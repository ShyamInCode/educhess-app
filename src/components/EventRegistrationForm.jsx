import React, { useId, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";

/* ============================================================
   Registration form, shared by tournaments and workshops.
   ------------------------------------------------------------
   The two flows collect exactly the same fields into two tables with the
   same shape, so `kind` picks the table and the foreign key rather than
   the markup being copied twice and drifting.
   ============================================================ */

const EMPTY_FORM = {
  child_name: "",
  grade: "",
  parent_name: "",
  parent_email: "",
  parent_phone: "",
  notes: "",
};

const INPUT_CLASS =
  "mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]";
const LABEL_CLASS = "text-xs font-mono text-[#93a1b8] uppercase tracking-wide";

/**
 * Turn a Postgres error into something a parent can act on.
 *
 * Three of these are server-side rules with no client equivalent, so this is
 * the only place the visitor learns what happened: the unique index, the
 * capacity/deadline trigger (Phase 5), and the RLS policy that refuses an
 * insert for an unpublished or closed event.
 */
export function friendlyRegistrationError(error) {
  const message = error?.message || "";
  // ALREADY_REGISTERED comes from the capacity trigger (Phase 5 / audit FL-03),
  // raised ahead of EVENT_FULL/REGISTRATION_CLOSED; 23505 is the unique-index
  // backstop. Either way the parent is already in.
  if (
    /ALREADY_REGISTERED/.test(message) ||
    error?.code === "23505" ||
    /duplicate key|unique constraint/i.test(message)
  ) {
    return "That child is already registered for this one.";
  }
  if (/EVENT_FULL/.test(message)) {
    return "This one is full — every place has gone. Contact us and we'll tell you about the next date.";
  }
  if (/REGISTRATION_CLOSED/.test(message)) {
    return "Registration has closed for this one.";
  }
  if (error?.code === "42501" || /row-level security/i.test(message)) {
    // The insert policy also enforces published + deadline, so a rejection
    // here almost always means the window shut while the form was open.
    return "Registration has closed for this one.";
  }
  return "Something went wrong submitting that. Please try again.";
}

export default function EventRegistrationForm({ kind, event, onDone }) {
  const { user, profile } = useAuth();
  // Signed-in parents shouldn't retype what we already hold. Seeded once from
  // the profile rather than synced, so editing a field always sticks.
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    grade: profile?.grade || "",
    parent_name: profile?.name || "",
    parent_email: user?.email || "",
    parent_phone: user?.phone ? `+${String(user.phone).replace(/^\+/, "")}` : "",
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // One of these forms renders per event card, so field ids have to be
  // unique per instance or every label would point at the first form's inputs.
  const fid = useId();

  const table = kind === "workshop" ? "workshop_registrations" : "tournament_registrations";
  const foreignKey = kind === "workshop" ? "workshop_id" : "tournament_id";

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: insertError } = await supabase.from(table).insert({
      [foreignKey]: event.id,
      user_id: user?.id ?? null,
      ...form,
    });
    setLoading(false);
    if (insertError) {
      setError(friendlyRegistrationError(insertError));
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3 mt-4 bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl p-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${fid}-child`} className={LABEL_CLASS}>Child's Name</label>
          <input id={`${fid}-child`} required maxLength={120} value={form.child_name}
            onChange={(e) => setForm({ ...form, child_name: e.target.value })} className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor={`${fid}-grade`} className={LABEL_CLASS}>Grade</label>
          <input id={`${fid}-grade`} required maxLength={40} value={form.grade}
            onChange={(e) => setForm({ ...form, grade: e.target.value })} className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor={`${fid}-parent`} className={LABEL_CLASS}>Parent's Name</label>
          <input id={`${fid}-parent`} required autoComplete="name" maxLength={120} value={form.parent_name}
            onChange={(e) => setForm({ ...form, parent_name: e.target.value })} className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor={`${fid}-phone`} className={LABEL_CLASS}>Parent's Phone</label>
          <input id={`${fid}-phone`} required type="tel" autoComplete="tel" maxLength={32} value={form.parent_phone}
            onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} className={INPUT_CLASS} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${fid}-email`} className={LABEL_CLASS}>Parent's Email</label>
          <input id={`${fid}-email`} required type="email" autoComplete="email" maxLength={254} value={form.parent_email}
            onChange={(e) => setForm({ ...form, parent_email: e.target.value })} className={INPUT_CLASS} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${fid}-notes`} className={LABEL_CLASS}>Notes (optional)</label>
          <textarea id={`${fid}-notes`} rows={2} maxLength={2000} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT_CLASS} />
        </div>
      </div>
      <p className="text-xs text-[#93a1b8]">
        We email the confirmation to the parent's address above.
      </p>
      {error && <p className="text-[#f87171] text-sm">{error}</p>}
      <button type="submit" disabled={loading}
        className="w-full py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors disabled:opacity-60">
        {loading ? "Submitting…" : "Confirm Registration"}
      </button>
    </form>
  );
}
