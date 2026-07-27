import React from "react";
import { ROMAN_LEVELS } from "../data/mockData";

export default function LevelTrack({ unlockedCount = 1 }) {
  return (
    <div className="bg-[#1e293b]/60 border border-[#2d3b53] rounded-2xl p-6 mt-8">
      <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Level Progress</span>
      <h3 className="font-display text-lg sm:text-xl mt-2 mb-4 text-[#e7ecf5]">Ten levels to grandmaster</h3>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
        {ROMAN_LEVELS.map((numeral, i) => {
          const unlocked = i < unlockedCount;
          return (
            <div
              key={numeral}
              title={unlocked ? `Level ${numeral}` : `Complete Level ${ROMAN_LEVELS[i - 1]} to unlock`}
              className={`aspect-square rounded-xl border flex flex-col items-center justify-center font-display text-lg transition-all ${
                unlocked
                  ? "border-[#d4af37]/60 bg-[#0f172a] text-[#d4af37] cursor-pointer hover:-translate-y-0.5"
                  : "border-[#2d3b53] bg-[#0f172a]/40 text-[#93a1b8]/50 cursor-not-allowed"
              }`}
            >
              <span>{numeral}</span>
              {!unlocked && <span className="text-xs mt-0.5">🔒</span>}
            </div>
          );
        })}
      </div>
      <p className="text-sm text-[#93a1b8] mt-4 font-mono">Level I unlocked — clear its quiz below to open Level II.</p>
    </div>
  );
}
