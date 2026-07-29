import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const EMPTY = {
  title: "",
  description: "",
  format: "offline",
  venue: "",
  start_at: "",
  registration_deadline: "",
  fee: "",
  capacity: "",
};

export default function AdminTournaments() {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tournaments, setTournaments] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  async function loadTournaments() {
    setLoading(true);
    const { data, error } = await supabase.from("tournaments").select("*").order("start_at", { ascending: false });
    if (!error) {
      setTournaments(data || []);
      const { data: regs } = await supabase.from("tournament_registrations").select("tournament_id");
      const tally = {};
      (regs || []).forEach((r) => { tally[r.tournament_id] = (tally[r.tournament_id] || 0) + 1; });
      setCounts(tally);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTournaments();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!form.title.trim() || !form.start_at) {
      setError("Title and start date/time are required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("tournaments").insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      format: form.format,
      venue: form.venue.trim() || null,
      start_at: new Date(form.start_at).toISOString(),
      registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
      fee: form.fee.trim() || null,
      capacity: form.capacity ? Number(form.capacity) : null,
    });
    setSaving(false);
    if (error) {
      setError(error.message || "Couldn't save that tournament.");
      return;
    }
    setSuccess("Tournament created.");
    setForm(EMPTY);
    loadTournaments();
  }

  async function handleDelete(t) {
    if (!window.confirm(`Delete "${t.title}"? This also removes its registrations.`)) return;
    setDeletingId(t.id);
    await supabase.from("tournaments").delete().eq("id", t.id);
    setDeletingId(null);
    loadTournaments();
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Tournaments</span>
        <h2 className="font-display text-2xl mt-2 mb-6 text-[#e7ecf5]">Create a tournament</h2>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div>
            <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
          </div>
          <div>
            <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Format</label>
              <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}
                className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]">
                <option value="offline">Offline</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">{form.format === "online" ? "Platform / Link" : "Venue"}</label>
              <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })}
                className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Start Date &amp; Time</label>
              <input required type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
            </div>
            <div>
              <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Registration Deadline</label>
              <input type="datetime-local" value={form.registration_deadline} onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })}
                className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Fee (e.g. "Free" or "₹500")</label>
              <input value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })}
                className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
            </div>
            <div>
              <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Capacity (optional)</label>
              <input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
            </div>
          </div>
          {error && <p className="text-[#f87171] text-sm">{error}</p>}
          {success && <p className="text-[#34d399] text-sm">{success}</p>}
          <button type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60">
            {saving ? "Saving…" : "Create Tournament"}
          </button>
        </form>
      </div>

      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Tournaments</span>
        <h2 className="font-display text-xl mt-2 mb-4 text-[#e7ecf5]">All tournaments</h2>
        {loading && <p className="text-sm text-[#93a1b8]">Loading…</p>}
        {!loading && tournaments.length === 0 && <p className="text-sm text-[#93a1b8]">No tournaments yet.</p>}
        <div className="space-y-2">
          {tournaments.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-4 bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-base text-[#e7ecf5] truncate">{t.title}</p>
                <p className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">
                  {t.format} · {new Date(t.start_at).toLocaleDateString()} · {counts[t.id] || 0} registered
                </p>
              </div>
              <button
                onClick={() => handleDelete(t)}
                disabled={deletingId === t.id}
                className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold text-[#f87171] border border-[#f87171]/40 hover:bg-[#f87171]/10 transition-colors disabled:opacity-50"
              >
                {deletingId === t.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
