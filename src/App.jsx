import React, { useEffect, useRef, useState } from "react";
import { FloatingPieces, CoordRail } from "./components/Decor";
import NavBar from "./components/NavBar";
import LiveTicker from "./components/LiveTicker";
import HomePage from "./pages/HomePage";
import CoursesPage from "./pages/CoursesPage";
import PracticePage from "./pages/PracticePage";
import AdminPage from "./pages/AdminPage";
import PricingPage from "./pages/PricingPage";
import ResourcesPage from "./pages/ResourcesPage";
import QuizPage from "./pages/QuizPage";
import DashboardPage from "./pages/DashboardPage";
import MyLearningPage from "./pages/MyLearningPage";
import ContactPage from "./pages/ContactPage";

/* ============================================================
   EDUCHESS — "Chess & Education"
   Design tokens:
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

   NOTE: the AuthProvider wraps this component in main.jsx — that's the
   app's one context provider, so it's kept at the true composition root
   rather than duplicated here.
   ============================================================ */

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
`;

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

        /* Chessboard pieces — fully filled/solid on both colors, with a
           strong contrasting outline + soft glow so white pieces stay
           bright and legible on light squares, and black pieces stay
           legible on dark squares. */
        .piece-white {
          color: #ffffff;
          -webkit-text-stroke: 1.4px #1a1006;
          text-stroke: 1.4px #1a1006;
          paint-order: stroke fill;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.55)) drop-shadow(0 0 6px rgba(255,255,255,0.35));
        }
        .piece-black {
          color: #17110a;
          -webkit-text-stroke: 1px #fdf6e3;
          text-stroke: 1px #fdf6e3;
          paint-order: stroke fill;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35)) drop-shadow(0 0 3px rgba(255,255,255,0.25));
        }

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

      <main key={subjectDetail ? `courses-${subjectDetail}` : activePage} className="page-enter relative z-10 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {activePage === "home" && <HomePage goTo={goTo} />}
        {activePage === "courses" && <CoursesPage subjectDetail={subjectDetail} />}
        {activePage === "practice" && <PracticePage />}
        {activePage === "admin" && <AdminPage />}
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
