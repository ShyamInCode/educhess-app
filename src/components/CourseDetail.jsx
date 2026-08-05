import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { COURSE_TITLES, COURSE_VIDEOS } from "../data/mockData";
import { getPublicVideoUrl } from "../lib/media";
import { useAutoplaySound } from "../lib/useAutoplaySound";

export default function CourseDetail({ subjectKey, onBack }) {
  const [expanded, setExpanded] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [videosByChapter, setVideosByChapter] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null); // { title, url } | null
  const videoRef = useRef(null);

  const title = COURSE_TITLES[subjectKey];
  const defaultVideoUrl = getPublicVideoUrl(COURSE_VIDEOS[subjectKey]);

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
  // src/lib/useAutoplaySound.js for the browser-policy fallback.
  useAutoplaySound(videoRef, [activeVideo]);

  const playingUrl = activeVideo ? activeVideo.url : defaultVideoUrl;
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
            return (
              <div key={ch.id} className="bg-[#1e293b] border border-[#2d3b53] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
                >
                  <p className="font-display text-base sm:text-lg text-[#e7ecf5]">{ch.title}</p>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs text-[#93a1b8]">{chapterVideos.length} video{chapterVideos.length === 1 ? "" : "s"}</span>
                    <span className={`font-mono text-xl text-[#d4af37] transition-transform ${expanded === i ? "rotate-45" : ""}`}>+</span>
                  </span>
                </button>
                {expanded === i && (
                  <div className="px-5 pb-4">
                    {chapterVideos.length === 0 ? (
                      <p className="text-sm text-[#93a1b8]">No videos uploaded to this chapter yet.</p>
                    ) : (
                      <ul className="space-y-1">
                        {chapterVideos.map((v) => (
                          <li key={v.id}>
                            <button
                              onClick={() => setActiveVideo({ title: v.title, url: v.url })}
                              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                                activeVideo?.url === v.url
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
              <video
                key={playingUrl}
                ref={videoRef}
                className="w-full h-full"
                src={playingUrl}
                autoPlay
                loop
                playsInline
                controls
              >
                Your browser does not support the video tag.
              </video>
            </div>
            <p className="text-sm text-[#93a1b8] mt-2 font-mono">{playingTitle}</p>
          </div>

        </div>
      </div>

    </div>
  );
}
