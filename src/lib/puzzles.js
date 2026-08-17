import { Chess } from "chess.js";
import { supabase } from "./supabaseClient";

/* ============================================================
   Lichess puzzle adapter
   ------------------------------------------------------------
   VERIFIED against 6,000 real rows from lichess_db_puzzle.csv:

   1. `fen` is the position BEFORE the opponent's move. `moves[0]` is played
      BY THE OPPONENT; the student solves from the position after it.
      Checked on 904 mateIn1 puzzles: apply moves[0] then moves[1] and
      chess.js reports checkmate in 904/904, with 0 illegal moves.

   2. The student is NOT always White. In the sample, 3137 puzzles had the
      student playing White and 2862 playing Black — so the board must be
      flipped and piece selection gated on the *solver's* colour, not "w".
   ============================================================ */

/*
  These keys are Lichess theme tags, matched with `themes @> [key]`.

  They must stay a subset of the importer's KEEP_THEMES
  (`backend/scripts/import_lichess_puzzles.py`) — a category listed here but
  not imported would render a tile that always says "no puzzles available".
  The importer files puzzles into 13 buckets; all 13 are surfaced below, and
  every one was checked against the live table for rows in all three
  difficulty bands before being added.

  Order is roughly pedagogical: mates first (most concrete for a beginner),
  then the basic double-attack motifs, then the ideas that need more board
  vision.
*/
export const CATEGORIES = [
  { key: "mateIn1", icon: "♕", title: "One Move Mate", desc: "Find the single move that delivers checkmate." },
  { key: "mateIn2", icon: "♞", title: "Two Move Mate", desc: "Force checkmate in exactly two moves." },
  { key: "mateIn3", icon: "♖", title: "Three Move Mate", desc: "A longer forced sequence. Plan three moves ahead." },
  { key: "backRankMate", icon: "♜", title: "Back Rank Mates", desc: "Punish a king trapped behind its own pawns." },
  { key: "smotheredMate", icon: "♞", title: "Smothered Mates", desc: "The knight mate a king's own pieces make possible." },
  { key: "fork", icon: "♘", title: "Forks", desc: "Attack two pieces at once." },
  { key: "pin", icon: "♗", title: "Pins", desc: "Freeze a defender against a bigger piece." },
  { key: "skewer", icon: "♖", title: "Skewers", desc: "Force a valuable piece to move and win what's behind it." },
  { key: "hangingPiece", icon: "♟", title: "Hanging Pieces", desc: "Spot the piece left undefended and take it." },
  { key: "discoveredAttack", icon: "♗", title: "Discovered Attacks", desc: "Move one piece to unleash another behind it." },
  { key: "doubleCheck", icon: "♔", title: "Double Checks", desc: "Check with two pieces at once, so the king must move." },
  { key: "deflection", icon: "♕", title: "Deflection", desc: "Drag a defender away from what it is guarding." },
  { key: "sacrifice", icon: "♛", title: "Sacrifices", desc: "Give up material now for a decisive attack." },
];

export const DIFFICULTIES = [
  { key: "easy", label: "Easy", min: 0, max: 1299 },
  { key: "medium", label: "Medium", min: 1300, max: 1800 },
  { key: "hard", label: "Hard", min: 1801, max: 4000 },
];

/**
 * Convert a `lichess_puzzles` row into the shape PuzzleTrainer consumes.
 *
 * Returns null if the row is malformed — the caller should filter these out
 * rather than rendering a broken board.
 */
export function normalizeLichessPuzzle(row) {
  if (!row?.fen || !Array.isArray(row.moves) || row.moves.length < 2) return null;

  const game = new Chess(row.fen);
  const first = row.moves[0];
  const opponentMove = game.move({
    from: first.slice(0, 2),
    to: first.slice(2, 4),
    promotion: first[4] || undefined,
  });
  if (!opponentMove) return null;

  return {
    id: row.puzzle_id,
    // Position the student actually sees, i.e. AFTER the opponent's move.
    fen: game.fen(),
    solverColor: game.turn(), // "w" | "b" — flip the board when "b"
    rating: row.rating,
    themes: row.themes || [],
    // Alternating [student, opponent, student, ...] — the same format the
    // trainer already used for its mate-in-2/3 sequences.
    solution: row.moves.slice(1).map((uci) => ({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || undefined,
    })),
  };
}

/**
 * How many puzzles to ask for at a time.
 *
 * Deliberately small, and it is not a display choice. The allowance is
 * metered at DELIVERY now (supabase/02_functions.sql), so every puzzle handed
 * out is spent whether or not it is solved. A 20-puzzle batch would charge a
 * Free account its whole day the moment it opened the page, and switching
 * category after two puzzles would find nothing left. Five keeps the waste
 * bounded to at most four, and matches the Free tier exactly — one batch is
 * one day.
 */
export const BATCH_SIZE = 5;

/**
 * Fetch a shuffled batch for a category + difficulty.
 *
 * Returns `{ puzzles, quota }`, where quota is
 * `{ tier, daily_limit, used_today, remaining }` as the server counted it
 * AFTER this batch — a null limit (and null remaining) means unlimited.
 *
 * The quota comes back in the same response on purpose. The count is the
 * server's, not a number the UI decrements: the client used to keep its own
 * tally derived from attempts it chose to log, which is what made the
 * allowance unenforceable (audit ENT-01).
 *
 * random_puzzles_for_user, not random_puzzles: the wrapper meters the batch,
 * clamps it to what is left, and direct EXECUTE on the sampler is revoked
 * from every client role.
 */
export async function fetchPuzzles(categoryKey, difficultyKey, limit = BATCH_SIZE) {
  const band = DIFFICULTIES.find((d) => d.key === difficultyKey) || DIFFICULTIES[1];

  const { data, error } = await supabase.rpc("random_puzzles_for_user", {
    p_themes: [categoryKey],
    p_min_rating: band.min,
    p_max_rating: band.max,
    p_limit: limit,
  });

  if (error) throw error;

  return {
    puzzles: (data?.puzzles || []).map(normalizeLichessPuzzle).filter(Boolean),
    quota: {
      tier: data?.tier ?? "free",
      daily_limit: data?.daily_limit ?? null,
      used_today: data?.used_today ?? 0,
      remaining: data?.remaining ?? null,
    },
  };
}
