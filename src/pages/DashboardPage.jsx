import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { fetchPuzzleStats } from "../lib/puzzleProgress";
import { CATEGORIES } from "../lib/puzzles";

/*
  The student's home.

  Was profile-settings-only. It now answers the three questions a returning
  family actually has: what has my child solved, what have we signed up for,
  and where do I go next.

  The Preferences and "Manage Subscriptions" tabs are still gone: neither had
  any backing store. Re-add them when there is a real preferences table and
  real billing (see docs/ROADMAP.md P4.5).
*/

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.title]));

const CARD = "bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8";
const LABEL_CLASS = "text-sm font-mono text-[#93a1b8] uppercase tracking-wide";
const INPUT_CLASS =
  "mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]";

function Stat({ value, label }) {
  return (
    <div className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-3 text-center">
      <p className="font-display text-2xl text-[#d4af37]">{value}</p>
      <p className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide mt-1">{label}</p>
    </div>
  );
}

function ProfileSection() {
  const { user, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name || "");
  const [grade, setGrade] = useState(profile?.grade || "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // {type:"ok"|"error", msg}

  async function save(e) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setStatus(null);
    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim() || null, grade: grade.trim() || null })
      .eq("id", user.id);
    if (error) {
      setSaving(false);
      setStatus({ type: "error", msg: "Couldn't save that. Please try again." });
      return;
    }
    // Re-read the profile so the header picks the new name up immediately —
    // this used to tell the user to refresh the page themselves.
    await refreshProfile();
    setSaving(false);
    setStatus({ type: "ok", msg: "Saved." });
  }

  return (
    <form onSubmit={save} className={`${CARD} space-y-4`}>
      <h2 className="font-display text-2xl text-[#e7ecf5] mb-2">Profile</h2>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="dash-name" className={LABEL_CLASS}>Name</label>
          <input id="dash-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
            className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="dash-grade" className={LABEL_CLASS}>Grade</label>
          <input id="dash-grade" value={grade} onChange={(e) => setGrade(e.target.value)} maxLength={40}
            placeholder="e.g. Grade 6" className={INPUT_CLASS} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="dash-email" className={LABEL_CLASS}>Email</label>
          <input id="dash-email" value={user.email || "—"} disabled
            className={`${INPUT_CLASS} opacity-60`} />
        </div>
        <div>
          <label htmlFor="dash-phone" className={LABEL_CLASS}>Mobile</label>
          <input id="dash-phone" value={user.phone ? `+${String(user.phone).replace(/^\+/, "")}` : "—"} disabled
            className={`${INPUT_CLASS} opacity-60`} />
        </div>
      </div>

      {status && (
        <p className={`text-sm ${status.type === "ok" ? "text-[#34d399]" : "text-[#f87171]"}`}>{status.msg}</p>
      )}

      <button type="submit" disabled={saving}
        className="mt-2 px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors disabled:opacity-60">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}

function ProgressSection() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPuzzleStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setError("We couldn't load your puzzle stats just now. Please refresh the page.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = (stats?.by_category || []).filter((c) => c.solved > 0);

  return (
    <div className={CARD}>
      <h2 className="font-display text-2xl text-[#e7ecf5] mb-4">My progress</h2>

      {loading && <p className="text-sm text-[#93a1b8]">Loading…</p>}
      {!loading && error && <p className="text-sm text-[#f87171]">{error}</p>}

      {!loading && !error && stats && stats.total_attempted === 0 && (
        <div>
          <p className="text-base text-[#93a1b8]">
            Nothing solved yet. Every puzzle you finish from here on is counted — streaks, totals and
            what you're strongest at.
          </p>
          <Link to="/puzzles"
            className="inline-block mt-4 px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors">
            Solve your first puzzle
          </Link>
        </div>
      )}

      {!loading && !error && stats && stats.total_attempted > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat value={stats.solved_today} label="Solved today" />
            <Stat value={`${stats.streak}d`} label="Current streak" />
            <Stat value={stats.total_solved} label="Solved overall" />
            <Stat value={stats.total_attempted} label="Puzzles played" />
          </div>

          {categories.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-mono text-[#d4af37] uppercase tracking-widest mb-3">By category</p>
              <ul className="space-y-2">
                {categories.map((c) => (
                  <li key={c.category} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-[#e7ecf5]">{CATEGORY_LABEL[c.category] || c.category}</span>
                    <span className="font-mono text-[#93a1b8]">{c.solved} solved</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link to="/puzzles" className="inline-block mt-6 text-sm font-mono text-[#34d399] hover:text-[#6ee7b7]">
            Keep solving →
          </Link>
        </>
      )}
    </div>
  );
}

function RegistrationRow({ entry }) {
  const { event, kind } = entry;
  return (
    <li className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-base text-[#e7ecf5]">{event?.title || "Event details unavailable"}</p>
          <p className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide mt-0.5">
            {kind} · {entry.child_name}
            {event?.start_at ? ` · ${new Date(event.start_at).toLocaleDateString()}` : ""}
          </p>
        </div>
        <Link to={kind === "workshop" ? "/workshops" : "/tournaments"}
          className="shrink-0 text-sm font-mono text-[#34d399] hover:text-[#6ee7b7]">
          View →
        </Link>
      </div>
    </li>
  );
}

function RegistrationsSection() {
  const { user } = useAuth();
  // Split at fetch time, not at render time: "is this in the future?" depends
  // on the clock, and a value read during render changes on every re-render.
  const [entries, setEntries] = useState({ upcoming: [], past: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    // Two tables, one list. Both are filtered by user_id, which the RLS
    // policies enforce anyway — the filter is here so the query is honest
    // about what it wants rather than relying on the policy to trim it.
    const [tournaments, workshops] = await Promise.all([
      supabase
        .from("tournament_registrations")
        .select("id, child_name, created_at, tournaments (id, title, start_at)")
        .eq("user_id", user.id),
      supabase
        .from("workshop_registrations")
        .select("id, child_name, created_at, workshops (id, title, start_at)")
        .eq("user_id", user.id),
    ]);

    if (tournaments.error && workshops.error) {
      setError("We couldn't load your registrations just now. Please refresh the page.");
      setLoading(false);
      return;
    }

    const combined = [
      ...(tournaments.data || []).map((r) => ({
        key: `t-${r.id}`,
        kind: "tournament",
        child_name: r.child_name,
        event: r.tournaments,
      })),
      ...(workshops.data || []).map((r) => ({
        key: `w-${r.id}`,
        kind: "workshop",
        child_name: r.child_name,
        event: r.workshops,
      })),
    ];
    const now = Date.now();
    setEntries({
      total: combined.length,
      upcoming: combined
        .filter((e) => e.event?.start_at && new Date(e.event.start_at).getTime() >= now)
        .sort((a, b) => new Date(a.event.start_at) - new Date(b.event.start_at)),
      // An event whose row we can't read (unpublished, so RLS hides it) has no
      // date, and belongs with the past rather than being dropped silently.
      past: combined
        .filter((e) => !e.event?.start_at || new Date(e.event.start_at).getTime() < now)
        .sort((a, b) => new Date(b.event?.start_at || 0) - new Date(a.event?.start_at || 0)),
    });
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const { upcoming, past, total } = entries;

  return (
    <div className={CARD}>
      <h2 className="font-display text-2xl text-[#e7ecf5] mb-4">My registrations</h2>

      {loading && <p className="text-sm text-[#93a1b8]">Loading…</p>}
      {!loading && error && <p className="text-sm text-[#f87171]">{error}</p>}

      {!loading && !error && total === 0 && (
        <div>
          <p className="text-base text-[#93a1b8]">
            Nothing booked yet. Tournaments and workshops you register for while signed in show up here.
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <Link to="/tournaments"
              className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors">
              See tournaments
            </Link>
            <Link to="/workshops"
              className="px-5 py-2.5 rounded-lg border border-[#2d3b53] text-[#e7ecf5] font-semibold text-sm hover:border-[#d4af37]/60 transition-colors">
              See workshops
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && upcoming.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-mono text-[#d4af37] uppercase tracking-widest mb-3">Upcoming</p>
          <ul className="space-y-2">
            {upcoming.map((e) => <RegistrationRow key={e.key} entry={e} />)}
          </ul>
        </div>
      )}

      {!loading && !error && past.length > 0 && (
        <div>
          <p className="text-xs font-mono text-[#93a1b8] uppercase tracking-widest mb-3">Past</p>
          <ul className="space-y-2 opacity-70">
            {past.map((e) => <RegistrationRow key={e.key} entry={e} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user, profile } = useAuth();

  // <RequireAuth> already gates this route; this is the belt-and-braces case
  // of the page being rendered directly.
  if (!user) {
    return (
      <div className="w-full max-w-6xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
        <h1 className="font-display text-3xl sm:text-4xl mb-4 text-[#e7ecf5]">Dashboard</h1>
        <div className={CARD}>
          <p className="text-base text-[#e7ecf5]">Log in to see your dashboard.</p>
        </div>
      </div>
    );
  }

  const greeting = profile?.name ? `Welcome back, ${profile.name}` : "Welcome back";

  return (
    <div className="w-full max-w-3xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Your Command Center</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-2 text-[#e7ecf5]">Dashboard</h1>
      <p className="text-base text-[#93a1b8] mb-8">{greeting}</p>

      <div className="space-y-6">
        <ProgressSection />
        <RegistrationsSection />
        <ProfileSection />

        <div className={CARD}>
          <h2 className="font-display text-2xl text-[#e7ecf5] mb-4">Jump back in</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link to="/puzzles"
              className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-4 hover:border-[#d4af37]/60 transition-colors">
              <span className="text-2xl text-[#d4af37] block">♕</span>
              <p className="text-base text-[#e7ecf5] mt-2">Puzzles</p>
              <p className="text-sm text-[#93a1b8] mt-0.5">Unlimited tactics, thirteen categories.</p>
            </Link>
            <Link to="/practice"
              className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-4 hover:border-[#d4af37]/60 transition-colors">
              <span className="text-2xl text-[#d4af37] block">♞</span>
              <p className="text-base text-[#e7ecf5] mt-2">Practice vs engine</p>
              <p className="text-sm text-[#93a1b8] mt-0.5">Six strength levels, with a game review after.</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
