import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabaseClient";

const FOCUSABLE =
  'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

const LABEL_CLASS = "text-sm font-mono text-[#93a1b8] uppercase tracking-wide";
const INPUT_CLASS =
  "mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]";

// Consent is mandatory (every user is a child; DPDP), and so is a name. Grade
// is optional and deliberately NOT gated on: this dialog is now non-dismissable,
// so gating on grade would trap a user who declines to give one (audit FL-04).
function needsCompletion(profile) {
  if (!profile) return false;
  return !profile.name || !profile.consent_at;
}

/**
 * One-time "Complete your profile" prompt.
 *
 * Google and phone sign-in produce a profile row with no grade and, for phone,
 * often no name — and neither flow can show a consent checkbox the way the
 * email sign-up form does. This collects all three the first time such a user
 * lands in the app.
 *
 * Mounted once at the app root so it appears no matter which page the visitor
 * signed in from.
 */
export default function ProfileCompletionDialog() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);

  // Non-dismissable: the only way past it is to complete it or sign out, so
  // consent is recorded before the app is used (audit FL-04).
  const open = !!user && needsCompletion(profile);

  // Seed the fields from whatever the provider already gave us, so a Google
  // user usually only has to add a grade and tick the box.
  useEffect(() => {
    if (!profile) return;
    setName(profile.name || "");
    setGrade(profile.grade || "");
    setConsent(!!profile.consent_at);
  }, [profile]);

  useEffect(() => {
    if (!open) return undefined;
    const node = dialogRef.current;
    const visibleFocusables = () =>
      node ? [...node.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.offsetParent !== null) : [];

    visibleFocusables()[0]?.focus();

    function onKeyDown(e) {
      if (e.key !== "Tab") return;
      const items = visibleFocusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  if (!open) return null;

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }
    if (!consent) {
      setError("Please confirm the parent/guardian statement.");
      return;
    }
    setSaving(true);
    // Only the three columns the client is granted UPDATE on
    // (see migration_phase1_auth_methods.sql).
    const { error: saveError } = await supabase
      .from("profiles")
      .update({
        name: name.trim().slice(0, 80),
        grade: grade.trim().slice(0, 40) || null,
        consent_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (saveError) {
      setSaving(false);
      setError("Couldn't save that. Please try again.");
      return;
    }
    await refreshProfile();
    setSaving(false);
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm px-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
        className="w-full max-w-sm bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin"
      >
        <h2 id="profile-dialog-title" className="font-display text-xl text-[#e7ecf5]">
          Complete your profile
        </h2>
        <p className="text-sm text-[#93a1b8] mt-2">
          Before your child continues, we need a name and a parent or guardian's consent.
        </p>

        <form onSubmit={save} className="space-y-4 mt-5" noValidate>
          <div>
            <label htmlFor="profile-dialog-name" className={LABEL_CLASS}>
              Name
            </label>
            <input
              id="profile-dialog-name"
              required
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="profile-dialog-grade" className={LABEL_CLASS}>
              Grade
            </label>
            <input
              id="profile-dialog-grade"
              maxLength={40}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g. Grade 6"
              className={INPUT_CLASS}
            />
          </div>

          <label htmlFor="profile-dialog-consent" className="flex items-start gap-2.5 text-sm text-[#93a1b8]">
            <input
              id="profile-dialog-consent"
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#d4af37]"
            />
            <span>I am a parent/guardian, or I have my parent's permission to use this account.</span>
          </label>

          {error && <p className="text-[#f87171] text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save and continue"}
          </button>
          <button
            type="button"
            onClick={signOut}
            className="w-full text-sm text-[#93a1b8] hover:text-[#e7ecf5]"
          >
            Cancel and sign out
          </button>
        </form>
      </div>
    </div>
  );
}
