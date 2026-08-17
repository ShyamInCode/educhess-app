-- ============================================================
-- Replace public.random_puzzles — sampling fix
-- ============================================================
-- Safe to re-run. Only replaces a function; touches no data.
--
-- The original body was:
--
--     select * from public.lichess_puzzles
--     where rating between p_min_rating and p_max_rating
--       and (p_themes is null or themes @> p_themes)
--       and rand > random()
--     order by rand
--     limit N
--
-- That is the right shape for sampling an *unfiltered* multi-million-row
-- table (ROADMAP P4-4), but it misbehaves once every call is also highly
-- selective on theme + rating, which is what the UI actually does:
--
--   * `order by rand limit N` can be answered straight from
--     lichess_puzzles_rand_idx, so the planner walks that index hunting for
--     the rare rows matching the theme. For a scarce theme — smotheredMate
--     has 149 rows in the easy band out of 123k total — that means scanning
--     most of the index. Observed: a cold-cache call hit the statement
--     timeout and surfaced as "Couldn't load puzzles" in the trainer.
--
--   * `rand > random()` then throws away ~half of an already tiny pool, so
--     small buckets returned short batches. Observed: 15 and 19 rows when
--     20 were requested (smotheredMate / hard, a 44-row bucket).
--
-- Fix: filter first into a materialised pool, then sample that. The pool is
-- small by construction — the importer caps each (category x difficulty)
-- bucket — so `order by random()` over it is cheap and returns full batches.
--
-- The no-theme branch keeps the original probabilistic cut, because there the
-- candidate set really is the whole table and materialising it would be the
-- expensive option. The UI never takes that branch.
--
-- Declared VOLATILE (not STABLE, as the original was): the body calls
-- random(), so claiming stability invites the planner to treat repeated calls
-- as interchangeable. supabase-js `.rpc()` POSTs, which handles volatile
-- functions fine.
--
-- SECURITY INVOKER (the default) is deliberate — RLS still applies.

create or replace function public.random_puzzles(
  p_themes     text[] default null,
  p_min_rating integer default 0,
  p_max_rating integer default 4000,
  p_limit      integer default 20
)
returns setof public.lichess_puzzles
language plpgsql
volatile
as $$
declare
  v_limit integer := least(greatest(p_limit, 1), 100);
begin
  if p_themes is null or cardinality(p_themes) = 0 then
    return query
      select *
      from public.lichess_puzzles
      where rating between p_min_rating and p_max_rating
        and rand > random()
      order by rand
      limit v_limit;
  else
    return query
      with pool as materialized (
        select *
        from public.lichess_puzzles
        where rating between p_min_rating and p_max_rating
          and themes @> p_themes
      )
      select *
      from pool
      order by random()
      limit v_limit;
  end if;
end;
$$;

-- create or replace preserves grants, but re-stating them keeps this file
-- self-contained if it is ever run against a fresh database.
grant execute on function public.random_puzzles(text[], integer, integer, integer)
  to anon, authenticated;
