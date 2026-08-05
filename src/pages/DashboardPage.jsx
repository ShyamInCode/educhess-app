import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabaseClient";

/*
  The Preferences and "Manage Subscriptions" tabs were removed: neither had any
  backing store. Preferences were three always-checked checkboxes that persisted
  nothing (and promised a weekly email that doesn't exist), and Subscriptions
  told every visitor they were on the ₹2,999/mo plan by reading a static
  marketing flag. Re-add them when there is a real preferences table and real
  billing (see docs/ROADMAP.md P4.5).

  The "N pts earned so far" line was removed along with the rest of the points
  system — see the note in docs/ROADMAP.md P0-4.
*/

export default function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name || "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // {type:"ok"|"error", msg}

  async function save(e) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setStatus(null);
    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim() || null })
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

  if (!user) {
    return (
      <div className="w-full max-w-6xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
        <h1 className="font-display text-3xl sm:text-4xl mb-4 text-[#e7ecf5]">Dashboard</h1>
        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
          <p className="text-base text-[#e7ecf5]">Log in to see your dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Your Command Center</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Dashboard</h1>

      <form onSubmit={save} className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8 space-y-4 max-w-md">
        <h2 className="font-display text-2xl text-[#e7ecf5] mb-2">Profile</h2>

        <div>
          <label htmlFor="dash-name" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Name</label>
          <input
            id="dash-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
          />
        </div>

        <div>
          <label htmlFor="dash-email" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Email</label>
          <input
            id="dash-email"
            value={user.email || ""}
            disabled
            className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base opacity-60"
          />
        </div>

        {status && (
          <p className={`text-sm ${status.type === "ok" ? "text-[#34d399]" : "text-[#f87171]"}`}>{status.msg}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-2 px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
