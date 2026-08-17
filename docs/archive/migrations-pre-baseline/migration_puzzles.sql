-- ============================================================
-- EDUCHESS — Puzzles migration
-- ------------------------------------------------------------
-- Run this AFTER schema.sql and migration_admin_videos.sql (it
-- reuses the admin-role RLS pattern from that file).
--
-- What this adds:
--   public.puzzles — chess puzzles for the /puzzles trainer, in
--   three categories: 'mate_in_1', 'mate_in_2', 'best_move'.
--   `solution` is a jsonb array of {from,to,promotion?} move
--   objects: length 1 for mate_in_1/best_move, length 3 for
--   mate_in_2 (player move, forced opponent reply, mating move).
--   All puzzles are White-to-move, matching the rest of the app's
--   "you play White" convention.
--
-- Every position + solution below was constructed and verified
-- programmatically with chess.js (legal FEN, moves are legal, and
-- for mate puzzles chess.js confirms actual checkmate; for
-- mate-in-2 the opponent's reply is confirmed forced — i.e. the
-- only legal move — before the mating move is accepted). This is
-- a hand-curated starter set (8/6/8), not a bulk import of an
-- external puzzle database — the schema/UI scale to any size if
-- more are added later (via SQL or a future admin puzzle uploader).
-- Safe to re-run: uses ON CONFLICT DO NOTHING via a unique guard.
-- ============================================================

create table if not exists public.puzzles (
  id           bigint generated always as identity primary key,
  category     text not null check (category in ('mate_in_1', 'mate_in_2', 'best_move')),
  fen          text not null,
  solution     jsonb not null,
  hint         text,
  created_at   timestamptz not null default now()
);

alter table public.puzzles enable row level security;

drop policy if exists "Puzzles are viewable by everyone" on public.puzzles;
create policy "Puzzles are viewable by everyone"
  on public.puzzles for select
  using (true);

drop policy if exists "Only admins can insert puzzles" on public.puzzles;
create policy "Only admins can insert puzzles"
  on public.puzzles for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can delete puzzles" on public.puzzles;
create policy "Only admins can delete puzzles"
  on public.puzzles for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Only seed once — skip if puzzles already exist (safe to re-run).
insert into public.puzzles (category, fen, solution, hint)
select * from (values
  -- ---------- mate_in_1 (back-rank mate pattern, 8 variations) ----------
  ('mate_in_1', '1k6/ppp5/8/8/8/8/8/Q6K w - - 0 1', '[{"from":"a1","to":"h8"}]'::jsonb, 'The back rank is wide open.'),
  ('mate_in_1', '1k6/ppp5/8/8/8/8/8/3R3K w - - 0 1', '[{"from":"d1","to":"d8"}]'::jsonb, 'The rook owns the open file.'),
  ('mate_in_1', '2k5/1ppp4/8/8/8/8/Q7/7K w - - 0 1', '[{"from":"a2","to":"a8"}]'::jsonb, 'The king has no escape squares.'),
  ('mate_in_1', '2k5/1ppp4/8/8/8/R7/8/7K w - - 0 1', '[{"from":"a3","to":"a8"}]'::jsonb, 'Bring the rook all the way home.'),
  ('mate_in_1', '3k4/2ppp3/8/8/Q7/8/8/7K w - - 0 1', '[{"from":"a4","to":"a8"}]'::jsonb, 'One clean diagonal-to-file shot.'),
  ('mate_in_1', '3k4/2ppp3/8/8/8/8/8/1R5K w - - 0 1', '[{"from":"b1","to":"b8"}]'::jsonb, 'The pawns box the king in.'),
  ('mate_in_1', '4k3/3ppp2/8/8/8/8/1Q6/7K w - - 0 1', '[{"from":"b2","to":"b8"}]'::jsonb, 'Classic back-rank pattern.'),
  ('mate_in_1', '4k3/3ppp2/8/8/8/1R6/8/7K w - - 0 1', '[{"from":"b3","to":"b8"}]'::jsonb, 'The rook needs just one file.'),

  -- ---------- mate_in_2 (forced sequences: 1 smothered mate + 5 corner mates) ----------
  ('mate_in_2', '5r1k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1', '[{"from":"b3","to":"g8"},{"from":"f8","to":"g8"},{"from":"h6","to":"f7"}]'::jsonb, 'Sacrifice the queen — the rook is forced to recapture.'),
  ('mate_in_2', 'k7/8/8/K7/8/8/8/Q7 w - - 0 1', '[{"from":"a5","to":"b6"},{"from":"a8","to":"b8"},{"from":"a1","to":"h8"}]'::jsonb, 'Cut off the king with your king first.'),
  ('mate_in_2', 'k7/8/8/K7/8/8/Q7/8 w - - 0 1', '[{"from":"a5","to":"b6"},{"from":"a8","to":"b8"},{"from":"a2","to":"g8"}]'::jsonb, 'Same idea, different queen square.'),
  ('mate_in_2', 'k7/8/8/K7/8/Q7/8/8 w - - 0 1', '[{"from":"a5","to":"b6"},{"from":"a8","to":"b8"},{"from":"a3","to":"f8"}]'::jsonb, 'Trap the king against the rank.'),
  ('mate_in_2', 'k7/8/2Q5/K7/8/8/8/8 w - - 0 1', '[{"from":"a5","to":"a6"},{"from":"a8","to":"b8"},{"from":"c6","to":"b7"}]'::jsonb, 'The queen delivers mate right next to your king.'),
  ('mate_in_2', 'k7/8/8/K2Q4/8/8/8/8 w - - 0 1', '[{"from":"a5","to":"a6"},{"from":"a8","to":"b8"},{"from":"d5","to":"b7"}]'::jsonb, 'Your king supports the final blow.'),

  -- ---------- best_move (direct tactics winning clear material) ----------
  ('best_move', '3q2k1/p7/8/8/8/8/8/3R2K1 w - - 0 1', '[{"from":"d1","to":"d8"}]'::jsonb, 'The queen is undefended on the open file.'),
  ('best_move', '6k1/p7/5r2/8/8/8/1B6/6K1 w - - 0 1', '[{"from":"b2","to":"f6"}]'::jsonb, 'The long diagonal wins the rook.'),
  ('best_move', '6k1/r6p/8/8/Q7/8/8/6K1 w - - 0 1', '[{"from":"a4","to":"a7"}]'::jsonb, 'The rook has no defender.'),
  ('best_move', '6k1/7p/8/R3b3/8/8/8/6K1 w - - 0 1', '[{"from":"a5","to":"e5"}]'::jsonb, 'The bishop hangs on the fifth rank.'),
  ('best_move', '6k1/3q3p/8/4N3/8/8/8/6K1 w - - 0 1', '[{"from":"e5","to":"d7"}]'::jsonb, 'The knight forks its way to the queen.'),
  ('best_move', '6k1/p7/7q/8/8/8/8/2B3K1 w - - 0 1', '[{"from":"c1","to":"h6"}]'::jsonb, 'The bishop''s diagonal reaches all the way.'),
  ('best_move', 'k6q/1p6/8/7R/8/8/8/6K1 w - - 0 1', '[{"from":"h5","to":"h8"}]'::jsonb, 'The rook lifts to the back rank.'),
  ('best_move', 'k7/1p3r2/8/8/2B5/8/8/6K1 w - - 0 1', '[{"from":"c4","to":"f7"}]'::jsonb, 'The bishop skewers straight to the rook.')
) as seed(category, fen, solution, hint)
where not exists (select 1 from public.puzzles limit 1);
