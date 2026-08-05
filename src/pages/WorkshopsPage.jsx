import React from "react";
import { Link } from "react-router-dom";

/*
  Workshops.

  There is no `workshops` table yet (ROADMAP P5), so this page describes the
  formats and routes people to the contact form rather than listing invented
  sessions with invented dates. Once the schema and admin tab exist, the
  static list below becomes a query and the "ask us" call to action becomes a
  registration form.
*/
const FORMATS = [
  {
    title: "Weekend intensives",
    body: "A half day on one theme, usually openings or endgames, with a coach working through positions on the board.",
  },
  {
    title: "School sessions",
    body: "We run introductory chess sessions at schools around Visakhapatnam, from a single assembly to a full term.",
  },
  {
    title: "Simuls and guest sessions",
    body: "One strong player against many students at once. The fastest way for a beginner to learn how a stronger player thinks.",
  },
  {
    title: "Tournament preparation",
    body: "Short courses before local events: time management, opening choices, and playing under a clock.",
  },
];

export default function WorkshopsPage() {
  return (
    <div className="w-full max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <h1 className="font-display text-3xl sm:text-4xl mb-3 text-[#e7ecf5]">Workshops</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-10">
        Short, focused sessions alongside the regular coaching, run at both academies and at schools.
      </p>

      <div className="grid sm:grid-cols-2 gap-5">
        {FORMATS.map((f) => (
          <div key={f.title} className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
            <h2 className="font-display text-xl text-[#e7ecf5]">{f.title}</h2>
            <p className="text-base text-[#93a1b8] mt-2 leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-[#1e293b] border border-[#d4af37]/40 rounded-2xl p-6 sm:p-8">
        <h2 className="font-display text-xl text-[#e7ecf5]">Dates for the next sessions</h2>
        <p className="text-base text-[#93a1b8] mt-2 max-w-2xl leading-relaxed">
          Workshop dates are announced each term. Ask us and we will tell you what is running next, or
          arrange a session for your school or group.
        </p>
        <div className="flex flex-wrap gap-3 mt-5">
          <Link
            to="/contact"
            className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
          >
            Ask about workshops
          </Link>
          <Link
            to="/tournaments"
            className="px-5 py-2.5 rounded-lg border border-[#2d3b53] text-[#e7ecf5] font-semibold text-sm hover:border-[#d4af37]/60 transition-colors"
          >
            See tournaments
          </Link>
        </div>
      </div>
    </div>
  );
}
