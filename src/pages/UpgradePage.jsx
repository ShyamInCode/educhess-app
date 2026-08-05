import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { TIER_LIST, tierRank } from "../lib/tiers";

/*
  Membership comparison.

  Kept separate from the pricing block on /about: that one sells the coaching
  programme to a parent who has never been here, this one is where a signed-in
  family goes when they hit a limit. Same three tiers, same numbers, both
  derived from src/lib/tiers.js.
*/

function TierCard({ tier, currentTier, signedIn }) {
  const isCurrent = signedIn && currentTier === tier.key;
  const isBelow = signedIn && tierRank(tier.key) < tierRank(currentTier);

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
        ) : (
          <Link
            to="/contact"
            className="block w-full text-center py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
          >
            Talk to us about {tier.name}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function UpgradePage() {
  const { user, tier } = useAuth();

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
          <TierCard key={t.key} tier={t} currentTier={tier} signedIn={!!user} />
        ))}
      </div>

      <p className="text-sm text-[#93a1b8] mt-8">
        Coaching at both academies is arranged in person and billed separately.{" "}
        <Link to="/contact" className="text-[#34d399] hover:text-[#6ee7b7]">
          Ask us about in-person coaching
        </Link>
        .
      </p>
    </div>
  );
}
