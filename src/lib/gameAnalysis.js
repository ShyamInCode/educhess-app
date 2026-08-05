import { Chess } from "chess.js";

/* ============================================================
   Post-game analysis — accuracy, move classification, estimated rating.

   Everything here is derived from one number per position: Stockfish's
   evaluation in centipawns, always from the point of view of the side to move.
   The engine is asked to evaluate each position BEFORE a move is played; the
   difference between the best line and what was actually played is that move's
   cost, and every metric below is a presentation of that.

   The formulas are the published Lichess/chess.com ones. They are widely used
   and roughly comparable to those sites, but "accuracy" is a convention, not a
   measurement — a different depth gives different numbers. Depth is fixed in
   ANALYSIS_DEPTH so at least our own numbers are comparable to each other.
   ============================================================ */

/** Search depth for analysis. Deep enough to be fair, shallow enough to finish. */
export const ANALYSIS_DEPTH = 12;

/** A mate score is treated as this many centipawns for arithmetic. */
const MATE_CP = 10000;

/**
 * Ceiling on a single move's centipawn loss when averaging.
 *
 * Without it, one move that walks into mate contributes 10000cp and the
 * "average loss" for a short game reads like 3344cp — a number that is both
 * meaningless and wrecks the rating estimate. Once a move is this bad, how
 * much worse it is stops carrying information: losing a queen and getting
 * mated are both simply lost. Lichess caps at the same value.
 */
const MAX_COUNTED_LOSS = 1000;

/**
 * Convert a centipawn evaluation to an expected-score percentage (0-100).
 *
 * Centipawns are not linear in practical terms: the difference between +100
 * and +200 matters far more than between +900 and +1000, because the second
 * pair are both simply winning. This is the Lichess win-percentage curve.
 */
export function cpToWinPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Normalise an engine score object to centipawns from the mover's side. */
export function scoreToCp(score) {
  if (!score) return 0;
  if (score.mate != null) return score.mate > 0 ? MATE_CP : -MATE_CP;
  return score.cp ?? 0;
}

/**
 * Per-move accuracy from the win% given up. Chess.com's published curve.
 * A move that loses nothing scores ~100; one that collapses the position ~0.
 */
export function moveAccuracy(winPercentBefore, winPercentAfter) {
  const drop = Math.max(0, winPercentBefore - winPercentAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/*
  Classification thresholds, in centipawns lost.

  These are judgement calls presented as categories, so they are stated once,
  here, rather than scattered through the UI. `best` is reserved for actually
  matching the engine's choice — otherwise a position with several equal moves
  would never award it.
*/
export const MOVE_CLASSES = {
  best: { label: "Best", color: "#34d399", weight: 0 },
  excellent: { label: "Excellent", color: "#6ee7b7", weight: 1 },
  good: { label: "Good", color: "#93a1b8", weight: 2 },
  inaccuracy: { label: "Inaccuracy", color: "#f0d98c", weight: 3 },
  mistake: { label: "Mistake", color: "#fb923c", weight: 4 },
  blunder: { label: "Blunder", color: "#f87171", weight: 5 },
};

export function classifyMove({ centipawnLoss, playedEngineMove }) {
  if (playedEngineMove) return "best";
  if (centipawnLoss < 20) return "excellent";
  if (centipawnLoss < 50) return "good";
  if (centipawnLoss < 100) return "inaccuracy";
  if (centipawnLoss < 300) return "mistake";
  return "blunder";
}

/**
 * Minimum moves before a rating estimate is worth showing at all.
 *
 * Fifteen quiet opening moves produce a low centipawn loss for almost anyone —
 * book moves are book moves — so a short game flatters weak play badly. In
 * testing, a deliberately-weakened engine scored ~20cp over a closed 15-move
 * opening, which reads as club level. Requiring a real game is the honest fix.
 */
const MIN_MOVES_FOR_RATING = 20;

/**
 * Very rough rating estimate from average centipawn loss.
 *
 * Fitted to the usual published rules of thumb rather than invented:
 *   ~10cp -> 2500, ~20cp -> 2100, ~40cp -> 1700, ~80cp -> 1300, ~150cp -> 900
 * which gives rating = 3860 - 1360*log10(acpl).
 *
 * Still an estimate, and labelled as one in the UI. A real rating comes from
 * results against rated opposition over many games; one game's centipawn loss
 * is a weak proxy, badly skewed by a single blunder and by how sharp the
 * position was. Returns null rather than guessing on short games.
 */
export function estimateRating(avgCentipawnLoss, moveCount) {
  if (!moveCount || moveCount < MIN_MOVES_FOR_RATING) return null;
  const acpl = Math.max(1, avgCentipawnLoss);
  const raw = 3860 - 1360 * Math.log10(acpl);
  return Math.round(Math.max(400, Math.min(2800, raw)) / 25) * 25;
}

/**
 * Analyse a finished game.
 *
 * @param {string[]} history  SAN move list, in order (from chess.js .history()).
 * @param {object}   engine   a StockfishEngine that is already init()'d.
 * @param {object}   opts     { depth, signal, onProgress(done,total) }
 * @returns {Promise<object>} per-move detail plus per-colour summaries.
 *
 * The engine is re-configured to full strength here: analysis must be as
 * strong as possible regardless of the tier the game was played against.
 */
export async function analyseGame(history, engine, { depth = ANALYSIS_DEPTH, signal, onProgress } = {}) {
  engine.send("setoption name UCI_LimitStrength value false");
  engine.send("setoption name Skill Level value 20");
  engine.send("setoption name MultiPV value 1");

  const game = new Chess();
  const moves = [];
  const total = history.length;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");

    const fenBefore = game.fen();
    const mover = game.turn(); // "w" | "b"

    // What the engine would do here, and how good the position is for `mover`.
    const before = await engine.evaluate(fenBefore, { depth });
    const cpBefore = scoreToCp(before);

    const san = history[i];
    const played = game.move(san);
    if (!played) break; // desynced history; stop rather than report nonsense

    let cpAfterForMover;
    if (game.isGameOver()) {
      // No position left to evaluate. Checkmate delivered is a perfect move;
      // a draw is scored as equal.
      cpAfterForMover = game.isCheckmate() ? MATE_CP : 0;
    } else {
      const after = await engine.evaluate(game.fen(), { depth });
      // `after` is from the OPPONENT's perspective now, so negate it to keep
      // everything in the mover's terms. Getting this backwards would invert
      // every good and bad move in the report.
      cpAfterForMover = -scoreToCp(after);
    }

    const playedEngineMove =
      !!before.best &&
      before.best.slice(0, 2) === played.from &&
      before.best.slice(2, 4) === played.to;

    /*
      The engine's own choice costs nothing, by definition.

      Measuring it as `cpBefore - cpAfter` instead produced a small phantom
      loss: the two evaluations are separate searches of different positions,
      and horizon effects make them disagree by a few tens of centipawns even
      when the move is the one the engine picked. That surfaced as the
      self-contradicting "Bxd5 — Best — cost 0.6 pawns" in the report.
    */
    const centipawnLoss = playedEngineMove ? 0 : Math.max(0, cpBefore - cpAfterForMover);

    moves.push({
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color: mover,
      san,
      centipawnLoss,
      classification: classifyMove({ centipawnLoss, playedEngineMove }),
      accuracy: moveAccuracy(cpToWinPercent(cpBefore), cpToWinPercent(cpAfterForMover)),
      engineBest: before.best,
      evalBefore: cpBefore,
    });

    onProgress?.(i + 1, total);
  }

  return { moves, white: summarise(moves, "w"), black: summarise(moves, "b") };
}

function summarise(moves, color) {
  const mine = moves.filter((m) => m.color === color);
  if (!mine.length) {
    return { moveCount: 0, accuracy: null, avgCentipawnLoss: null, estimatedRating: null, counts: {} };
  }
  const counts = {};
  for (const key of Object.keys(MOVE_CLASSES)) counts[key] = 0;
  mine.forEach((m) => { counts[m.classification] += 1; });

  const avgCentipawnLoss = Math.round(
    mine.reduce((a, m) => a + Math.min(m.centipawnLoss, MAX_COUNTED_LOSS), 0) / mine.length
  );

  /*
    Accuracy blends the arithmetic and harmonic means of the per-move figures.

    A plain average is too forgiving: play three perfect moves, hang your queen
    on the fourth, and it still reports ~75% — which is not how anyone would
    describe that game. The harmonic mean is dominated by the worst move, so
    averaging the two keeps good play visible while letting one catastrophe
    actually register. This is the approach the open re-implementations of
    chess.com's metric converge on.
  */
  const accuracies = mine.map((m) => Math.max(1, m.accuracy)); // 1, not 0: harmonic mean divides
  const arithmetic = accuracies.reduce((a, x) => a + x, 0) / accuracies.length;
  const harmonic = accuracies.length / accuracies.reduce((a, x) => a + 1 / x, 0);
  const accuracy = (arithmetic + harmonic) / 2;

  return {
    moveCount: mine.length,
    accuracy: Math.round(accuracy * 10) / 10,
    avgCentipawnLoss,
    estimatedRating: estimateRating(avgCentipawnLoss, mine.length),
    counts,
    worst: [...mine].sort((a, b) => b.centipawnLoss - a.centipawnLoss).slice(0, 3),
  };
}
