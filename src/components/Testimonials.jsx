import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Testimonials() {
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("testimonials")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[Testimonials] failed to load", error);
          setFailed(true);
        } else {
          setTestimonials(data || []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (paused || testimonials.length === 0) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % testimonials.length), 4500);
    return () => clearInterval(t);
  }, [paused, testimonials.length]);

  const cur = testimonials[index];

  return (
    <div
      className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8 relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <h2 className="font-display text-2xl mb-6 text-[#e7ecf5]">What parents are saying</h2>

      {loading && <p className="text-[#93a1b8] text-base">Loading testimonials…</p>}

      {/* "None yet" and "the request failed" are different things — saying the
          first when the second happened misrepresents the academy. */}
      {!loading && failed && (
        <p className="text-[#f87171] text-base">
          These couldn't load right now. Please refresh the page.
        </p>
      )}

      {!loading && !failed && testimonials.length === 0 && (
        <p className="text-[#93a1b8] text-base">Testimonials from our families will appear here soon.</p>
      )}

      {!loading && cur && (
        <>
          <div key={index} className="min-h-[110px]">
            <div className="text-[#d4af37] text-base mb-3">{"★".repeat(cur.rating)}{"☆".repeat(5 - cur.rating)}</div>
            <p className="text-[#e7ecf5] text-lg sm:text-xl leading-relaxed font-display">"{cur.quote}"</p>
            <p className="text-base text-[#93a1b8] mt-4 font-mono">{cur.name} · {cur.role}</p>
          </div>

          <div className="flex gap-2 mt-6">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Show testimonial ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-[#d4af37]" : "w-1.5 bg-[#2d3b53]"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
