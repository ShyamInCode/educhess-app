import React, { useEffect, useRef, useState, useCallback } from "react";
import { Chess } from "chess.js";
import Chessboard, { squareName } from "./Chessboard";
import AuthModal from "./AuthModal";
import { tryMove } from "../lib/chessMoves";
import { playSoundForMove } from "../lib/sound";
import { fetchPuzzles, CATEGORIES } from "../lib/puzzles";
import { useAuth } from "../lib/AuthContext";
import {
  ANON_DAILY_LIMIT,
  anonPuzzlesLeft,
  logPuzzleAttempt,
  recordAnonPuzzle,
} from "../lib/puzzleProgress";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

function squareToRC(square) {
  const file = FILES.indexOf(square[0]);
  const rank = RANKS.indexOf(Number(square[1]));
  return [rank, file];
}

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.title]));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PuzzleTrainer({ category, difficulty, onBack }) {
  const { user, loading: authLoading } = useAuth();
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [solvedCount, setSolvedCount] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [freeLeft, setFreeLeft] = useState(ANON_DAILY_LIMIT);
  const [authOpen, setAuthOpen] = useState(false);

  const gameRef = useRef(null);
  // Whether the student has already played a wrong move on the CURRENT puzzle.
  // Decides `solved` when the puzzle concludes: a puzzle you had to retry is
  // recorded as unsolved, otherwise the stats would say everyone is perfect.
  const missedRef = useRef(false);
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

  // Every delayed board transition (retry, advance, forced reply) goes through
  // `schedule` so it can be cancelled. Left uncleared, these fired after the
  // component unmounted — advancing a puzzle queue that no longer exists and
  // warning about state updates on an unmounted component.
  const timersRef = useRef([]);
  const schedule = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);
  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const puzzle = queue[pos] || null;

  const loadPuzzle = useCallback(
    (p) => {
      if (!p) return;
      // Drop anything still queued from the previous puzzle before starting
      // this one. Skip can't collide with the pause (the button is disabled
      // while `feedback` is set), but retry() and the batch refetch both land
      // here, and a stale advance firing after either would silently eat a
      // puzzle. Unmount is covered separately by the cleanup effect above.
      clearTimers();
      gameRef.current = new Chess(p.fen);
      stageRef.current = 0;
      setSelected(null);
      setLegalTargets([]);
      setFeedback(null);
      rerender();
    },
    [clearTimers]
  );

  useEffect(() => {
    let cancelled = false;
    async function fetchBatch() {
      setLoading(true);
      setError("");
      let data;
      try {
        // Server-side random sampling — a fresh batch every mount, so
        // reopening never "resumes" the same handful of puzzles.
        data = await fetchPuzzles(category, difficulty, 20);
      } catch {
        if (!cancelled) {
          setError("Couldn't load puzzles. Please try again in a moment.");
          setLoading(false);
        }
        return;
      }
      if (cancelled) return;
      if (!data.length) {
        setError("No puzzles available for this category and difficulty yet.");
        setLoading(false);
        return;
      }
      const shuffled = shuffle(data);
      setQueue(shuffled);
      setPos(0);
      missedRef.current = false;
      loadPuzzle(shuffled[0]);
      setLoading(false);
    }
    fetchBatch();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, difficulty]);

  // The anonymous daily cap. Held off until auth has resolved: during that
  // first tick `user` is null for everyone, and locking the board there would
  // greet a signed-in student with the sign-up overlay.
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      setLimitReached(false);
      return;
    }
    const left = anonPuzzlesLeft();
    setFreeLeft(left);
    setLimitReached(left <= 0);
  }, [user, authLoading]);

  function goToNextPuzzle() {
    // A new puzzle, so the "did they need a retry?" flag starts clean. This
    // deliberately does NOT live in loadPuzzle(): retry() reloads the same
    // puzzle, and resetting there would forget the mistake we just saw.
    missedRef.current = false;
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

  /**
   * A puzzle has just been finished. Signed-in students get it recorded;
   * anonymous ones get it counted against today's free allowance, which may
   * raise the overlay.
   */
  function concludePuzzle() {
    if (user) {
      logPuzzleAttempt({
        userId: user.id,
        puzzleId: puzzle?.id,
        // A puzzle that took a retry is not "solved" — see missedRef.
        solved: !missedRef.current,
        category,
        difficulty,
      });
      return;
    }
    const left = Math.max(0, ANON_DAILY_LIMIT - recordAnonPuzzle());
    setFreeLeft(left);
    if (left <= 0) setLimitReached(true);
  }

  function advance() {
    setSolvedCount((c) => c + 1);
    concludePuzzle();
    // Load the next puzzle even when the cap has just been hit: it sits ready
    // behind the overlay, so signing in resumes solving instead of stranding
    // the student on a board they have already finished.
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
      if (piece && piece.color === puzzle.solverColor) {
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

    // Promotion rank depends on which side the student is playing.
    const promotionRank = puzzle.solverColor === "w" ? "8" : "1";
    const isPromotion = game.get(fromSquare)?.type === "p" && square[1] === promotionRank;
    const attempt = tryMove(game, { from: fromSquare, to: square, promotion: isPromotion ? "q" : undefined });
    setSelected(null);
    setLegalTargets([]);

    if (!attempt) {
      const piece = game.get(square);
      if (piece && piece.color === puzzle.solverColor) {
        setSelected([r, c]);
        setLegalTargets(game.moves({ square, verbose: true }).map((m) => squareToRC(m.to)));
      }
      return;
    }

    playSoundForMove(attempt);
    rerender();
    evaluateMove(attempt);
  }

  // One generic path for every category. `puzzle.solution` is always an
  // alternating [student, opponent, student, …] list (Lichess `moves` minus
  // the opponent's opening move, which is pre-applied). A puzzle is solved
  // when the student plays the final entry — for mate puzzles that move IS
  // the mate, so no separate isCheckmate() branch is needed.
  function evaluateMove(attempt) {
    const solution = puzzle.solution || [];
    const expectedIdx = stageRef.current;
    const expected = solution[expectedIdx];
    const isFinalMove = expectedIdx === solution.length - 1;
    const matches = expected && attempt.from === expected.from && attempt.to === expected.to;

    if (!matches) {
      missedRef.current = true;
      setFeedback("wrong");
      schedule(retry, 900);
      return;
    }

    if (isFinalMove) {
      setFeedback("correct");
      schedule(advance, 1100);
      return;
    }

    setFeedback("correct");
    stageRef.current = expectedIdx + 2;
    schedule(() => {
      const forced = solution[expectedIdx + 1];
      if (forced) {
        // Also via tryMove: a throw here would skip the setFeedback(null)
        // below and leave the board frozen mid-sequence.
        const forcedMove = tryMove(gameRef.current, { from: forced.from, to: forced.to, promotion: forced.promotion });
        if (forcedMove) playSoundForMove(forcedMove);
      }
      setFeedback(null);
      rerender();
    }, 700);
  }

  if (loading) {
    return (
      <div>
        <button onClick={onBack} className="block text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-5">← Back to Puzzles</button>
        <p className="text-sm text-[#93a1b8]">Loading puzzles…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <button onClick={onBack} className="block text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-5">← Back to Puzzles</button>
        <p className="text-sm text-[#f87171]">{error}</p>
      </div>
    );
  }

  const sideToMove = puzzle?.solverColor === "b" ? "Black" : "White";
  const title = stageRef.current === 0 ? `${sideToMove} to move` : "Find your next move";

  return (
    <div>
      <button onClick={onBack} className="block text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-5">← Back to Puzzles</button>
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">
            {CATEGORY_LABEL[category]} · {difficulty}
          </span>
          <h1 className="font-display text-2xl sm:text-3xl mt-2 text-[#e7ecf5]">{title}</h1>
        </div>
        <div className="text-right">
          <span className="font-mono text-sm text-[#d4af37] block">Solved: {solvedCount}</span>
          {!user && !authLoading && !limitReached && (
            <span className="font-mono text-xs text-[#93a1b8] block mt-1">
              {freeLeft} free {freeLeft === 1 ? "puzzle" : "puzzles"} left today
            </span>
          )}
        </div>
      </div>

      <div className="max-w-[440px] mx-auto relative">
        <Chessboard
          fluid
          game={gameRef.current}
          onSquareClick={handleSquareClick}
          selected={selected}
          highlights={legalTargets}
          interactionDisabled={!!feedback || limitReached}
          // Show the board from the student's side — ~half of Lichess puzzles
          // are solved as Black.
          flipped={puzzle?.solverColor === "b"}
        />

        {/* The daily-cap card. Sits over the board rather than replacing it so
            the visitor can still see what they were doing — the point is to
            invite a sign-in, not to slam a door. */}
        {limitReached && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-[#0f172a]/90 backdrop-blur-sm p-4">
            <div className="max-w-xs text-center">
              <span className="text-4xl block mb-3 text-[#d4af37]">♛</span>
              <h2 className="font-display text-xl text-[#e7ecf5]">
                You've used today's free puzzles
              </h2>
              <p className="text-sm text-[#93a1b8] mt-2">
                Sign in for unlimited puzzles and progress tracking — streaks, totals and what
                you've solved by category.
              </p>
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="mt-5 w-full py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
              >
                Sign in — it's free
              </button>
              <button
                type="button"
                onClick={onBack}
                className="mt-2 w-full py-2 text-sm text-[#93a1b8] hover:text-[#e7ecf5]"
              >
                Back to puzzles
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center mt-4 h-6">
        {feedback === "correct" && !limitReached && (
          <p className="text-[#34d399] font-mono text-sm">Correct! Next puzzle…</p>
        )}
        {feedback === "wrong" && <p className="text-[#f87171] font-mono text-sm">Not quite. Try again.</p>}
      </div>

      <div className="flex justify-center mt-2">
        <button
          onClick={skip}
          disabled={!!feedback || limitReached}
          className="px-5 py-2 rounded-lg border border-[#2d3b53] text-[#93a1b8] text-sm font-semibold hover:border-[#d4af37]/50 hover:text-[#e7ecf5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Skip → Next Puzzle
        </button>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
