import { supabase } from "./supabaseClient";

/* ============================================================
   Puzzle progress and the daily allowance.
   ------------------------------------------------------------
   Puzzles are behind sign-in, and the allowance is a property of the
   account's tier rather than of the browser:

     free     5 a day
     pro      50 a day
     academy  unlimited

   THE ALLOWANCE IS NOW A REAL BOUNDARY, and it is worth being precise about
   what changed, because the old comment here said the opposite.

   It used to be counted from `puzzle_attempts` — rows this file writes,
   fire-and-forget. A client that simply never logged an attempt was never
   counted, so the tier difference could not actually be delivered (audit
   ENT-01). It was accepted as a signup nudge on the grounds that Lichess
   puzzles are free public data; that reasoning holds for the FREE tier and
   does not hold for a thing Pro and Academy are sold on.

   Counting now happens on the way OUT, in random_puzzles_for_user()
   (supabase/02_functions.sql): puzzles are charged to the account when the
   server hands them over, under a row lock, and every batch is clamped to
   what is left. A client cannot decline to be counted, because it is not the
   one counting.

   What follows from that, for anyone editing this file:
     * `remaining` is a READ. Never decrement it locally — the number the
       server returned with the batch is the number.
     * logPuzzleAttempt() is now purely a record of outcomes. It feeds the
       dashboard's totals and streak. It gates nothing, and a failed write
       costs the student nothing.

   There is no anonymous path. /puzzles is behind RequireAuth, so the old
   localStorage nudge for logged-out visitors has nothing to nudge and is
   gone. The free tier is the top of the funnel now: five a day, with an
   account.
   ============================================================ */

/** Does this error mean "you have used today's puzzles"? */
export function isQuotaError(error) {
  return /PUZZLE_QUOTA_REACHED/.test(error?.message || "");
}

/**
 * Read the signed-in student's allowance WITHOUT spending any of it.
 *
 * Shape: `{ tier, daily_limit, used_today, remaining }`, where a null
 * `daily_limit` (and null `remaining`) means unlimited. Throws so the caller
 * can tell "couldn't read it" apart from "you have none left" — they lead to
 * completely different screens.
 *
 * Used by the category picker. The trainer itself does not need this: its
 * batch response already carries the same four fields, counted after the
 * batch was handed over.
 */
export async function fetchPuzzleQuota() {
  const { data, error } = await supabase.rpc("puzzle_quota");
  if (error) throw error;
  return data ?? { tier: "free", daily_limit: 5, used_today: 0, remaining: 5 };
}

/**
 * Record a concluded puzzle.
 *
 * Deliberately fire-and-forget. A logging failure — offline, or a dropped
 * request — must never interrupt the puzzle the child is solving, so nothing
 * here is awaited and every error ends as a console warning.
 *
 * Safe to be lossy now in a way it was not before: this write no longer
 * decides how many puzzles anyone gets. The worst a lost row costs is one
 * missing tick in the dashboard streak.
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
