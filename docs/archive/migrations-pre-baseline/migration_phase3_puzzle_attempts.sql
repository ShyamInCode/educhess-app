-- ============================================================
-- EDUCHESS — Phase 3: puzzle attempt tracking
-- ------------------------------------------------------------
-- Run this AFTER migration_lichess_puzzles.sql (it references
-- lichess_puzzles) and migration_security_fixes.sql (is_admin()).
--
-- What this adds:
--   1. public.puzzle_attempts — one row per concluded puzzle for a
--      signed-in student. This is the first progress data the product
--      has ever kept; the trainer previously recorded nothing.
--   2. public.puzzle_stats() — the dashboard's read side.
--
-- Anonymous visitors are NOT tracked here. Their 5-a-day cap lives in
-- localStorage and is a conversion nudge, not a security boundary —
-- see src/lib/puzzleProgress.js.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. puzzle_attempts
-- ------------------------------------------------------------
create table if not exists public.puzzle_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  puzzle_id   text not null references public.lichess_puzzles (puzzle_id),
  solved      boolean not null,
  category    text,
  difficulty  text,
  created_at  timestamptz not null default now()
);

-- The client spreads its own payload into the insert, so cap the two
-- free-text columns the same way the public forms are capped.
alter table public.puzzle_attempts
  drop constraint if exists puzzle_attempts_sane;
alter table public.puzzle_attempts
  add constraint puzzle_attempts_sane check (
    (category is null or length(category) <= 40)
    and (difficulty is null or length(difficulty) <= 20)
  );

-- Every read is "this user, ordered by time" — the dashboard totals, the
-- streak, and today's count all scan the same slice.
create index if not exists puzzle_attempts_user_created_idx
  on public.puzzle_attempts (user_id, created_at);

alter table public.puzzle_attempts enable row level security;

drop policy if exists "Users can log their own puzzle attempts" on public.puzzle_attempts;
create policy "Users can log their own puzzle attempts"
  on public.puzzle_attempts for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can view their own puzzle attempts" on public.puzzle_attempts;
create policy "Users can view their own puzzle attempts"
  on public.puzzle_attempts for select
  using (user_id = auth.uid());

drop policy if exists "Admins can view all puzzle attempts" on public.puzzle_attempts;
create policy "Admins can view all puzzle attempts"
  on public.puzzle_attempts for select
  using (public.is_admin());

-- No UPDATE or DELETE policy: an attempt is a fact about what happened,
-- and nothing in the product edits one.

-- ------------------------------------------------------------
-- 2. puzzle_stats() — the dashboard's read side
-- ------------------------------------------------------------
-- SECURITY INVOKER on purpose: RLS still applies, so this can only ever
-- return the caller's own rows even if the WHERE clause were dropped.
--
-- Days are bucketed in Asia/Kolkata, not UTC. Bucketing by UTC would end
-- a Visakhapatnam student's day at 5:30 AM local and silently break every
-- streak they build in the evening.
create or replace function public.puzzle_stats()
returns json
language sql
security invoker
stable
set search_path = public
as $$
  with attempts as (
    select
      solved,
      coalesce(category, 'other') as category,
      (timezone('Asia/Kolkata', created_at))::date as day
    from public.puzzle_attempts
    where user_id = auth.uid()
  ),
  today as (
    select (timezone('Asia/Kolkata', now()))::date as d
  ),
  solved_days as (
    select distinct day from attempts where solved
  ),
  -- Classic gaps-and-islands: consecutive dates share (day - row_number),
  -- so each group is one unbroken run. Keep only the run that reaches
  -- today or yesterday — that is the streak still alive. Yesterday counts
  -- so the number doesn't read as 0 first thing in the morning.
  runs as (
    select grp, count(*)::int as len, max(day) as last_day
    from (
      select day, day - (row_number() over (order by day))::int as grp
      from solved_days
    ) g
    group by grp
  ),
  current_streak as (
    select coalesce(max(len), 0) as len
    from runs, today
    where runs.last_day >= today.d - 1
  ),
  per_category as (
    select category, count(*)::int as solved
    from attempts
    where solved
    group by category
  )
  select json_build_object(
    'total_attempted', (select count(*)::int from attempts),
    'total_solved',    (select count(*)::int from attempts where solved),
    'solved_today',    (select count(*)::int from attempts, today where solved and day = today.d),
    'streak',          (select len from current_streak),
    'by_category',     coalesce(
                         (select json_agg(json_build_object('category', category, 'solved', solved)
                                          order by solved desc, category)
                          from per_category),
                         '[]'::json
                       )
  );
$$;

revoke all on function public.puzzle_stats() from public, anon;
grant execute on function public.puzzle_stats() to authenticated;
