import React, { useState } from "react";
import PuzzleTrainer from "../components/PuzzleTrainer";

import { CATEGORIES, DIFFICULTIES } from "../lib/puzzles";

export default function PuzzlesPage() {
  const [category, setCategory] = useState(null);
  const [difficulty, setDifficulty] = useState(null);

  if (category && difficulty) {
    return (
      <div className="w-full max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
        <PuzzleTrainer
          category={category}
          difficulty={difficulty}
          onBack={() => {
            setCategory(null);
            setDifficulty(null);
          }}
        />
      </div>
    );
  }

  if (category) {
    const cat = CATEGORIES.find((c) => c.key === category);
    return (
      <div className="w-full max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
        <button
          onClick={() => setCategory(null)}
          className="block text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-5"
        >
          ← Back to Puzzles
        </button>
        <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">{cat.title}</span>
        <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Choose a difficulty</h1>
        <div className="grid sm:grid-cols-3 gap-5">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              onClick={() => setDifficulty(d.key)}
              className="text-left bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 hover:border-[#d4af37]/60 hover:-translate-y-1 transition-all group cursor-pointer"
            >
              <h3 className="font-display text-xl text-[#e7ecf5] group-hover:text-[#d4af37] transition-colors">{d.label}</h3>
              <span className="inline-block mt-4 text-sm font-mono text-[#34d399]">Start solving →</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Sharpen Your Tactics</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-3 text-[#e7ecf5]">Puzzles</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-8">
        Pick a category and difficulty, then solve a continuous, randomly-ordered stream of puzzles. One
        clears, the next one loads automatically.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className="text-left bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 hover:border-[#d4af37]/60 hover:-translate-y-1 transition-all group cursor-pointer"
          >
            <span className="text-5xl block mb-4 text-[#d4af37] bob">{c.icon}</span>
            <h3 className="font-display text-xl text-[#e7ecf5] group-hover:text-[#d4af37] transition-colors">{c.title}</h3>
            <p className="text-sm text-[#93a1b8] mt-1">{c.desc}</p>
            <span className="inline-block mt-4 text-sm font-mono text-[#34d399]">Choose difficulty →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
