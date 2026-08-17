import { supabase } from "./supabaseClient";

/* ============================================================
   Storage helpers
   ------------------------------------------------------------
   Two buckets behave differently, on purpose.

   course-videos is PRIVATE. It holds the paid product, so there is no such
   thing as a public URL for it any more: every read goes through
   `createSignedUrl`, which Supabase only grants if the caller passes the
   SELECT policy on storage.objects. That policy (supabase/04_storage.sql)
   is the paywall — it lets anyone read a chapter marked `min_tier = 'free'`
   and the bucket-root marketing clips, and nobody below the required tier
   read anything else.

   That is the whole of the fix for audit SEC-02. Before it, `videos` carried
   a public CDN `url` column and the bucket was public, so the chapter
   padlock was a UI boundary: a signed-out visitor could read a locked
   video's link out of the network tab and stream it.

   carousel-images and gallery-images stay PUBLIC. They are marketing photos
   on the logged-out homepage and About page, they want CDN caching, and
   nothing is sold on them — so `getPublicUrl` is still right for those.
   ============================================================ */

export const VIDEO_BUCKET = "course-videos";
export const GALLERY_BUCKET = "gallery-images";
export const CAROUSEL_BUCKET = "carousel-images";

/**
 * How long a signed video URL lasts, in seconds.
 *
 * Long enough to watch a lesson without the tab going dead mid-sentence,
 * short enough that a link pasted into a WhatsApp group stops working the
 * same afternoon. The player re-requests on expiry rather than failing, so
 * raising this buys nothing except a longer-lived leaked URL.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 2;

/**
 * Mint a short-lived URL for one object in the private course-videos bucket.
 *
 * Returns `{ url, expiresAt }` on success. Throws on refusal, and the caller
 * is expected to tell those two cases apart: a refusal here means "your tier
 * does not cover this chapter", which is a different screen from "the video
 * failed to load".
 */
export async function getSignedVideoUrl(path) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;
  if (!data?.signedUrl) return null;

  return {
    url: data.signedUrl,
    // Refresh a little before the real deadline so a click at the boundary
    // doesn't race the expiry.
    expiresAt: Date.now() + (SIGNED_URL_TTL_SECONDS - 60) * 1000,
  };
}

/** Does this error mean "the storage policy said no", rather than "it broke"? */
export function isVideoAccessError(error) {
  const message = error?.message || "";
  const status = error?.statusCode ?? error?.status;
  return (
    String(status) === "400" ||
    String(status) === "403" ||
    String(status) === "404" ||
    /not found|unauthor|forbidden|permission|violates row-level security/i.test(message)
  );
}

/**
 * Resolve a storage object path to its public CDN URL.
 *
 * Only valid for the two PUBLIC buckets. Passing a course-videos path here
 * returns a URL that 404s — use getSignedVideoUrl instead.
 */
export function getPublicStorageUrl(bucket, path) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}
