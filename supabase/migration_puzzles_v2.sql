-- ============================================================
-- EDUCHESS — Puzzles v2: difficulty tiers + Three Move Mate +
-- corrected/expanded seed library
-- ------------------------------------------------------------
-- Run this AFTER migration_puzzles.sql.
--
-- Why this migration exists:
--   1. Two of the original 6 mate_in_2 seed puzzles were actually
--      ILLEGAL positions — the puzzle-verification script only
--      checked that White (the side to move) wasn't already in
--      check, but never checked that Black wasn't *already* in
--      check before White's move (impossible in real chess). This
--      migration deletes ALL old seed puzzles and replaces them
--      with a much larger, genuinely re-verified set (every
--      position confirmed legal both ways, every mate confirmed
--      by chess.js, every "forced" reply confirmed to be Black's
--      only legal move).
--   2. Adds a `difficulty` tier (easy/medium/hard) so the trainer
--      can filter by it.
--   3. Adds a new 'mate_in_3' category.
--   4. The new set is much bigger and more varied (different
--      mating patterns/piece combinations, not just "back rank
--      with three pawns" repeated) so a continuous shuffle-stream
--      doesn't feel like the same handful of puzzles on repeat.
-- ------------------------------------------------------------
-- !! NOT SAFE TO RE-RUN — THIS MIGRATION IS DESTRUCTIVE !!
--
-- This header used to claim "Safe to re-run: guarded with IF NOT EXISTS /
-- DROP ... IF EXISTS." The DDL is guarded, but the body also runs an
-- unguarded
--
--     delete from public.puzzles;
--
-- and then re-inserts the seed set. Re-running therefore WIPES the table
-- first. That is intended on a first run (the point of the migration is to
-- replace a seed set containing illegal positions) but it is not idempotent,
-- and the old comment invited someone to re-run it casually.
--
-- SUPERSEDED. `public.puzzles` is the old hand-generated table. The app now
-- reads `public.lichess_puzzles` — see migration_lichess_puzzles.sql and
-- src/lib/puzzles.js. There is no reason to run this file on a database that
-- already has it applied. It is kept only so the schema history stays
-- readable, and so the table can be rebuilt if anyone ever needs it.
--
-- If you do need to re-run it, take a backup of public.puzzles first.
-- ============================================================

alter table public.puzzles
  add column if not exists difficulty text not null default 'medium';

alter table public.puzzles
  drop constraint if exists puzzles_difficulty_check;
alter table public.puzzles
  add constraint puzzles_difficulty_check check (difficulty in ('easy', 'medium', 'hard'));

alter table public.puzzles
  drop constraint if exists puzzles_category_check;
alter table public.puzzles
  add constraint puzzles_category_check check (category in ('mate_in_1', 'mate_in_2', 'mate_in_3', 'best_move'));

-- >>> DESTRUCTIVE <<<
-- Wipe the old (partly-illegal, thin) seed set — see explanation above.
-- This is the statement that makes the whole file non-idempotent: re-running
-- the migration empties the table before re-seeding it.
--
-- quest_progress rows referencing old puzzle ids become harmless orphaned
-- text keys (quest_key is a plain string, not a foreign key), so no
-- migration is needed there.
delete from public.puzzles;

insert into public.puzzles (category, fen, solution, difficulty, hint) values
  ('mate_in_1', '4K3/8/3Q4/8/4k3/8/8/5Q2 w - - 0 1', '[{"from":"f1","to":"d3"}]'::jsonb, 'easy', 'Look for a checkmate in one.'),
  ('mate_in_1', '7k/6pp/8/8/8/8/2Q5/7K w - - 0 1', '[{"from":"c2","to":"c8"}]'::jsonb, 'easy', 'Look for a checkmate in one.'),
  ('mate_in_1', '7k/K5pp/8/8/8/8/8/2Q5 w - - 0 1', '[{"from":"c1","to":"c8"}]'::jsonb, 'easy', 'Look for a checkmate in one.'),
  ('mate_in_1', '8/4B3/7p/7k/8/4K3/2Q5/8 w - - 0 1', '[{"from":"c2","to":"f5"}]'::jsonb, 'easy', 'Look for a checkmate in one.'),
  ('mate_in_1', '5K2/8/8/8/2Q5/8/4pp2/4k3 w - - 0 1', '[{"from":"c4","to":"c1"}]'::jsonb, 'easy', 'Look for a checkmate in one.'),
  ('mate_in_1', '8/8/8/3R2Q1/8/K7/3p4/3k4 w - - 0 1', '[{"from":"g5","to":"d2"}]'::jsonb, 'easy', 'Look for a checkmate in one.'),
  ('mate_in_1', '6R1/7k/7p/6Q1/1K6/8/8/8 w - - 0 1', '[{"from":"g5","to":"g6"}]'::jsonb, 'easy', 'Look for a checkmate in one.'),
  ('mate_in_1', '7k/6pp/8/8/8/8/1K6/2R5 w - - 0 1', '[{"from":"c1","to":"c8"}]'::jsonb, 'easy', 'Look for a checkmate in one.'),
  ('mate_in_1', '7k/6pp/8/8/5K2/8/Q7/8 w - - 0 1', '[{"from":"a2","to":"a8"}]'::jsonb, 'easy', 'Look for a checkmate in one.'),
  ('mate_in_1', '2Q5/8/6p1/6pk/8/K7/5R2/8 w - - 0 1', '[{"from":"c8","to":"h3"}]'::jsonb, 'easy', 'Look for a checkmate in one.'),
  ('mate_in_1', '8/8/8/4K3/7Q/5Q2/pp6/1k6 w - - 0 1', '[{"from":"f3","to":"d1"}]'::jsonb, 'medium', 'Look for a checkmate in one.'),
  ('mate_in_1', '1K4k1/5ppp/8/8/8/8/3R4/8 w - - 0 1', '[{"from":"d2","to":"d8"}]'::jsonb, 'medium', 'Look for a checkmate in one.'),
  ('mate_in_1', 'K6k/2Q3pp/8/8/6Q1/8/8/8 w - - 0 1', '[{"from":"c7","to":"b8"}]'::jsonb, 'medium', 'Look for a checkmate in one.'),
  ('mate_in_1', 'k7/pp6/2R5/4R3/8/8/5K2/8 w - - 0 1', '[{"from":"c6","to":"c8"}]'::jsonb, 'medium', 'Look for a checkmate in one.'),
  ('mate_in_1', '5k2/4ppp1/4Q3/8/3K4/8/8/8 w - - 0 1', '[{"from":"e6","to":"c8"}]'::jsonb, 'medium', 'Look for a checkmate in one.'),
  ('mate_in_1', '8/8/8/3B1R2/8/2K5/6pp/7k w - - 0 1', '[{"from":"f5","to":"f1"}]'::jsonb, 'medium', 'Look for a checkmate in one.'),
  ('mate_in_1', 'Bk6/p1p5/8/8/8/Q7/7K/8 w - - 0 1', '[{"from":"a3","to":"f8"}]'::jsonb, 'medium', 'Look for a checkmate in one.'),
  ('mate_in_1', '8/3K4/6B1/8/6Q1/8/5pp1/5k2 w - - 0 1', '[{"from":"g4","to":"d1"}]'::jsonb, 'medium', 'Look for a checkmate in one.'),
  ('mate_in_1', '1k6/ppp5/8/3R4/8/2K5/8/8 w - - 0 1', '[{"from":"d5","to":"d8"}]'::jsonb, 'medium', 'Look for a checkmate in one.'),
  ('mate_in_1', '7k/1Q4pp/8/8/8/8/1BK5/8 w - - 0 1', '[{"from":"b7","to":"a8"}]'::jsonb, 'medium', 'Look for a checkmate in one.'),
  ('mate_in_1', '3k4/2ppp3/8/2K5/8/1Q6/8/8 w - - 0 1', '[{"from":"b3","to":"b8"}]'::jsonb, 'hard', 'Look for a checkmate in one.'),
  ('mate_in_1', '1k6/pppQ4/8/8/8/8/8/1K6 w - - 0 1', '[{"from":"d7","to":"d8"}]'::jsonb, 'hard', 'Look for a checkmate in one.'),
  ('mate_in_1', '3k4/2ppp3/8/8/6Q1/8/8/2K5 w - - 0 1', '[{"from":"g4","to":"g8"}]'::jsonb, 'hard', 'Look for a checkmate in one.'),
  ('mate_in_1', '8/8/R5p1/3K2pk/6p1/8/Q7/8 w - - 0 1', '[{"from":"a2","to":"h2"}]'::jsonb, 'hard', 'Look for a checkmate in one.'),
  ('mate_in_1', '3k4/2ppp3/8/8/8/3B1R2/8/4K3 w - - 0 1', '[{"from":"f3","to":"f8"}]'::jsonb, 'hard', 'Look for a checkmate in one.'),
  ('mate_in_1', '8/3pp3/2pk4/8/8/2Q1Q3/K7/8 w - - 0 1', '[{"from":"c3","to":"e5"}]'::jsonb, 'hard', 'Look for a checkmate in one.'),
  ('mate_in_1', '8/8/5Q2/6pp/5B1k/7p/8/5K2 w - - 0 1', '[{"from":"f6","to":"g5"}]'::jsonb, 'hard', 'Look for a checkmate in one.'),
  ('mate_in_1', '2k5/1ppp4/8/8/8/8/3R2R1/1K6 w - - 0 1', '[{"from":"g2","to":"g8"}]'::jsonb, 'hard', 'Look for a checkmate in one.'),
  ('mate_in_1', '1k6/ppp1Q3/8/8/8/4R3/7K/8 w - - 0 1', '[{"from":"e7","to":"d8"}]'::jsonb, 'hard', 'Look for a checkmate in one.'),
  ('mate_in_1', '3K4/8/8/8/6pp/3N3k/7p/5N2 w - - 0 1', '[{"from":"d3","to":"f4"}]'::jsonb, 'hard', 'Look for a checkmate in one.'),
  ('best_move', '8/k4K2/8/6q1/8/6Q1/8/8 w - - 0 1', '[{"from":"g3","to":"g5"}]'::jsonb, 'easy', 'One move wins material outright.'),
  ('best_move', 'k5K1/8/8/2q1p3/8/3N4/8/8 w - - 0 1', '[{"from":"d3","to":"c5"}]'::jsonb, 'easy', 'One move wins material outright.'),
  ('best_move', '8/8/1p5q/8/K2k2N1/8/8/8 w - - 0 1', '[{"from":"g4","to":"h6"}]'::jsonb, 'easy', 'One move wins material outright.'),
  ('best_move', 'k7/4K3/5Q2/8/8/8/8/5q2 w - - 0 1', '[{"from":"f6","to":"f1"}]'::jsonb, 'easy', 'One move wins material outright.'),
  ('best_move', '4k3/4p3/8/2K5/8/8/5N2/7q w - - 0 1', '[{"from":"f2","to":"h1"}]'::jsonb, 'easy', 'One move wins material outright.'),
  ('best_move', '1k6/7q/8/8/8/K7/2p4R/8 w - - 0 1', '[{"from":"h2","to":"h7"}]'::jsonb, 'easy', 'One move wins material outright.'),
  ('best_move', 'q7/7k/R7/8/8/8/7K/8 w - - 0 1', '[{"from":"a6","to":"a8"}]'::jsonb, 'easy', 'One move wins material outright.'),
  ('best_move', '8/4p2K/6B1/5q2/8/8/5k2/8 w - - 0 1', '[{"from":"g6","to":"f5"}]'::jsonb, 'easy', 'One move wins material outright.'),
  ('best_move', '8/8/3q4/5N2/8/5k2/8/6K1 w - - 0 1', '[{"from":"f5","to":"d6"}]'::jsonb, 'easy', 'One move wins material outright.'),
  ('best_move', '8/8/8/8/2r5/8/4Q1K1/1k6 w - - 0 1', '[{"from":"e2","to":"c4"}]'::jsonb, 'easy', 'One move wins material outright.'),
  ('best_move', '8/8/p4B2/6K1/8/7k/8/r7 w - - 0 1', '[{"from":"f6","to":"a1"}]'::jsonb, 'medium', 'One move wins material outright.'),
  ('best_move', 'k7/8/8/7r/8/8/3p3Q/6K1 w - - 0 1', '[{"from":"h2","to":"h5"}]'::jsonb, 'medium', 'One move wins material outright.'),
  ('best_move', '1k6/7K/8/8/8/8/1r2Q3/8 w - - 0 1', '[{"from":"e2","to":"b2"}]'::jsonb, 'medium', 'One move wins material outright.'),
  ('best_move', '4R3/5K2/8/8/4qk2/8/8/8 w - - 0 1', '[{"from":"e8","to":"e4"}]'::jsonb, 'medium', 'One move wins material outright.'),
  ('best_move', '4Q3/4n3/8/4k3/K7/8/7p/8 w - - 0 1', '[{"from":"e8","to":"e7"}]'::jsonb, 'medium', 'One move wins material outright.'),
  ('best_move', '8/8/5b2/8/k3N3/8/8/6K1 w - - 0 1', '[{"from":"e4","to":"f6"}]'::jsonb, 'medium', 'One move wins material outright.'),
  ('best_move', '7B/8/8/8/8/2n5/6pK/k7 w - - 0 1', '[{"from":"h8","to":"c3"}]'::jsonb, 'medium', 'One move wins material outright.'),
  ('best_move', '5R2/6p1/8/8/5b2/K7/8/6k1 w - - 0 1', '[{"from":"f8","to":"f4"}]'::jsonb, 'medium', 'One move wins material outright.'),
  ('best_move', '8/6K1/k7/8/1b1R4/8/8/8 w - - 0 1', '[{"from":"d4","to":"b4"}]'::jsonb, 'medium', 'One move wins material outright.'),
  ('best_move', '8/8/8/5K2/k7/8/bQ6/8 w - - 0 1', '[{"from":"b2","to":"a2"}]'::jsonb, 'medium', 'One move wins material outright.'),
  ('best_move', '8/8/8/8/8/1nK1k3/8/1Q6 w - - 0 1', '[{"from":"b1","to":"b3"}]'::jsonb, 'hard', 'One move wins material outright.'),
  ('best_move', '8/4R3/4b2k/8/8/3K4/8/8 w - - 0 1', '[{"from":"e7","to":"e6"}]'::jsonb, 'hard', 'One move wins material outright.'),
  ('best_move', '8/1K6/7k/8/4n3/8/8/1Q6 w - - 0 1', '[{"from":"b1","to":"e4"}]'::jsonb, 'hard', 'One move wins material outright.'),
  ('best_move', 'K7/8/6np/8/8/1k6/6R1/8 w - - 0 1', '[{"from":"g2","to":"g6"}]'::jsonb, 'hard', 'One move wins material outright.'),
  ('best_move', '8/6K1/8/8/3k4/8/R5b1/8 w - - 0 1', '[{"from":"a2","to":"g2"}]'::jsonb, 'hard', 'One move wins material outright.'),
  ('best_move', '7K/8/8/1n5k/8/1R4p1/8/8 w - - 0 1', '[{"from":"b3","to":"b5"}]'::jsonb, 'hard', 'One move wins material outright.'),
  ('best_move', 'b4k2/8/8/8/R7/4p3/4K3/8 w - - 0 1', '[{"from":"a4","to":"a8"}]'::jsonb, 'hard', 'One move wins material outright.'),
  ('best_move', '3Q3b/8/8/8/8/3K4/8/6k1 w - - 0 1', '[{"from":"d8","to":"h8"}]'::jsonb, 'hard', 'One move wins material outright.'),
  ('best_move', '8/6Rn/8/7K/8/2p1k3/8/8 w - - 0 1', '[{"from":"g7","to":"h7"}]'::jsonb, 'hard', 'One move wins material outright.'),
  ('best_move', '5K2/3k4/1B6/b7/8/8/8/8 w - - 0 1', '[{"from":"b6","to":"a5"}]'::jsonb, 'hard', 'One move wins material outright.'),
  ('mate_in_2', '7k/8/Q5K1/8/8/8/8/8 w - - 0 1', '[{"from":"a6","to":"f6"},{"from":"h8","to":"g8"},{"from":"f6","to":"d8"}]'::jsonb, 'easy', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/8/8/8/6K1/4Q3/6k1 w - - 0 1', '[{"from":"e2","to":"f2"},{"from":"g1","to":"h1"},{"from":"f2","to":"g2"}]'::jsonb, 'easy', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/8/2Q5/8/1K6/8/1k6 w - - 0 1', '[{"from":"c5","to":"c2"},{"from":"b1","to":"a1"},{"from":"c2","to":"d1"}]'::jsonb, 'easy', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/8/8/5Q2/k1K5/8/8 w - - 0 1', '[{"from":"f4","to":"b4"},{"from":"a3","to":"a2"},{"from":"b4","to":"b2"}]'::jsonb, 'easy', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '7k/8/6K1/8/8/8/3Q4/8 w - - 0 1', '[{"from":"d2","to":"c3"},{"from":"h8","to":"g8"},{"from":"c3","to":"c8"}]'::jsonb, 'easy', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/1Q6/8/8/K7/8/k7 w - - 0 1', '[{"from":"b6","to":"f6"},{"from":"a1","to":"b1"},{"from":"f6","to":"b2"}]'::jsonb, 'easy', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/8/8/8/k1K5/6Q1/8 w - - 0 1', '[{"from":"g2","to":"b2"},{"from":"a3","to":"a4"},{"from":"b2","to":"b4"}]'::jsonb, 'medium', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/2Q5/8/8/8/8/k1K5 w - - 0 1', '[{"from":"c6","to":"f6"},{"from":"a1","to":"a2"},{"from":"f6","to":"b2"}]'::jsonb, 'medium', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/7Q/8/8/8/8/k1K5 w - - 0 1', '[{"from":"h6","to":"g7"},{"from":"a1","to":"a2"},{"from":"g7","to":"b2"}]'::jsonb, 'medium', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '7k/5K2/4Q3/8/8/8/8/8 w - - 0 1', '[{"from":"e6","to":"c8"},{"from":"h8","to":"h7"},{"from":"c8","to":"h3"}]'::jsonb, 'medium', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '3Q4/8/8/8/8/2K5/8/2k5 w - - 0 1', '[{"from":"d8","to":"d2"},{"from":"c1","to":"b1"},{"from":"d2","to":"b2"}]'::jsonb, 'medium', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/8/8/5Q2/8/8/5K1k w - - 0 1', '[{"from":"f4","to":"f3"},{"from":"h1","to":"h2"},{"from":"f3","to":"g2"}]'::jsonb, 'medium', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/5Q2/8/8/8/1K6/8/k7 w - - 0 1', '[{"from":"f7","to":"g7"},{"from":"a1","to":"b1"},{"from":"g7","to":"g1"}]'::jsonb, 'hard', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/2Q5/8/8/8/1K6/8/k7 w - - 0 1', '[{"from":"c7","to":"g7"},{"from":"a1","to":"b1"},{"from":"g7","to":"g1"}]'::jsonb, 'hard', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '6k1/8/6K1/5Q2/8/8/8/8 w - - 0 1', '[{"from":"f5","to":"f7"},{"from":"g8","to":"h8"},{"from":"f7","to":"e8"}]'::jsonb, 'hard', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/8/8/1Q6/2K5/k7/8 w - - 0 1', '[{"from":"b4","to":"b3"},{"from":"a2","to":"a1"},{"from":"b3","to":"b2"}]'::jsonb, 'hard', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/4Q3/8/8/6K1/8/7k w - - 0 1', '[{"from":"e6","to":"h6"},{"from":"h1","to":"g1"},{"from":"h6","to":"c1"}]'::jsonb, 'hard', 'White forces mate in exactly two moves.'),
  ('mate_in_2', '8/8/3Q4/8/8/6K1/8/7k w - - 0 1', '[{"from":"d6","to":"h6"},{"from":"h1","to":"g1"},{"from":"h6","to":"c1"}]'::jsonb, 'hard', 'White forces mate in exactly two moves.'),
  ('mate_in_3', '8/3Q4/8/8/8/8/2K5/k7 w - - 0 1', '[{"from":"d7","to":"d1"},{"from":"a1","to":"a2"},{"from":"d1","to":"b1"},{"from":"a2","to":"a3"},{"from":"b1","to":"b3"}]'::jsonb, 'easy', 'White forces mate in exactly three moves — plan ahead.'),
  ('mate_in_3', '8/5K1k/8/8/8/8/8/6Q1 w - - 0 1', '[{"from":"g1","to":"g6"},{"from":"h7","to":"h8"},{"from":"g6","to":"f6"},{"from":"h8","to":"h7"},{"from":"f6","to":"g7"}]'::jsonb, 'easy', 'White forces mate in exactly three moves — plan ahead.'),
  ('mate_in_3', '7k/5K2/8/3Q4/8/8/8/8 w - - 0 1', '[{"from":"d5","to":"a8"},{"from":"h8","to":"h7"},{"from":"a8","to":"g8"},{"from":"h7","to":"h6"},{"from":"g8","to":"g6"}]'::jsonb, 'easy', 'White forces mate in exactly three moves — plan ahead.'),
  ('mate_in_3', '7k/8/4Q1K1/8/8/8/8/8 w - - 0 1', '[{"from":"e6","to":"f6"},{"from":"h8","to":"g8"},{"from":"f6","to":"f7"},{"from":"g8","to":"h8"},{"from":"f7","to":"e8"}]'::jsonb, 'medium', 'White forces mate in exactly three moves — plan ahead.'),
  ('mate_in_3', '7k/1Q6/6K1/8/8/8/8/8 w - - 0 1', '[{"from":"b7","to":"h1"},{"from":"h8","to":"g8"},{"from":"h1","to":"h7"},{"from":"g8","to":"f8"},{"from":"h7","to":"f7"}]'::jsonb, 'medium', 'White forces mate in exactly three moves — plan ahead.'),
  ('mate_in_3', '6k1/2Q5/6K1/8/8/8/8/8 w - - 0 1', '[{"from":"c7","to":"f7"},{"from":"g8","to":"h8"},{"from":"f7","to":"f6"},{"from":"h8","to":"g8"},{"from":"f6","to":"d8"}]'::jsonb, 'medium', 'White forces mate in exactly three moves — plan ahead.'),
  ('mate_in_3', '8/8/8/8/2Q5/5K1k/8/8 w - - 0 1', '[{"from":"c4","to":"g4"},{"from":"h3","to":"h2"},{"from":"g4","to":"g3"},{"from":"h2","to":"h1"},{"from":"g3","to":"g2"}]'::jsonb, 'hard', 'White forces mate in exactly three moves — plan ahead.'),
  ('mate_in_3', '6k1/3Q4/6K1/8/8/8/8/8 w - - 0 1', '[{"from":"d7","to":"f7"},{"from":"g8","to":"h8"},{"from":"f7","to":"f6"},{"from":"h8","to":"g8"},{"from":"f6","to":"d8"}]'::jsonb, 'hard', 'White forces mate in exactly three moves — plan ahead.'),
  ('mate_in_3', '7k/8/7K/8/7Q/8/8/8 w - - 0 1', '[{"from":"h6","to":"g6"},{"from":"h8","to":"g8"},{"from":"h4","to":"h7"},{"from":"g8","to":"f8"},{"from":"h7","to":"f7"}]'::jsonb, 'hard', 'White forces mate in exactly three moves — plan ahead.');
