import React, { useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import Chessboard, { initialBoard } from "../components/Chessboard";
import CountUp from "../components/CountUp";
import Testimonials from "../components/Testimonials";
import ContactForm from "../components/ContactForm";
import { CORPORATE_DETAILS, HOMEPAGE_VIDEO_PATH } from "../data/mockData";
import { getPublicVideoUrl } from "../lib/media";
import { useAutoplaySound } from "../lib/useAutoplaySound";

export default function HomePage({ goTo }) {
  const { user } = useAuth();
  const [answer, setAnswer] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [liveBoard, setLiveBoard] = useState(initialBoard());
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
          <span className="font-mono text-xs tracking-[0.3em] text-[#34d399] uppercase">Chess & Education</span>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-tight mt-4 text-[#e7ecf5]">
            Two Boards, One Academy —{" "}
            <span className="text-[#d4af37]">Chess Strategy and Academic Mastery, Together.</span>
          </h1>
          <p className="text-base text-[#93a1b8] mt-4 max-w-xl">
            In collaboration with international FIDE players and IITians, EduChess runs a dual-pillar
            program: a pure chess strategy track for tournament-ready players, and a chess-integrated
            Maths & English track that turns school textbooks into a game worth winning.
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
