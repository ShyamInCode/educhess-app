import React from "react";
import { Link } from "react-router-dom";
import PlanCard, { usePlanCheckout } from "../components/PlanCard";
import { TIER_LIST } from "../lib/tiers";

/*
  Membership comparison.

  Where a signed-in family goes when they hit a limit. The cards and the
  checkout are shared with the Programs & Pricing block on /about — same
  offer, so the same component.
*/
export default function UpgradePage() {
  const checkout = usePlanCheckout();

  return (
    <div className="w-full max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Membership</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-3 text-[#e7ecf5]">Choose a plan</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-8">
        Every account gets puzzles, the engine and full game review. Paid plans add more puzzles a day
        and the course videos our coaches teach from.
      </p>

      <div className="grid md:grid-cols-3 gap-5 items-stretch">
        {TIER_LIST.map((t) => (
          <PlanCard key={t.key} tier={t} checkout={checkout} />
        ))}
      </div>

      <p className="text-sm text-[#93a1b8] mt-8">
        Coaching at both academies is arranged in person and billed separately.{" "}
        <Link to="/contact" className="text-[#34d399] hover:text-[#6ee7b7]">
          Ask us about in-person coaching
        </Link>
        .
      </p>

      {checkout.authModal}
    </div>
  );
}
