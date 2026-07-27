import React, { useEffect, useState } from "react";
import CourseDetail from "../components/CourseDetail";
import { EDUCATION_SUBJECTS } from "../data/mockData";

const EDU_KEYS = new Set(["maths", "english"]);

export default function CoursesPage({ subjectDetail }) {
  const [tab, setTab] = useState(EDU_KEYS.has(subjectDetail) ? "education" : "chess");
  const [eduSubject, setEduSubject] = useState(EDU_KEYS.has(subjectDetail) ? subjectDetail : null);

  // Keep the tab / sub-selection in sync with nav deep-links (goTo("courses", key)).
  useEffect(() => {
    if (EDU_KEYS.has(subjectDetail)) {
      setTab("education");
      setEduSubject(subjectDetail);
    } else if (subjectDetail === "chess") {
      setTab("chess");
      setEduSubject(null);
    }
  }, [subjectDetail]);

  function selectTab(next) {
    setTab(next);
    if (next === "chess") setEduSubject(null);
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Chess & Education</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-3 text-[#e7ecf5]">Courses</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-8">
        One academy, two pillars: pure chess strategy for competitive play, and a chess-integrated
        Education track covering the standard school curriculum.
      </p>

      {/* Section tabs */}
      <div className="flex gap-2 border-b border-[#2d3b53] mb-8">
        {[
          { key: "chess", label: "♞ Chess" },
          { key: "education", label: "📘 Education" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`px-5 py-3 font-display text-lg border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-[#d4af37] text-[#d4af37]" : "border-transparent text-[#93a1b8] hover:text-[#e7ecf5]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "chess" && <CourseDetail subjectKey="chess" />}

      {tab === "education" && !eduSubject && (
        <div>
          <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">School Curriculum</span>
          <h2 className="font-display text-2xl sm:text-3xl mt-3 mb-6 text-[#e7ecf5]">Choose a subject</h2>
          <div className="grid sm:grid-cols-2 gap-5 max-w-2xl">
            {EDUCATION_SUBJECTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setEduSubject(s.key)}
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
      )}

      {tab === "education" && eduSubject && (
        <CourseDetail subjectKey={eduSubject} onBack={() => setEduSubject(null)} />
      )}
    </div>
  );
}
