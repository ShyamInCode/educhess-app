/* ============================================================
   EDUCHESS — Mock / static content
   Brand positioning: Champion Chess Academy offers three separate
   courses — Chess (the primary/flagship course), Maths, and English —
   not a single merged "chess-integrated education" product.
   ============================================================ */

/* ---------- Piece glyphs (shared by every board renderer) ---------- */
export const GLYPHS = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" };
export const GLYPHS_B = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };

/* ---------- Top nav ---------- */
// "courses" gets bespoke nav behavior in NavBar; everything else is a
// simple button or a dropdown of static items. Practice is intentionally
// not listed here — it renders as a permanent icon in NavBar instead.
export const NAV_LINKS = [
  { key: "about", label: "About" },
  { key: "courses", label: "Courses" },
  { key: "resources", label: "Resources" },
  { key: "puzzles", label: "Puzzles" },
  { key: "tournaments", label: "Tournaments" },
  { key: "contact", label: "Contact Us", items: ["Speak to a Growth Specialist", "Visakhapatnam HQ"] },
];

// Items shown in the Courses toggle dropdown — deep-link straight into
// the relevant course on the Courses page. Chess is the primary/flagship
// course; Maths and English are separate courses in their own right.
export const COURSES_DROPDOWN = [
  { key: "chess", label: "Chess", tag: "Primary Course" },
  { key: "maths", label: "Maths", tag: "Course" },
  { key: "english", label: "English", tag: "Course" },
];

// Subject tiles used on My Learning / Courses / Puzzles pickers.
export const SUBJECT_TILES = [
  { key: "chess", title: "Chess", sub: "Our Primary Course", icon: "♞" },
  { key: "maths", title: "Maths", sub: "Course", icon: "♟" },
  { key: "english", title: "English", sub: "Course", icon: "♝" },
];

export const COURSE_TITLES = {
  chess: "Chess",
  maths: "Maths",
  english: "English",
};

// Storage object paths (not local /public paths) — resolved to public
// Supabase Storage CDN URLs at render time via src/lib/media.js.
export const COURSE_VIDEOS = {
  chess: "chess.mp4",
  maths: "maths.mp4",
  english: "english.mp4",
};

export const HOMEPAGE_VIDEO_PATH = "homepage.mp4";

// Ten progression levels shown on every course page, named with roman numerals.
export const ROMAN_LEVELS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export const CURRICULA = {
  chess: [
    { t: "Opening Principles", cat: "Openings", pts: ["Control the center before anything else", "Develop pieces before launching an attack", "Get the king to safety early with castling"] },
    { t: "Tactical Motifs", cat: "Tactics", pts: ["Spot pins that freeze a defender in place", "Set up forks that attack two targets at once", "Recognize skewers and discovered attacks"] },
    { t: "Endgame Fundamentals", cat: "Endgames", pts: ["Win king-and-pawn races using opposition", "Promote a passed pawn under pressure", "Convert a material edge into checkmate"] },
    { t: "Positional Play", cat: "Strategy", pts: ["Identify weak squares and outposts", "Judge good vs bad pawn structures", "Trade pieces to favor a stronger position"] },
    { t: "Calculation & Visualization", cat: "Calculation", pts: ["List candidate moves before committing", "Calculate forcing sequences several moves deep", "Visualize a position without moving pieces"] },
    { t: "Game Annotation & Review", cat: "Analysis", pts: ["Annotate a completed game's key turning points", "Spot the critical moment where the game shifted", "Start building a personal opening repertoire"] },
  ],
  maths: [
    { t: "Fractions via Rank Puzzles", cat: "Number Sense", pts: ["Split a pawn-chain's value into equal file shares", "Compare fraction size using material-value ratios", "Convert board-territory percentages to fractions"] },
    { t: "Coordinate Planes as Chess Axes", cat: "Coordinate Geometry", pts: ["Read (file, rank) as (x, y) pairs", "Plot a knight's legal moves as a coordinate set", "Translate reflections and shifts across the board"] },
    { t: "Combinatorics Vector Mapping", cat: "Combinatorics", pts: ["Count legal knight paths between two squares", "Use permutations to map opening move orders", "Introduce factorial growth via branching variations"] },
    { t: "Geometry of the 64 Squares", cat: "Geometry", pts: ["Identify diagonals, ranks, and files as lines and vectors", "Calculate area and symmetry of attack zones", "Use bishops to teach angle and reflection theorems"] },
    { t: "Aptitude & Speed Tactics", cat: "Aptitude", pts: ["Timed puzzle-rush drills for mental arithmetic speed", "Pattern recognition under a ticking clock, like blitz chess", "Estimation strategies before a full calculation"] },
    { t: "Algebra via Material Equations", cat: "Algebra", pts: ["Set up linear equations from piece-value trades", "Solve for unknowns in an even material exchange", "Introduce simple simultaneous equations via two-piece trades"] },
    { t: "Probability of the Next Move", cat: "Probability & Statistics", pts: ["Estimate the odds of a blunder from a position", "Use opening-move frequency data to teach basic probability", "Read simple win/draw/loss stats as data sets"] },
    { t: "Mensuration on the Board", cat: "Mensuration", pts: ["Calculate perimeter and area of control zones", "Compare square footage of the center vs the edges", "Apply board-scaling to real-world measurement problems"] },
    { t: "Ratios, Percentages & Time Controls", cat: "Ratio & Percentage", pts: ["Convert clock time into percentage of a match remaining", "Compare piece-value ratios between two positions", "Work rate problems using simultaneous exhibition games"] },
  ],
  english: [
    { t: "Conditional If/Then Calculation Syntax", cat: "Grammar", pts: ["Build 'if check, then king must respond' sentences", "Practice conditional clauses using forced-move scenarios", "Distinguish real vs hypothetical conditionals"] },
    { t: "Active vs Passive Tactical Voices", cat: "Grammar", pts: ["Rewrite 'the knight captured the bishop' in passive voice", "Identify when passive voice hides the attacker", "Choose voice for clarity in match commentary"] },
    { t: "Narrative Arc via Game Annotation", cat: "Creative Writing", pts: ["Map opening, middlegame, endgame to story structure", "Write rising action using a tense tactical sequence", "Practice concise, vivid annotation captions"] },
    { t: "Grammar Fundamentals on the Board", cat: "Grammar", pts: ["Practice subject-verb agreement using piece-move sentences", "Identify parts of speech within match commentary", "Correct common errors found in student game notes"] },
    { t: "Vocabulary Building — The Strategist's Lexicon", cat: "Vocabulary", pts: ["Learn tactical terms: fork, pin, skewer, zugzwang", "Build word families from chess root words", "Use context clues from annotated games to guess meaning"] },
    { t: "Reading Comprehension — Match Reports", cat: "Comprehension", pts: ["Extract main idea and supporting detail from game write-ups", "Answer inference questions about a player's strategy", "Summarize a match report in the student's own words"] },
    { t: "Essay & Opinion Writing — Defend Your Opening", cat: "Writing", pts: ["Structure a persuasive essay defending a chosen opening", "Use evidence from real games to support a thesis", "Practice counter-argument using an opponent's rebuttal"] },
    { t: "Public Speaking & Debate — Post-Match Analysis", cat: "Speaking", pts: ["Deliver a short spoken analysis of a played game", "Practice structured debate: attack vs defense strategy", "Build confidence answering unscripted follow-up questions"] },
    { t: "Punctuation & Mechanics in Annotation", cat: "Mechanics", pts: ["Use correct notation punctuation as a proxy for sentence punctuation", "Practice commas, semicolons, and clause boundaries", "Edit a passage of game commentary for mechanical errors"] },
  ],
};

/* ---------- Pricing ---------- */
export const PRICING_TIERS = [
  {
    name: "Basic Level",
    medal: "🥉",
    price: "₹1,999/mo",
    tag: "Self-paced foundation",
    desc: "The perfect low-friction entry point for parents testing out the concept.",
    features: ["Pure chess curriculum", "Chess Board Explanation", "Naming and Movement of Pieces", "Puzzle Solving"],
  },
  {
    name: "Tournament Level",
    medal: "🥈",
    price: "₹2,999/mo",
    tag: "Most popular",
    desc: "The complete core school accelerator — covers the entire standard school spectrum.",
    features: ["Everything in the Basic Level", "Tactics and Strategy", "Opening game", "End Game"],
    highlight: true,
  },
  {
    name: "Advanced Level",
    medal: "🥇",
    price: "₹4,999/mo",
    tag: "Advanced future skills",
    desc: "The ultimate future-proof cognitive upgrade — for parents who want elite development.",
    features: ["Everything in the Basic and Tournament Levels", "Advanced Strategies", "Middle game", "Games Analysis"],
  },
];

/* ---------- Resources ---------- */
export const RESOURCE_CATEGORIES = [
  {
    cat: "Maths",
    icon: "♟",
    items: [
      { t: "Fractions Quest Sheet — Pack 1", type: "PDF · 12 pages" },
      { t: "Coordinate Planes Board Drills", type: "PDF · 8 pages" },
      { t: "Geometry of the 64 Squares", type: "PDF · 10 pages" },
      { t: "Aptitude Speed-Rush Drills", type: "PDF · 6 pages" },
      { t: "Algebra via Material Equations", type: "PDF · 9 pages" },
      { t: "Knight's Combinatorics Worksheet", type: "PDF · 14 pages" },
    ],
  },
  {
    cat: "English",
    icon: "♝",
    items: [
      { t: "Conditional Syntax Tactics", type: "PDF · 10 pages" },
      { t: "Active vs Passive Voice Arena", type: "PDF · 6 pages" },
      { t: "The Strategist's Lexicon — Vocabulary Pack", type: "PDF · 8 pages" },
      { t: "Match Report Comprehension Set", type: "PDF · 11 pages" },
      { t: "Defend Your Opening — Essay Templates", type: "PDF · 7 pages" },
      { t: "Punctuation via Game Annotation", type: "PDF · 5 pages" },
    ],
  },
  {
    cat: "Chess",
    icon: "♞",
    items: [
      { t: "Opening Principles Quick-Reference", type: "PDF · 6 pages" },
      { t: "Endgame Fundamentals Worksheet", type: "PDF · 9 pages" },
      { t: "Tactical Motifs Flashcard Set", type: "PDF · 20 cards" },
    ],
  },
];

/* ---------- Testimonials ---------- */
export const TESTIMONIALS = [
  { name: "Ananya R.", role: "Parent, Grade 6 student", quote: "My daughter used to dread fractions. Now she asks to do her 'chess quests' before dinner.", rating: 5 },
  { name: "Karthik M.", role: "Parent, Grade 8 student", quote: "The English module made grammar click for the first time — tying it to tactics actually worked.", rating: 5 },
  { name: "Priya D.", role: "Parent, Grade 5 student", quote: "He climbed from a beginner rank to top of his cohort leaderboard in six weeks.", rating: 4 },
  { name: "Suresh V.", role: "Parent, Grade 7 student", quote: "Finally a program that doesn't feel like extra school. It feels like a game he wants to win.", rating: 5 },
];

export const CORPORATE_DETAILS = [
  { l: "Email", v: "support@educhess.in" },
  { l: "Primary Direct Hotline", v: "+91 8247564508" },
  { l: "HQ Location", v: "Champion Chess Academy, Gajuwaka, Visakhapatnam, Andhra Pradesh, India" },
  { l: "Hours of Operation", v: "Mon – Sat: 9:00 AM – 8:00 PM IST" },
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
export const ENGINE_LEVELS = [
  { elo: 500, name: "Beginner", label: "500 · Beginner", skill: 0, depth: 2, moveTimeMs: 300 },
  { elo: 1000, name: "Casual", label: "1000 · Casual", skill: 5, depth: 5, moveTimeMs: 500 },
  { elo: 1500, name: "Intermediate", label: "1500 · Intermediate", skill: 10, depth: 8, moveTimeMs: 800 },
  { elo: 2000, name: "Advanced", label: "2000 · Advanced", skill: 15, depth: 12, moveTimeMs: 1200 },
  { elo: 2500, name: "Master", label: "2500 · Master", skill: 20, depth: 18, moveTimeMs: 2000 },
  { elo: 3000, name: "Grandmaster", label: "3000+ · Grandmaster", skill: 20, depth: 24, moveTimeMs: 3000 },
];

export const ADMIN_VIDEO_CATEGORIES = ["chess", "maths", "english"];
