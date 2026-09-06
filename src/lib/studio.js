import { supabase } from "./supabaseClient";
import { VIDEO_BUCKET, getSignedVideoUrl } from "./media";

/*
  studio.js — the browser half of the Video Studio.

  The panel does four things and none of them are rendering: it queues a job,
  watches it, previews the result, and files it into a course. Everything
  expensive happens on the academy PC, in studio/worker.py.

  Nothing here can bypass a policy. `video_jobs` is admin-only in RLS, the
  status column is not writable from a browser at all, and publishing goes
  through `publish_video_job()` so the chapter, the videos row and the job all
  move together or not at all. See supabase/06_studio.sql.
*/

export const JOB_STATUS = {
  queued:    { label: "Waiting for the studio", tone: "wait" },
  claimed:   { label: "Starting",               tone: "work" },
  rendering: { label: "Rendering",              tone: "work" },
  ready:     { label: "Ready to preview",       tone: "ready" },
  published: { label: "In the course",          tone: "done" },
  failed:    { label: "Failed",                 tone: "bad" },
  cancelled: { label: "Cancelled",              tone: "off" },
};

/** Statuses where the worker is expected to be doing something right now. */
export const ACTIVE_STATUSES = ["queued", "claimed", "rendering"];

/**
 * If nothing has touched a job for this long while it is supposedly being
 * worked on, the worker is not running. The panel says so rather than
 * spinning forever, because "the studio is offline" is a fixable problem and
 * a spinner is not.
 */
export const STALE_AFTER_MS = 3 * 60 * 1000;

export function isStale(job) {
  if (!ACTIVE_STATUSES.includes(job?.status)) return false;
  if (job.status === "queued" && !job.worker) return false;   // nobody has claimed it yet
  return Date.now() - new Date(job.updated_at).getTime() > STALE_AFTER_MS;
}

export async function listJobs(limit = 25) {
  const { data, error } = await supabase
    .from("video_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function createJob({ kind, title, category, chapter, spec, options }) {
  const { data, error } = await supabase
    .from("video_jobs")
    .insert({
      kind,
      title: title.trim(),
      category,
      chapter: chapter?.trim() || null,
      spec,
      options: options || {},
      created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Only the columns 06_studio.sql grants: title, chapter, spec, options,
 *  narration_path, error. Anything else silently no-ops. */
export async function updateJob(id, patch) {
  const { error } = await supabase.from("video_jobs").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setJobStatus(id, status) {
  const { error } = await supabase.rpc("set_video_job_status", {
    p_job_id: id,
    p_status: status,
  });
  if (error) throw error;
}

export const requeueJob = (id) => setJobStatus(id, "queued");
export const cancelJob = (id) => setJobStatus(id, "cancelled");

/**
 * Throw the job away, and its file with it.
 *
 * The object goes first. If the row went first and the delete failed, the
 * object would be left in the bucket with nothing pointing at it — reachable
 * by admins, invisible to everyone, and impossible to find again. This way a
 * failure leaves the job in the list, which is the state someone can act on.
 */
export async function deleteJob(job) {
  if (job.storage_path) {
    await supabase.storage.from(VIDEO_BUCKET).remove([job.storage_path]);
  }
  if (job.narration_path) {
    await supabase.storage.from(VIDEO_BUCKET).remove([job.narration_path]);
  }
  const { error } = await supabase.from("video_jobs").delete().eq("id", job.id);
  if (error) throw error;
}

export async function publishJob({ jobId, chapter, title, minTier }) {
  const { data, error } = await supabase.rpc("publish_video_job", {
    p_job_id: jobId,
    p_chapter: chapter,
    p_title: title || null,
    p_min_tier: minTier || null,
  });
  if (error) throw error;
  return data;
}

/** A short-lived URL for the preview player. Admins pass the storage policy
 *  even before a video is filed, which is what makes previewing possible. */
export async function previewUrl(job) {
  if (!job?.storage_path) return null;
  const signed = await getSignedVideoUrl(job.storage_path);
  return signed?.url || null;
}

/**
 * Upload the admin's own narration and hand the job back to the worker.
 *
 * This does not re-render. The frames, the board, the branding and the encode
 * settings are already right; the worker downloads the finished mp4, lays the
 * new audio over it and puts it back — seconds rather than minutes. That is
 * the whole reason "record it in my own voice" is practical at all.
 */
export async function attachNarration(job, blob, filename) {
  const extension = (filename?.split(".").pop() || "webm").toLowerCase();
  const path = `_studio-voice/${job.id}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(path, blob, {
      cacheControl: "60",
      upsert: false,
      contentType: blob.type || "audio/webm",
    });
  if (uploadError) throw uploadError;

  await updateJob(job.id, {
    narration_path: path,
    options: { ...(job.options || {}), revoiceOnly: true },
  });
  await requeueJob(job.id);
  return path;
}

/** Chapters for a category, for the module picker and the publish dialog. */
export async function listChapters(category) {
  const { data, error } = await supabase
    .from("course_chapters")
    .select("*")
    .eq("category", category)
    .order("position", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return data || [];
}

export function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
