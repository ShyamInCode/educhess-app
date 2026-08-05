import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import AuthModal from "../components/AuthModal";
import { TIER_LIST, tierRank } from "../lib/tiers";
import { paymentsEnabled, startUpgrade, waitForTier } from "../lib/razorpay";

/*
  Membership comparison.

  Kept separate from the pricing block on /about: that one sells the coaching
  programme to a parent who has never been here, this one is where a signed-in
  family goes when they hit a limit. Same three tiers, same numbers, both
  derived from src/lib/tiers.js.
*/

function TierCard({ tier, currentTier, signedIn, onBuy, busyTier, statusFor }) {
  const isCurrent = signedIn && currentTier === tier.key;
  const isBelow = signedIn && tierRank(tier.key) < tierRank(currentTier);
  const status = statusFor(tier.key);

  return (
    <div
      className={`rounded-2xl p-6 border flex flex-col ${
        tier.highlight ? "bg-[#1e293b] border-[#d4af37] shadow-2xl" : "bg-[#1e293b]/70 border-[#2d3b53]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm uppercase tracking-widest text-[#34d399]">{tier.tag}</span>
        {isCurrent && (
          <span className="text-xs font-mono uppercase tracking-wide text-[#d4af37] border border-[#d4af37]/50 rounded-full px-2 py-0.5">
            Your plan
          </span>
        )}
      </div>
      <h2 className="font-display text-2xl mt-2 text-[#e7ecf5]">
        {tier.medal} {tier.name}
      </h2>
      <p className="font-mono text-3xl text-[#d4af37] mt-3">
        {tier.price}
        <span className="text-base text-[#93a1b8]">{tier.priceNote}</span>
      </p>
      <p className="text-base text-[#93a1b8] mt-3 flex-1">{tier.desc}</p>

      <ul className="mt-4 space-y-2">
        {tier.features.map((f) => (
          <li key={f} className="text-base text-[#e7ecf5] flex gap-2">
            <span className="text-[#d4af37]">♟</span>
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {isCurrent ? (
          <p className="text-sm text-[#93a1b8] text-center py-2.5">This is the plan you're on.</p>
        ) : isBelow ? (
          <p className="text-sm text-[#93a1b8] text-center py-2.5">Included in your plan.</p>
        ) : tier.amountPaise === 0 ? (
          <p className="text-sm text-[#93a1b8] text-center py-2.5">Free with any account.</p>
        ) : paymentsEnabled ? (
          <button
            type="button"
            onClick={() => onBuy(tier)}
            disabled={!!busyTier}
            className="block w-full text-center py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors disabled:opacity-60"
          >
            {busyTier === tier.key ? "Opening payment…" : `Get ${tier.name} — ${tier.price}${tier.priceNote}`}
          </button>
        ) : (
          /* No publishable key configured, so there is no honest "pay now"
             button to show. Fall back to the thing that does work. */
          <Link
            to="/contact"
            className="block w-full text-center py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
          >
            Talk to us about {tier.name}
          </Link>
        )}

        {status && (
          <p className={`text-sm mt-3 ${status.type === "error" ? "text-[#f87171]" : "text-[#34d399]"}`}>
            {status.msg}
          </p>
        )}
      </div>
    </div>
  );
}

export default function UpgradePage() {
  const { user, profile, tier, refreshProfile } = useAuth();
  const [busyTier, setBusyTier] = useState(null);
  const [status, setStatus] = useState(null); // { tier, type, msg }
  const [authOpen, setAuthOpen] = useState(false);

  const statusFor = (key) => (status?.tier === key ? status : null);

  async function buy(target) {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setStatus(null);
    setBusyTier(target.key);
    try {
      const result = await startUpgrade({ tier: target.key, profile, user });
      if (result.status === "dismissed") {
        setBusyTier(null);
        return;
      }
      // Paid, as far as the browser knows. The membership itself is switched
      // on by the signed webhook, so ask the server rather than celebrating.
      setStatus({ tier: target.key, type: "ok", msg: "Payment received. Activating your plan…" });
      const fresh = await waitForTier({ refreshProfile, expectedTier: target.key });
      setBusyTier(null);
      setStatus(
        fresh
          ? { tier: target.key, type: "ok", msg: `${target.name} is active. Enjoy.` }
          : {
              tier: target.key,
              type: "error",
              msg: "Your payment went through but the plan hasn't switched over yet. Refresh in a minute — if it still hasn't, contact us and we'll sort it out.",
            }
      );
    } catch (e) {
      setBusyTier(null);
      setStatus({ tier: target.key, type: "error", msg: e.message || "Something went wrong." });
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Membership</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-3 text-[#e7ecf5]">Choose a plan</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-8">
        Every account gets puzzles, the engine and full game review. Paid plans add more puzzles a day
        and the course videos our coaches teach from.
      </p>

      <div className="grid md:grid-cols-3 gap-5">
        {TIER_LIST.map((t) => (
          <TierCard
            key={t.key}
            tier={t}
            currentTier={tier}
            signedIn={!!user}
            onBuy={buy}
            busyTier={busyTier}
            statusFor={statusFor}
          />
        ))}
      </div>

      <p className="text-sm text-[#93a1b8] mt-8">
        Coaching at both academies is arranged in person and billed separately.{" "}
        <Link to="/contact" className="text-[#34d399] hover:text-[#6ee7b7]">
          Ask us about in-person coaching
        </Link>
        .
      </p>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
