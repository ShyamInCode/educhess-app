import React, { useState } from "react";
import LevelQuiz from "../components/LevelQuiz";
import LevelTrack from "../components/LevelTrack";
import { SUBJECT_TILES } from "../data/mockData";

export default function QuizPage() {
  const [course, setCourse] = useState(null);

  if (!course) {
    return (
      <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
        <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Test Your Position</span>
        <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Quiz</h1>
        <p className="text-base text-[#93a1b8] max-w-2xl mb-8">Pick a course to see its ten levels and take on the quiz for the level you've unlocked.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SUBJECT_TILES.map((s) => (
            <button
              key={s.key}
              onClick={() => setCourse(s.key)}
              className="text-left bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 hover:border-[#d4af37]/60 hover:-translate-y-1 transition-all group cursor-pointer"
            >
              <span className="text-5xl block mb-4 text-[#d4af37] bob">{s.icon}</span>
              <h3 className="font-display text-xl text-[#e7ecf5] group-hover:text-[#d4af37] transition-colors">{s.title}</h3>
              <p className="text-base text-[#93a1b8] mt-1">{s.sub}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const tile = SUBJECT_TILES.find((s) => s.key === course);

  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <button onClick={() => setCourse(null)} className="text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-4">← Back to Quiz</button>
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Quiz · {tile.title}</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Pick a level</h1>

      <LevelTrack unlockedCount={1} />

      <div className="mt-8 max-w-lg">
        <LevelQuiz label={`${tile.title} · Level I`} />
      </div>
    </div>
  );
}
