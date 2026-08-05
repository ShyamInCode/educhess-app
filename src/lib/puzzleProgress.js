import { supabase } from "./supabaseClient";

/* ============================================================
   Puzzle progress + the anonymous daily cap
   ------------------------------------------------------------
   Two separate things live here on purpose:

   1. Signed-in students get their attempts recorded in `puzzle_attempts`
      and read back by the `puzzle_stats()` RPC.

   2. Anonymous visitors get a soft cap of 5 puzzles a day, counted in
      localStorage. This is a CONVERSION NUDGE, not a security boundary —
      clearing site data or opening a private window resets it, and that
      is fine. Enforcing it server-side would mean fingerprinting children,
      which we are not going to do for a free puzzle trainer.
   ============================================================ */

export const ANON_DAILY_LIMIT = 5;

const USAGE_KEY = "educhess.puzzleUsage";

/** Local calendar day, e.g. "2026-08-05". Local, because the cap is a UX rule. */
function todayKey() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Read today's anonymous usage as `{ date, count }`.
 *
 * A stored entry from a previous day is treated as zero rather than reset in
 * place: reads happen during render, and writing there would be a side effect.
 * The stale row is overwritten by the next `recordAnonPuzzle()`.
 */
export function readAnonUsage() {
  const today = todayKey();
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return { date: today, count: 0 };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.date !== today) return { date: today, count: 0 };
    const count = Number(parsed.count);
    return { date: today, count: Number.isFinite(count) && count > 0 ? count : 0 };
  } catch {
    // Corrupt JSON, or storage blocked entirely (Safari private mode throws
    // on read in some versions). Treat as a fresh day — never block on this.
    return { date: today, count: 0 };
  }
}

/** Count one concluded puzzle against today's anonymous allowance. */
export function recordAnonPuzzle() {
  const next = { date: todayKey(), count: readAnonUsage().count + 1 };
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked. The visitor gets unlimited puzzles; that is a
    // far better failure than a trainer that refuses to load.
  }
  return next.count;
}

/** How many free puzzles an anonymous visitor has left today. */
export function anonPuzzlesLeft() {
  return Math.max(0, ANON_DAILY_LIMIT - readAnonUsage().count);
}

/**
 * Record a concluded puzzle for a signed-in student.
 *
 * Deliberately fire-and-forget. A logging failure — offline, RLS not yet
 * migrated, a dropped request — must never interrupt the puzzle the child is
 * solving, so nothing here is awaited by the caller and every error ends as a
 * console warning.
 */
export function logPuzzleAttempt({ userId, puzzleId, solved, category, difficulty }) {
  if (!userId || !puzzleId) return;
  supabase
    .from("puzzle_attempts")
    .insert({
      user_id: userId,
      puzzle_id: puzzleId,
      solved: !!solved,
      category: category ?? null,
      difficulty: difficulty ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn("[EduChess] couldn't record puzzle attempt:", error.message);
    });
}

/**
 * Read the signed-in student's puzzle stats.
 *
 * Returns the shape `puzzle_stats()` builds. Throws on failure so the caller
 * can keep "failed to load" and "nothing solved yet" as distinct states.
 */
export async function fetchPuzzleStats() {
  const { data, error } = await supabase.rpc("puzzle_stats");
  if (error) throw error;
  return (
    data ?? { total_attempted: 0, total_solved: 0, solved_today: 0, streak: 0, by_category: [] }
  );
}
