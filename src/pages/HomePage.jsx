import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import Chessboard from "../components/Chessboard";
import CountUp from "../components/CountUp";
import Carousel from "../components/Carousel";
import Testimonials from "../components/Testimonials";
import ContactForm from "../components/ContactForm";
import { CORPORATE_DETAILS, HOMEPAGE_VIDEO_PATH } from "../data/mockData";
import { getPublicVideoUrl } from "../lib/media";
import { useAutoplaySound } from "../lib/useAutoplaySound";

// The famous Scholar's Mate, one move before the finish: 1.e4 e5 2.Bc4 Nc6
// 3.Qh5 Nf6?? — White plays Qxf7# next. Used as Quest 01's board so the
// "winning move" the visitor plays is a real, historic checkmate.
function scholarsMateBoard() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  const F = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };
  const set = (square, t, w) => {
    const file = F[square[0]];
    const rank = Number(square[1]);
    b[8 - rank][file] = { t, w };
  };
  // Black
  set("a8", "R", false); set("b8", "N", false); set("c8", "B", false); set("d8", "Q", false);
  set("e8", "K", false); set("f8", "B", false); set("h8", "R", false);
  set("a7", "P", false); set("b7", "P", false); set("c7", "P", false); set("d7", "P", false);
  set("f7", "P", false); set("g7", "P", false); set("h7", "P", false);
  set("c6", "N", false); set("f6", "N", false);
  set("e5", "P", false);
  // White
  set("h5", "Q", true);
  set("c4", "B", true); set("e4", "P", true);
  set("a2", "P", true); set("b2", "P", true); set("c2", "P", true); set("d2", "P", true);
  set("f2", "P", true); set("g2", "P", true); set("h2", "P", true);
  set("a1", "R", true); set("b1", "N", true); set("c1", "B", true); set("e1", "K", true);
  set("g1", "N", true); set("h1", "R", true);
  return b;
}

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const goTo = (page) => navigate(page === "home" ? "/" : `/${page}`);
  const [answer, setAnswer] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [liveBoard, setLiveBoard] = useState(scholarsMateBoard());
  const [selected, setSelected] = useState(null);
  const [moveMade, setMoveMade] = useState(false);
  const heroVideoRef = useRef(null);

  // Autoplay with sound the moment the page loads (with a same-page
  // interaction fallback baked into the hook for browsers that still
  // block it) — see src/lib/useAutoplaySound.js.
  useAutoplaySound(heroVideoRef, []);

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
          <span className="font-mono text-xs tracking-[0.3em] text-[#34d399] uppercase">Chess-First Academy</span>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-tight mt-4 text-[#e7ecf5]">
            Chess Is Our Game —{" "}
            <span className="text-[#d4af37]">And We Teach Maths and English Too.</span>
          </h1>
          <p className="text-base text-[#93a1b8] mt-4 max-w-xl">
            In collaboration with international FIDE players and IITians, EduChess is built around one
            primary course: tournament-ready chess strategy for every level. Alongside it, we run separate
            Maths and English courses for students who want to keep building outside the board.
          </p>
          <button
            onClick={() => goTo("courses")}
            className="mt-6 px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
          >
            Explore the Curriculum →
          </button>
        </div>

        {/* Right: hero video */}
        <div className="relative rounded-2xl overflow-hidden border-2 border-[#d4af37]/50 shadow-2xl bg-[#1e293b] aspect-video">
          <video
            ref={heroVideoRef}
            className="w-full h-full object-cover"
            src={getPublicVideoUrl(HOMEPAGE_VIDEO_PATH)}
            autoPlay
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
          <p className="text-[#93a1b8] text-sm mt-3">
            Once solved, play the historic <span className="text-[#d4af37] font-mono">Qxf7#</span> checkmate on
            the board to complete the quest!
          </p>
          <p className="text-[#93a1b8] text-sm mt-3 leading-relaxed">
            The position on the right is <span className="text-[#e7ecf5]">Scholar's Mate</span> — one of the
            fastest checkmates in chess (1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#). If Black doesn't defend the
            f7 square in time, White's queen and bishop team up for an instant knockout. It's one of the
            first tactical patterns every new student learns at the academy.
          </p>

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
              <button onClick={() => goTo("courses")} className="mt-3 text-sm px-4 py-2 rounded-lg bg-[#34d399] text-[#0f172a] font-semibold hover:bg-[#6ee7b7] transition-colors">
                Continue to Courses
              </button>
            </div>
          )}
        </div>

        {/* Right: board */}
        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 shadow-xl flex flex-col items-center">
          <span className="font-mono text-xs text-[#d4af37] tracking-widest uppercase self-start">Quest 01 · The Board</span>
          <h2 className="font-display text-xl mt-2 mb-4 text-[#e7ecf5] self-start">
            {verified ? (moveMade ? "Checkmate!" : "Play the queen to f7 for mate") : "Locked"}
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

      {/* Auto-advancing photo carousel — admin-managed via Admin Panel */}
      <div className="mt-10">
        <Carousel />
      </div>

      <div className="mt-10 grid sm:grid-cols-3 gap-5">
        {[
          { t: "Tactics, not tuition", d: "Every concept lands as a forcing move on the board, not a page of drill." },
          { t: "Real curriculum mapping", d: "Aligned to school syllabi — chess is the delivery vehicle for the Education pillar." },
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
