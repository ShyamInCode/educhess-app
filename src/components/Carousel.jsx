import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getPublicStorageUrl, CAROUSEL_BUCKET } from "../lib/media";

export default function Carousel() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("carousel_slides")
      .select("*")
      .eq("published", true)
      .order("position", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        // A failed fetch used to be indistinguishable from "no slides", so the
        // carousel silently disappeared from the homepage with nothing logged.
        if (error) {
          console.error("[Carousel] failed to load slides", error);
          setFailed(true);
        } else {
          setSlides(data || []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 3500);
    return () => clearInterval(t);
  }, [paused, slides.length]);

  if (failed) {
    return (
      <div className="rounded-2xl border border-[#2d3b53] bg-[#1e293b] p-6 text-center">
        <p className="text-sm text-[#93a1b8]">
          Our photo gallery couldn't load right now. Please refresh the page.
        </p>
      </div>
    );
  }

  if (loading || slides.length === 0) return null;

  const cur = slides[index];

  return (
    <div
      className="relative rounded-2xl overflow-hidden border-2 border-[#d4af37]/50 shadow-2xl bg-[#1e293b]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Fixed frame keeps the carousel from jumping between slides, but the
          image is `object-contain` so an upload of ANY aspect ratio is shown
          whole rather than cropped. A blurred copy fills the letterbox so the
          result still looks deliberate. */}
      <div key={cur.id} className="relative aspect-video w-full overflow-hidden bg-[#0f172a]">
        <img
          src={getPublicStorageUrl(CAROUSEL_BUCKET, cur.storage_path)}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
        />
        <img
          src={getPublicStorageUrl(CAROUSEL_BUCKET, cur.storage_path)}
          alt={cur.caption || "EduChess"}
          className="relative w-full h-full object-contain"
        />
      </div>
      {cur.caption && (
        <p className="text-center text-base sm:text-lg text-[#e7ecf5] font-display px-6 py-4 bg-[#151f36]">
          {cur.caption}
        </p>
      )}
      {slides.length > 1 && (
        <div className="flex justify-center gap-2 pb-4 bg-[#151f36]">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIndex(i)}
              aria-label={`Show slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-[#d4af37]" : "w-1.5 bg-[#2d3b53]"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
