import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { PRICING_TIERS } from "../data/mockData";

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState("profile");
  const displayName = profile?.name || user?.email || "Strategist";
  const tabs = [
    { key: "profile", label: "Profile" },
    { key: "preferences", label: "Preferences" },
    { key: "subscriptions", label: "Manage Subscriptions" },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Your Command Center</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Dashboard</h1>

      <div className="grid lg:grid-cols-[220px_1fr] gap-8">
        <div className="flex lg:flex-col gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-left px-4 py-2.5 rounded-lg text-base font-medium transition-colors ${
                tab === t.key ? "bg-[#1e293b] text-[#d4af37] border border-[#d4af37]/50" : "text-[#93a1b8] hover:text-[#e7ecf5] hover:bg-[#1e293b]/60"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
          {tab === "profile" && (
            <div className="space-y-4 max-w-md">
              <h2 className="font-display text-2xl text-[#e7ecf5] mb-4">Profile</h2>
              <div>
                <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Name</label>
                <input defaultValue={displayName} className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
              </div>
              <div>
                <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Email</label>
                <input defaultValue={user?.email || ""} disabled className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base opacity-60" />
              </div>
              <p className="text-sm font-mono text-[#93a1b8]">{profile?.rank_points ?? 0} pts earned so far</p>
              <button className="mt-2 px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors">Save Changes</button>
            </div>
          )}

          {tab === "preferences" && (
            <div className="space-y-4 max-w-md">
              <h2 className="font-display text-2xl text-[#e7ecf5] mb-4">Preferences</h2>
              {[
                { l: "Weekly progress email", d: "Get a summary of quests cleared each week." },
                { l: "New content alerts", d: "Hear about new modules the moment they drop." },
                { l: "Quiz reminders", d: "A nudge if a level's quiz has been sitting untaken." },
              ].map((p) => (
                <label key={p.l} className="flex items-center justify-between gap-4 bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl p-4 cursor-pointer">
                  <div>
                    <p className="text-base text-[#e7ecf5]">{p.l}</p>
                    <p className="text-sm text-[#93a1b8] mt-0.5">{p.d}</p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-5 h-5 accent-[#d4af37]" />
                </label>
              ))}
            </div>
          )}

          {tab === "subscriptions" && (
            <div>
              <h2 className="font-display text-2xl text-[#e7ecf5] mb-4">Manage Subscriptions</h2>
              <div className="grid sm:grid-cols-3 gap-4">
                {PRICING_TIERS.map((t) => (
                  <div key={t.name} className={`rounded-xl p-4 border flex flex-col ${t.highlight ? "border-[#d4af37] bg-[#0f172a]" : "border-[#2d3b53] bg-[#0f172a]/60"}`}>
                    <span className="text-2xl">{t.medal}</span>
                    <h3 className="font-display text-lg text-[#e7ecf5] mt-2">{t.name}</h3>
                    <p className="font-mono text-xl text-[#d4af37] mt-1">{t.price}</p>
                    <button className={`mt-4 py-2 rounded-lg text-sm font-semibold transition-colors ${t.highlight ? "bg-[#d4af37] text-[#0f172a] hover:bg-[#f0d98c]" : "bg-[#1e293b] border border-[#2d3b53] text-[#e7ecf5] hover:border-[#d4af37]"}`}>
                      {t.highlight ? "Current Plan" : "Switch Plan"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
