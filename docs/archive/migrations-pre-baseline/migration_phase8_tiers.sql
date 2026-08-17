-- ============================================================
-- EDUCHESS — Phase 8: membership tiers (free / pro / academy)
-- ------------------------------------------------------------
-- Run this AFTER migration_phase3_puzzle_attempts.sql.
--
-- The product now has three tiers:
--   free     — 5 puzzles a day, no course videos
--   pro      — 50 puzzles a day, chapters marked 'pro'
--   academy  — unlimited puzzles, every chapter
--
-- The numbers live in tier_daily_puzzles() so the database and the
-- browser cannot disagree about them; src/lib/tiers.js mirrors this
-- function and is only used for what to *display*.
--
-- IMPORTANT, read before relying on chapter gating: `videos` is
-- world-readable and the `course-videos` bucket is public, so the
-- chapter lock is a UI boundary, not a security one. Anyone who reads
-- the network tab can still fetch a locked video's CDN URL. Closing
-- that needs signed URLs — the open item in docs/SYSTEM-OVERVIEW.md §9.
-- The puzzle quota, by contrast, IS enforced server-side below.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles.tier
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists tier text not null default 'free';

alter table public.profiles
  drop constraint if exists profiles_tier_valid;
alter table public.profiles
  add constraint profiles_tier_valid check (tier in ('free', 'pro', 'academy'));

-- Paid access is a month at a time. NULL means "no expiry" — used for
-- comped accounts (coaches, staff, a scholarship student).
alter table public.profiles
  add column if not exists tier_expires_at timestamptz;

-- Deliberately NOT added to the column-level UPDATE grant. The client may
-- write name, grade and consent_at and nothing else, so a student cannot
-- promote themselves to academy from the browser console the way they once
-- could promote themselves to admin (see migration_security_fixes.sql, C1).
-- Tier changes go through admin_set_tier() or the Razorpay webhook.

-- ------------------------------------------------------------
-- 2. The tier table, as functions
-- ------------------------------------------------------------
create or replace function public.tier_rank(p_tier text)
returns integer
language sql
immutable
as $$
  select case p_tier
           when 'academy' then 3
           when 'pro'     then 2
           else 1
         end;
$$;

-- NULL return = unlimited. Callers must test for NULL before comparing.
create or replace function public.tier_daily_puzzles(p_tier text)
returns integer
language sql
immutable
as $$
  select case p_tier
           when 'academy' then null
           when 'pro'     then 50
           else 5
         end::integer;
$$;

-- The caller's tier, with expiry applied. A lapsed pro account reads as
-- free from this moment on, so nothing has to run on a schedule to
-- downgrade anyone — there is no cron on this project.
create or replace function public.current_tier()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select case
               when p.tier = 'free' then 'free'
               when p.tier_expires_at is not null and p.tier_expires_at <= now() then 'free'
               else p.tier
             end
        from public.profiles p
       where p.id = auth.uid()
    ),
    'free'
  );
$$;

revoke all on function public.tier_rank(text) from public;
revoke all on function public.tier_daily_puzzles(text) from public;
revoke all on function public.current_tier() from public, anon;
grant execute on function public.tier_rank(text) to anon, authenticated;
grant execute on function public.tier_daily_puzzles(text) to anon, authenticated;
grant execute on function public.current_tier() to authenticated;

-- ------------------------------------------------------------
-- 3. Daily puzzle quota — enforced, not merely displayed
-- ------------------------------------------------------------
create or replace function public.puzzle_quota()
returns json
language sql
security definer
stable
set search_path = public
as $$
  with lim as (
    select public.current_tier() as tier
  ),
  used as (
    select count(*)::int as n
      from public.puzzle_attempts
     where user_id = auth.uid()
       and (timezone('Asia/Kolkata', created_at))::date
           = (timezone('Asia/Kolkata', now()))::date
  )
  select json_build_object(
    'tier',        lim.tier,
    'daily_limit', public.tier_daily_puzzles(lim.tier),
    'used_today',  used.n,
    'remaining',   case
                     when public.tier_daily_puzzles(lim.tier) is null then null
                     else greatest(0, public.tier_daily_puzzles(lim.tier) - used.n)
                   end
  )
  from lim, used;
$$;

revoke all on function public.puzzle_quota() from public, anon;
grant execute on function public.puzzle_quota() to authenticated;

-- The client counts too, but the client is not the authority. Without this
-- trigger the daily limit is a number in a React component.
create or replace function public.enforce_puzzle_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim  integer;
  used integer;
begin
  lim := public.tier_daily_puzzles(public.current_tier());
  if lim is null then
    return new; -- academy
  end if;

  select count(*) into used
    from public.puzzle_attempts
   where user_id = new.user_id
     and (timezone('Asia/Kolkata', created_at))::date
         = (timezone('Asia/Kolkata', now()))::date;

  if used >= lim then
    raise exception 'PUZZLE_QUOTA_REACHED: daily puzzle limit reached for this account';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_puzzle_quota_trg on public.puzzle_attempts;
create trigger enforce_puzzle_quota_trg
  before insert on public.puzzle_attempts
  for each row execute function public.enforce_puzzle_quota();

-- ------------------------------------------------------------
-- 4. Puzzle delivery goes through the quota
-- ------------------------------------------------------------
-- A wrapper, not a rewrite: random_puzzles() keeps the sampling strategy
-- and the comments explaining why it is shaped the way it is. This only
-- decides whether the caller is allowed a batch at all.
--
-- SECURITY DEFINER because the direct grants on random_puzzles() are
-- revoked below — otherwise the quota would be one console call away from
-- irrelevant.
create or replace function public.random_puzzles_for_user(
  p_themes     text[] default null,
  p_min_rating integer default 0,
  p_max_rating integer default 4000,
  p_limit      integer default 20
)
returns setof public.lichess_puzzles
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  if auth.uid() is null then
    raise exception 'SIGN_IN_REQUIRED: sign in to solve puzzles';
  end if;

  remaining := (public.puzzle_quota() ->> 'remaining')::integer;
  -- NULL remaining = unlimited (academy).
  if remaining is not null and remaining <= 0 then
    raise exception 'PUZZLE_QUOTA_REACHED: daily puzzle limit reached for this account';
  end if;

  return query
    select * from public.random_puzzles(p_themes, p_min_rating, p_max_rating, p_limit);
end;
$$;

revoke all on function public.random_puzzles_for_user(text[], integer, integer, integer) from public, anon;
grant execute on function public.random_puzzles_for_user(text[], integer, integer, integer) to authenticated;

-- Close the side door. Nothing in the app calls random_puzzles() directly
-- any more; leaving it granted would let anyone fetch unlimited puzzles
-- straight from the browser console.
-- PUBLIC too, not just the two roles: Postgres grants EXECUTE to PUBLIC by
-- default when a function is created, and that grant outlives a revoke aimed
-- only at anon and authenticated.
revoke execute on function public.random_puzzles(text[], integer, integer, integer)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. Course chapters carry a minimum tier
-- ------------------------------------------------------------
-- Defaults to 'pro': course video is the paid product, so existing
-- chapters become paid the moment this runs. Mark any taster chapter
-- 'free' from the admin panel afterwards.
alter table public.course_chapters
  add column if not exists min_tier text not null default 'pro';

alter table public.course_chapters
  drop constraint if exists course_chapters_min_tier_valid;
alter table public.course_chapters
  add constraint course_chapters_min_tier_valid check (min_tier in ('free', 'pro', 'academy'));

-- ------------------------------------------------------------
-- 6. Admins set tiers by hand
-- ------------------------------------------------------------
-- For comped accounts and for fixing a payment that went wrong. A plain
-- UPDATE from the browser cannot work: profiles.tier is outside the
-- column-level grant, and that restriction is what keeps students from
-- promoting themselves.
create or replace function public.admin_set_tier(
  p_user_id    uuid,
  p_tier       text,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: admins only';
  end if;
  if p_tier not in ('free', 'pro', 'academy') then
    raise exception 'INVALID_TIER: %', p_tier;
  end if;

  update public.profiles
     set tier = p_tier,
         tier_expires_at = case when p_tier = 'free' then null else p_expires_at end
   where id = p_user_id;
end;
$$;

revoke all on function public.admin_set_tier(uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_set_tier(uuid, text, timestamptz) to authenticated;
