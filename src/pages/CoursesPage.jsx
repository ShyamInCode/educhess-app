import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import CourseDetail from "../components/CourseDetail";
import { SUBJECT_TILES, EDU_COURSES } from "../data/mockData";

/*
  Which course is open is derived from the URL, never mirrored into state.

  The old version seeded `useState(subject)` and synced it in an effect, so
  "Back" cleared the state while leaving the URL on /courses/chess — and
  picking Chess from the nav then navigated to the same path, the param didn't
  change, the effect didn't fire, and the click appeared to do nothing.
  Back now navigates, which also makes the browser's own Back button agree
  with the in-page one.
*/
export default function CoursesPage() {
  const { subject } = useParams();
  const navigate = useNavigate();

  // An unknown /courses/:subject falls back to the grid rather than rendering
  // an empty detail page.
  const selected = SUBJECT_TILES.some((s) => s.key === subject) ? subject : null;

  if (selected) {
    return (
      <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
        <CourseDetail subjectKey={selected} onBack={() => navigate("/courses")} />
      </div>
    );
  }

  const [chess] = SUBJECT_TILES;

  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <h1 className="font-display text-3xl sm:text-4xl mb-3 text-[#e7ecf5]">Courses</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-10">
        Chess coaching from first moves to tournament play.
      </p>

      <section className="mb-12">
        <h2 className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase mb-4">Chess</h2>
        <Link
          to={`/courses/${chess.key}`}
          className="block w-full text-left bg-[#1e293b] border-2 border-[#d4af37]/60 rounded-2xl p-6 sm:p-8 hover:border-[#d4af37] hover:-translate-y-1 transition-all group cursor-pointer"
        >
          <div className="flex items-center gap-5">
            <span className="text-6xl text-[#d4af37] bob">{chess.icon}</span>
            <div>
              <h3 className="font-display text-2xl sm:text-3xl text-[#e7ecf5] group-hover:text-[#d4af37] transition-colors">
                {chess.title}
              </h3>
              <p className="text-base text-[#93a1b8] mt-1">{chess.sub}</p>
              <span className="inline-block mt-3 text-sm font-mono text-[#34d399]">Open curriculum map →</span>
            </div>
          </div>
        </Link>
      </section>

      {/*
        Edu Courses are announced but not running yet, so they are plain cards
        rather than links. A tile that navigates into an empty course reads as
        a broken site; one that says "Coming soon" reads as a roadmap.
      */}
      <section>
        <div className="flex items-baseline gap-3 flex-wrap mb-4">
          <h2 className="font-mono text-sm tracking-[0.3em] text-[#93a1b8] uppercase">Edu Courses</h2>
          <span className="font-mono text-xs text-[#f0d98c]">In development</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {EDU_COURSES.map((s) => (
            <div
              key={s.key}
              className="bg-[#1e293b]/60 border border-[#2d3b53] rounded-2xl p-6 relative overflow-hidden"
            >
              <span className="absolute top-4 right-4 font-mono text-[0.65rem] tracking-widest uppercase text-[#0f172a] bg-[#f0d98c] rounded-full px-2.5 py-1">
                Coming soon
              </span>
              <span className="text-5xl block mb-4 text-[#d4af37]/70">{s.icon}</span>
              <h3 className="font-display text-xl text-[#e7ecf5]">{s.title}</h3>
              <p className="text-base text-[#93a1b8] mt-1">{s.sub}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
