import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";

export default function ContactForm() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", grade: "", email: "", struggles: "" });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.from("contact_submissions").insert({
      user_id: user?.id ?? null,
      name: form.name,
      grade: form.grade,
      email: form.email,
      struggles: form.struggles,
    });
    setLoading(false);
    if (error) {
      setError("Something went wrong sending that. Please try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center py-10">
        <span className="text-5xl text-[#34d399] block mb-4">♛</span>
        <h3 className="font-display text-2xl text-[#34d399] mb-2">Strategist Alert!</h3>
        <p className="text-[#93a1b8] text-base">An EduChess Growth Specialist will contact you within 24 hours.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="contact-name" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Parent's Name</label>
        <input id="contact-name" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
      </div>
      <div>
        <label htmlFor="contact-grade" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Child's Grade</label>
        <input id="contact-grade" required value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}
          className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
      </div>
      <div>
        <label htmlFor="contact-email" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Email Address</label>
        <input id="contact-email" required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
      </div>
      <div>
        <label htmlFor="contact-struggles" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Main Academic Struggles</label>
        <textarea id="contact-struggles" rows={4} value={form.struggles} onChange={(e) => setForm({ ...form, struggles: e.target.value })}
          className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
      </div>
      {error && <p className="text-[#f87171] text-sm">{error}</p>}
      <button type="submit" disabled={loading} className="w-full py-3 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60">
        {loading ? "Sending…" : "Send Inquiry"}
      </button>
    </form>
  );
}
