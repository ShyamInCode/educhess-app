import React, { useEffect, useRef, useState, useCallback } from "react";
import { Chess } from "chess.js";
import Chessboard, { squareName } from "./Chessboard";
import { Link } from "react-router-dom";
import { tryMove } from "../lib/chessMoves";
import { playSoundForMove } from "../lib/sound";
import { fetchPuzzles, CATEGORIES } from "../lib/puzzles";
import { useAuth } from "../lib/AuthContext";
import { isQuotaError, logPuzzleAttempt } from "../lib/puzzleProgress";
import { nextTierAbove, tierName } from "../lib/tiers";

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
  const { user, tier } = useAuth();
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [solvedCount, setSolvedCount] = useState(0);
  // { tier, daily_limit, used_today, remaining }; daily_limit null = unlimited.
  // Always straight from the server's batch response — never decremented here.
  const [quota, setQuota] = useState(null);
  // Set when the server refuses a batch outright. Separate from `quota`
  // because it is the one state that must win regardless of what any count
  // says.
  const [quotaBlocked, setQuotaBlocked] = useState(false);

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

  /**
   * Ask the server for a batch, and take its word for the allowance.
   *
   * The response carries the batch AND the remaining count as the server
   * counted it, because the allowance is metered when puzzles are HANDED OUT
   * (supabase/02_functions.sql), not when the client gets round to logging an
   * attempt. So `setQuota` here is a read, never an estimate — the UI has no
   * business decrementing a number it does not own.
   */
  const loadBatch = useCallback(
    async ({ isCancelled } = {}) => {
      setLoading(true);
      setError("");
      let result;
      try {
        result = await fetchPuzzles(category, difficulty);
      } catch (e) {
        if (isCancelled?.()) return false;
        // "You've used today's puzzles" is not a failure and must not be
        // reported as one — it gets the upgrade card, not an error message.
        if (isQuotaError(e)) setQuotaBlocked(true);
        else setError("Couldn't load puzzles. Please try again in a moment.");
        setLoading(false);
        return false;
      }
      if (isCancelled?.()) return false;

      setQuota(result.quota);

      if (!result.puzzles.length) {
        // An empty batch with allowance left means the category really is
        // empty; with none left it means the day is done. Different sentences.
        if (result.quota.remaining !== null && result.quota.remaining <= 0) setQuotaBlocked(true);
        else setError("No puzzles available for this category and difficulty yet.");
        setLoading(false);
        return false;
      }

      const shuffled = shuffle(result.puzzles);
      setQueue(shuffled);
      setPos(0);
      missedRef.current = false;
      loadPuzzle(shuffled[0]);
      setLoading(false);
      return true;
    },
    [category, difficulty, loadPuzzle]
  );

  useEffect(() => {
    let cancelled = false;
    // A fresh batch every mount and on every category/difficulty change, so
    // reopening never "resumes" the same handful of puzzles.
    loadBatch({ isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [loadBatch]);

  function goToNextPuzzle() {
    // A new puzzle, so the "did they need a retry?" flag starts clean. This
    // deliberately does NOT live in loadPuzzle(): retry() reloads the same
    // puzzle, and resetting there would forget the mistake we just saw.
    missedRef.current = false;
    const nextPos = pos + 1;
    if (nextPos < queue.length) {
      setPos(nextPos);
      loadPuzzle(queue[nextPos]);
      return;
    }
    // Queue exhausted. Ask for more rather than reshuffling what is already
    // solved — under a real allowance, replaying the same five puzzles all
    // evening would look like the cap silently not applying. The server
    // either sends a new batch or refuses, and the refusal is the upgrade
    // card. Academy accounts are unlimited and simply keep going.
    loadBatch();
  }

  /**
   * A puzzle has just been finished: record it.
   *
   * Recording only. It does NOT touch `quota` — the allowance was already
   * spent when the server handed this puzzle over, and the count in the
   * header came back with the batch. The old version decremented locally from
   * attempts the client chose to log, which is precisely how the cap became
   * unenforceable (audit ENT-01).
   *
   * Still fire-and-forget: a logging failure must never interrupt the puzzle
   * a child is in the middle of, and it can no longer cost them anything.
   */
  function concludePuzzle() {
    logPuzzleAttempt({
      userId: user?.id,
      puzzleId: puzzle?.id,
      // A puzzle that took a retry is not "solved" — see missedRef.
      solved: !missedRef.current,
      category,
      difficulty,
    });
  }

  function advance() {
    setSolvedCount((c) => c + 1);
    concludePuzzle();
    // Load the next puzzle even when the allowance has just run out: it sits
    // ready behind the overlay, so an upgrade resumes solving instead of
    // stranding the student on a board they have already finished.
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

  const unlimited = quota ? quota.daily_limit === null : false;
  const remaining = quota?.remaining ?? null;
  const outOfPuzzles = quotaBlocked || (!!quota && !unlimited && remaining <= 0);
  const upgrade = nextTierAbove(tier);

  /* Shared by the two places the allowance runs out: before a batch is
     fetched (no board to show) and after the last puzzle of the day (board
     still on screen, covered). Same words either way. */
  const outOfPuzzlesCard = (
    <div className="max-w-xs text-center">
      <span className="text-4xl block mb-3 text-[#d4af37]">♛</span>
      <h2 className="font-display text-xl text-[#e7ecf5]">That's today's puzzles</h2>
      <p className="text-sm text-[#93a1b8] mt-2">
        {upgrade
          ? `Your ${tierName(tier)} plan includes ${quota?.daily_limit ?? ""} puzzles a day. ${upgrade.name} gives you ${
              upgrade.dailyPuzzles === null ? "unlimited puzzles" : `${upgrade.dailyPuzzles} a day`
            }${upgrade.key === "pro" ? " and the basic course videos" : " and every course video"}.`
          : "Come back tomorrow for a fresh set."}
      </p>
      {upgrade && (
        <Link
          to="/upgrade"
          className="mt-5 block w-full py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
        >
          See {upgrade.name}
        </Link>
      )}
      <button
        type="button"
        onClick={onBack}
        className="mt-2 w-full py-2 text-sm text-[#93a1b8] hover:text-[#e7ecf5]"
      >
        Back to puzzles
      </button>
    </div>
  );

  // Ran out before we ever got a board — nothing to cover, so this stands alone.
  if (outOfPuzzles && !puzzle) {
    return (
      <div>
        <button onClick={onBack} className="block text-sm font-mono text-[#93a1b8] hover:text-[#d4af37] mb-5">← Back to Puzzles</button>
        <div className="flex justify-center py-10">{outOfPuzzlesCard}</div>
      </div>
    );
  }

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
          {quota && !outOfPuzzles && (
            <span className="font-mono text-xs text-[#93a1b8] block mt-1">
              {unlimited
                ? `${tierName(tier)} · unlimited`
                : `${remaining} of ${quota.daily_limit} left today`}
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
          interactionDisabled={!!feedback || outOfPuzzles}
          // Show the board from the student's side — ~half of Lichess puzzles
          // are solved as Black.
          flipped={puzzle?.solverColor === "b"}
        />

        {/* Sits over the board rather than replacing it, so the student can
            still see the position they just finished. The point is to make
            the next tier legible, not to slam a door. */}
        {outOfPuzzles && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-[#0f172a]/90 backdrop-blur-sm p-4">
            {outOfPuzzlesCard}
          </div>
        )}
      </div>

      <div className="text-center mt-4 h-6">
        {feedback === "correct" && !outOfPuzzles && (
          <p className="text-[#34d399] font-mono text-sm">Correct! Next puzzle…</p>
        )}
        {feedback === "wrong" && <p className="text-[#f87171] font-mono text-sm">Not quite. Try again.</p>}
      </div>

      <div className="flex justify-center mt-2">
        <button
          onClick={skip}
          disabled={!!feedback || outOfPuzzles}
          className="px-5 py-2 rounded-lg border border-[#2d3b53] text-[#93a1b8] text-sm font-semibold hover:border-[#d4af37]/50 hover:text-[#e7ecf5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Skip → Next Puzzle
        </button>
      </div>
    </div>
  );
}
