/* ============================================================
   Membership tiers.
   ------------------------------------------------------------
   DISPLAY ONLY. The database is the authority:

     tier_daily_puzzles()  decides how many puzzles anyone gets
     enforce_puzzle_quota  refuses the row past that number
     current_tier()        applies expiry

   The numbers below mirror migration_phase8_tiers.sql so the UI can say
   "3 of 5 left" without a round trip. If you change one, change both —
   the mismatch shows up as a limit the client promises and the database
   refuses, which reads as a bug rather than a policy.
   ============================================================ */

export const TIER_KEYS = ["free", "pro", "academy"];

export const TIERS = {
  free: {
    key: "free",
    name: "Free",
    medal: "♟",
    price: "₹0",
    priceNote: "",
    // Paise, for Razorpay. Free is never charged.
    amountPaise: 0,
    dailyPuzzles: 5,
    tag: "Start here",
    desc: "Enough to see whether your child takes to it, at no cost and no commitment.",
    features: [
      "5 puzzles a day",
      "Play the engine, all six levels",
      "Full game review after every game",
      "Register for tournaments and workshops",
    ],
  },
  pro: {
    key: "pro",
    name: "Pro",
    medal: "🥈",
    price: "₹1,999",
    priceNote: "/mo",
    amountPaise: 199900,
    dailyPuzzles: 50,
    tag: "Most popular",
    desc: "For a student who has started and wants to get properly good.",
    features: [
      "50 puzzles a day",
      "Basic chess course videos",
      "Chess board explanation, pieces and movement",
      "Everything in Free",
    ],
    highlight: true,
  },
  academy: {
    key: "academy",
    name: "Academy",
    medal: "🥇",
    price: "₹3,999",
    priceNote: "/mo",
    amountPaise: 399900,
    // null = unlimited
    dailyPuzzles: null,
    tag: "The full programme",
    desc: "For committed players working towards serious tournament results.",
    features: [
      "Unlimited puzzles",
      "Every course video, all chapters",
      "Tactics, strategy, openings and endgames",
      "Advanced strategies, middle game and game analysis",
      "Everything in Pro",
    ],
  },
};

export const TIER_LIST = TIER_KEYS.map((k) => TIERS[k]);

/** Paid tiers only — the ones an upgrade button can point at. */
export const PAID_TIERS = TIER_LIST.filter((t) => t.amountPaise > 0);

const RANK = { free: 1, pro: 2, academy: 3 };

/** Mirrors tier_rank() in SQL. */
export function tierRank(tier) {
  return RANK[tier] || 1;
}

/** Does `tier` clear the bar set by `minTier`? */
export function tierAllows(tier, minTier) {
  return tierRank(tier) >= tierRank(minTier || "free");
}

export function tierName(tier) {
  return TIERS[tier]?.name || "Free";
}

/**
 * The tier a profile actually has right now, mirroring current_tier() in SQL.
 *
 * Expiry is applied at read time on both sides. Nothing runs on a schedule to
 * downgrade a lapsed member — this project has no cron, and a lapsed row that
 * silently kept its access would be the worst of the available bugs.
 */
export function effectiveTier(profile) {
  if (!profile?.tier || profile.tier === "free") return "free";
  if (profile.tier_expires_at && new Date(profile.tier_expires_at).getTime() <= Date.now()) {
    return "free";
  }
  return profile.tier;
}

/** The next tier up, or null at the top. Drives every "upgrade to…" prompt. */
export function nextTierAbove(tier) {
  const rank = tierRank(tier);
  return TIER_LIST.find((t) => tierRank(t.key) > rank) || null;
}
