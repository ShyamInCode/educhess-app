-- ============================================================
-- EDUCHESS — 00. Teardown (PATH A ONLY)
-- ------------------------------------------------------------
-- Run this FIRST, and only when rebuilding an EXISTING Supabase project
-- onto the baseline. On a brand-new project (Path B) skip straight to
-- 01_schema.sql — there is nothing to tear down.
--
-- WHAT THIS DOES NOT DO: it does not drop a single table that holds data
-- you want. No content is deleted. No puzzles are deleted. No accounts are
-- deleted. It removes the OLD BEHAVIOUR — policies, trigger functions and
-- two genuinely dead tables — so that 01-04 rebuild it cleanly rather than
-- layering on top of it.
--
-- Why it has to exist at all: RLS SELECT policies are OR'd together. A
-- forgotten policy from the old schema does not sit inert, it WIDENS access.
-- Two in particular would silently undo the whole point of the rebuild:
--   * "Public read access to course videos" — unconditional read on the
--     course-videos bucket, which keeps every paid video world-readable
--     however good the new policy is (audit SEC-02).
--   * "Anyone can register for a tournament" / "...workshop" — a direct
--     INSERT path that walks straight past register_for_event()'s lock,
--     capacity check, duplicate message and rate limit (audit SEC-03).
--
-- The last section reports anything in the database the baseline does not
-- define, so drift is visible instead of assumed absent.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Every policy in public, and on storage.objects
-- ------------------------------------------------------------
-- 03 and 04 each do this again for their own scope; doing it here as well
-- means a half-finished session cannot leave a mixed old/new policy set.
do $$
declare
  r record;
  n integer := 0;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    n := n + 1;
  end loop;
  raise notice 'Teardown: dropped % policies in public.', n;
end;
$$;

-- If this raises a permission error, your SQL Editor role does not own
-- storage.objects. Remove the old policies from the dashboard instead
-- (Storage -> Policies), then carry on. Do not skip it.
do $$
declare
  r record;
  n integer := 0;
begin
  for r in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
    n := n + 1;
  end loop;
  raise notice 'Teardown: dropped % policies on storage.objects.', n;
end;
$$;

-- ------------------------------------------------------------
-- 2. Triggers and the functions behind them
-- ------------------------------------------------------------
-- The enforcement moved out of triggers and into two SECURITY DEFINER
-- functions that own the whole operation (register_for_event, and delivery
-- metering inside random_puzzles_for_user). Leaving the old triggers in
-- place would double-check registrations and would re-impose the lockless
-- puzzle cap the baseline replaced.
drop trigger if exists enforce_tournament_registration_trg on public.tournament_registrations;
drop trigger if exists enforce_workshop_registration_trg   on public.workshop_registrations;
drop trigger if exists enforce_puzzle_quota_trg            on public.puzzle_attempts;
drop trigger if exists on_quest_completed                  on public.quest_progress;

drop function if exists public.enforce_tournament_registration() cascade;
drop function if exists public.enforce_workshop_registration()   cascade;
drop function if exists public.enforce_puzzle_quota()            cascade;
drop function if exists public.handle_quest_completed()          cascade;

-- ------------------------------------------------------------
-- 3. Functions with no place in a frontend-only architecture
-- ------------------------------------------------------------
-- record_razorpay_payment() was called by the razorpay-webhook Edge
-- Function with the service-role key. There is no Edge Function now, so this
-- is an orphaned grant to service_role on a function that hands out paid
-- memberships. Payments are stubbed; the schema keeps the table, not the
-- activation path.
drop function if exists public.record_razorpay_payment(text, text);

-- Changes return type (setof lichess_puzzles -> json), and Postgres will not
-- replace a function's return type in place.
drop function if exists public.random_puzzles_for_user(text[], integer, integer, integer);

-- ------------------------------------------------------------
-- 4. The two dead tables
-- ------------------------------------------------------------
-- quest_progress (audit DB-06): no React code reads or writes it — verified
-- across all 68 files in src/ — but it stayed a live, self-writable surface.
-- Its INSERT policy plus AFTER INSERT trigger let any signed-in user award
-- themselves up to 50 rank_points per invented quest_key, for a feature the
-- app no longer shows.
--
-- puzzles: the retired hand-generated set, superseded by lichess_puzzles and
-- read by nothing.
--
-- If you would rather keep a copy, run these two lines first and the tables
-- survive under new names:
--   alter table if exists public.quest_progress rename to zz_old_quest_progress;
--   alter table if exists public.puzzles        rename to zz_old_puzzles;
drop table if exists public.quest_progress cascade;
drop table if exists public.puzzles        cascade;

-- profiles.rank_points was the value quest_progress fed. 01_schema.sql drops
-- it too; stated here so the teardown reads as a complete account.
alter table if exists public.profiles drop column if exists rank_points;

-- ============================================================
-- 5. DRIFT REPORT — what is in this database that the baseline does not define
-- ============================================================
-- Read both results. Anything listed is something the baseline will not
-- manage: an experiment, a hand-made table, a leftover from an abandoned
-- feature. Decide about each one deliberately. The rebuild does not touch
-- them, which means it also does not protect them.

-- (a) Tables the baseline does not define.
select c.relname as unmanaged_table,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname not in (
     'profiles', 'contact_submissions',
     'tournaments', 'tournament_registrations',
     'workshops', 'workshop_registrations',
     'event_meeting_links', 'registration_rate_limit',
     'course_chapters', 'videos',
     'carousel_slides', 'gallery_images', 'testimonials',
     'lichess_puzzles', 'puzzle_attempts', 'puzzle_allowance',
     'payments'
   )
 order by c.relname;

-- (b) Functions the baseline does not define.
select p.proname as unmanaged_function,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname not in (
     'is_admin', 'handle_new_user',
     'tier_rank', 'tier_daily_puzzles', 'current_tier', 'ist_today',
     'random_puzzles', 'random_puzzles_for_user', 'puzzle_quota', 'puzzle_stats',
     'tournament_spots_left', 'workshop_spots_left',
     'register_for_event', 'event_meeting_url', 'admin_set_meeting_url',
     'admin_list_members', 'admin_set_tier', 'event_registration_counts',
     'can_read_course_object'
   )
 order by p.proname;

-- ============================================================
-- Teardown complete. Now run 01_schema.sql.
-- ============================================================
