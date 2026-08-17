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
 * Turn the RPC's outcome into something a parent can act on.
 *
 * register_for_event() (supabase/02_functions.sql) RETURNS a status rather
 * than raising, so the ordinary outcomes arrive as data. That is not a style
 * choice — a raised exception would roll back the rate-limit row along with
 * everything else, which made failed attempts free and turned the duplicate
 * check into an unlimited "is this child registered?" oracle.
 *
 * So `status` is the normal path and `error` is a genuine fault. Both map
 * through here, because either way the visitor needs one sentence they can
 * act on, and this is the only place they learn what happened.
 */
export function friendlyRegistrationMessage(status, error) {
  // ALREADY_REGISTERED comes ahead of the closed and full checks (audit
  // FL-03): a parent who resubmits was previously told "this one is full",
  // which is both confusing and wrong about what to do next.
  if (status === "ALREADY_REGISTERED") return "That child is already registered for this one.";
  if (status === "EVENT_FULL") {
    return "This one is full — every place has gone. Contact us and we'll tell you about the next date.";
  }
  if (status === "REGISTRATION_CLOSED") return "Registration has closed for this one.";
  // The throttle (audit SEC-03). Rare for a real parent, and worth its own
  // sentence: "something went wrong" would send them round the loop again,
  // which is the one thing that cannot help.
  if (status === "RATE_LIMITED") {
    return "That's a lot of registrations in a short time. Please wait an hour, or contact us and we'll book the places for you.";
  }
  if (status === "INVALID_INPUT") return "Please fill in the child's name, your name and your email.";

  const message = error?.message || "";
  // The unique index is the backstop behind the duplicate check above.
  if (error?.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    return "That child is already registered for this one.";
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

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // One RPC, not a table insert. register_for_event() owns the row lock on
    // the event, the capacity check inside that lock, the duplicate message
    // and the rate limit — and the registration tables have no client INSERT
    // policy, so there is no way round it. Note what is NOT sent: user_id.
    // The function takes it from auth.uid(), so a forged one is not a thing
    // that can be attempted.
    const { data, error: rpcError } = await supabase.rpc("register_for_event", {
      p_kind: kind === "workshop" ? "workshop" : "tournament",
      p_event_id: event.id,
      p_child_name: form.child_name,
      p_grade: form.grade,
      p_parent_name: form.parent_name,
      p_parent_email: form.parent_email,
      p_parent_phone: form.parent_phone,
      p_notes: form.notes,
    });
    setLoading(false);
    if (rpcError || data?.status !== "OK") {
      setError(friendlyRegistrationMessage(data?.status, rpcError));
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
      {/* This used to promise a confirmation email, sent by an Edge Function
          through Resend. There is no server any more, so there is no email —
          and a promise the system cannot keep is worse than no promise. The
          registration is recorded either way, and shows in the parent's
          dashboard when they are signed in. */}
      <p className="text-xs text-[#93a1b8]">
        {user
          ? "We'll contact you on the details above. Your registration also appears on your dashboard."
          : "We'll contact you on the details above. Sign in before registering and it appears on your dashboard — and for online events, so does the joining link."}
      </p>
      {error && <p className="text-[#f87171] text-sm">{error}</p>}
      <button type="submit" disabled={loading}
        className="w-full py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors disabled:opacity-60">
        {loading ? "Submitting…" : "Confirm Registration"}
      </button>
    </form>
  );
}
