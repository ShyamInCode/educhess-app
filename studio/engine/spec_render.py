#!/usr/bin/env python3
"""
spec_render.py — render a Video Studio spec to a narrated mp4.

`generate_mate_videos.py` renders one PGN that ends in checkmate. That was
the right shape for a batch of five Reels and the wrong shape for a course:
a module video is several positions, several sections, and a lot of narration
that is not a move at all ("these four squares are the centre").

So this is a second front end onto the same engine. Everything expensive is
imported from `mate_engine` and not rewritten: the SVG rasteriser, the branded
frame composition, the logo watermark, the audio padding that keeps narration
locked to frames, and the ffmpeg invocation. What is new here is the plan —
title card, sections, holds on a still position, teaching highlights, and an
outro that does not have to say CHECKMATE.

THE ONE RULE: the narration is whatever the spec says it is.

The spec comes from the admin panel, where a human read it and could edit
every line. This module never writes a sentence of its own and never asks a
model for one. If a frame has no `say`, it is silent for `hold` seconds. That
is what makes the browser preview an honest preview.
"""

from __future__ import annotations

import io
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import chess
import chess.svg
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mate_engine as eng  # noqa: E402  (path set above)

ASSETS = Path(__file__).resolve().parent / "assets"

# The engine resolves its brand assets relative to the working directory,
# which was fine for a script you ran from its own folder and is not fine for
# a worker started by a .bat file from anywhere. Pin them.
eng.LOGO_PATH = ASSETS / "educhess_logo.png"
eng.LOGO_TRANSPARENT_PATH = ASSETS / "logo_transparent.png"
eng.WORDMARK_PATH = ASSETS / "educhess_title.png"

# A teaching highlight is not a move highlight, and it must not read like one.
# The engine paints moves green and captures red; this is the brand gold, so
# "these are the squares I am talking about" never looks like "this is what
# just happened".
FILL_TEACH = "#d4af3766"

SQUARE_SIZE = eng.SQUARE_SIZE
VERTICAL_SIZE = eng.VERTICAL_SIZE

ProgressFn = Callable[[int, str], None]


# ---------------------------------------------------------------------------
# The plan
# ---------------------------------------------------------------------------

@dataclass
class PlannedFrame:
    kind: str                       # title | section | board | outro
    speech: str = ""
    min_hold: float = 0.0
    caption: str = ""
    board: chess.Board | None = None
    move: chess.Move | None = None
    was_capture: bool = False
    squares: list[str] = field(default_factory=list)
    arrows: list[list] = field(default_factory=list)
    heading: str = ""
    tagline: str = ""
    stamp: str = ""


class SpecError(ValueError):
    """The spec is wrong, and saying exactly how is the whole job.

    These messages go straight into `video_jobs.error` and are read by the
    academy owner, not by a developer. "illegal move Nf6 in segment 2, frame
    4" is actionable. "KeyError: san" is not.
    """


def _san_caption(board_before: chess.Board, san: str) -> str:
    number = board_before.fullmove_number
    prefix = f"{number}." if board_before.turn == chess.WHITE else f"{number}..."
    return f"{prefix} {san}"


def plan(spec: dict, silent: bool = False) -> list[PlannedFrame]:
    """Spec in, timeline out. Every legality check happens here, before a
    single PNG is written — a bad line should cost a second, not four minutes
    of rendering followed by a failure."""
    title = (spec.get("title") or "EduChess Lesson").strip()
    tagline = (spec.get("tagline") or "").strip()
    segments = spec.get("segments") or []
    if not segments:
        raise SpecError("this spec has no segments")

    frames: list[PlannedFrame] = [PlannedFrame(
        kind="title",
        heading=title,
        tagline=tagline,
        speech="" if silent else (spec.get("introSpeech") or "").strip(),
        min_hold=float(spec.get("introHold") or eng.DEFAULT_INTRO_HOLD),
    )]

    for s_index, segment in enumerate(segments):
        where = f"segment {s_index + 1}"
        heading = (segment.get("heading") or "").strip()

        if heading:
            frames.append(PlannedFrame(
                kind="section",
                heading=heading,
                tagline=(segment.get("subheading") or "").strip(),
                speech="" if silent else (segment.get("headingSpeech") or "").strip(),
                min_hold=float(segment.get("headingHold") or 2.5),
            ))

        start_fen = segment.get("startFen")
        try:
            board = chess.Board(start_fen) if start_fen else chess.Board()
        except ValueError as exc:
            raise SpecError(f"{where}: the starting position is not a legal FEN ({exc})") from exc
        if not board.is_valid():
            raise SpecError(
                f"{where}: the starting position is illegal "
                f"({str(board.status()).replace('Status.', '').replace('|', ' and ').lower()})"
            )

        segment_frames = segment.get("frames") or []
        if not segment_frames:
            raise SpecError(f"{where} ('{heading or 'untitled'}') has no frames")

        last_caption = "Starting position"
        for f_index, item in enumerate(segment_frames):
            spot = f"{where}, frame {f_index + 1}"
            san = (item.get("san") or "").strip()
            move: chess.Move | None = None
            was_capture = False

            if san:
                before = board.copy()
                try:
                    move = board.parse_san(san)
                except (ValueError, AssertionError) as exc:
                    # python-chess's own message repeats the move and prints
                    # the FEN inline, which reads like a stack trace. The
                    # academy owner sees this string in the admin panel.
                    side = "White" if board.turn == chess.WHITE else "Black"
                    raise SpecError(
                        f"{spot}: '{san}' is not a legal move in this position "
                        f"— it is {side} to play ({board.fen()})"
                    ) from exc
                was_capture = before.is_capture(move)
                last_caption = _san_caption(before, before.san(move))
                board.push(move)

            squares = [str(sq) for sq in (item.get("sq") or [])]
            for square in squares:
                if square not in chess.SQUARE_NAMES:
                    raise SpecError(f"{spot}: '{square}' is not a square on the board")

            arrows = [list(a) for a in (item.get("ar") or [])]
            for arrow in arrows:
                if len(arrow) < 2 or arrow[0] not in chess.SQUARE_NAMES \
                        or arrow[1] not in chess.SQUARE_NAMES:
                    raise SpecError(f"{spot}: {arrow!r} is not a from/to pair of squares")

            speech = "" if silent else (item.get("say") or "").strip()
            # `hold` is a floor, not a duration: a narrated frame is held for
            # as long as its line takes, and this only stops a one-word line
            # from flashing past. A frame with no narration gets it exactly.
            min_hold = float(item.get("hold") or eng.DEFAULT_HOLD)

            frames.append(PlannedFrame(
                kind="board",
                board=board.copy(),
                move=move,
                was_capture=was_capture,
                caption=(item.get("cap") or last_caption),
                squares=squares,
                arrows=arrows,
                speech=speech,
                min_hold=min_hold,
            ))

    final_board = next(
        (f.board for f in reversed(frames) if f.kind == "board" and f.board is not None),
        None,
    )
    frames.append(PlannedFrame(
        kind="outro",
        board=final_board,
        stamp=(spec.get("outroStamp") or "EDUCHESS").strip(),
        speech="" if silent else (spec.get("outroSpeech") or "").strip(),
        min_hold=float(spec.get("outroHold") or eng.DEFAULT_OUTRO_HOLD),
    ))
    return frames


# ---------------------------------------------------------------------------
# Board and cards
# ---------------------------------------------------------------------------

def render_board_png(frame: PlannedFrame, size: int) -> bytes:
    """The move highlight the engine already draws, plus teaching highlights.

    Move fills are set first and `setdefault` is used for the teaching ones,
    so a square that is both the destination of the move and part of a
    highlighted group keeps the move colour. Losing the move highlight to a
    decoration would be the wrong way round.
    """
    board = frame.board
    check_square = board.king(board.turn) if board.is_check() else None

    arrows: list[chess.svg.Arrow] = []
    fill: dict[int, str] = {}

    if frame.move is not None:
        arrows.append(chess.svg.Arrow(
            frame.move.from_square, frame.move.to_square,
            color="red" if frame.was_capture else "green",
        ))
        fill[frame.move.to_square] = (
            eng.FILL_CAPTURE if frame.was_capture else eng.FILL_QUIET
        )

    for name in frame.squares:
        fill.setdefault(chess.parse_square(name), FILL_TEACH)

    for arrow in frame.arrows:
        colour = arrow[2] if len(arrow) > 2 else "blue"
        arrows.append(chess.svg.Arrow(
            chess.parse_square(arrow[0]), chess.parse_square(arrow[1]), color=colour,
        ))

    svg = chess.svg.board(
        board=board,
        lastmove=frame.move,
        check=check_square,
        arrows=arrows,
        fill=fill,
        size=size,
        coordinates=True,
        colors=eng.BOARD_COLORS,
    )
    return eng.svg_to_png_bytes(svg, size)


def make_card(heading: str, tagline: str, canvas: tuple[int, int],
              lead: str = "") -> Image.Image:
    """Title and section cards. Deliberately the same furniture as the
    engine's own title card — wordmark, gold rule, big name — so a studio
    video and a batch-rendered Reel look like they came from one place."""
    width, height = canvas
    vertical = height > width
    card = Image.new("RGB", canvas, eng.NAVY)
    draw = ImageDraw.Draw(card)

    wordmark = eng.load_asset("wordmark", eng.WORDMARK_PATH)
    wm_h = 0
    if wordmark is not None:
        wm_h = round(width * eng.WORDMARK_WIDTH_FRAC * wordmark.height / wordmark.width)

    lead_font = eng.fit_font(draw, lead or " ", int(width * 0.86), 36 if vertical else 32)
    name_font = eng.fit_font(draw, heading.upper(), int(width * 0.86), 100 if vertical else 86)
    tag_font = eng.fit_font(draw, tagline or " ", int(width * 0.86), 46 if vertical else 40)

    lead_h = eng.text_extent(draw, lead, lead_font)[1] if lead else 0
    name_h = eng.text_extent(draw, heading.upper(), name_font)[1]
    tag_h = eng.text_extent(draw, tagline, tag_font)[1] if tagline else 0

    gap_a, gap_b, gap_c = 96, 44, 30
    block = wm_h + gap_a + lead_h + gap_b + name_h + (gap_c + tag_h if tagline else 0)
    y = max(60, (height - block) // 2)

    if wordmark is not None:
        y = eng.paste_wordmark(card, y, eng.WORDMARK_WIDTH_FRAC)
    else:
        y = eng.draw_centered(draw, eng.BRAND_NAME.upper(), y, eng.load_font(72),
                              width, eng.GOLD)

    if lead:
        y = eng.draw_centered(draw, lead, y + gap_a, lead_font, width, eng.GOLD_DIM)
    else:
        y += gap_a

    rule_y = y + gap_b // 2
    inset = width // 8
    draw.line([(inset, rule_y), (width - inset, rule_y)], fill=eng.GOLD_DIM, width=3)

    y = eng.draw_centered(draw, heading.upper(), y + gap_b, name_font, width, eng.GOLD)
    if tagline:
        eng.draw_centered(draw, tagline, y + gap_c, tag_font, width, eng.CREAM)
    return card


def make_outro(frame: PlannedFrame, canvas: tuple[int, int]) -> Image.Image:
    """The closing card: the final position dimmed back, with one word over it.

    The engine's own outro hard-codes CHECKMATE, which is right for a mate
    pattern and a lie on a lesson about pawn structure — the last position of
    "Opening Principles" is not mate, and stamping it as one teaches the
    opposite of what the video just said. So the geometry is borrowed and the
    word is the spec's. Red is reserved for an actual checkmate; everything
    else closes in brand gold.
    """
    if frame.board is None:
        return make_card(frame.stamp or "EDUCHESS", "", canvas)

    stamp = (frame.stamp or "").strip().upper()
    is_mate = frame.board.is_checkmate()
    if is_mate and not stamp:
        stamp = "CHECKMATE"
    stamp_fill = eng.CHECK_RED if (is_mate and stamp == "CHECKMATE") else eng.GOLD

    board_png = render_board_png(
        PlannedFrame(kind="board", board=frame.board), min(canvas) * 2
    )

    width, height = canvas
    vertical = height > width
    card = Image.new("RGB", canvas, eng.NAVY)
    draw = ImageDraw.Draw(card)

    pad = 36
    board_px = max(64, min(width - 2 * pad, height - 2 * pad))
    board_img = Image.open(io.BytesIO(board_png)).convert("RGBA")
    if board_img.size != (board_px, board_px):
        board_img = board_img.resize((board_px, board_px), Image.LANCZOS)

    # Dim hard: the stamp has to win against a full board behind it.
    board_img = Image.blend(
        board_img, Image.new("RGBA", board_img.size, eng.NAVY + (255,)), 0.62
    )
    card.paste(board_img, ((width - board_px) // 2, (height - board_px) // 2), board_img)

    stamp_font = None
    stamp_w = stamp_h = 0
    if stamp:
        stamp_font = eng.fit_font(draw, stamp, int(board_px * 0.72),
                                  150 if vertical else 128)
        stamp_w, stamp_h = eng.text_size(draw, stamp, stamp_font)

    wordmark = eng.load_asset("wordmark", eng.WORDMARK_PATH)
    wm_w = wm_h = 0
    if wordmark is not None:
        wm_w = int(width * eng.WORDMARK_WIDTH_FRAC)
        wm_h = round(wm_w * wordmark.height / wordmark.width)

    inner_pad, gap = 46, 34
    panel_w = max(stamp_w, wm_w) + 2 * inner_pad
    panel_h = stamp_h + (gap + wm_h if (wm_h and stamp_h) else wm_h) + 2 * inner_pad
    px = (width - panel_w) // 2
    py = (height - panel_h) // 2

    draw.rectangle([px, py, px + panel_w, py + panel_h], fill=eng.NAVY_DEEP)
    draw.rectangle([px, py, px + panel_w, py + panel_h], outline=eng.GOLD, width=5)

    # Anchored center-middle so the glyphs sit on the panel's real centre
    # rather than on a size estimate that ignores bearing and descenders.
    if stamp_font is not None:
        draw.text((width // 2, py + inner_pad + stamp_h // 2), stamp,
                  font=stamp_font, fill=stamp_fill, anchor="mm")

    mark_y = py + inner_pad + (stamp_h + gap if stamp_h else 0)
    if wordmark is not None:
        eng.paste_wordmark(card, mark_y, eng.WORDMARK_WIDTH_FRAC)
    elif not stamp:
        eng.draw_centered(draw, eng.BRAND_NAME.upper(), mark_y,
                          eng.load_font(64), width, eng.GOLD)
    return card


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------

@dataclass
class RenderResult:
    ok: bool = False
    output: Path | None = None
    duration: float = 0.0
    frames: int = 0
    narrated: bool = False
    error: str = ""


def render_spec(
    spec: dict,
    options: dict,
    out_path: Path,
    work_dir: Path,
    ffmpeg: str,
    ffprobe: str,
    progress: ProgressFn | None = None,
) -> RenderResult:
    """Spec -> mp4. `progress(percent, stage)` is called as it goes; the
    worker forwards it straight into video_jobs so the admin panel can say
    something truthful instead of spinning."""
    def report(pct: int, stage: str) -> None:
        if progress:
            progress(pct, stage)

    silent = bool(options.get("silent"))
    vertical = bool(options.get("vertical"))
    canvas = VERTICAL_SIZE if vertical else SQUARE_SIZE
    fps = int(options.get("fps") or eng.DEFAULT_FPS)
    voice = options.get("voice") or eng.VOICE
    rate = options.get("rate") or eng.DEFAULT_RATE
    pitch = options.get("pitch") or eng.DEFAULT_PITCH
    buffer = float(options.get("audioBuffer") or eng.DEFAULT_AUDIO_BUFFER)

    result = RenderResult()

    report(2, "Checking the moves")
    try:
        frames = plan(spec, silent=silent)
    except SpecError as exc:
        result.error = str(exc)
        return result

    work_dir.mkdir(parents=True, exist_ok=True)
    for stale in work_dir.iterdir():
        shutil.rmtree(stale, ignore_errors=True) if stale.is_dir() else stale.unlink()

    audio_dir = work_dir / "audio"
    audio_dir.mkdir(exist_ok=True)

    # --- narration decides the timing, so it goes first --------------------
    clips: list[Path | None] = [None] * len(frames)
    if not silent:
        jobs: list[tuple[str, Path]] = []
        for index, frame in enumerate(frames):
            if not frame.speech:
                continue
            path = audio_dir / f"line_{index:03d}.mp3"
            jobs.append((frame.speech, path))
            clips[index] = path

        if jobs:
            report(8, f"Recording {len(jobs)} narration lines")
            try:
                import asyncio
                asyncio.run(eng._synthesize_all(jobs, voice, rate, pitch))
            except Exception as exc:
                result.error = (
                    f"the voice service failed ({exc}). Check the internet "
                    f"connection on this PC, or render this one silent."
                )
                return result

    durations: list[float] = []
    for index, frame in enumerate(frames):
        clip = clips[index]
        if clip is None:
            durations.append(frame.min_hold)
            continue
        spoken = eng.probe_duration(ffprobe, clip)
        durations.append(max(frame.min_hold, spoken + buffer))

    # --- frames ------------------------------------------------------------
    report(20, "Drawing the board")
    eng.prepare_logo()
    render_px = min(canvas) * 2
    lesson_title = (spec.get("title") or "EduChess").strip()
    frame_paths: list[Path] = []

    try:
        for index, frame in enumerate(frames):
            if frame.kind == "title":
                image = make_card(frame.heading, frame.tagline, canvas,
                                  lead="IN THIS LESSON WE WILL LEARN")
            elif frame.kind == "section":
                image = make_card(frame.heading, frame.tagline, canvas)
            elif frame.kind == "outro":
                image = make_outro(frame, canvas)
            else:
                board_png = render_board_png(frame, render_px)
                ply = eng.Ply(board=frame.board, move=frame.move,
                              caption=frame.caption, was_capture=frame.was_capture)
                image = eng.compose_frame(board_png, ply, lesson_title, canvas)

            path = work_dir / f"f{index:04d}.png"
            image.save(path, "PNG", optimize=False)
            frame_paths.append(path)

            if len(frames) > 1:
                report(20 + int(50 * (index + 1) / len(frames)),
                       f"Drawing frame {index + 1} of {len(frames)}")
    except Exception as exc:
        result.error = f"could not draw frame {len(frame_paths) + 1}: {exc}"
        return result

    result.frames = len(frame_paths)
    result.duration = sum(durations)

    list_path = work_dir / "frames.txt"
    eng.write_concat_list(frame_paths, durations, list_path)

    # --- audio bed ---------------------------------------------------------
    narration: Path | None = None
    if not silent and any(clips):
        report(74, "Building the narration track")
        try:
            narration = eng.build_narration(ffmpeg, clips, durations, audio_dir, False)
            result.narrated = True
        except RuntimeError as exc:
            result.error = f"narration failed: {exc}"
            return result

    # --- mux ---------------------------------------------------------------
    report(84, "Encoding the video")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = eng.build_ffmpeg_cmd(ffmpeg, list_path, out_path, canvas, fps,
                               result.duration, narration)
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=str(work_dir))
    if proc.returncode != 0:
        result.error = (proc.stderr or proc.stdout or "ffmpeg failed").strip()[:800]
        return result
    if not out_path.exists() or out_path.stat().st_size == 0:
        result.error = "ffmpeg finished without writing a file"
        return result

    report(96, "Finishing")
    result.output = out_path
    result.ok = True
    return result


# ---------------------------------------------------------------------------
# Replacing the voice
# ---------------------------------------------------------------------------

def remux_audio(video: Path, audio: Path, out_path: Path,
                ffmpeg: str, ffprobe: str) -> RenderResult:
    """Put the owner's own recording over an already-rendered video.

    This is why re-voicing is fast: the frames, the board, the branding and
    the encode settings are all already correct, so a new narration is a mux,
    not a render — seconds instead of minutes.

    The two tracks will not be the same length, and the fix has to be honest
    in both directions. A recording longer than the video freezes the last
    frame until the sentence finishes, rather than cutting the owner off
    mid-word. A shorter one is padded with silence, rather than speeding the
    video up to meet it.
    """
    result = RenderResult()
    try:
        video_len = eng.probe_duration(ffprobe, video)
        audio_len = eng.probe_duration(ffprobe, audio)
    except Exception as exc:
        result.error = f"could not read the media durations: {exc}"
        return result

    total = max(video_len, audio_len)
    cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
           "-i", str(video), "-i", str(audio)]

    if audio_len > video_len + 0.05:
        cmd += ["-vf", f"tpad=stop_mode=clone:stop_duration={audio_len - video_len:.3f}"]
        cmd += ["-af", "apad"]
    else:
        cmd += ["-af", "apad"]

    cmd += [
        "-map", "0:v:0", "-map", "1:a:0",
        "-t", f"{total:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        str(out_path),
    ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        result.error = (proc.stderr or "ffmpeg failed").strip()[:800]
        return result

    result.ok = True
    result.output = out_path
    result.duration = total
    result.narrated = True
    return result
