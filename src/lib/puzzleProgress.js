import { supabase } from "./supabaseClient";

/* ============================================================
   Puzzle progress and the daily allowance.
   ------------------------------------------------------------
   Puzzles are now behind sign-in, and the allowance is a property of the
   account's tier rather than of the browser:

     free     5 a day
     pro      50 a day
     academy  unlimited

   The earlier version counted anonymous puzzles in localStorage. That is
   gone: it was a nudge that anyone could clear, and there is nothing to
   nudge now — you cannot reach a puzzle without an account.

   The numbers are NOT decided here. tier_daily_puzzles() decides them,
   enforce_puzzle_quota refuses attempts past the limit, and
   random_puzzles_for_user() refuses a batch once the day's attempts are used.

   This is a SOFT limit, not a hard boundary (audit finding FE-02). The count
   is derived from puzzle_attempts, which the client writes below, so a client
   that never logs an attempt is never counted against the cap. That is an
   accepted tradeoff: the puzzles are free public Lichess data, so the daily
   allowance is a signup/upgrade nudge, not protection of a scarce resource.
   Everything below is either a read of that state or a display of it.
   ============================================================ */

/** Does this error mean "you have used today's puzzles"? */
export function isQuotaError(error) {
  return /PUZZLE_QUOTA_REACHED/.test(error?.message || "");
}

/**
 * Read the signed-in student's allowance.
 *
 * Shape: `{ tier, daily_limit, used_today, remaining }`, where a null
 * `daily_limit` (and null `remaining`) means unlimited. Throws so the caller
 * can tell "couldn't read it" apart from "you have none left" — they lead to
 * completely different screens.
 */
export async function fetchPuzzleQuota() {
  const { data, error } = await supabase.rpc("puzzle_quota");
  if (error) throw error;
  return data ?? { tier: "free", daily_limit: 5, used_today: 0, remaining: 5 };
}

/**
 * Record a concluded puzzle.
 *
 * Deliberately fire-and-forget. A logging failure — offline, a dropped
 * request, or the quota trigger disagreeing with the client's count by one —
 * must never interrupt the puzzle the child is solving, so nothing here is
 * awaited and every error ends as a console warning.
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
