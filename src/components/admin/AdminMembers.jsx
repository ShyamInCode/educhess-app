import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { TIER_KEYS, tierName } from "../../lib/tiers";

/* ============================================================
   Members — who is on which plan.
   ------------------------------------------------------------
   Payments are stubbed, so this tab is not a fallback for a checkout that
   missed one: it IS how a membership is granted. A family pays at the
   academy or by transfer, and an admin sets their plan here. Comping a
   coach works the same way.

   Tier changes go through admin_set_tier(), not a plain UPDATE —
   profiles.tier is outside the client's column grant on purpose, which is
   what stops a student promoting themselves from the browser console.

   The ledger below stays empty until something writes `payments`. Nothing
   does today, which means a membership set here leaves no receipt — worth
   knowing before relying on this tab for accounting.
   ============================================================ */

function expiryLabel(iso) {
  if (!iso) return "no expiry";
  const d = new Date(iso);
  const expired = d.getTime() <= Date.now();
  return `${expired ? "expired" : "until"} ${d.toLocaleDateString()}`;
}

export default function AdminMembers() {
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    // Email lives in auth.users, which the browser cannot read directly, so
    // the list comes from an admin-gated SECURITY DEFINER function.
    const [{ data: rows, error: listError }, { data: pays }] = await Promise.all([
      supabase.rpc("admin_list_members"),
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    if (listError) {
      setLoadError(listError.message);
      setLoading(false);
      return;
    }
    setMembers(rows || []);
    setPayments(pays || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setTier(member, tier) {
    setError("");
    setNotice("");
    setBusyId(member.id);
    // A month from today for paid tiers; free clears the expiry entirely
    // (admin_set_tier does that itself).
    const expires = new Date();
    expires.setMonth(expires.getMonth() + 1);
    const { error: rpcError } = await supabase.rpc("admin_set_tier", {
      p_user_id: member.id,
      p_tier: tier,
      p_expires_at: tier === "free" ? null : expires.toISOString(),
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message || "Couldn't change that member's plan.");
      return;
    }
    setNotice(`${member.email || member.name || "Member"} is now on ${tierName(tier)}.`);
    load();
  }

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? members.filter(
        (m) =>
          (m.email || "").toLowerCase().includes(needle) ||
          (m.name || "").toLowerCase().includes(needle)
      )
    : members;

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Memberships</span>
        <h2 className="font-display text-2xl mt-2 mb-1 text-[#e7ecf5]">Members</h2>
        <p className="text-sm text-[#93a1b8] mb-4">
          Paid upgrades activate themselves. Change a plan here only to comp an account or to fix a
          payment that didn't land.
        </p>

        <label htmlFor="member-search" className="sr-only">Search members</label>
        <input
          id="member-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          className="mb-4 w-full max-w-sm bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
        />

        {loading && <p className="text-sm text-[#93a1b8]">Loading…</p>}
        {!loading && loadError && (
          <p className="text-sm text-[#f87171]">
            Couldn't load the member list. Confirm the baseline SQL in{" "}
            <code className="text-[#d4af37]">supabase/</code> has been run. ({loadError})
          </p>
        )}
        {!loading && !loadError && visible.length === 0 && (
          <p className="text-sm text-[#93a1b8]">{needle ? "Nobody matches that." : "No members yet."}</p>
        )}

        {error && <p className="text-[#f87171] text-sm mb-3">{error}</p>}
        {notice && <p className="text-[#34d399] text-sm mb-3">{notice}</p>}

        <div className="space-y-2">
          {visible.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-4 flex-wrap bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-base text-[#e7ecf5] truncate">{m.name || "—"}</p>
                <p className="text-xs font-mono text-[#93a1b8] truncate">{m.email}</p>
                <p className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide mt-0.5">
                  {tierName(m.tier)} · {expiryLabel(m.tier_expires_at)}
                  {m.role === "admin" ? " · admin" : ""}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {TIER_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => setTier(m, key)}
                    disabled={busyId === m.id || m.tier === key}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40 ${
                      m.tier === key
                        ? "border-[#d4af37] text-[#d4af37]"
                        : "border-[#2d3b53] text-[#e7ecf5] hover:border-[#d4af37]/60"
                    }`}
                  >
                    {tierName(key)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Ledger</span>
        <h2 className="font-display text-xl mt-2 mb-4 text-[#e7ecf5]">Recent payments</h2>
        {/* Payments are stubbed: the table and its columns exist so a receipt
            has somewhere to go, but nothing in the app writes one. Until that
            changes this list stays empty, and a member who has paid out of
            band is marked up by hand above. */}
        {!loading && payments.length === 0 && (
          <p className="text-sm text-[#93a1b8]">
            No payments recorded. Payments are stubbed — set a member's plan by hand above after they pay.
          </p>
        )}
        <div className="overflow-x-auto">
          {payments.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono uppercase tracking-wide text-[#93a1b8]">
                  <th scope="col" className="py-2 pr-4">Plan</th>
                  <th scope="col" className="py-2 pr-4">Amount</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Order</th>
                  <th scope="col" className="py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-[#2d3b53]">
                    <td className="py-2 pr-4 text-[#e7ecf5]">{tierName(p.tier)}</td>
                    <td className="py-2 pr-4 text-[#93a1b8] font-mono">₹{(p.amount_paise / 100).toFixed(0)}</td>
                    <td className={`py-2 pr-4 font-mono ${p.status === "paid" ? "text-[#34d399]" : "text-[#93a1b8]"}`}>
                      {p.status}
                    </td>
                    <td className="py-2 pr-4 text-[#93a1b8] font-mono text-xs truncate">{p.provider_order_id}</td>
                    <td className="py-2 text-[#93a1b8] font-mono text-xs">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
