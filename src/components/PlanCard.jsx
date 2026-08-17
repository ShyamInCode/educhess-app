import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { tierRank } from "../lib/tiers";

/* ============================================================
   One pricing card.
   ------------------------------------------------------------
   Used by /upgrade and by the Programs & Pricing block on /about. They
   are the same offer, so they are the same component: a card on the
   About page that said "enquire" while /upgrade took payment was two
   different answers to the same question.

   PAYMENTS ARE STUBBED. There is no checkout: the plans are described here
   and bought by talking to the academy, which is how the in-person coaching
   has always been sold anyway. The `payments` table still exists with its
   columns and its RESTRICT foreign key, so a receipt has somewhere to go the
   day this changes — but nothing writes to it and no code processes money.

   This is the same thing a visitor saw before, because the publishable key
   shipped blank: the buttons already fell back to "Talk to us". What has gone
   is the branch behind them — a client bundle that loaded Razorpay Checkout,
   an Edge Function that created orders, and a second one that took the
   signed webhook. Turning payments back on means either Razorpay Payment
   Links (zero code, admin marks the member up by hand) or that Edge Function
   pair. See docs/SYSTEM-OVERVIEW.md.
   ============================================================ */

/**
 * Plan-card state for a page that shows them.
 *
 * Kept as a hook, and kept returning the same shape, so /upgrade and /about
 * still cannot drift apart. It has nothing left to do asynchronously.
 */
export function usePlanCheckout() {
  const { user, tier } = useAuth();
  return {
    currentTier: tier,
    signedIn: !!user,
    // The pages render this; there is no longer a flow that opens it.
    authModal: null,
  };
}

export default function PlanCard({ tier, checkout }) {
  const { currentTier, signedIn } = checkout;
  const isCurrent = signedIn && currentTier === tier.key;
  const isBelow = signedIn && tierRank(tier.key) < tierRank(currentTier);

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
        ) : (
          /* Payments are stubbed, so there is no honest "pay now" button to
             show. This is the fallback the site already used whenever the
             publishable key was blank, which was always. */
          <Link
            to="/contact"
            aria-label={`Enquire about the ${tier.name} plan`}
            className="block w-full text-center py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
          >
            Talk to us about {tier.name}
          </Link>
        )}
      </div>
    </div>
  );
}
