import { useEffect } from "react";

/**
 * Autoplay a <video> element with sound on, everywhere it's used.
 *
 * Browsers generally allow unmuted autoplay once a visitor has interacted
 * with the site at all (which is almost always true here — they clicked a
 * nav link, a course card, etc. to reach the page). Where a browser still
 * blocks it, this falls back to starting playback (still unmuted) on the
 * very next interaction anywhere on the page — not just a click on the
 * video itself — so it feels automatic rather than requiring the visitor
 * to hunt for a play button.
 *
 * @param {React.RefObject<HTMLVideoElement>} videoRef
 * @param {any[]} deps - re-run whenever these change (e.g. the video src)
 */
export function useAutoplaySound(videoRef, deps = []) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    video.muted = false;
    video.volume = 1;

    const tryPlay = () => {
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };

    tryPlay();

    function onFirstInteraction() {
      tryPlay();
    }

    window.addEventListener("pointerdown", onFirstInteraction, { once: true });
    window.addEventListener("keydown", onFirstInteraction, { once: true });
    window.addEventListener("touchstart", onFirstInteraction, { once: true });

    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
      window.removeEventListener("touchstart", onFirstInteraction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
