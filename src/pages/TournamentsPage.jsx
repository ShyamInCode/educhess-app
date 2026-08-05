import React, { useEffect, useId, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";

const EMPTY_FORM = { child_name: "", grade: "", parent_name: "", parent_email: "", parent_phone: "", notes: "" };

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function RegistrationForm({ tournament, onDone }) {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // One of these forms renders per tournament card, so field ids have to be
  // unique per instance or every label would point at the first form's inputs.
  const fid = useId();

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.from("tournament_registrations").insert({
      tournament_id: tournament.id,
      user_id: user?.id ?? null,
      ...form,
    });
    setLoading(false);
    if (error) {
      setError("Something went wrong submitting that. Please try again.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3 mt-4 bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl p-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${fid}-child`} className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">Child's Name</label>
          <input id={`${fid}-child`} required value={form.child_name} onChange={(e) => setForm({ ...form, child_name: e.target.value })}
            className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
        </div>
        <div>
          <label htmlFor={`${fid}-grade`} className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">Grade</label>
          <input id={`${fid}-grade`} required value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}
            className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
        </div>
        <div>
          <label htmlFor={`${fid}-parent`} className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">Parent's Name</label>
          <input id={`${fid}-parent`} required autoComplete="name" value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
            className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
        </div>
        <div>
          <label htmlFor={`${fid}-phone`} className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">Parent's Phone</label>
          <input id={`${fid}-phone`} required type="tel" autoComplete="tel" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
            className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${fid}-email`} className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">Parent's Email</label>
          <input id={`${fid}-email`} required type="email" autoComplete="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })}
            className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${fid}-notes`} className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">Notes (optional)</label>
          <textarea id={`${fid}-notes`} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
        </div>
      </div>
      {error && <p className="text-[#f87171] text-sm">{error}</p>}
      <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors disabled:opacity-60">
        {loading ? "Submitting…" : "Confirm Registration"}
      </button>
    </form>
  );
}

function TournamentCard({ tournament }) {
  const [open, setOpen] = useState(false);
  const [registered, setRegistered] = useState(false);
  const isOnline = tournament.format === "online";

  return (
    <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wide ${
            isOnline ? "bg-[#34d399]/15 text-[#34d399]" : "bg-[#d4af37]/15 text-[#d4af37]"
          }`}>
            {isOnline ? "Online" : "Offline"}
          </span>
          <h3 className="font-display text-xl sm:text-2xl text-[#e7ecf5] mt-2">{tournament.title}</h3>
          <p className="text-sm font-mono text-[#93a1b8] mt-1">{formatDate(tournament.start_at)}</p>
        </div>
        {!registered && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
          >
            {open ? "Close" : "Register"}
          </button>
        )}
      </div>

      {tournament.description && <p className="text-base text-[#93a1b8] mt-4">{tournament.description}</p>}

      <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
        <div className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-lg px-3 py-2">
          <p className="text-xs font-mono text-[#d4af37] uppercase tracking-wide">{isOnline ? "Platform" : "Venue"}</p>
          <p className="text-[#e7ecf5] mt-0.5">{tournament.venue || "To be confirmed"}</p>
        </div>
        <div className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-lg px-3 py-2">
          <p className="text-xs font-mono text-[#d4af37] uppercase tracking-wide">Fee</p>
          <p className="text-[#e7ecf5] mt-0.5">{tournament.fee || "Free"}</p>
        </div>
        <div className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-lg px-3 py-2">
          <p className="text-xs font-mono text-[#d4af37] uppercase tracking-wide">Capacity</p>
          <p className="text-[#e7ecf5] mt-0.5">{tournament.capacity ?? "Open"}</p>
        </div>
      </div>

      {registered && (
        <p className="text-[#34d399] text-sm mt-4 font-mono">You're registered. We'll be in touch with details.</p>
      )}
      {open && !registered && <RegistrationForm tournament={tournament} onDone={() => { setRegistered(true); setOpen(false); }} />}
    </div>
  );
}

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
          <TournamentCard key={t.id} tournament={t} />
        ))}
      </div>
    </div>
  );
}
