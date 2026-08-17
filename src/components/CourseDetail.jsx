import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { COURSE_TITLES, COURSE_VIDEOS } from "../data/mockData";
import { useSignedVideo } from "../lib/useSignedVideo";
import { useAutoplaySound } from "../lib/useAutoplaySound";
import { useAuth } from "../lib/AuthContext";
import { tierAllows, tierName } from "../lib/tiers";

/*
  NOTE on what the padlock is, and what it is not.

  The padlock is now cosmetic in the useful direction: it tells a visitor
  what they would get, and the SERVER decides whether they get it. The
  course-videos bucket is private and the SELECT policy on storage.objects
  (supabase/04_storage.sql) compares the caller's tier against the chapter's
  min_tier before Supabase will sign a URL at all. Removing the padlock in
  devtools and clicking a locked lesson gets you a refusal, not a video.

  What the padlock is NOT is DRM. Someone who legitimately has access can
  still save the file — the signed URL is a real, playable link for its
  lifetime. The boundary is "may this person watch it", not "can this person
  keep it".
*/

export default function CourseDetail({ subjectKey, onBack }) {
  const { user, tier } = useAuth();
  const [expanded, setExpanded] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [videosByChapter, setVideosByChapter] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null); // { title, path } | null
  const videoRef = useRef(null);

  const title = COURSE_TITLES[subjectKey];
  // The course introduction sits at the root of the bucket, where the storage
  // policy lets anyone read it. Falling back to it means a logged-out visitor
  // always has something playing rather than an empty frame.
  const playingPath = activeVideo ? activeVideo.path : COURSE_VIDEOS[subjectKey];
  const player = useSignedVideo(playingPath);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setActiveVideo(null);
      setExpanded(null);

      const [{ data: chapterRows }, { data: videoRows }] = await Promise.all([
        supabase
          .from("course_chapters")
          .select("*")
          .eq("category", subjectKey)
          .order("position", { ascending: true })
          .order("title", { ascending: true }),
        supabase
          .from("videos")
          .select("*")
          .eq("category", subjectKey)
          .order("created_at", { ascending: true }),
      ]);

      if (cancelled) return;

      const grouped = {};
      (videoRows || []).forEach((v) => {
        const key = v.chapter || "Uncategorized";
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(v);
      });

      setChapters(chapterRows || []);
      setVideosByChapter(grouped);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [subjectKey]);

  // Autoplay with sound whenever the video source changes — see
  // src/lib/useAutoplaySound.js for the browser-policy fallback. Keyed on the
  // signed URL rather than on `activeVideo`, because the element only has a
  // src once the URL has been minted.
  useAutoplaySound(videoRef, [player.url]);

  const playingTitle = activeVideo ? activeVideo.title : "Course Introduction";

  return (
    <div>
      {onBack && (
        <button onClick={onBack} className="block text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-5">← Back</button>
      )}
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Curriculum Map · {chapters.length} Chapters</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">{title}</h1>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        {/* Left: chapters accordion, listing uploaded videos.
            Ordered after the video on mobile so visitors see the player
            first without scrolling; back to its normal left column on lg+. */}
        <div className="space-y-3 order-2 lg:order-1">
          {loading && <p className="text-sm text-[#93a1b8]">Loading chapters…</p>}
          {!loading && chapters.length === 0 && (
            <p className="text-sm text-[#93a1b8]">No chapters yet. Check back soon.</p>
          )}
          {chapters.map((ch, i) => {
            const chapterVideos = videosByChapter[ch.title] || [];
            const required = ch.min_tier || "pro";
            const locked = !tierAllows(tier, required);
            return (
              <div key={ch.id} className="bg-[#1e293b] border border-[#2d3b53] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
                >
                  <p className={`font-display text-base sm:text-lg ${locked ? "text-[#93a1b8]" : "text-[#e7ecf5]"}`}>
                    {locked && <span aria-hidden="true" className="mr-2">🔒</span>}
                    {ch.title}
                  </p>
                  <span className="flex items-center gap-3 shrink-0">
                    {locked ? (
                      <span className="font-mono text-xs uppercase tracking-wide text-[#d4af37] border border-[#d4af37]/40 rounded-full px-2 py-0.5">
                        {tierName(required)}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-[#93a1b8]">{chapterVideos.length} video{chapterVideos.length === 1 ? "" : "s"}</span>
                    )}
                    <span className={`font-mono text-xl text-[#d4af37] transition-transform ${expanded === i ? "rotate-45" : ""}`}>+</span>
                  </span>
                </button>
                {expanded === i && locked && (
                  <div className="px-5 pb-4">
                    <p className="text-sm text-[#93a1b8]">
                      {chapterVideos.length} video{chapterVideos.length === 1 ? "" : "s"} in this chapter,
                      included with {tierName(required)}.
                    </p>
                    <Link
                      to="/upgrade"
                      className="inline-block mt-3 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
                    >
                      {user ? `Upgrade to ${tierName(required)}` : `See ${tierName(required)}`}
                    </Link>
                  </div>
                )}
                {expanded === i && !locked && (
                  <div className="px-5 pb-4">
                    {chapterVideos.length === 0 ? (
                      <p className="text-sm text-[#93a1b8]">No videos uploaded to this chapter yet.</p>
                    ) : (
                      <ul className="space-y-1">
                        {chapterVideos.map((v) => (
                          <li key={v.id}>
                            <button
                              onClick={() => setActiveVideo({ title: v.title, path: v.storage_path })}
                              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                                activeVideo?.path === v.storage_path
                                  ? "bg-[#0f172a] text-[#d4af37]"
                                  : "text-[#e7ecf5] hover:bg-[#0f172a] hover:text-[#34d399]"
                              }`}
                            >
                              <span>▶</span>
                              <span>{v.title}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: video player on top, chessboard quiz below.
            Ordered first on mobile so the video is immediately visible. */}
        <div className="space-y-6 h-fit order-1 lg:order-2 lg:sticky lg:top-0">
          <div>
            <div className="rounded-2xl overflow-hidden border-2 border-[#d4af37]/50 shadow-2xl bg-[#1e293b] aspect-video">
              {/* No object-cover: <video> letterboxes by default, so a 4:3 or
                  vertical lesson recording is shown whole instead of having its
                  sides (and the native control bar) clipped. */}
              {player.url ? (
                <video
                  key={player.url}
                  ref={videoRef}
                  className="w-full h-full"
                  src={player.url}
                  autoPlay
                  loop
                  playsInline
                  controls
                  // The URL has a deadline. If it lapsed while this tab sat
                  // open, the element reports a media error — mint a new one
                  // rather than leaving a dead player on screen.
                  onError={player.refresh}
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="w-full h-full grid place-items-center px-6 text-center">
                  {player.status === "loading" && (
                    <p className="text-sm text-[#93a1b8] font-mono">Loading…</p>
                  )}
                  {/* "The server said no" and "it broke" are different
                      sentences and lead to different places. Telling a paying
                      Academy member to upgrade because a request failed would
                      be worse than saying nothing. */}
                  {player.status === "denied" && (
                    <div>
                      <p className="text-sm text-[#93a1b8]">
                        This lesson is part of a paid chapter.
                      </p>
                      <Link
                        to="/upgrade"
                        className="inline-block mt-3 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
                      >
                        See the plans
                      </Link>
                    </div>
                  )}
                  {player.status === "failed" && (
                    <div>
                      <p className="text-sm text-[#f87171]">Couldn't load that video.</p>
                      <button
                        onClick={player.refresh}
                        className="mt-3 text-sm font-mono text-[#34d399] hover:text-[#6ee7b7]"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-sm text-[#93a1b8] mt-2 font-mono">{playingTitle}</p>
          </div>

        </div>
      </div>

    </div>
  );
}
