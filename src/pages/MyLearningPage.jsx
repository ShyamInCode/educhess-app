import React from "react";
import { SUBJECT_TILES } from "../data/mockData";

const PROGRESS_BY_KEY = { chess: 35, maths: 60, english: 20 };

export default function MyLearningPage({ goTo }) {
  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Continue where you left off</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">My Learning</h1>

      <div className="space-y-4">
        {SUBJECT_TILES.map((s) => (
          <div key={s.key} className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-5 flex items-center gap-5">
            <span className="text-4xl text-[#d4af37]">{s.icon}</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-lg text-[#e7ecf5]">{s.title}</h3>
              <p className="text-sm text-[#93a1b8]">{s.sub}</p>
              <div className="w-full h-2 bg-[#0f172a] rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-[#d4af37]" style={{ width: `${PROGRESS_BY_KEY[s.key]}%` }} />
              </div>
            </div>
            <button
              onClick={() => goTo("courses", s.key)}
              className="shrink-0 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
            >
              Resume
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
