import React, { useEffect, useState } from "react";
import { TESTIMONIALS } from "../data/mockData";

export default function Testimonials() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % TESTIMONIALS.length), 4500);
    return () => clearInterval(t);
  }, [paused]);

  const cur = TESTIMONIALS[index];

  return (
    <div
      className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8 relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">From the Cohort</span>
      <h2 className="font-display text-2xl mt-2 mb-6 text-[#e7ecf5]">What parents are saying</h2>

      <div key={index} className="min-h-[110px]">
        <div className="text-[#d4af37] text-base mb-3">{"★".repeat(cur.rating)}{"☆".repeat(5 - cur.rating)}</div>
        <p className="text-[#e7ecf5] text-lg sm:text-xl leading-relaxed font-display">"{cur.quote}"</p>
        <p className="text-base text-[#93a1b8] mt-4 font-mono">{cur.name} · {cur.role}</p>
      </div>

      <div className="flex gap-2 mt-6">
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Show testimonial ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-[#d4af37]" : "w-1.5 bg-[#2d3b53]"}`}
          />
        ))}
      </div>
    </div>
  );
}
