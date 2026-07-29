import React, { useEffect, useRef, useState, useCallback } from "react";
import { Chess } from "chess.js";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import Chessboard, { squareName } from "./Chessboard";
import { playSoundForMove } from "../lib/sound";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

function squareToRC(square) {
  const file = FILES.indexOf(square[0]);
  const rank = RANKS.indexOf(Number(square[1]));
  return [rank, file];
}

const CATEGORY_LABEL = {
  mate_in_1: "One Move Mate",
  mate_in_2: "Two Move Mate",
  mate_in_3: "Three Move Mate",
  best_move: "Find the Best Move",
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PuzzleTrainer({ category, difficulty, onBack }) {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [solvedCount, setSolvedCount] = useState(0);

  const gameRef = useRef(null);
  // Index into puzzle.solution of the next WHITE move expected. 0 always
  // starts a puzzle; forced-sequence puzzles (mate_in_2/3) advance this by
  // 2 each time a white move lands correctly (skipping the auto-played
  // forced black reply in between).
  const stageRef = useRef(0);
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [feedback, setFeedback] = useState(null); // "correct" | "wrong" | null

  const puzzle = queue[pos] || null;

  const loadPuzzle = useCallback((p) => {
    if (!p) return;
    gameRef.current = new Chess(p.fen);
    stageRef.current = 0;
    setSelected(null);
    setLegalTargets([]);
    setFeedback(null);
    rerender();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchBatch() {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("puzzles")
        .select("*")
        .eq("category", category)
        .eq("difficulty", difficulty);
      if (cancelled) return;
      if (error) {
        setError("Couldn't load puzzles — run the puzzles migrations in Supabase if you haven't yet.");
        setLoading(false);
        return;
      }
      if (!data || data.length === 0) {
        setError("No puzzles seeded for this category/difficulty yet.");
        setLoading(false);
        return;
      }
      // Fresh shuffle every time this trainer mounts (new category/difficulty
      // pick, or a fresh visit to /puzzles) — never a cached/fixed order, so
      // reopening never "resumes" the same handful of puzzles.
      const shuffled = shuffle(data);
      setQueue(shuffled);
      setPos(0);
      loadPuzzle(shuffled[0]);
      setLoading(false);
    }
    fetchBatch();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, difficulty]);

  async function awardPoints(solvedPuzzle) {
    if (!user) return;
    await supabase.from("quest_progress").upsert(
      {
        user_id: user.id,
        subject: "puzzles",
        quest_key: `puzzle-${category}-${solvedPuzzle.id}`,
        points: 2,
      },
      { onConflict: "user_id,quest_key" }
    );
  }

  function goToNextPuzzle() {
    const nextPos = pos + 1;
    if (nextPos < queue.length) {
      setPos(nextPos);
      loadPuzzle(queue[nextPos]);
    } else {
      // Queue exhausted — reshuffle the same set for a truly continuous stream.
      const reshuffled = shuffle(queue);
      setQueue(reshuffled);
      setPos(0);
      loadPuzzle(reshuffled[0]);
    }
  }

  function advance() {
    setSolvedCount((c) => c + 1);
    goToNextPuzzle();
  }

  function skip() {
    goToNextPuzzle();
  }

  function retry() {
    loadPuzzle(puzzle);
  }

  function handleSquareClick(r, c, square) {
    if (!puzzle || feedback) return;
    const game = gameRef.current;

    if (!selected) {
      const piece = game.get(square);
      if (piece && piece.color === "w") {
        setSelected([r, c]);
        setLegalTargets(game.moves({ square, verbose: true }).map((m) => squareToRC(m.to)));
      }
      return;
    }

    const fromSquare = squareName(selected[0], selected[1]);
    if (fromSquare === square) {
      setSelected(null);
      setLegalTargets([]);
      return;
    }

    const isPromotion = game.get(fromSquare)?.type === "p" && square[1] === "8";
    const attempt = game.move({ from: fromSquare, to: square, promotion: isPromotion ? "q" : undefined });
    setSelected(null);
    setLegalTargets([]);

    if (!attempt) {
      const piece = game.get(square);
      if (piece && piece.color === "w") {
        setSelected([r, c]);
        setLegalTargets(game.moves({ square, verbose: true }).map((m) => squareToRC(m.to)));
      }
      return;
    }

    playSoundForMove(attempt);
    rerender();
    evaluateMove(attempt);
  }

  // Handles best_move (single move) and mate_in_1 (self-validating via
  // isCheckmate()) directly, and mate_in_2 / mate_in_3 generically as a
  // forced move/reply/move[/reply/move] sequence stored in puzzle.solution.
  function evaluateMove(attempt) {
    const solution = puzzle.solution || [];

    if (category === "mate_in_1") {
      if (gameRef.current.isCheckmate()) {
        setFeedback("correct");
        awardPoints(puzzle);
        setTimeout(advance, 1100);
      } else {
        setFeedback("wrong");
        setTimeout(retry, 900);
      }
      return;
    }

    if (category === "best_move") {
      const expected = solution[0];
      if (expected && attempt.from === expected.from && attempt.to === expected.to) {
        setFeedback("correct");
        awardPoints(puzzle);
        setTimeout(advance, 1100);
      } else {
        setFeedback("wrong");
        setTimeout(retry, 900);
      }
      return;
    }

    // mate_in_2 / mate_in_3
    const expectedIdx = stageRef.current;
    const expected = solution[expectedIdx];
    const isFinalMove = expectedIdx === solution.length - 1;
    const matches = expected && attempt.from === expected.from && attempt.to === expected.to;

    if (!matches) {
      setFeedback("wrong");
      setTimeout(retry, 900);
      return;
    }

    if (isFinalMove) {
      if (gameRef.current.isCheckmate()) {
        setFeedback("correct");
        awardPoints(puzzle);
        setTimeout(advance, 1100);
      } else {
        setFeedback("wrong");
        setTimeout(retry, 900);
      }
      return;
    }

    setFeedback("correct");
    stageRef.current = expectedIdx + 2;
    setTimeout(() => {
      const forced = solution[expectedIdx + 1];
      if (forced) {
        const forcedMove = gameRef.current.move({ from: forced.from, to: forced.to, promotion: forced.promotion });
        playSoundForMove(forcedMove);
      }
      setFeedback(null);
      rerender();
    }, 700);
  }

  if (loading) {
    return (
      <div>
        <button onClick={onBack} className="text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-4">← Back to Puzzles</button>
        <p className="text-sm text-[#93a1b8]">Loading puzzles…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <button onClick={onBack} className="text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-4">← Back to Puzzles</button>
        <p className="text-sm text-[#f87171]">{error}</p>
      </div>
    );
  }

  const isFinalStage = puzzle && stageRef.current === (puzzle.solution?.length ?? 1) - 1;
  const title = stageRef.current === 0 ? "White to move" : isFinalStage ? "Find the mating move" : "Find your next move";

  return (
    <div>
      <button onClick={onBack} className="text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-4">← Back to Puzzles</button>
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">
            {CATEGORY_LABEL[category]} · {difficulty}
          </span>
          <h1 className="font-display text-2xl sm:text-3xl mt-2 text-[#e7ecf5]">{title}</h1>
        </div>
        <span className="font-mono text-sm text-[#d4af37]">Solved: {solvedCount}</span>
      </div>

      <div className="max-w-[440px] mx-auto">
        <Chessboard
          fluid
          game={gameRef.current}
          onSquareClick={handleSquareClick}
          selected={selected}
          highlights={legalTargets}
          interactionDisabled={!!feedback}
        />
      </div>

      <div className="text-center mt-4 h-6">
        {feedback === "correct" && <p className="text-[#34d399] font-mono text-sm">Correct! Next puzzle…</p>}
        {feedback === "wrong" && <p className="text-[#f87171] font-mono text-sm">Not quite — try again.</p>}
      </div>

      <div className="flex justify-center mt-2">
        <button
          onClick={skip}
          disabled={!!feedback}
          className="px-5 py-2 rounded-lg border border-[#2d3b53] text-[#93a1b8] text-sm font-semibold hover:border-[#d4af37]/50 hover:text-[#e7ecf5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Skip → Next Puzzle
        </button>
      </div>
    </div>
  );
}
