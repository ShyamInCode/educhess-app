#!/usr/bin/env python3
"""
worker.py — the EduChess Video Studio render worker.

Run this on the academy PC. It watches the `video_jobs` table, renders each
job with the engine in `studio/engine/`, uploads the mp4 into the private
course-videos bucket, and writes back what happened.

    python studio/worker.py --check     verify this machine can render
    python studio/worker.py             watch for jobs, forever
    python studio/worker.py --once      take one job and stop
    python studio/worker.py --job 41    re-run one job by id

WHY A POLLING WORKER AND NOT A SERVER

Rendering needs Python, ffmpeg and a cairo build. The site is a static bundle
talking straight to Supabase and there is no server anywhere in this project,
by design. Adding one for video would mean a machine to patch, a bill, and a
second place where a secret lives. A worker on the PC that already has the
tooling costs nothing, and the failure mode is visible and recoverable: jobs
queue up, the panel says the studio is offline, and starting the worker
drains the queue.

THE SERVICE-ROLE KEY

This process holds `SUPABASE_SERVICE_ROLE_KEY`, which bypasses every RLS
policy in the project. That is the reason it runs here and not in a browser.
Keep `studio/.env` off GitHub (it is gitignored), and if the key is ever
pasted anywhere else, rotate it in the Supabase dashboard.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "engine"))

try:
    import requests
except ImportError:
    sys.exit("requests is required:  pip install -r studio/requirements.txt")

import spec_render as sr  # noqa: E402

VIDEO_BUCKET = "course-videos"

# The worker writes this itself the first time it runs. There is deliberately
# no .env.example in the repository: a file whose only job is to be copied is
# a file that can drift from the code that reads it, and one fewer step for
# whoever sets this up on the academy PC.
ENV_TEMPLATE = """\
# EduChess Video Studio — settings for this computer.
#
# Both values are in the Supabase dashboard under Project Settings -> API.
# This file never leaves this computer; git is told to ignore it.

SUPABASE_URL=

# The SERVICE ROLE key, not the anon key.
#
# This key bypasses every security rule in the database. That is why the
# rendering runs on this computer instead of in the website. Never paste it
# into the website, a screenshot, or a chat. If it does escape, open the
# Supabase dashboard and roll it.
SUPABASE_SERVICE_ROLE_KEY=

# ---- optional ----
# STUDIO_WORKER_NAME=academy-pc     # the name shown in the admin panel
# STUDIO_POLL_SECONDS=8             # how often to check for new videos
# STUDIO_VIDEO_BUCKET=course-videos
# STUDIO_WORK_DIR=                  # defaults to studio/.work
# STUDIO_KEEP_RENDERS=0             # 1 keeps the picture files, for debugging
"""


def ensure_env_file() -> tuple[Path, bool]:
    """Make sure studio/.env exists. Returns (path, whether it was created).

    Never overwrites: a file that is already there holds real keys.
    """
    env_file = HERE / ".env"
    if env_file.exists():
        return env_file, False
    env_file.write_text(ENV_TEMPLATE, encoding="utf-8")
    return env_file, True
POLL_SECONDS = 8
IDLE_LOG_EVERY = 60          # seconds between "still waiting" lines
PROGRESS_MIN_STEP = 3        # don't PATCH for every single frame
PROGRESS_MIN_GAP = 2.0


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def load_env() -> dict:
    """Read studio/.env. Deliberately not python-dotenv — this is six lines,
    and one fewer dependency to install on a Windows machine is worth it."""
    env = dict(os.environ)
    env_file = HERE / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return env


class Config:
    def __init__(self, env: dict) -> None:
        self.url = (env.get("SUPABASE_URL") or "").rstrip("/")
        self.key = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        self.bucket = env.get("STUDIO_VIDEO_BUCKET") or VIDEO_BUCKET
        self.poll = float(env.get("STUDIO_POLL_SECONDS") or POLL_SECONDS)
        self.name = env.get("STUDIO_WORKER_NAME") or f"{os.name}-{os.getpid()}"
        self.work = Path(env.get("STUDIO_WORK_DIR") or (HERE / ".work"))
        self.keep = (env.get("STUDIO_KEEP_RENDERS") or "").lower() in ("1", "true", "yes")

    def check(self) -> None:
        missing = [n for n, v in (("SUPABASE_URL", self.url),
                                  ("SUPABASE_SERVICE_ROLE_KEY", self.key)) if not v]
        if missing:
            env_file, created = ensure_env_file()
            sys.exit(
                f"{' and '.join(missing)} is not set.\n"
                f"{'I have just created' if created else 'Open'} {env_file} — fill in both "
                f"values from your Supabase dashboard, under Project Settings, API, "
                f"then run this again."
            )


# ---------------------------------------------------------------------------
# Supabase over plain REST
# ---------------------------------------------------------------------------

class Supabase:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            "apikey": config.key,
            "Authorization": f"Bearer {config.key}",
        })

    def claim(self) -> dict | None:
        response = self.session.post(
            f"{self.config.url}/rest/v1/rpc/claim_next_video_job",
            json={"p_worker": self.config.name},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        if isinstance(data, list):
            data = data[0] if data else None
        # The function returns a composite; an empty queue comes back as null,
        # or as a row of nulls depending on the PostgREST version.
        if not data or data.get("id") is None:
            return None
        return data

    def get_job(self, job_id: int) -> dict | None:
        response = self.session.get(
            f"{self.config.url}/rest/v1/video_jobs",
            params={"id": f"eq.{job_id}", "select": "*"},
            timeout=30,
        )
        response.raise_for_status()
        rows = response.json()
        return rows[0] if rows else None

    def patch(self, job_id: int, values: dict) -> None:
        response = self.session.patch(
            f"{self.config.url}/rest/v1/video_jobs",
            params={"id": f"eq.{job_id}"},
            json=values,
            headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
            timeout=30,
        )
        response.raise_for_status()

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        """Upsert, so re-running a job replaces its file instead of erroring
        out on the second attempt."""
        response = self.session.post(
            f"{self.config.url}/storage/v1/object/{self.config.bucket}/{path}",
            data=data,
            headers={"Content-Type": content_type, "x-upsert": "true"},
            timeout=600,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"upload of {path} failed ({response.status_code}): {response.text[:300]}"
            )

    def download(self, path: str) -> bytes:
        response = self.session.get(
            f"{self.config.url}/storage/v1/object/{self.config.bucket}/{path}",
            timeout=600,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"download of {path} failed ({response.status_code}): {response.text[:300]}"
            )
        return response.content


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

def slugify(text: str, fallback: str = "lesson") -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "")).strip("-").lower()
    return slug[:60] or fallback


def storage_path_for(job: dict) -> str:
    """Mirror the shape the manual uploader in AdminVideos.jsx already uses,
    so the bucket stays one library rather than two.

    The chapter is baked into the path at render time. If the admin files the
    finished video under a different chapter when publishing, the prefix ends
    up stale — which is cosmetic only, because supabase/04_storage.sql resolves
    an object's chapter through the `videos` row and never through its name.
    """
    category = job.get("category") or "chess"
    chapter = re.sub(r"[^a-zA-Z0-9._-]+", "-", job.get("chapter") or "unfiled")
    return f"{category}/{chapter}/studio-{job['id']}-{slugify(job.get('title'))}.mp4"


# ---------------------------------------------------------------------------
# Doing the work
# ---------------------------------------------------------------------------

class Worker:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.api = Supabase(config)
        self.ffmpeg = sr.eng.find_ffmpeg(None)
        self.ffprobe = sr.eng.find_ffprobe(self.ffmpeg)

    def progress_reporter(self, job_id: int):
        state = {"pct": -100, "at": 0.0}

        def report(pct: int, stage: str) -> None:
            now = time.time()
            if (pct - state["pct"] < PROGRESS_MIN_STEP
                    and now - state["at"] < PROGRESS_MIN_GAP
                    and pct < 100):
                return
            state.update(pct=pct, at=now)
            print(f"    {pct:3d}%  {stage}")
            try:
                self.api.patch(job_id, {"progress": max(0, min(100, pct)), "stage": stage})
            except Exception as exc:      # never let a status update kill a render
                print(f"    (could not report progress: {exc})")

        return report

    def run_job(self, job: dict) -> None:
        job_id = job["id"]
        title = job.get("title") or f"job {job_id}"
        options = job.get("options") or {}
        revoice = bool(options.get("revoiceOnly"))

        print(f"\n=== job {job_id}: {title} "
              f"({'re-voice' if revoice else job.get('kind', 'module')}) ===")

        report = self.progress_reporter(job_id)
        self.api.patch(job_id, {"status": "rendering", "progress": 1,
                                "stage": "Starting", "error": None})

        work_dir = self.config.work / f"job-{job_id}"
        work_dir.mkdir(parents=True, exist_ok=True)
        out_path = work_dir / "final.mp4"

        if revoice:
            result = self.revoice(job, work_dir, out_path, report)
        else:
            spec = job.get("spec") or {}
            if isinstance(spec, str):
                spec = json.loads(spec)
            result = sr.render_spec(spec, options, out_path, work_dir / "frames",
                                    self.ffmpeg, self.ffprobe, progress=report)

        if not result.ok:
            print(f"[fail] {result.error}")
            self.api.patch(job_id, {"status": "failed", "stage": "Failed",
                                    "error": result.error[:2000]})
            return

        path = job.get("storage_path") or storage_path_for(job)
        size = out_path.stat().st_size
        report(97, "Uploading to the library")
        self.api.upload(path, out_path.read_bytes(), "video/mp4")

        self.api.patch(job_id, {
            "status": "ready",
            "storage_path": path,
            "duration_seconds": round(result.duration, 2),
            "size_bytes": size,
            "progress": 100,
            "stage": "Ready to preview",
            "error": None,
            # A real ISO timestamp, not the string "now()". PostgREST sends
            # this value straight to Postgres as a literal to cast, and
            # Postgres's date parser accepts 'now' but not 'now()' — so the
            # SQL-looking spelling fails the whole PATCH and leaves the job
            # stuck at 'rendering' with the video already uploaded.
            "finished_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"[ok] {path}  ({size / 1_048_576:.1f} MB, {result.duration:.0f}s)")

        if not self.config.keep:
            for item in work_dir.rglob("*.png"):
                item.unlink(missing_ok=True)

    def revoice(self, job: dict, work_dir: Path, out_path: Path, report):
        """Replace the narration on a video that is already rendered."""
        video_path = job.get("storage_path")
        audio_path = job.get("narration_path")
        if not video_path or not audio_path:
            result = sr.RenderResult()
            result.error = ("re-voice needs both a rendered video and an uploaded "
                            "recording; one of them is missing")
            return result

        report(15, "Fetching the video")
        source = work_dir / "source.mp4"
        source.write_bytes(self.api.download(video_path))

        report(35, "Fetching your recording")
        narration = work_dir / Path(audio_path).name
        narration.write_bytes(self.api.download(audio_path))

        report(55, "Laying your voice over the video")
        return sr.remux_audio(source, narration, out_path, self.ffmpeg, self.ffprobe)

    # -- loop ---------------------------------------------------------------

    def loop(self, once: bool = False) -> None:
        print(f"studio worker '{self.config.name}' watching "
              f"{self.config.url} every {self.config.poll:.0f}s.  Ctrl-C to stop.")
        idle_since = time.time()
        while True:
            try:
                job = self.api.claim()
            except Exception as exc:
                print(f"[warn] could not reach Supabase: {exc}")
                time.sleep(min(60, self.config.poll * 4))
                continue

            if job is None:
                if time.time() - idle_since > IDLE_LOG_EVERY:
                    print(f"  waiting… {time.strftime('%H:%M:%S')}")
                    idle_since = time.time()
                if once:
                    print("nothing queued.")
                    return
                time.sleep(self.config.poll)
                continue

            idle_since = time.time()
            try:
                self.run_job(job)
            except KeyboardInterrupt:
                # Hand it back rather than leaving it 'rendering' forever.
                self.api.patch(job["id"], {"status": "queued", "stage": "Requeued",
                                           "progress": 0})
                raise
            except Exception as exc:
                traceback.print_exc()
                try:
                    self.api.patch(job["id"], {
                        "status": "failed", "stage": "Failed",
                        "error": f"{type(exc).__name__}: {exc}"[:2000],
                    })
                except Exception:
                    pass

            if once:
                return


# ---------------------------------------------------------------------------
# --check
# ---------------------------------------------------------------------------

def self_check(config: Config) -> int:
    """Everything that can be wrong on a fresh Windows machine, named."""
    print("EduChess studio worker — environment check\n")
    problems: list[str] = []

    def ok(label: str, detail: str = "") -> None:
        print(f"  [ok]   {label}{('  — ' + detail) if detail else ''}")

    def bad(label: str, fix: str) -> None:
        print(f"  [MISS] {label}\n         fix: {fix}")
        problems.append(label)

    print(f"  python {sys.version.split()[0]}")

    for module, fix in [
        ("chess",   "pip install -r studio/requirements.txt"),
        ("PIL",     "pip install -r studio/requirements.txt"),
        ("requests", "pip install -r studio/requirements.txt"),
        ("edge_tts", "pip install -r studio/requirements.txt"),
    ]:
        try:
            __import__(module)
            ok(module)
        except ImportError:
            bad(module, fix)

    try:
        backend = sr.eng._init_svg_backend()
        ok("svg rasteriser", backend)
    except Exception as exc:
        bad("svg rasteriser",
            f"install the GTK3 runtime so libcairo-2.dll is on PATH, or "
            f"`pip install svglib reportlab` for the fallback ({exc})")

    try:
        ffmpeg = sr.eng.find_ffmpeg(None)
        ok("ffmpeg", ffmpeg)
        ok("ffprobe", sr.eng.find_ffprobe(ffmpeg))
    except Exception as exc:
        bad("ffmpeg", f"install ffmpeg and put it on PATH ({exc})")

    for name in ("educhess_logo.png", "educhess_title.png"):
        if (HERE / "engine" / "assets" / name).exists():
            ok(f"brand asset {name}")
        else:
            bad(f"brand asset {name}", f"copy it into studio/engine/assets/")

    if not config.url or not config.key:
        env_file, created = ensure_env_file()
        bad("studio/.env",
            f"{'created for you just now at ' if created else 'open '}{env_file} — "
            f"fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the Supabase "
            f"dashboard (Project Settings -> API)")
    else:
        try:
            api = Supabase(config)
            response = api.session.get(
                f"{config.url}/rest/v1/video_jobs",
                params={"select": "id", "limit": "1"}, timeout=20)
            if response.status_code == 200:
                ok("supabase", f"video_jobs reachable at {config.url}")
            elif response.status_code in (401, 403):
                bad("supabase", "the service role key was rejected — check studio/.env")
            elif response.status_code == 404:
                bad("supabase", "video_jobs does not exist — run supabase/06_studio.sql "
                                "in the Supabase SQL editor")
            else:
                bad("supabase", f"HTTP {response.status_code}: {response.text[:200]}")
        except Exception as exc:
            bad("supabase", f"could not connect: {exc}")

    print()
    if problems:
        print(f"{len(problems)} thing(s) to fix before the studio can render.")
        return 1
    print("all good — run `python studio/worker.py` and queue a video from the admin panel.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="EduChess Video Studio render worker")
    parser.add_argument("--check", action="store_true",
                        help="verify this machine can render, then exit")
    parser.add_argument("--once", action="store_true",
                        help="take at most one job, then exit")
    parser.add_argument("--job", type=int, metavar="ID",
                        help="render one job by id, whatever its current status")
    args = parser.parse_args(argv)

    config = Config(load_env())

    if args.check:
        return self_check(config)

    config.check()
    worker = Worker(config)

    if args.job:
        job = worker.api.get_job(args.job)
        if job is None:
            print(f"no job {args.job}")
            return 1
        worker.run_job(job)
        return 0

    try:
        worker.loop(once=args.once)
    except KeyboardInterrupt:
        print("\nstopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
