import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import EventCard from "../components/EventCard";

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // A dropped request used to render "No upcoming tournaments right now",
  // which actively misinforms a parent deciding whether to enrol. The two
  // states are now distinct, and the fetch is cancellable so a fast
  // navigation away doesn't set state on an unmounted page.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("tournaments")
      .select("*")
      .eq("published", true)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError("We couldn't load the tournament list just now. Please refresh the page.");
        } else {
          setTournaments(data || []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Compete &amp; Play</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-3 text-[#e7ecf5]">Tournaments</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-8">
        Upcoming online and offline tournaments. Register your child directly below.
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
      {!loading && !loadError && tournaments.length === 0 && (
        <p className="text-sm text-[#93a1b8]">No upcoming tournaments right now. Check back soon.</p>
      )}

      <div className="space-y-5">
        {tournaments.map((t) => (
          <EventCard key={t.id} kind="tournament" event={t} />
        ))}
      </div>
    </div>
  );
}
