import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import EventCard from "../components/EventCard";

/*
  Workshops.

  Until Phase 4 this page was static copy describing four formats, because
  there was no `workshops` table. It is now the same shape as Tournaments:
  published, upcoming rows from the database, each with its own registration
  form. The "ask us" call to action stays at the bottom — schools and groups
  still book by talking to someone.
*/
export default function WorkshopsPage() {
  const [workshops, setWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("workshops")
      .select("*")
      .eq("published", true)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        // "Couldn't load" and "none scheduled" are different facts and a
        // parent acts differently on each, so they never share a message.
        if (error) {
          setLoadError("We couldn't load the workshop list just now. Please refresh the page.");
        } else {
          setWorkshops(data || []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Short &amp; Focused</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-3 text-[#e7ecf5]">Workshops</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-8">
        Short, focused sessions alongside the regular coaching, run at both academies and at schools.
        Register your child directly below.
      </p>

      {loading && <p className="text-sm text-[#93a1b8]">Loading…</p>}
      {!loading && loadError && (
        <div className="bg-[#1e293b] border border-[#f87171]/50 rounded-2xl p-5">
          <p className="text-sm text-[#f87171]">{loadError}</p>
          <p className="text-sm text-[#93a1b8] mt-2">
            This doesn't mean there are none. We just couldn't reach our servers.
          </p>
        </div>
      )}
      {!loading && !loadError && workshops.length === 0 && (
        <p className="text-sm text-[#93a1b8]">No workshops scheduled right now. Check back soon.</p>
      )}

      <div className="space-y-5">
        {workshops.map((w) => (
          <EventCard key={w.id} kind="workshop" event={w} />
        ))}
      </div>

      <div className="mt-8 bg-[#1e293b] border border-[#d4af37]/40 rounded-2xl p-6 sm:p-8">
        <h2 className="font-display text-xl text-[#e7ecf5]">Want a session for your school or group?</h2>
        <p className="text-base text-[#93a1b8] mt-2 max-w-2xl leading-relaxed">
          We run introductory chess at schools around Visakhapatnam, from a single assembly to a full
          term. Tell us what you need and we will put a date in.
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
