import React, { useState } from "react";
import { Link } from "react-router-dom";
import AuthModal from "./AuthModal";
import { useAuth } from "../lib/AuthContext";
import { tierRank } from "../lib/tiers";
import { paymentsEnabled, startUpgrade, waitForTier } from "../lib/razorpay";

/* ============================================================
   One pricing card, and the checkout behind it.
   ------------------------------------------------------------
   Used by /upgrade and by the Programs & Pricing block on /about. They
   are the same offer, so they are the same component: a card on the
   About page that said "enquire" while /upgrade took payment was two
   different answers to the same question.
   ============================================================ */

/**
 * Checkout state for a page that shows plan cards.
 *
 * Returns `authModal` for the caller to render — a signed-out visitor who
 * clicks Get Pro needs an account before there is anyone to sell to.
 */
export function usePlanCheckout() {
  const { user, profile, tier, refreshProfile } = useAuth();
  const [busyTier, setBusyTier] = useState(null);
  const [status, setStatus] = useState(null); // { tier, type, msg }
  const [authOpen, setAuthOpen] = useState(false);

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

  return {
    buy,
    busyTier,
    statusFor: (key) => (status?.tier === key ? status : null),
    currentTier: tier,
    signedIn: !!user,
    authModal: <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />,
  };
}

export default function PlanCard({ tier, checkout }) {
  const { buy, busyTier, statusFor, currentTier, signedIn } = checkout;
  const isCurrent = signedIn && currentTier === tier.key;
  const isBelow = signedIn && tierRank(tier.key) < tierRank(currentTier);
  const status = statusFor(tier.key);

  return (
    <div
      className={`h-full rounded-2xl p-6 border flex flex-col ${
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
      <h3 className="font-display text-2xl mt-2 text-[#e7ecf5]">
        {tier.medal} {tier.name}
      </h3>
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
            onClick={() => buy(tier)}
            disabled={!!busyTier}
            aria-label={`Get the ${tier.name} plan for ${tier.price}${tier.priceNote}`}
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
