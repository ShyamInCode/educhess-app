import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./lib/AuthContext";

/* ============================================================
   EDUCHESS — "Learn Through Chess"
   Design tokens (per brief + studio pass):
   - bg-void:      #0f172a  (page background)
   - bg-panel:     #1e293b  (card surfaces)
   - bg-panel-2:   #172033  (recessed / nested surfaces)
   - line:         #2d3b53  (hairline borders)
   - gold:         #d4af37  (rank / authority accent)
   - gold-soft:    #f0d98c
   - emerald:      #34d399  (success / interactive confirm)
   - ink:          #e7ecf5  (primary text on dark)
   - ink-dim:      #93a1b8  (secondary text)
   Type:
   - Display: 'Cinzel' — chiseled, regal, reads like a piece finial. Headlines only.
   - Body:    'Inter' — quiet workhorse for paragraphs & UI.
   - Notation:'JetBrains Mono' — algebraic-notation voice for ranks, scores, coordinates.
   Signature:
   - A gold coordinate rail (a–h / 1–8) framing the whole app like a board edge,
     plus slow-falling, low-opacity chess glyphs that behave like drifting motes.
   ============================================================ */

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
`;

const GLYPHS = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" };
const GLYPHS_B = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };

/* ---------- Floating background pieces ---------- */
function FloatingPieces() {
  const items = [
    { g: "♞", left: "6%", delay: "0s", dur: "22s", size: 60 },
    { g: "♜", left: "16%", delay: "3s", dur: "26s", size: 46 },
    { g: "♛", left: "27%", delay: "1.5s", dur: "30s", size: 74 },
    { g: "♝", left: "39%", delay: "6s", dur: "24s", size: 42 },
    { g: "♟", left: "50%", delay: "2s", dur: "20s", size: 36 },
    { g: "♚", left: "61%", delay: "8s", dur: "32s", size: 70 },
    { g: "♞", left: "72%", delay: "4.5s", dur: "23s", size: 48 },
    { g: "♜", left: "83%", delay: "0.8s", dur: "28s", size: 44 },
    { g: "♛", left: "92%", delay: "5.5s", dur: "25s", size: 56 },
    { g: "♝", left: "48%", delay: "10s", dur: "27s", size: 32 },
  ];
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
      {items.map((it, i) => (
        <span
          key={i}
          className="drift-piece"
          style={{
            left: it.left,
            animationDelay: it.delay,
            animationDuration: it.dur,
            fontSize: it.size,
          }}
        >
          {it.g}
        </span>
      ))}
    </div>
  );
}

/* ---------- Coordinate rail (signature framing element) ---------- */
function CoordRail() {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
  return (
    <>
      <div className="hidden md:flex fixed top-0 left-0 right-0 justify-around px-10 pt-1 z-40 pointer-events-none">
        {files.map((f) => (
          <span key={f} className="font-mono text-[10px] tracking-widest text-[#d4af37]/40">{f}</span>
        ))}
      </div>
      <div className="hidden md:flex fixed top-0 bottom-0 left-1 flex-col justify-around py-10 z-40 pointer-events-none">
        {ranks.map((r) => (
          <span key={r} className="font-mono text-[10px] tracking-widest text-[#d4af37]/40">{r}</span>
        ))}
      </div>
    </>
  );
}

/* ---------- Reusable mini chessboard ---------- */
function initialBoard() {
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { t: back[c], w: false };
    board[1][c] = { t: "P", w: false };
    board[6][c] = { t: "P", w: true };
    board[7][c] = { t: back[c], w: true };
  }
  return board;
}

function Chessboard({ board, onSquareClick, selected, highlights = [], locked, size = "normal" }) {
  const dim = size === "small" ? "w-8 h-8 text-lg" : "w-10 h-10 sm:w-12 sm:h-12 text-2xl";
  return (
    <div className={`relative inline-block rounded-lg overflow-hidden border-2 border-[#d4af37]/50 shadow-2xl ${locked ? "opacity-40 grayscale" : ""}`}>
      <div className="grid grid-cols-8">
        {board.map((row, r) =>
          row.map((sq, c) => {
            const dark = (r + c) % 2 === 1;
            const key = `${r}-${c}`;
            const isSel = selected && selected[0] === r && selected[1] === c;
            const isHi = highlights.some(([hr, hc]) => hr === r && hc === c);
            return (
              <button
                key={key}
                disabled={locked}
                onClick={() => onSquareClick && onSquareClick(r, c)}
                className={`${dim} flex items-center justify-center select-none transition-colors
                  ${dark ? "bg-[#1e293b]" : "bg-[#334155]"}
                  ${isSel ? "ring-4 ring-inset ring-[#34d399]" : ""}
                  ${isHi ? "bg-[#d4af37]/40" : ""}
                  ${!locked ? "hover:bg-[#d4af37]/20 cursor-pointer" : "cursor-not-allowed"}
                `}
              >
                {sq && (
                  <span className={sq.w ? "text-[#f4f1ea] drop-shadow" : "text-[#0f172a]"}>
                    {sq.w ? GLYPHS[sq.t] : GLYPHS_B[sq.t]}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------- Animated counting stat (dynamic on-mount tween) ---------- */
function CountUp({ to, suffix = "", duration = 1400 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.4 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    let start = null;
    function step(ts) {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * to));
      if (progress < 1) requestAnimationFrame(step);
    }
    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className="font-mono">
      {val.toLocaleString()}{suffix}
    </span>
  );
}

/* ---------- Testimonials data + auto-rotating carousel ---------- */
const TESTIMONIALS = [
  { name: "Ananya R.", role: "Parent, Grade 6 student", quote: "My daughter used to dread fractions. Now she asks to do her 'chess quests' before dinner.", rating: 5 },
  { name: "Karthik M.", role: "Parent, Grade 8 student", quote: "The English module made grammar click for the first time — tying it to tactics actually worked.", rating: 5 },
  { name: "Priya D.", role: "Parent, Grade 5 student", quote: "He climbed from a beginner rank to top of his cohort leaderboard in six weeks.", rating: 4 },
  { name: "Suresh V.", role: "Parent, Grade 7 student", quote: "Finally a program that doesn't feel like extra school. It feels like a game he wants to win.", rating: 5 },
];

function Testimonials() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % TESTIMONIALS.length), 4500);
    return () => clearInterval(t);
  }, [paused]);

  const cur = TESTIMONIALS[index];

  return (
    <div
      className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8 relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">From the Cohort</span>
      <h2 className="font-display text-2xl mt-2 mb-6 text-[#e7ecf5]">What parents are saying</h2>

      <div key={index} className="min-h-[110px]">
        <div className="text-[#d4af37] text-base mb-3">{"★".repeat(cur.rating)}{"☆".repeat(5 - cur.rating)}</div>
        <p className="text-[#e7ecf5] text-lg sm:text-xl leading-relaxed font-display">"{cur.quote}"</p>
        <p className="text-base text-[#93a1b8] mt-4 font-mono">{cur.name} · {cur.role}</p>
      </div>

      <div className="flex gap-2 mt-6">
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Show testimonial ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-[#d4af37]" : "w-1.5 bg-[#2d3b53]"}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- Nav dropdown content ---------- */
// "subjects" (Courses) and "quiz" are handled with bespoke nav behavior in NavBar.
const NAV_LINKS = [
  { key: "subjects", label: "Courses" },
  { key: "pricing", label: "Pricing", items: ["Basic Level", "Tournament Level", "Advanced Level"] },
  { key: "resources", label: "Resources", items: ["Quest Sheet Library", "Printable Worksheets"] },
  { key: "quiz", label: "Quiz" },
  { key: "contact", label: "Contact Us", items: ["Speak to a Growth Specialist", "Visakhapatnam HQ"] },
];

// Items shown in the Courses toggle dropdown. "All courses" always lands on
// the full Curriculum Board; the rest deep-link straight to that course.
const COURSES_DROPDOWN = [
  { key: "chess", label: "Chess", tag: "Pure strategy" },
  { key: "maths", label: "Maths", tag: "Popular" },
  { key: "coding", label: "Coding", tag: "Popular" },
];

const SUBJECT_TILES = [
  { key: "chess", title: "Chess", sub: "Pure Strategy", icon: "♞" },
  { key: "maths", title: "Maths", sub: "Chess-Integrated", icon: "♟" },
  { key: "english", title: "English", sub: "Chess-Integrated", icon: "♝" },
  { key: "coding", title: "Coding", sub: "Computational Thinking", icon: "♜" },
  { key: "finance", title: "Financial Literacy", sub: "Strategic Capital", icon: "♛" },
];

// Video file served from /public for each course's curriculum map page.
const COURSE_VIDEOS = {
  chess: "chess.mp4",
  maths: "maths.mp4",
  english: "english.mp4",
  coding: "coding.mp4",
  finance: "finance.mp4",
};

// Ten progression levels shown on every course page, named with roman numerals.
const ROMAN_LEVELS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const CURRICULA = {
  chess: [
    { t: "Opening Principles", cat: "Openings", pts: ["Control the center before anything else", "Develop pieces before launching an attack", "Get the king to safety early with castling"] },
    { t: "Tactical Motifs", cat: "Tactics", pts: ["Spot pins that freeze a defender in place", "Set up forks that attack two targets at once", "Recognize skewers and discovered attacks"] },
    { t: "Endgame Fundamentals", cat: "Endgames", pts: ["Win king-and-pawn races using opposition", "Promote a passed pawn under pressure", "Convert a material edge into checkmate"] },
    { t: "Positional Play", cat: "Strategy", pts: ["Identify weak squares and outposts", "Judge good vs bad pawn structures", "Trade pieces to favor a stronger position"] },
    { t: "Calculation & Visualization", cat: "Calculation", pts: ["List candidate moves before committing", "Calculate forcing sequences several moves deep", "Visualize a position without moving pieces"] },
    { t: "Game Annotation & Review", cat: "Analysis", pts: ["Annotate a completed game's key turning points", "Spot the critical moment where the game shifted", "Start building a personal opening repertoire"] },
  ],
  coding: [
    { t: "Algorithmic Thinking via Move Trees", cat: "Algorithms", pts: ["Map decision trees onto a game tree of moves", "Use if / else logic to model forced replies", "Model repeated tactics as a loop"] },
    { t: "Sequencing & Logic Blocks", cat: "Programming Fundamentals", pts: ["Treat a sequence of moves as a small program", "Build conditionals from 'if check, then king moves'", "Debug a broken move sequence step by step"] },
    { t: "Variables & State", cat: "Data & State", pts: ["Track the board position as a program's state", "Use piece values as simple variables", "Keep a running total to track material balance"] },
    { t: "Loops & Patterns", cat: "Iteration", pts: ["Repeat a knight patrol pattern across the board", "Detect repetition, like spotting a threefold loop", "Practice pattern recognition drills at speed"] },
    { t: "Functions & Reusable Strategy", cat: "Abstraction", pts: ["Treat a memorized opening as a reusable function", "Break a plan into smaller reusable sub-routines", "Use parameters to represent alternate move options"] },
    { t: "Intro to Real Code", cat: "Applied Coding", pts: ["Translate a simple chess rule into pseudocode", "Write a mini script that checks a legal pawn move", "Try block-based coding mapped to piece movement"] },
  ],
  finance: [
    { t: "Financial Literacy Opening Book", cat: "Foundations", pts: ["Use piece value to introduce relative worth", "Read a trade-off as a lesson in opportunity cost", "Compare material vs position to assets vs goals"] },
    { t: "Budgeting Like a Grandmaster", cat: "Budgeting", pts: ["Allocate a fixed clock budget across a game", "Plan resources before spending them", "Practice a simple weekly allowance planning exercise"] },
    { t: "Saving & Compounding", cat: "Saving", pts: ["Build a small material edge over many moves", "See how small edges compound over a long game", "Practice delayed gratification through long-term plans"] },
    { t: "Risk & Reward", cat: "Risk Management", pts: ["Weigh a risky sacrifice against a safe move", "Compare risk and reward to an investment decision", "Understand defensive moves as a form of insurance"] },
    { t: "Tactical Money Management", cat: "Money Management", pts: ["Track a mock ledger of coins earned from quests", "Practice sorting needs vs wants", "Run a simple mock-trading simulation"] },
    { t: "Planning for the Long Game", cat: "Financial Planning", pts: ["Set a match plan as a metaphor for a savings goal", "Adjust a plan as the position on the board changes", "Get an intro to growth through a simplified example"] },
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

/* ---------- App ---------- */
const TRANSITION_GLYPHS = ["♔", "♕", "♖", "♗", "♘", "♙"];

export default function App() {
  const [activePage, setActivePage] = useState("home");
  const [subjectDetail, setSubjectDetail] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [transitionPiece, setTransitionPiece] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenDropdown(null);
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function goTo(page, detail = null) {
    const glyph = TRANSITION_GLYPHS[Math.floor(Math.random() * TRANSITION_GLYPHS.length)];
    setTransitionPiece({ glyph, id: Date.now() });
    setActivePage(page);
    setSubjectDetail(detail);
    setOpenDropdown(null);
    setProfileOpen(false);
  }

  return (
    <div className="h-screen w-full overflow-hidden relative bg-[#0f172a] text-[#e7ecf5] font-body flex flex-col">
      <style>{`
        ${FONT_IMPORT}
        .font-display { font-family: 'Cinzel', serif; }
        .font-body { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }

        @keyframes drift {
          0%   { transform: translateY(-10vh) rotate(-6deg); opacity: 0; }
          8%   { opacity: 0.14; }
          50%  { transform: translateY(50vh) rotate(4deg); }
          92%  { opacity: 0.10; }
          100% { transform: translateY(112vh) rotate(-4deg); opacity: 0; }
        }
        .drift-piece {
          position: absolute;
          top: 0;
          color: #d4af37;
          opacity: 0.12;
          animation-name: drift;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        @keyframes bob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .bob { animation: bob 3.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .drift-piece, .bob { animation: none !important; }
        }
        .scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #d4af3755; border-radius: 4px; }

        @keyframes page-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .page-enter { animation: page-in 0.35s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .page-enter { animation: none !important; }
        }

        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ticker-track { animation: ticker-scroll 28s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ticker-track { animation: none !important; }
        }

        @keyframes piece-slam {
          0%   { transform: translate(-50%, -50%) scale(0.2) rotate(-15deg); opacity: 0; }
          35%  { transform: translate(-50%, -50%) scale(1.15) rotate(4deg); opacity: 0.5; }
          60%  { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 0.32; }
          100% { transform: translate(-50%, -50%) scale(1.6) rotate(6deg); opacity: 0; }
        }
        .piece-transition {
          position: fixed;
          top: 50%;
          left: 50%;
          animation: piece-slam 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .piece-transition { display: none; }
        }
      `}</style>

      <FloatingPieces />
      <CoordRail />

      {transitionPiece && (
        <span
          key={transitionPiece.id}
          className="piece-transition text-[#d4af37] pointer-events-none z-50"
          style={{ fontSize: "42vh" }}
          onAnimationEnd={() => setTransitionPiece(null)}
        >
          {transitionPiece.glyph}
        </span>
      )}

      <NavBar
        navRef={navRef}
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        profileOpen={profileOpen}
        setProfileOpen={setProfileOpen}
        goTo={goTo}
        activePage={activePage}
      />

      <LiveTicker />

      <main key={subjectDetail ? `subjects-${subjectDetail}` : activePage} className="page-enter relative z-10 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {activePage === "home" && <HomePage goTo={goTo} />}
        {activePage === "subjects" && !subjectDetail && (
          <SubjectsPage onOpenSubject={(k) => setSubjectDetail(k)} />
        )}
        {activePage === "subjects" && subjectDetail && (
          <CoursePage subjectKey={subjectDetail} onBack={() => setSubjectDetail(null)} />
        )}
        {activePage === "pricing" && <PricingPage />}
        {activePage === "resources" && <ResourcesPage />}
        {activePage === "quiz" && <QuizPage />}
        {activePage === "dashboard" && <DashboardPage />}
        {activePage === "mylearning" && <MyLearningPage goTo={goTo} />}
        {activePage === "contact" && <ContactPage />}
      </main>
    </div>
  );
}

/* ---------- Live activity ticker (dynamic marquee) ---------- */
const TICKER_EVENTS = [
  "Aarav just cleared 'Fractions via Rank Puzzles' · +5 pts",
  "Meher climbed to Rank #12 in Cognitive Arenas",
  "Ishaan completed the Coordinate Planes quest · +8 pts",
  "Diya joined this week's Blitz Cup cohort",
  "Kabir unlocked the Combinatorics module",
  "Sara's cohort match starts in 20 minutes",
];

function LiveTicker() {
  const loop = [...TICKER_EVENTS, ...TICKER_EVENTS];
  return (
    <div className="relative z-20 border-b border-[#2d3b53] bg-[#0f172a]/80 overflow-hidden py-1.5 shrink-0">
      <div className="flex whitespace-nowrap ticker-track">
        {loop.map((e, i) => (
          <span key={i} className="mx-6 text-xs font-mono text-[#93a1b8] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] inline-block" />
            {e}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- NavBar ---------- */
function NavBar({ navRef, openDropdown, setOpenDropdown, profileOpen, setProfileOpen, goTo, activePage }) {
  const { user, profile, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSubOpen, setMobileSubOpen] = useState(null);
  const mobilePanelRef = useRef(null);
  const displayName = profile?.name || user?.email || "";
  const initial = displayName ? displayName.charAt(0).toUpperCase() : "?";

  function mobileGoTo(page, detail) {
    setMobileMenuOpen(false);
    setMobileSubOpen(null);
    goTo(page, detail);
  }

  useEffect(() => {
    function onClick(e) {
      if (
        mobilePanelRef.current &&
        !mobilePanelRef.current.contains(e.target) &&
        navRef.current &&
        !navRef.current.contains(e.target)
      ) {
        setMobileMenuOpen(false);
        setMobileSubOpen(null);
      }
    }
    function onResize() {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
        setMobileSubOpen(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("resize", onResize);
    };
  }, [navRef]);

  return (
    <>
      <nav ref={navRef} className="relative z-30 border-b border-[#d4af37]/25 bg-[#151f36]/95 backdrop-blur px-4 sm:px-8 py-3 flex items-center justify-between shrink-0">
        <button onClick={() => goTo("home")} className="flex items-center shrink-0 hover:opacity-90 transition-opacity">
          <img
            src="/educhess_title.png"
            alt="EduChess"
            className="h-10 sm:h-10 w-auto object-contain"
          />
        </button>

        <div className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((l) => {
            if (l.key === "subjects") {
              return (
                <div key={l.key} className="relative flex items-center">
                  <button
                    onClick={() => goTo("subjects")}
                    className={`pl-3 pr-1.5 py-2 text-base font-medium rounded-l-md transition-colors ${
                      activePage === "subjects" ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                    }`}
                  >
                    {l.label}
                  </button>
                  <button
                    aria-label="Toggle courses menu"
                    onClick={() => setOpenDropdown(openDropdown === "subjects" ? null : "subjects")}
                    className={`pl-1 pr-2.5 py-2 text-sm rounded-r-md transition-colors ${
                      openDropdown === "subjects" ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                    }`}
                  >
                    <span className={`inline-block transition-transform ${openDropdown === "subjects" ? "rotate-180" : ""}`}>▾</span>
                  </button>
                  {openDropdown === "subjects" && (
                    <div className="absolute top-full mt-2 left-0 w-64 bg-[#1e293b] border border-[#2d3b53] rounded-xl shadow-2xl p-2 z-40">
                      {COURSES_DROPDOWN.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => goTo("subjects", c.key)}
                          className="w-full flex items-center justify-between px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a] hover:text-[#34d399] transition-colors"
                        >
                          <span>{c.label} <span className="text-[#93a1b8] text-sm">({c.tag})</span></span>
                        </button>
                      ))}
                      <div className="my-1 border-t border-[#2d3b53]" />
                      <button
                        onClick={() => goTo("subjects")}
                        className="w-full flex items-center justify-between px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a] hover:text-[#34d399] transition-colors"
                      >
                        <span>All courses</span>
                        <span className="text-[#d4af37]">→</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            if (l.key === "quiz") {
              return (
                <button
                  key={l.key}
                  onClick={() => goTo("quiz")}
                  className={`px-3 py-2 text-base font-medium rounded-md transition-colors ${
                    activePage === "quiz" ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                  }`}
                >
                  {l.label}
                </button>
              );
            }
            return (
              <div key={l.key} className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === l.key ? null : l.key)}
                  className={`px-3 py-2 text-base font-medium rounded-md transition-colors ${
                    activePage === l.key || openDropdown === l.key ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                  }`}
                >
                  {l.label}
                </button>
                {openDropdown === l.key && (
                  <div className="absolute top-full mt-2 left-0 w-64 bg-[#1e293b] border border-[#2d3b53] rounded-xl shadow-2xl p-2 z-40">
                    {l.items.map((it) => (
                      <button
                        key={it}
                        onClick={() => goTo(l.key)}
                        className="w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a] hover:text-[#34d399] transition-colors"
                      >
                        {it}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative">
            {!user ? (
              <button
                onClick={() => setAuthOpen(true)}
                className="px-3 sm:px-4 py-2 rounded-md bg-[#d4af37] text-[#0f172a] font-semibold text-sm sm:text-base hover:bg-[#f0d98c] transition-colors"
              >
                Login
              </button>
            ) : (
              <>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-[#1e293b] border border-[#2d3b53] hover:border-[#d4af37]/50 transition-colors"
                >
                  <span className="w-7 h-7 rounded-full bg-[#d4af37] text-[#0f172a] flex items-center justify-center font-display text-base shrink-0">{initial}</span>
                  <span className="text-base text-[#e7ecf5] hidden sm:inline">{displayName}</span>
                </button>
                {profileOpen && (
                  <div className="absolute top-full mt-2 right-0 w-48 bg-[#1e293b] border border-[#2d3b53] rounded-xl shadow-2xl p-2 z-40">
                    <p className="px-3 py-1 text-xs font-mono text-[#93a1b8] uppercase tracking-wide">
                      {profile?.rank_points ?? 0} pts earned
                    </p>
                    <button onClick={() => goTo("dashboard")} className="w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a]">Dashboard</button>
                    <button onClick={() => goTo("mylearning")} className="w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a]">My Learning</button>
                    <button onClick={() => goTo("contact")} className="w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a]">Help</button>
                    <button
                      onClick={() => { signOut(); setProfileOpen(false); }}
                      className="w-full text-left px-3 py-2 text-base rounded-lg text-[#f87171] hover:bg-[#0f172a]"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Hamburger — visible below the lg breakpoint where the full nav collapses */}
          <button
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            className="lg:hidden flex flex-col justify-center items-center gap-1.5 w-9 h-9 rounded-md border border-[#2d3b53] bg-[#1e293b] hover:border-[#d4af37]/50 transition-colors shrink-0"
          >
            <span className={`block w-5 h-0.5 bg-[#d4af37] transition-transform ${mobileMenuOpen ? "translate-y-2 rotate-45" : ""}`} />
            <span className={`block w-5 h-0.5 bg-[#d4af37] transition-opacity ${mobileMenuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-[#d4af37] transition-transform ${mobileMenuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
          </button>
        </div>
      </nav>

      {/* Mobile menu panel */}
      {mobileMenuOpen && (
        <div ref={mobilePanelRef} className="lg:hidden relative z-30 border-b border-[#d4af37]/25 bg-[#151f36] px-4 py-3 space-y-1 shrink-0 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {NAV_LINKS.map((l) => {
            if (l.key === "subjects") {
              return (
                <div key={l.key}>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => mobileGoTo("subjects")}
                      className={`flex-1 text-left px-3 py-2.5 text-base font-medium rounded-md transition-colors ${
                        activePage === "subjects" ? "text-[#d4af37] bg-[#1e293b]" : "text-[#e7ecf5] hover:bg-[#1e293b]"
                      }`}
                    >
                      {l.label}
                    </button>
                    <button
                      aria-label="Toggle courses submenu"
                      onClick={() => setMobileSubOpen(mobileSubOpen === "subjects" ? null : "subjects")}
                      className="px-3 py-2.5 text-[#93a1b8]"
                    >
                      <span className={`inline-block transition-transform ${mobileSubOpen === "subjects" ? "rotate-180" : ""}`}>▾</span>
                    </button>
                  </div>
                  {mobileSubOpen === "subjects" && (
                    <div className="pl-3 pb-1 space-y-1">
                      {COURSES_DROPDOWN.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => mobileGoTo("subjects", c.key)}
                          className="w-full text-left px-3 py-2 text-sm rounded-lg text-[#e7ecf5] hover:bg-[#1e293b] hover:text-[#34d399] transition-colors"
                        >
                          {c.label} <span className="text-[#93a1b8] text-xs">({c.tag})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            if (l.key === "quiz") {
              return (
                <button
                  key={l.key}
                  onClick={() => mobileGoTo("quiz")}
                  className={`w-full text-left px-3 py-2.5 text-base font-medium rounded-md transition-colors ${
                    activePage === "quiz" ? "text-[#d4af37] bg-[#1e293b]" : "text-[#e7ecf5] hover:bg-[#1e293b]"
                  }`}
                >
                  {l.label}
                </button>
              );
            }
            return (
              <div key={l.key}>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => mobileGoTo(l.key)}
                    className={`flex-1 text-left px-3 py-2.5 text-base font-medium rounded-md transition-colors ${
                      activePage === l.key ? "text-[#d4af37] bg-[#1e293b]" : "text-[#e7ecf5] hover:bg-[#1e293b]"
                    }`}
                  >
                    {l.label}
                  </button>
                  <button
                    aria-label={`Toggle ${l.label} submenu`}
                    onClick={() => setMobileSubOpen(mobileSubOpen === l.key ? null : l.key)}
                    className="px-3 py-2.5 text-[#93a1b8]"
                  >
                    <span className={`inline-block transition-transform ${mobileSubOpen === l.key ? "rotate-180" : ""}`}>▾</span>
                  </button>
                </div>
                {mobileSubOpen === l.key && (
                  <div className="pl-3 pb-1 space-y-1">
                    {l.items.map((it) => (
                      <button
                        key={it}
                        onClick={() => mobileGoTo(l.key)}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg text-[#e7ecf5] hover:bg-[#1e293b] hover:text-[#34d399] transition-colors"
                      >
                        {it}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}

/* ---------- Auth modal (login / sign up) ---------- */
function AuthModal({ open, onClose }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  function switchMode(next) {
    setMode(next);
    setError("");
    setNotice("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    const { error } = mode === "login" ? await signIn(email, password) : await signUp(email, password, name);
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    if (mode === "signup") {
      setNotice("Account created! Check your inbox to confirm your email, then log in.");
      switchMode("login");
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl text-[#e7ecf5]">{mode === "login" ? "Log In" : "Create Account"}</h2>
          <button onClick={onClose} className="text-[#93a1b8] hover:text-[#e7ecf5] text-2xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
            />
          </div>
          <div>
            <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Password</label>
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
            />
          </div>

          {error && <p className="text-[#f87171] text-sm">{error}</p>}
          {notice && <p className="text-[#34d399] text-sm">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "login" ? "Log In" : "Sign Up"}
          </button>
        </form>

        <p className="text-sm text-[#93a1b8] mt-4 text-center">
          {mode === "login" ? "New to EduChess?" : "Already have an account?"}{" "}
          <button onClick={() => switchMode(mode === "login" ? "signup" : "login")} className="text-[#34d399] hover:text-[#6ee7b7] font-medium">
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}

/* ---------- Homepage ---------- */
function HomePage({ goTo }) {
  const { user } = useAuth();
  const [answer, setAnswer] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [board] = useState(initialBoard());
  const [liveBoard, setLiveBoard] = useState(initialBoard());
  const [selected, setSelected] = useState(null);
  const [moveMade, setMoveMade] = useState(false);

  function checkAnswer() {
    if (answer.trim() === "1") {
      setVerified(true);
      setError("");
    } else {
      setError("Not quite — remember Queen (9) = Rook (5) + Bishop (3) + X.");
    }
  }

  async function handleSquareClick(r, c) {
    if (!verified || moveMade) return;
    if (!selected) {
      const sq = liveBoard[r][c];
      if (sq && sq.w) setSelected([r, c]);
      return;
    }
    // simulate the "winning move": pawn e2-e4 style push
    const [sr, sc] = selected;
    const next = liveBoard.map((row) => row.slice());
    next[r][c] = next[sr][sc];
    next[sr][sc] = null;
    setLiveBoard(next);
    setSelected(null);
    setMoveMade(true);

    if (user) {
      await supabase.from("quest_progress").upsert(
        { user_id: user.id, subject: "home", quest_key: "quest-01-value-hook", points: 10 },
        { onConflict: "user_id,quest_key" }
      );
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      {/* Hero — video + text only, visible without scrolling */}
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center min-h-[76vh]">
        <div>
          <span className="font-mono text-xs tracking-[0.3em] text-[#34d399] uppercase">In collaboration with international FIDE players and IITian's</span>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-tight mt-4 text-[#e7ecf5]">
            We Use Game Logic to Turn School Textbooks Into an{" "}
            <span className="text-[#d4af37]">Exciting Strategic Playground.</span>
          </h1>
          <button
            onClick={() => goTo("subjects")}
            className="mt-6 px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
          >
            Explore the Curriculum →
          </button>
        </div>

        {/* Right: hero video */}
        <div className="relative rounded-2xl overflow-hidden border-2 border-[#d4af37]/50 shadow-2xl bg-[#1e293b] aspect-video">
          <video
            className="w-full h-full object-cover"
            src="/homepage.mp4"
            autoPlay
            muted
            loop
            playsInline
            controls
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </div>

      {/* Quest 01 — solve to unlock the board; revealed on scroll */}
      <div className="grid md:grid-cols-2 gap-6 items-start pt-6">
        {/* Left: math hook */}
        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 shadow-xl">
          <span className="font-mono text-xs text-[#d4af37] tracking-widest uppercase">Quest 01 · The Value Hook</span>
          <h2 className="font-display text-xl mt-2 mb-4 text-[#e7ecf5]">Solve to unlock the board</h2>
          <div className="bg-[#0f172a] rounded-xl p-4 font-mono text-sm text-[#e7ecf5] leading-relaxed border border-[#2d3b53]">
            Pawn = 1, Knight = 3, Bishop = 3, Rook = 5, Queen = 9.<br />
            Solve for X: <span className="text-[#d4af37]">Queen = Rook + Bishop + X</span>
          </div>
          <p className="text-[#93a1b8] text-sm mt-3">Once solved, find the winning move on the board to complete the quest!</p>

          <div className="mt-5 flex gap-3">
            <input
              type="number"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={verified}
              placeholder="X ="
              className="w-24 bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2 font-mono text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#d4af37] disabled:opacity-60"
            />
            <button
              onClick={checkAnswer}
              disabled={verified}
              className="px-5 py-2 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors disabled:opacity-50"
            >
              Verify Answer
            </button>
          </div>
          {error && <p className="text-[#f87171] text-sm mt-2">{error}</p>}
          {verified && !moveMade && (
            <p className="text-[#34d399] text-sm mt-2">Correct! X = 1. The board is unlocked — make the winning move →</p>
          )}
          {moveMade && (
            <div className="mt-4 bg-[#0f172a] border border-[#34d399]/40 rounded-xl p-4 text-center">
              <p className="font-display text-lg text-[#34d399]">Quest Completed! 🎉</p>
              <p className="text-sm text-[#93a1b8] mt-1 font-mono">Rank Points Awarded +10 · Unlocking Next Lesson</p>
              {!user && (
                <p className="text-xs text-[#f0d98c] mt-2">Log in to save this progress to your rank.</p>
              )}
              <button onClick={() => goTo("subjects")} className="mt-3 text-sm px-4 py-2 rounded-lg bg-[#34d399] text-[#0f172a] font-semibold hover:bg-[#6ee7b7] transition-colors">
                Continue to Subjects
              </button>
            </div>
          )}
        </div>

        {/* Right: board */}
        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 shadow-xl flex flex-col items-center">
          <span className="font-mono text-xs text-[#d4af37] tracking-widest uppercase self-start">Quest 01 · The Board</span>
          <h2 className="font-display text-xl mt-2 mb-4 text-[#e7ecf5] self-start">
            {verified ? (moveMade ? "Move complete" : "Select your piece, then its square") : "Locked"}
          </h2>
          <div className="relative">
            <Chessboard board={liveBoard} selected={selected} onSquareClick={handleSquareClick} locked={!verified} />
            {!verified && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0f172a]/70 rounded-lg">
                <p className="font-mono text-sm text-center text-[#f0d98c] px-6">
                  Solve the Math Hook first<br />to unlock the Board.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-10 grid sm:grid-cols-3 gap-5">
        {[
          { t: "Tactics, not tuition", d: "Every concept lands as a forcing move on the board, not a page of drill." },
          { t: "Real curriculum mapping", d: "Aligned to school syllabi — chess is the delivery vehicle, not the subject." },
          { t: "Ranked progress", d: "Students climb a real rating ladder as they clear quests, not just a progress bar." },
        ].map((c) => (
          <div key={c.t} className="bg-[#1e293b]/60 border border-[#2d3b53] rounded-xl p-5">
            <h3 className="font-display text-base text-[#d4af37] mb-1">{c.t}</h3>
            <p className="text-sm text-[#93a1b8]">{c.d}</p>
          </div>
        ))}
      </div>

      {/* Dynamic, animated stat bar */}
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 bg-[#1e293b]/40 border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        {[
          { to: 4870, suffix: "+", label: "Students ranked up" },
          { to: 312, suffix: "", label: "Weekly quests cleared" },
          { to: 96, suffix: "%", label: "Parent satisfaction" },
          { to: 58, suffix: "", label: "Cognitive Arenas run" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-display text-3xl sm:text-4xl text-[#d4af37]">
              <CountUp to={s.to} suffix={s.suffix} />
            </p>
            <p className="text-sm text-[#93a1b8] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Testimonials */}
      <div className="mt-8">
        <Testimonials />
      </div>

      {/* Contact — embedded form, not a redirect */}
      <div className="mt-8 bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#34d399] tracking-widest uppercase">Talk to us</span>
        <h2 className="font-display text-2xl text-[#e7ecf5] mt-2 mb-6">Have questions before you start?</h2>
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
          <div className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl p-5 sm:p-6">
            <ContactForm />
          </div>
          <div className="space-y-3">
            {CORPORATE_DETAILS.map((c) => (
              <div key={c.l} className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl p-4">
                <p className="text-xs font-mono text-[#d4af37] uppercase tracking-widest">{c.l}</p>
                <p className="text-base text-[#e7ecf5] mt-1">{c.v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Subjects page ---------- */
function SubjectsPage({ onOpenSubject }) {
  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">The Curriculum Board</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Choose your opening</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {SUBJECT_TILES.map((s) => (
          <button
            key={s.key}
            onClick={() => onOpenSubject(s.key)}
            className="text-left bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 hover:border-[#d4af37]/60 hover:-translate-y-1 transition-all group cursor-pointer"
          >
            <span className="text-5xl block mb-4 text-[#d4af37] bob">{s.icon}</span>
            <h3 className="font-display text-xl text-[#e7ecf5] group-hover:text-[#d4af37] transition-colors">{s.title}</h3>
            <p className="text-base text-[#93a1b8] mt-1">{s.sub}</p>
            <span className="inline-block mt-4 text-sm font-mono text-[#34d399]">Open curriculum map →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const COURSE_TITLES = {
  chess: "Chess — Pure Strategy",
  maths: "Maths — Chess-Integrated",
  english: "English — Chess-Integrated",
  coding: "Coding — Computational Thinking",
  finance: "Financial Literacy — Strategic Capital",
};

/* ---------- Reusable knight-fork mini quiz (used on course pages + Quiz nav page) ---------- */
function LevelQuiz({ label = "Live Evaluation" }) {
  const [board] = useState(() => {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    b[4][4] = { t: "Q", w: false }; // black queen
    b[6][3] = { t: "N", w: true }; // white knight
    return b;
  });
  const [feedback, setFeedback] = useState(null);
  const correctSquare = [4, 4];

  function handleQuizClick(r, c) {
    setFeedback(r === correctSquare[0] && c === correctSquare[1] ? "correct" : "wrong");
  }

  return (
    <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
      <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">{label}</span>
      <h3 className="font-display text-lg sm:text-xl mt-2 mb-3 text-[#e7ecf5]">Where can the knight fork the queen?</h3>
      <p className="text-sm text-[#93a1b8] mb-4">Select the square the white knight should move to.</p>
      <div className="flex justify-center">
        <Chessboard board={board} onSquareClick={handleQuizClick} size="small" />
      </div>
      {feedback === "correct" && (
        <p className="text-[#34d399] text-sm mt-4 text-center font-mono">Correct — that's the forking square. +5 points.</p>
      )}
      {feedback === "wrong" && (
        <p className="text-[#f87171] text-sm mt-4 text-center font-mono">Not the square — think about knight-move geometry, try again.</p>
      )}
    </div>
  );
}

/* ---------- 10-level progression tracker, shown on every course page ---------- */
function LevelTrack({ unlockedCount = 1 }) {
  return (
    <div className="bg-[#1e293b]/60 border border-[#2d3b53] rounded-2xl p-6 mt-8">
      <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Level Progress</span>
      <h3 className="font-display text-lg sm:text-xl mt-2 mb-4 text-[#e7ecf5]">Ten levels to grandmaster</h3>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
        {ROMAN_LEVELS.map((numeral, i) => {
          const unlocked = i < unlockedCount;
          return (
            <div
              key={numeral}
              title={unlocked ? `Level ${numeral}` : `Complete Level ${ROMAN_LEVELS[i - 1]} to unlock`}
              className={`aspect-square rounded-xl border flex flex-col items-center justify-center font-display text-lg transition-all ${
                unlocked
                  ? "border-[#d4af37]/60 bg-[#0f172a] text-[#d4af37] cursor-pointer hover:-translate-y-0.5"
                  : "border-[#2d3b53] bg-[#0f172a]/40 text-[#93a1b8]/50 cursor-not-allowed"
              }`}
            >
              <span>{numeral}</span>
              {!unlocked && <span className="text-xs mt-0.5">🔒</span>}
            </div>
          );
        })}
      </div>
      <p className="text-sm text-[#93a1b8] mt-4 font-mono">Level I unlocked — clear its quiz below to open Level II.</p>
    </div>
  );
}

/* ---------- Course detail page (curriculum map for any of the five courses) ---------- */
function CoursePage({ subjectKey, onBack }) {
  const [expanded, setExpanded] = useState(null);
  const modules = CURRICULA[subjectKey];
  const title = COURSE_TITLES[subjectKey];
  const video = COURSE_VIDEOS[subjectKey];

  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <button onClick={onBack} className="text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-4">← Back to Courses</button>
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Curriculum Map · {modules.length} Modules</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">{title}</h1>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        {/* Left: topics accordion */}
        <div className="space-y-3">
          {modules.map((m, i) => (
            <div key={m.t} className="bg-[#1e293b] border border-[#2d3b53] rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
              >
                <div>
                  <span className="font-mono text-[10px] tracking-widest text-[#34d399] uppercase">{m.cat}</span>
                  <p className="font-display text-base sm:text-lg text-[#e7ecf5] mt-0.5">{m.t}</p>
                </div>
                <span className={`font-mono text-xl text-[#d4af37] transition-transform shrink-0 ${expanded === i ? "rotate-45" : ""}`}>+</span>
              </button>
              {expanded === i && (
                <div className="px-5 pb-4">
                  <ul className="space-y-2">
                    {m.pts.map((p) => (
                      <li key={p} className="text-sm text-[#93a1b8] flex gap-2">
                        <span className="text-[#34d399] mt-0.5">▸</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right: video on top, chessboard quiz below */}
        <div className="space-y-6 h-fit lg:sticky lg:top-0">
          <div className="rounded-2xl overflow-hidden border-2 border-[#d4af37]/50 shadow-2xl bg-[#1e293b] aspect-video">
            <video
              className="w-full h-full object-cover"
              src={`/${video}`}
              autoPlay
              muted
              loop
              playsInline
              controls
            >
              Your browser does not support the video tag.
            </video>
          </div>

          <LevelQuiz label="Level I · Live Evaluation" />
        </div>
      </div>

      <LevelTrack unlockedCount={1} />
    </div>
  );
}

/* ---------- Pricing ---------- */
const PRICING_TIERS = [
  {
    name: "Basic Level",
    medal: "🥉",
    price: "₹1,999/mo",
    tag: "Self-paced foundation",
    desc: "The perfect low-friction entry point for parents testing out the concept.",
    features: [
      "Pure chess curriculum",
      "Chess Board Explanation",
      "Naming and Movement of Pieces",
      "Puzzle Solving"
    ],
  },
  {
    name: "Tournament Level",
    medal: "🥈",
    price: "₹2,999/mo",
    tag: "Most popular",
    desc: "The complete core school accelerator — covers the entire standard school spectrum.",
    features: [
      "Everything in the Basic Level",
      "Tactics and Strategy",
      "Opening game",
      "End Game"
    ],
    highlight: true,
  },
  {
    name: "Advanced Level",
    medal: "🥇",
    price: "₹4,999/mo",
    tag: "Advanced future skills",
    desc: "The ultimate future-proof cognitive upgrade — for parents who want elite development.",
    features: [
      "Everything in the Basic and Tournament Levels",
      "Advanced Strategies",
      "Middle game",
      "Games Analysis"
    ],
  },
];

function PricingPage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Choose your gambit</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Pricing</h1>
      <div className="grid md:grid-cols-3 gap-6">
        {PRICING_TIERS.map((t) => (
          <div key={t.name} className={`rounded-2xl p-6 border flex flex-col ${t.highlight ? "bg-[#1e293b] border-[#d4af37] shadow-2xl scale-[1.02]" : "bg-[#1e293b]/70 border-[#2d3b53]"}`}>
            <span className="font-mono text-sm uppercase tracking-widest text-[#34d399]">{t.tag}</span>
            <h3 className="font-display text-2xl mt-2 text-[#e7ecf5]">{t.medal} {t.name}</h3>
            <p className="font-mono text-3xl text-[#d4af37] mt-3">{t.price}</p>
            <p className="text-base text-[#93a1b8] mt-3 flex-1">{t.desc}</p>
            <ul className="mt-4 space-y-2">
              {t.features.map((f) => (
                <li key={f} className="text-base text-[#e7ecf5] flex gap-2"><span className="text-[#d4af37]">♟</span>{f}</li>
              ))}
            </ul>
            <button className={`mt-6 py-2.5 rounded-lg font-semibold text-base transition-colors ${t.highlight ? "bg-[#d4af37] text-[#0f172a] hover:bg-[#f0d98c]" : "bg-[#0f172a] border border-[#2d3b53] text-[#e7ecf5] hover:border-[#d4af37]"}`}>
              Select Tier
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Resources ---------- */
const RESOURCE_CATEGORIES = [
  {
    cat: "Maths — Chess-Integrated",
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
    cat: "English — Chess-Integrated",
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
    cat: "Pure Chess Strategy",
    icon: "♞",
    items: [
      { t: "Opening Principles Quick-Reference", type: "PDF · 6 pages" },
      { t: "Endgame Fundamentals Worksheet", type: "PDF · 9 pages" },
      { t: "Tactical Motifs Flashcard Set", type: "PDF · 20 cards" },
    ],
  },
  {
    cat: "Coding & Financial Literacy",
    icon: "♜",
    items: [
      { t: "Algorithmic Thinking via Move Trees", type: "PDF · 13 pages" },
      { t: "Financial Literacy Opening Book", type: "PDF · 9 pages" },
      { t: "Budgeting Like a Grandmaster", type: "PDF · 8 pages" },
    ],
  },
];

function ResourcesPage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">The Resource Vault</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-4 text-[#e7ecf5]">Resources</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-8">
        Every quest sheet and worksheet below is mapped to a curriculum module — download, print, and hand a child a mission instead of a page of drill.
      </p>

      <div className="space-y-10">
        {RESOURCE_CATEGORIES.map((group) => (
          <div key={group.cat}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl text-[#d4af37]">{group.icon}</span>
              <h2 className="font-display text-2xl text-[#e7ecf5]">{group.cat}</h2>
              <span className="font-mono text-xs text-[#93a1b8]">({group.items.length})</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {group.items.map((it) => (
                <div key={it.t} className="bg-[#1e293b] border border-[#2d3b53] rounded-xl p-5 hover:border-[#d4af37]/60 hover:-translate-y-0.5 transition-all">
                  <span className="text-2xl text-[#d4af37]">♜</span>
                  <h3 className="font-display text-lg mt-3 text-[#e7ecf5]">{it.t}</h3>
                  <p className="text-sm font-mono text-[#93a1b8] mt-1">{it.type}</p>
                  <button className="mt-4 text-sm font-mono text-[#34d399] hover:text-[#6ee7b7]">Download →</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Quiz (replaces Tournaments / Global Ranks in the nav) ---------- */
function QuizPage() {
  const [course, setCourse] = useState(null);

  if (!course) {
    return (
      <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
        <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Test Your Position</span>
        <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Quiz</h1>
        <p className="text-base text-[#93a1b8] max-w-2xl mb-8">Pick a course to see its ten levels and take on the quiz for the level you've unlocked.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SUBJECT_TILES.map((s) => (
            <button
              key={s.key}
              onClick={() => setCourse(s.key)}
              className="text-left bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 hover:border-[#d4af37]/60 hover:-translate-y-1 transition-all group cursor-pointer"
            >
              <span className="text-5xl block mb-4 text-[#d4af37] bob">{s.icon}</span>
              <h3 className="font-display text-xl text-[#e7ecf5] group-hover:text-[#d4af37] transition-colors">{s.title}</h3>
              <p className="text-base text-[#93a1b8] mt-1">{s.sub}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const tile = SUBJECT_TILES.find((s) => s.key === course);

  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <button onClick={() => setCourse(null)} className="text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-4">← Back to Quiz</button>
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Quiz · {tile.title}</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Pick a level</h1>

      <LevelTrack unlockedCount={1} />

      <div className="mt-8 max-w-lg">
        <LevelQuiz label={`${tile.title} · Level I`} />
      </div>
    </div>
  );
}

/* ---------- Dashboard (Profile / Preferences / Manage Subscriptions) ---------- */
function DashboardPage() {
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

/* ---------- My Learning ---------- */
function MyLearningPage({ goTo }) {
  const progressByKey = { chess: 35, maths: 60, english: 20, coding: 10, finance: 5 };
  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Continue where you left off</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">My Learning</h1>

      <div className="space-y-4">
        {SUBJECT_TILES.map((s) => (
          <div key={s.key} className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-5 flex items-center gap-5">
            <span className="text-4xl text-[#d4af37]">{s.icon}</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-lg text-[#e7ecf5]">{s.title}</h3>
              <p className="text-sm text-[#93a1b8]">{s.sub}</p>
              <div className="w-full h-2 bg-[#0f172a] rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-[#d4af37]" style={{ width: `${progressByKey[s.key]}%` }} />
              </div>
            </div>
            <button
              onClick={() => goTo("subjects", s.key)}
              className="shrink-0 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
            >
              Resume
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Contact ---------- */
function ContactForm() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", grade: "", email: "", struggles: "" });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.from("contact_submissions").insert({
      user_id: user?.id ?? null,
      name: form.name,
      grade: form.grade,
      email: form.email,
      struggles: form.struggles,
    });
    setLoading(false);
    if (error) {
      setError("Something went wrong sending that — please try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center py-10">
        <span className="text-5xl text-[#34d399] block mb-4">♛</span>
        <h3 className="font-display text-2xl text-[#34d399] mb-2">Strategist Alert!</h3>
        <p className="text-[#93a1b8] text-base">An EduChess Growth Specialist will contact you within 24 hours.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Parent's Name</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
      </div>
      <div>
        <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Child's Grade</label>
        <input required value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}
          className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
      </div>
      <div>
        <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Email Address</label>
        <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
      </div>
      <div>
        <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Main Academic Struggles</label>
        <textarea rows={4} value={form.struggles} onChange={(e) => setForm({ ...form, struggles: e.target.value })}
          className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]" />
      </div>
      {error && <p className="text-[#f87171] text-sm">{error}</p>}
      <button type="submit" disabled={loading} className="w-full py-3 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60">
        {loading ? "Sending…" : "Send Inquiry"}
      </button>
    </form>
  );
}

const CORPORATE_DETAILS = [
  { l: "Email", v: "support@educhess.in" },
  { l: "Primary Direct Hotline", v: "+91 8247564508" },
  { l: "HQ Location", v: "Champion Chess Academy, Visakhapatnam, Andhra Pradesh, India" },
  { l: "Hours of Operation", v: "Mon – Sat: 9:00 AM – 8:00 PM IST" },
];

function ContactPage() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Request a Consult</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Contact Us</h1>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
          <ContactForm />
        </div>

        <div className="space-y-4">
          {CORPORATE_DETAILS.map((c) => (
            <div key={c.l} className="bg-[#1e293b]/70 border border-[#2d3b53] rounded-xl p-4">
              <p className="text-xs font-mono text-[#d4af37] uppercase tracking-widest">{c.l}</p>
              <p className="text-base text-[#e7ecf5] mt-1">{c.v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
