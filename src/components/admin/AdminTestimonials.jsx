import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const EMPTY = { name: "", role: "", quote: "", rating: 5 };

export default function AdminTestimonials() {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  async function loadTestimonials() {
    setLoading(true);
    const { data, error } = await supabase.from("testimonials").select("*").order("created_at", { ascending: false });
    if (!error) setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadTestimonials();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!form.name.trim() || !form.quote.trim()) {
      setError("Name and quote are required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("testimonials").insert({
      name: form.name.trim(),
      role: form.role.trim() || null,
      quote: form.quote.trim(),
      rating: Number(form.rating) || 5,
    });
    setSaving(false);
    if (error) {
      setError(error.message || "Couldn't save that testimonial.");
      return;
    }
    setSuccess("Testimonial added.");
    setForm(EMPTY);
    loadTestimonials();
  }

  async function handleDelete(item) {
    if (!window.confirm(`Remove the testimonial from ${item.name}?`)) return;
    setDeletingId(item.id);
    await supabase.from("testimonials").delete().eq("id", item.id);
    setDeletingId(null);
    loadTestimonials();
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Homepage</span>
        <h2 className="font-display text-2xl mt-2 mb-6 text-[#e7ecf5]">Add a testimonial</h2>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div>
            <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
            />
          </div>
          <div>
            <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Role (e.g. "Parent, Grade 6 student")</label>
            <input
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
            />
          </div>
          <div>
            <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Quote</label>
            <textarea
              required
              rows={3}
              value={form.quote}
              onChange={(e) => setForm({ ...form, quote: e.target.value })}
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
            />
          </div>
          <div>
            <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Rating (1-5)</label>
            <select
              value={form.rating}
              onChange={(e) => setForm({ ...form, rating: e.target.value })}
              className="mt-1 w-32 bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
            >
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {error && <p className="text-[#f87171] text-sm">{error}</p>}
          {success && <p className="text-[#34d399] text-sm">{success}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add Testimonial"}
          </button>
        </form>
      </div>

      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Homepage</span>
        <h2 className="font-display text-xl mt-2 mb-4 text-[#e7ecf5]">Current testimonials</h2>
        {loading && <p className="text-sm text-[#93a1b8]">Loading…</p>}
        {!loading && items.length === 0 && <p className="text-sm text-[#93a1b8]">No testimonials yet.</p>}
        <div className="space-y-2">
          {items.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-4 bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-base text-[#e7ecf5] truncate">"{t.quote}"</p>
                <p className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">{t.name} · {t.role || "—"} · {t.rating}★</p>
              </div>
              <button
                onClick={() => handleDelete(t)}
                disabled={deletingId === t.id}
                className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold text-[#f87171] border border-[#f87171]/40 hover:bg-[#f87171]/10 transition-colors disabled:opacity-50"
              >
                {deletingId === t.id ? "Removing…" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
