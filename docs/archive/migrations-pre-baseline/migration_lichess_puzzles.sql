-- ============================================================
-- EDUCHESS — Lichess puzzle library
-- ------------------------------------------------------------
-- Replaces the small hand-generated `puzzles` table with an import
-- of the Lichess puzzle database (~5M puzzles, CC0 / public domain,
-- https://database.lichess.org/#puzzles).
--
-- Run this, then run backend/scripts/import_lichess_puzzles.py to
-- load the rows. The old `puzzles` table is left untouched so the
-- current Puzzles page keeps working until the frontend is switched
-- over; drop it once you're happy (see the commented line at the end).
--
-- IMPORTANT — the FEN convention differs from our old table:
--   `fen` is the position BEFORE the opponent's move.
--   moves[1] is played BY THE OPPONENT; the student solves from there.
--     student's moves  = moves[2], moves[4], ...   (1-indexed SQL array)
--     opponent replies = moves[3], moves[5], ...
--   The frontend must apply moves[1] before handing the board over.
--
-- Safe to re-run.
-- ============================================================

create table if not exists public.lichess_puzzles (
  puzzle_id    text primary key,           -- Lichess PuzzleId, e.g. '00sHx'
  fen          text not null,
  moves        text[] not null,            -- UCI, opponent's move first
  rating       integer not null,
  rating_dev   integer,
  popularity   integer,
  nb_plays     integer,
  themes       text[] not null default '{}',
  game_url     text,
  opening_tags text[],
  -- Cheap random sampling: `where rand > random() order by rand limit N`
  -- stays fast at millions of rows, unlike `order by random()` which sorts
  -- the whole filtered set.
  rand         double precision not null default random()
);

alter table public.lichess_puzzles enable row level security;

-- Puzzles are free and playable logged-out — this is the top of the funnel.
drop policy if exists "Lichess puzzles are viewable by everyone" on public.lichess_puzzles;
create policy "Lichess puzzles are viewable by everyone"
  on public.lichess_puzzles for select
  using (true);

-- Import is done server-side with the service_role key, which bypasses RLS,
-- so no client-facing insert/update/delete policy is granted at all.

create index if not exists lichess_puzzles_themes_idx  on public.lichess_puzzles using gin (themes);
create index if not exists lichess_puzzles_rating_idx  on public.lichess_puzzles (rating);
create index if not exists lichess_puzzles_rand_idx    on public.lichess_puzzles (rand);
-- Covers the hot query shape: theme filter + rating band + random pick.
create index if not exists lichess_puzzles_rating_rand_idx on public.lichess_puzzles (rating, rand);

-- ------------------------------------------------------------
-- Random sampling RPC
-- ------------------------------------------------------------
-- Called by the frontend (or backend) instead of hand-rolling the random
-- trick at every call site. STABLE + SECURITY INVOKER: RLS still applies.
create or replace function public.random_puzzles(
  p_themes     text[] default null,
  p_min_rating integer default 0,
  p_max_rating integer default 4000,
  p_limit      integer default 20
)
returns setof public.lichess_puzzles
language sql
stable
as $$
  select *
  from public.lichess_puzzles
  where rating between p_min_rating and p_max_rating
    and (p_themes is null or themes @> p_themes)
    and rand > random()
  order by rand
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.random_puzzles(text[], integer, integer, integer)
  to anon, authenticated;

-- Once the frontend reads from lichess_puzzles and you've confirmed it works,
-- retire the old hand-generated table:
--   drop table if exists public.puzzles;
