/* ============================================================
   EDUCHESS — Mock / static content

   Brand: this site is **EduChess** throughout. "Champion Chess Academy" is
   the offline/in-person entity and deliberately does not appear in site copy;
   the only place it survives is the physical HQ address below, because that
   is the name on the building people are trying to find.

   Positioning: EduChess is a chess academy. Chess is the whole product.
   Maths, English and AI are announced as future "Edu Courses" and appear on
   the Courses page as Coming soon; they are not sold or described anywhere
   else in the site copy.
   ============================================================ */

import { TIER_LIST } from "../lib/tiers";

/* ---------- Piece glyphs (shared by every board renderer) ---------- */
// Both colours render from these solid/filled shapes; the hollow "white"
// unicode glyphs disappear on light squares. See Chessboard.jsx.
export const GLYPHS_B = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };

/* ---------- Top nav ---------- */
// "courses" gets bespoke nav behavior in NavBar; everything else is a
// simple link or a dropdown of static items. Practice is intentionally
// not listed here — it renders as a permanent icon in NavBar instead.
export const NAV_LINKS = [
  { key: "about", label: "About" },
  { key: "courses", label: "Courses" },
  { key: "workshops", label: "Workshops" },
  { key: "puzzles", label: "Puzzles" },
  { key: "tournaments", label: "Tournaments" },
  { key: "contact", label: "Contact Us", items: ["Speak to a Growth Specialist", "Visakhapatnam HQ"] },
];

// Items shown in the Courses toggle dropdown. Only live courses appear here;
// the Edu Courses are still in development and are listed on the Courses page
// itself rather than offered as links that go nowhere.
export const COURSES_DROPDOWN = [
  { key: "chess", label: "Chess", tag: "Live now" },
];

// The chess programme: what the academy actually teaches today.
export const SUBJECT_TILES = [
  { key: "chess", title: "Chess", sub: "Beginner to tournament level", icon: "♞" },
];

/*
  Edu Courses: announced, not yet running.

  Kept as data rather than hardcoded into the page so that launching one is a
  matter of moving it into SUBJECT_TILES and COURSES_DROPDOWN. They render as
  "Coming soon" cards with no link, because a tile that navigates to an empty
  course is worse than one that plainly says it is not ready.
*/
export const EDU_COURSES = [
  { key: "maths", title: "Maths", sub: "Number sense and problem solving", icon: "♟" },
  { key: "english", title: "English", sub: "Reading, writing and speaking", icon: "♝" },
  { key: "ai", title: "AI", sub: "How modern AI works, for students", icon: "♜" },
];

/*
  What chess practice actually trains, for the homepage.

  Phrased as descriptions of the activity rather than health claims. "Chess
  raises IQ" is the sort of line that gets a school prospectus in trouble and
  cannot be backed up; "you hold a position in your head and recall it later"
  is simply what playing involves, and it is more convincing anyway.
*/
export const CHESS_BENEFITS = [
  {
    art: "memory",
    title: "Memory",
    body: "Students learn to hold a position in their head, recall openings they have studied, and spot patterns they have met before.",
  },
  {
    art: "concentration",
    title: "Concentration",
    body: "A single game asks for unbroken attention across an hour. That stamina carries straight into classwork and exams.",
  },
  {
    art: "planning",
    title: "Planning ahead",
    body: "Every move is a small forecast. Children get used to asking what happens next before they commit to anything.",
  },
  {
    art: "pressure",
    title: "Decisions under pressure",
    body: "With a clock running there is no waiting for certainty. Players learn to choose, commit, and keep going.",
  },
  {
    art: "mistakes",
    title: "Learning from mistakes",
    body: "Every loss has a cause you can find on the board. Reviewing a game turns a defeat into something specific to fix.",
  },
  {
    art: "confidence",
    title: "Quiet confidence",
    body: "Progress is visible and earned. Beating an opponent you could not beat last month is proof a student can trust.",
  },
];

export const COURSE_TITLES = {
  chess: "Chess",
};

// Storage object paths (not local /public paths) — resolved to public
// Supabase Storage CDN URLs at render time via src/lib/media.js.
export const COURSE_VIDEOS = {
  chess: "chess.mp4",
};

export const HOMEPAGE_VIDEO_PATH = "homepage.mp4";

/* ---------- Pricing ---------- */
/*
  The three membership tiers, for the pricing cards.

  Derived from src/lib/tiers.js rather than written out again here: the same
  three tiers now decide puzzle allowances and course access, and a price card
  that disagreed with what the account actually grants is worse than no card.
  The old Basic / Tournament / Advanced ladder maps onto Free / Pro / Academy,
  with the curriculum lines kept.
*/
export const PRICING_TIERS = TIER_LIST.map((t) => ({
  key: t.key,
  name: t.name,
  medal: t.medal,
  price: `${t.price}${t.priceNote}`,
  tag: t.tag,
  desc: t.desc,
  features: t.features,
  highlight: t.highlight,
}));

export const CORPORATE_DETAILS = [
  { l: "Email", v: "support@educhess.in" },
  { l: "Primary Direct Hotline", v: "+91 8247564508" },
  // The one intentional exception to EduChess-only branding: this is a
  // wayfinding address, and the offline centre is signposted "Champion Chess
  // Academy". Change it if the signage says EduChess.
  { l: "HQ Location", v: "EduChess, Champion Chess Academy, Gajuwaka, Visakhapatnam, Andhra Pradesh, India" },
  { l: "Second Academy", v: "Opposite Timpany School, VUDA Colony, Visakhapatnam, Andhra Pradesh, India" },
  { l: "Hours of Operation", v: "Mon to Sat, 9:00 AM to 8:00 PM IST" },
];

/* ---------- Live activity ticker ---------- */
export const TICKER_EVENTS = [
  "Aarav just cleared 'Fractions via Rank Puzzles' · +5 pts",
  "Meher climbed to Rank #12 in Cognitive Arenas",
  "Ishaan completed the Coordinate Planes quest · +8 pts",
  "Diya joined this week's Blitz Cup cohort",
  "Kabir unlocked the Combinatorics module",
  "Sara's cohort match starts in 20 minutes",
];

/* ---------- Stockfish practice: ELO presets ---------- */
// skill: Stockfish's internal Skill Level (0-20), used with `setoption`.
// depth: search depth cap sent with `go depth N`.
// moveError/randomness give beginner levels some human-like imprecision.
/*
  Engine difficulty tiers.

  `uciElo` is the important field. When present, the engine turns on
  Stockfish's own `UCI_LimitStrength` and plays at that calibrated rating —
  which is what makes "choose 1500 and get a 1500 opponent" actually true.
  The previous version set only `Skill Level` and never enabled the limiter,
  so every tier, including 500, played close to full strength.

  `UCI_Elo` on this build accepts 1320-3190. The two tiers below that floor
  cannot use the limiter, so they are approximated by hand:
    skill        Stockfish's own (weak) skill setting, 0 = weakest
    depth        hard search-depth cap
    multiPv      how many candidate lines to generate
    mistakeChance probability of playing a non-best candidate

  `approx: true` marks the tiers whose rating is an approximation, so the UI
  can say so instead of overclaiming.
*/
export const ENGINE_LEVELS = [
  // Tuned against measured average centipawn loss, not guessed: at multiPv 4 /
  // mistakeChance 0.75 the "500" tier still analysed at roughly 1275, so both
  // weak tiers widen the candidate pool and pick from it more often.
  { elo: 500, name: "Beginner", label: "500 · Beginner", approx: true, skill: 0, depth: 1, multiPv: 8, mistakeChance: 0.92, moveTimeMs: 200 },
  { elo: 1000, name: "Casual", label: "1000 · Casual", approx: true, skill: 0, depth: 2, multiPv: 5, mistakeChance: 0.6, moveTimeMs: 250 },
  { elo: 1500, name: "Intermediate", label: "1500 · Intermediate", uciElo: 1500, moveTimeMs: 500 },
  { elo: 2000, name: "Advanced", label: "2000 · Advanced", uciElo: 2000, moveTimeMs: 800 },
  { elo: 2500, name: "Master", label: "2500 · Master", uciElo: 2500, moveTimeMs: 1200 },
  { elo: 3000, name: "Grandmaster", label: "3000+ · Grandmaster", uciElo: 3190, moveTimeMs: 2000 },
];

export const ADMIN_VIDEO_CATEGORIES = ["chess", "maths", "english"];
