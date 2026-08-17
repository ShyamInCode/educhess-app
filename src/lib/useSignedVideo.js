import { useCallback, useEffect, useRef, useState } from "react";
import { getSignedVideoUrl, isVideoAccessError } from "./media";

/* ============================================================
   Signed video URLs, with expiry handled.
   ------------------------------------------------------------
   course-videos is a private bucket, so a <video src> is a URL with a
   deadline on it (src/lib/media.js). Two things follow, and this hook exists
   so neither has to be reimplemented at each player:

   1. The URL has to be fetched, which means the player has loading, ready,
      denied and failed states rather than just a src string.

   2. It expires. A student who leaves a lesson open over lunch comes back to
      a dead link, so `refresh()` re-requests on demand and the player calls
      it from the <video> element's own onError.

   "Denied" is kept distinct from "failed" all the way through. They lead to
   completely different screens: one offers an upgrade, the other says
   something went wrong. Collapsing them would tell a paying Academy member
   that a broken CDN means they need to pay more.
   ============================================================ */

export function useSignedVideo(path) {
  const [state, setState] = useState({ url: null, status: path ? "loading" : "idle" });
  const expiresAtRef = useRef(0);
  // Guards against a slow response for an old path landing after the user
  // has already clicked a different video.
  const requestedPathRef = useRef(path);

  const load = useCallback(
    async (forPath) => {
      if (!forPath) {
        setState({ url: null, status: "idle" });
        return;
      }
      setState((s) => ({ url: s.url, status: "loading" }));
      try {
        const signed = await getSignedVideoUrl(forPath);
        if (requestedPathRef.current !== forPath) return;
        if (!signed) {
          setState({ url: null, status: "failed" });
          return;
        }
        expiresAtRef.current = signed.expiresAt;
        setState({ url: signed.url, status: "ready" });
      } catch (error) {
        if (requestedPathRef.current !== forPath) return;
        setState({ url: null, status: isVideoAccessError(error) ? "denied" : "failed" });
      }
    },
    []
  );

  useEffect(() => {
    requestedPathRef.current = path;
    load(path);
  }, [path, load]);

  /**
   * Re-mint the URL. Safe to call from <video onError>: that fires for a
   * genuinely broken file too, and re-requesting once is cheap. A second
   * failure lands in `failed` or `denied` and stops there rather than looping.
   */
  const refresh = useCallback(() => {
    if (requestedPathRef.current) load(requestedPathRef.current);
  }, [load]);

  /** True once the current URL is close enough to expiry to be worth replacing. */
  const isStale = useCallback(() => Date.now() >= expiresAtRef.current, []);

  return { url: state.url, status: state.status, refresh, isStale };
}
