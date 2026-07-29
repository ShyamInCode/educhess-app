import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import CourseDetail from "../components/CourseDetail";
import { SUBJECT_TILES } from "../data/mockData";

export default function CoursesPage() {
  const { subject } = useParams();
  const [selected, setSelected] = useState(subject || null);

  // Keep the selection in sync with nav deep-links (goTo("courses", key)).
  useEffect(() => {
    if (subject) setSelected(subject);
  }, [subject]);

  if (selected) {
    return (
      <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
        <CourseDetail subjectKey={selected} onBack={() => setSelected(null)} />
      </div>
    );
  }

  const [chess, ...others] = SUBJECT_TILES;

  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Champion Chess Academy</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-3 text-[#e7ecf5]">Courses</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-8">
        Chess is our primary course — tournament-ready strategy for every level. We also teach Maths
        and English as their own separate courses.
      </p>

      {/* Chess — flagship course, shown larger/first */}
      <button
        onClick={() => setSelected(chess.key)}
        className="w-full text-left bg-[#1e293b] border-2 border-[#d4af37]/60 rounded-2xl p-6 sm:p-8 hover:border-[#d4af37] hover:-translate-y-1 transition-all group cursor-pointer mb-6"
      >
        <span className="font-mono text-xs text-[#34d399] tracking-widest uppercase">{chess.sub}</span>
        <div className="flex items-center gap-5 mt-3">
          <span className="text-6xl text-[#d4af37] bob">{chess.icon}</span>
          <div>
            <h2 className="font-display text-2xl sm:text-3xl text-[#e7ecf5] group-hover:text-[#d4af37] transition-colors">{chess.title}</h2>
            <span className="inline-block mt-2 text-sm font-mono text-[#34d399]">Open curriculum map →</span>
          </div>
        </div>
      </button>

      {/* Maths / English — separate courses, equal standing with each other */}
      <div className="grid sm:grid-cols-2 gap-5">
        {others.map((s) => (
          <button
            key={s.key}
            onClick={() => setSelected(s.key)}
            className="text-left bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 hover:border-[#d4af37]/60 hover:-translate-y-1 transition-all group cursor-pointer"
          >
            <span className="text-5xl block mb-4 text-[#d4af37] bob">{s.icon}</span>
            <h3 className="font-display text-xl text-[#e7ecf5] group-hover:text-[#d4af37] transition-colors">{s.title}</h3>
            <p className="text-base text-[#93a1b8] mt-1">{s.sub}</p>
            <span className="inline-block mt-4 text-sm font-mono text-[#34d399]">Open curriculum map →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
