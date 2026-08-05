-- ============================================================
-- EDUCHESS — URGENT SECURITY FIXES
-- ------------------------------------------------------------
-- RUN THIS BEFORE ANY OTHER PENDING MIGRATION.
--
-- A security audit found two critical holes that are exploitable
-- today with nothing but the anon key that ships in the public JS
-- bundle. Both are one-policy fixes and nothing in the current
-- frontend depends on the permissive behaviour.
--
--   C1  Any signed-up user could promote themselves to admin:
--         update profiles set role = 'admin' where id = <self>
--       The "Users can update their own profile" policy had no
--       WITH CHECK and no column restriction, so the only rule
--       enforced was "the row is still yours". Because every admin
--       policy in the project trusts profiles.role, one browser
--       console call granted read access to every contact enquiry
--       and tournament registration (children's names, grades,
--       parent phone/email) plus delete rights on all content.
--
--   C2  profiles was world-readable to ANONYMOUS users:
--         "Profiles are viewable by everyone" using (true)
--       That is a bulk disclosure of every enrolled child's name,
--       school grade, signup date and auth user-id, requiring no
--       login at all. Only AuthContext reads this table, and it
--       only ever reads the caller's own row.
--
-- Also hardens: client-forged user_id on the two public insert
-- endpoints, unbounded rank_points/points writes, and missing
-- length/format constraints on free-text PII columns.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Admin check helper
-- ------------------------------------------------------------
-- SECURITY DEFINER so it bypasses RLS on `profiles`. Without this,
-- an admin-read policy ON profiles that itself queries profiles
-- would recurse infinitely.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ------------------------------------------------------------
-- 1. C2 — stop leaking every child's name and grade publicly
-- ------------------------------------------------------------
drop policy if exists "Profiles are viewable by everyone" on public.profiles;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

-- ------------------------------------------------------------
-- 2. C1 — stop self-promotion to admin and rank_points forgery
-- ------------------------------------------------------------
-- Add the missing WITH CHECK so the row can't be re-owned...
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ...and, more importantly, restrict WHICH COLUMNS a client may write.
-- Column-level grants are checked against the *calling* role, so this
-- blocks the browser while still allowing the SECURITY DEFINER quest
-- trigger below (which runs as the table owner) to update rank_points.
revoke update on public.profiles from authenticated, anon;
grant update (name, grade) on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 3. H1 — bound the client-supplied quest points
-- ------------------------------------------------------------
-- The awarding trigger adds whatever `points` the browser sends. A
-- proper fix moves the value server-side (see docs/ROADMAP.md P0-4);
-- until then, cap the blast radius.
alter table public.quest_progress
  drop constraint if exists quest_progress_points_sane;
alter table public.quest_progress
  add constraint quest_progress_points_sane check (points >= 0 and points <= 50);

alter table public.profiles
  drop constraint if exists profiles_rank_points_nonneg;
alter table public.profiles
  add constraint profiles_rank_points_nonneg check (rank_points >= 0);

-- The UPDATE policy was missing a WITH CHECK too (same class of bug as C1).
-- NOTE: UPDATE privilege itself is deliberately left in place — the client
-- uses upsert(onConflict) to award points, which needs it.
drop policy if exists "Users can update their own quest progress" on public.quest_progress;
create policy "Users can update their own quest progress"
  on public.quest_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4. H3 — stop forged user_id / out-of-window registrations
-- ------------------------------------------------------------
-- Both forms spread the client payload straight into the insert, so
-- every column was attacker-controlled. Anonymous submissions still
-- work: auth.uid() and user_id are both NULL, which satisfies
-- `is not distinct from`.
drop policy if exists "Anyone can submit a contact form" on public.contact_submissions;
create policy "Anyone can submit a contact form"
  on public.contact_submissions for insert
  with check (user_id is not distinct from auth.uid());

drop policy if exists "Anyone can register for a tournament" on public.tournament_registrations;
create policy "Anyone can register for a tournament"
  on public.tournament_registrations for insert
  with check (
    user_id is not distinct from auth.uid()
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.published
        and coalesce(t.registration_deadline, t.start_at) > now()
    )
  );

-- ------------------------------------------------------------
-- 5. Bound the free-text PII columns
-- ------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_name_len;
alter table public.profiles
  add constraint profiles_name_len check (name is null or length(name) <= 80);

alter table public.contact_submissions
  drop constraint if exists contact_submissions_sane;
alter table public.contact_submissions
  add constraint contact_submissions_sane check (
    length(name) between 1 and 120
    and length(email) between 3 and 254
    and (grade is null or length(grade) <= 40)
    and (struggles is null or length(struggles) <= 2000)
  );

alter table public.tournament_registrations
  drop constraint if exists tournament_registrations_sane;
alter table public.tournament_registrations
  add constraint tournament_registrations_sane check (
    length(child_name) between 1 and 120
    and length(parent_name) between 1 and 120
    and length(parent_email) between 3 and 254
    and (grade is null or length(grade) <= 40)
    and (parent_phone is null or length(parent_phone) <= 32)
    and (notes is null or length(notes) <= 2000)
  );

-- ------------------------------------------------------------
-- 6. Stop duplicate tournament registrations
-- ------------------------------------------------------------
-- Previously prevented only by React state, so a refresh + resubmit
-- created duplicate rows.
create unique index if not exists tournament_registrations_unique_entry
  on public.tournament_registrations (tournament_id, lower(parent_email), lower(child_name));

-- ------------------------------------------------------------
-- 7. Don't destroy registrations when a tournament is deleted
-- ------------------------------------------------------------
-- These are business records for a paid event; cascade-delete behind a
-- single window.confirm() is not recoverable.
alter table public.tournament_registrations
  drop constraint if exists tournament_registrations_tournament_id_fkey;
alter table public.tournament_registrations
  add constraint tournament_registrations_tournament_id_fkey
  foreign key (tournament_id) references public.tournaments (id) on delete restrict;
