import React, { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import {
  JOB_STATUS, cancelJob, deleteJob, attachNarration, formatDuration,
  isStale, previewUrl, publishJob, requeueJob,
} from "../../lib/studio";

const TONE = {
  wait:  "text-ink-dim border-line",
  work:  "text-gold border-gold/50",
  ready: "text-brand-emerald border-brand-emerald/50",
  done:  "text-brand-emerald border-brand-emerald",
  bad:   "text-danger border-danger/50",
  off:   "text-ink-dim border-line",
};

/** Everything the admin does to one job after it has been queued. */
export default function StudioJob({ job, chapters, onChanged }) {
  // The preview URL is cached against the version of the file it was minted
  // for. A signed URL expires, and a re-voiced job has a brand new video
  // behind the same storage path — so "which file is this URL for" has to be
  // part of the state, not something an effect clears afterwards.
  const [preview, setPreview] = useState({ key: null, url: null });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishChapter, setPublishChapter] = useState(job.chapter || "");
  const [publishTier, setPublishTier] = useState("");
  const [voicing, setVoicing] = useState(false);

  const status = JOB_STATUS[job.status] || { label: job.status, tone: "off" };
  const stale = isStale(job);
  const working = ["claimed", "rendering"].includes(job.status);

  const fileKey = `${job.storage_path || ""}|${job.updated_at}`;
  const url = preview.key === fileKey ? preview.url : null;

  async function openPreview() {
    setError("");
    setOpen(true);
    if (url) return;
    setBusy("preview");
    try {
      setPreview({ key: fileKey, url: await previewUrl(job) });
    } catch (err) {
      setError(err.message || "Couldn't open that video.");
    } finally {
      setBusy("");
    }
  }

  async function act(name, fn) {
    setError("");
    setBusy(name);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err.message || "That didn't work.");
    } finally {
      setBusy("");
    }
  }

  async function handlePublish() {
    if (!publishChapter.trim()) {
      setError("Choose which chapter this belongs in.");
      return;
    }
    await act("publish", () => publishJob({
      jobId: job.id,
      chapter: publishChapter.trim(),
      title: job.title,
      minTier: publishTier || null,
    }));
    setPublishing(false);
  }

  return (
    <div className="bg-void/60 border border-line rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base text-ink truncate">{job.title}</p>
          <p className="text-xs font-mono text-ink-dim uppercase tracking-wide mt-0.5">
            {job.category}
            {job.chapter ? ` · ${job.chapter}` : ""}
            {job.duration_seconds ? ` · ${formatDuration(job.duration_seconds)}` : ""}
            {job.size_bytes ? ` · ${(job.size_bytes / 1048576).toFixed(1)} MB` : ""}
          </p>
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-lg border text-xs font-mono uppercase tracking-wide ${TONE[status.tone]}`}>
          {stale ? "Studio offline" : status.label}
        </span>
      </div>

      {working && !stale && (
        <div className="mt-3">
          <div className="h-1.5 bg-line rounded-full overflow-hidden">
            <div
              className="h-full bg-gold transition-all duration-500"
              style={{ width: `${Math.max(4, job.progress || 0)}%` }}
            />
          </div>
          <p className="text-xs font-mono text-ink-dim mt-1.5">
            {job.stage || "Working"} · {job.progress || 0}%
          </p>
        </div>
      )}

      {stale && (
        <p className="mt-3 text-sm text-ink-dim">
          Nothing has moved on this for a few minutes. Start the studio on the
          academy PC (run <span className="font-mono text-ink">run-worker.bat</span>) and
          it will pick this up on its own.
        </p>
      )}

      {job.status === "queued" && !job.worker && (
        <p className="mt-3 text-sm text-ink-dim">
          Waiting for the studio to pick this up. It renders one video at a time.
        </p>
      )}

      {job.error && (
        <p className="mt-3 text-sm text-danger whitespace-pre-wrap">{job.error}</p>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {/* --- preview ------------------------------------------------------ */}
      {open && (
        <div className="mt-3">
          {busy === "preview" && <p className="text-sm text-ink-dim">Opening…</p>}
          {url && (
            /* Admin-only preview of a video that has no caption track — the
               narration is in `spec` and is not timed to cues. */
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={url}
              controls
              playsInline
              className="w-full max-w-md rounded-lg border border-line bg-black"
            />
          )}
        </div>
      )}

      {/* --- record your own voice ---------------------------------------- */}
      {voicing && (
        <VoiceRecorder
          job={job}
          onCancel={() => setVoicing(false)}
          onDone={async () => { setVoicing(false); await onChanged(); }}
        />
      )}

      {/* --- publish ------------------------------------------------------ */}
      {publishing && (
        <div className="mt-3 bg-panel border border-line rounded-lg p-4 space-y-3">
          <div>
            <label htmlFor={`pub-chapter-${job.id}`} className="text-xs font-mono text-ink-dim uppercase tracking-wide">
              Add to chapter
            </label>
            <input
              id={`pub-chapter-${job.id}`}
              list={`chapters-${job.id}`}
              value={publishChapter}
              onChange={(e) => setPublishChapter(e.target.value)}
              placeholder="e.g. Opening Principles"
              className="mt-1 w-full bg-void border border-line rounded-lg px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-gold"
            />
            <datalist id={`chapters-${job.id}`}>
              {chapters.map((c) => <option key={c.id} value={c.title} />)}
            </datalist>
            <p className="text-xs text-ink-dim mt-1">
              A chapter that doesn&apos;t exist yet is created for you.
            </p>
          </div>
          <div>
            <label htmlFor={`pub-tier-${job.id}`} className="text-xs font-mono text-ink-dim uppercase tracking-wide">
              Who can watch it
            </label>
            <select
              id={`pub-tier-${job.id}`}
              value={publishTier}
              onChange={(e) => setPublishTier(e.target.value)}
              className="mt-1 w-full bg-void border border-line rounded-lg px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-gold"
            >
              <option value="">Leave the chapter as it is</option>
              <option value="free">Free — anyone, including visitors</option>
              <option value="pro">Pro members and above</option>
              <option value="academy">Academy members only</option>
            </select>
            <p className="text-xs text-ink-dim mt-1">
              This sets the whole chapter, not just this video.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePublish} disabled={busy === "publish"}>
              {busy === "publish" ? "Adding…" : "Add to course"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPublishing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* --- actions ------------------------------------------------------ */}
      <div className="flex flex-wrap gap-2 mt-3">
        {job.storage_path && (
          <Button size="sm" variant="outline" onClick={() => (open ? setOpen(false) : openPreview())}>
            {open ? "Hide preview" : "Preview"}
          </Button>
        )}

        {job.status === "ready" && !publishing && (
          <Button size="sm" onClick={() => {
            setPublishChapter(job.chapter || "");
            setPublishing(true);
          }}>
            Add to course
          </Button>
        )}

        {job.status === "ready" && !voicing && (
          <Button size="sm" variant="outline" onClick={() => setVoicing(true)}>
            Use my own voice
          </Button>
        )}

        {["failed", "cancelled"].includes(job.status) && (
          <Button size="sm" variant="outline" disabled={busy === "retry"}
                  onClick={() => act("retry", () => requeueJob(job.id))}>
            {busy === "retry" ? "Queueing…" : "Try again"}
          </Button>
        )}

        {["queued", "claimed", "rendering"].includes(job.status) && (
          <Button size="sm" variant="ghost" disabled={busy === "cancel"}
                  onClick={() => act("cancel", () => cancelJob(job.id))}>
            {busy === "cancel" ? "Cancelling…" : "Cancel"}
          </Button>
        )}

        {job.status !== "published" && (
          <button
            onClick={() => {
              if (!window.confirm(`Delete "${job.title}" and its video file? This cannot be undone.`)) return;
              act("delete", () => deleteJob(job));
            }}
            disabled={busy === "delete"}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-danger border border-danger/40 hover:bg-danger/10 transition-colors disabled:opacity-50"
          >
            {busy === "delete" ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   Recording the owner's own narration.

   The script is shown while recording on purpose: the video already exists
   and its timing came from the generated narration, so reading roughly this
   text keeps the words near the moves they describe. The worker stretches or
   pads the result either way — it will not cut a sentence off — but a
   recording that wanders far from the script drifts away from the board.
   ========================================================================== */

function VoiceRecorder({ job, onCancel, onDone }) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);

  const script = scriptLines(job.spec);

  useEffect(() => () => {
    clearInterval(timer.current);
    recorder.current?.stream?.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setError("");
    setBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      chunks.current = [];
      media.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      media.onstop = () => {
        setBlob(new Blob(chunks.current, { type: media.mimeType || "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      media.start();
      recorder.current = media;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Couldn't reach the microphone. Allow microphone access for this site and try again.");
    }
  }

  function stop() {
    recorder.current?.stop();
    clearInterval(timer.current);
    setRecording(false);
  }

  async function save(file) {
    setError("");
    setSaving(true);
    try {
      await attachNarration(job, file, file.name || "narration.webm");
      await onDone();
    } catch (err) {
      setError(err.message || "Couldn't send that recording to the studio.");
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 bg-panel border border-line rounded-lg p-4 space-y-3">
      <div>
        <p className="text-sm text-ink">Read this while you record</p>
        <div className="mt-2 max-h-44 overflow-y-auto bg-void border border-line rounded-lg p-3 space-y-1.5">
          {script.length === 0 && (
            <p className="text-sm text-ink-dim">This video has no script saved.</p>
          )}
          {script.map((line, i) => (
            <p key={i} className="text-sm text-ink-dim leading-relaxed">{line}</p>
          ))}
        </div>
        <p className="text-xs text-ink-dim mt-2">
          Your recording replaces the computer voice. The video is not rendered
          again, so this takes a few seconds. If you speak for longer than the
          video runs, the last picture is held until you finish.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {!recording && !blob && <Button size="sm" onClick={start}>Start recording</Button>}
        {recording && (
          <>
            <Button size="sm" variant="outline" onClick={stop}>Stop</Button>
            <span className="text-sm font-mono text-danger">
              ● {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
            </span>
          </>
        )}
        {blob && !recording && (
          <>
            {/* Playback of the recording just made, in the admin's own browser.
                There is no caption track for audio the admin recorded a second ago. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls src={URL.createObjectURL(blob)} className="h-9" />
            <Button size="sm" onClick={() => save(blob)} disabled={saving}>
              {saving ? "Sending…" : "Use this recording"}
            </Button>
            <Button size="sm" variant="ghost" onClick={start}>Record again</Button>
          </>
        )}

        <label className="text-sm text-ink-dim cursor-pointer hover:text-ink">
          <span className="underline">or upload a file</span>
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) save(f); }}
          />
        </label>

        <Button size="sm" variant="ghost" onClick={onCancel}>Close</Button>
      </div>
    </div>
  );
}

/** Flatten a spec back into the lines that were spoken, in order. */
function scriptLines(spec) {
  if (!spec) return [];
  const lines = [];
  if (spec.introSpeech) lines.push(spec.introSpeech);
  (spec.segments || []).forEach((segment) => {
    if (segment.headingSpeech) lines.push(segment.headingSpeech);
    (segment.frames || []).forEach((frame) => {
      if (frame.say) lines.push(frame.say);
    });
  });
  if (spec.outroSpeech) lines.push(spec.outroSpeech);
  return lines;
}
