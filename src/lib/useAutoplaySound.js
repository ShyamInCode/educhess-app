import { useEffect } from "react";

/**
 * Autoplay a <video>, preferring sound but never hijacking the visitor.
 *
 * Previously this set `volume = 1` and then attached *global* pointerdown /
 * keydown / touchstart listeners, so the visitor's first tap anywhere on the
 * page — including on the Login button or a nav link — started full-volume
 * audio. On a phone, in a classroom, that was the worst moment on the site.
 *
 * Now: try unmuted autoplay once (browsers allow it if the visitor has already
 * interacted with the site). If the browser blocks it, fall back to *muted*
 * autoplay so the video still plays, and leave unmuting to the visitor via the
 * native controls. No global listeners, no surprise audio.
 *
 * @param {React.RefObject<HTMLVideoElement>} videoRef
 * @param {any[]} deps - re-run whenever these change (e.g. the video src)
 */
export function useAutoplaySound(videoRef, deps = []) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    let cancelled = false;

    video.muted = false;
    const attempt = video.play();

    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        // Blocked because it's unmuted — retry silently. The visitor can
        // unmute from the controls if they want sound.
        if (cancelled || !videoRef.current) return;
        videoRef.current.muted = true;
        const retry = videoRef.current.play();
        if (retry && typeof retry.catch === "function") retry.catch(() => {});
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
