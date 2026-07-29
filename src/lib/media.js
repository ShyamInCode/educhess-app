import { supabase } from "./supabaseClient";

/* ============================================================
   Video CDN helper
   ------------------------------------------------------------
   All course + marketing videos are migrated off the local
   /public folder and are served from a public Supabase Storage
   bucket instead. Admin-uploaded videos (via AdminPanel) land in
   the same bucket, so a single helper resolves both the seeded
   defaults ("chess.mp4", "maths.mp4", ...) and freshly uploaded
   object paths to a public CDN URL.

   Bucket setup (one-time, in the Supabase dashboard or SQL):
     1. Storage → Create bucket → name it exactly "course-videos"
        and mark it Public.
     2. Upload the four seed files (homepage.mp4, chess.mp4,
        maths.mp4, english.mp4) at the bucket root.
   ============================================================ */

export const VIDEO_BUCKET = "course-videos";

/**
 * Resolve a storage object path (e.g. "chess.mp4" or
 * "maths/1706300000-lesson.mp4") to its public CDN URL.
 * Returns null if `path` is falsy so callers can fall back gracefully.
 */
export function getPublicVideoUrl(path) {
  if (!path) return null;
  const { data } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

export const GALLERY_BUCKET = "gallery-images";
export const CAROUSEL_BUCKET = "carousel-images";

/**
 * Same idea as getPublicVideoUrl, generalized to any public bucket —
 * used for the About-page gallery and homepage carousel images.
 */
export function getPublicStorageUrl(bucket, path) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}
