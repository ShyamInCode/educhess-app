-- ============================================================
-- EDUCHESS — 03. Row Level Security
-- ------------------------------------------------------------
-- Run AFTER 02_functions.sql.
--
-- The whole policy matrix, stated once, explicitly, per table x operation.
-- Read this file as the answer to "who can do what": if an operation is not
-- named here, it is denied, because 01_schema.sql enabled RLS on every table
-- and RLS with no matching policy is a refusal.
--
-- Two rules the old schema broke and this one keeps:
--   * Every admin check is `public.is_admin()`. There are ZERO inline
--     `exists (select 1 from profiles where ... role = 'admin')` subqueries
--     (audit SEC-06) — there were about twenty, and changing what admin
--     meant would have meant editing all of them.
--   * `using (true)` appears only on content that is genuinely public to
--     read. Every such case is named and justified below.
--
-- The file ends with a self-check block that fails loudly if any table lost
-- its RLS, then prints the policy count per table.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Clear the board
-- ------------------------------------------------------------
-- Drop EVERY existing policy in `public` before creating the new set, rather
-- than dropping the ones we happen to remember by name. On an existing
-- project the old policies are still there under their old names, and one of
-- them — "Anyone can register for a tournament" — would silently reopen the
-- direct INSERT path that register_for_event() exists to close. A stale
-- policy is not inert: SELECT policies are OR'd together, so a forgotten one
-- widens access rather than narrowing it.
do $$
declare
  r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 1. profiles
-- ------------------------------------------------------------
-- SELECT: own row, or any row if admin. It was `using (true)` once, which
-- published every enrolled child's name, grade, sign-up date and auth user
-- id to anonymous callers.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy "profiles_select_admin" on public.profiles
  for select to authenticated
  using (public.is_admin());

-- INSERT (audit SEC-05): handle_new_user() creates this row inside the
-- sign-up transaction, so the client never needs to. The policy stays as a
-- narrow fallback rather than being removed, and it pins the three columns
-- that decide privilege. Without the pin, a client that ever found itself
-- able to insert could arrive as role='admin', tier='academy'.
create policy "profiles_insert_own_student" on public.profiles
  for insert to authenticated
  with check (
    auth.uid() = id
    and role = 'student'
    and tier = 'free'
    and tier_expires_at is null
  );

-- UPDATE: own row only, and — the part that actually matters — only three
-- columns, enforced by the column-level GRANT below rather than by this
-- policy. WITH CHECK stops the row being re-owned on the way out.
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No DELETE policy: a profile disappears with its auth.users row, via the
-- FK cascade, and nothing else should be able to remove one.

-- THE column grant. This, not the policy above, is what stops a student
-- promoting themselves to admin or upgrading themselves to academy from the
-- browser console. Column privileges are checked against the CALLING role,
-- so `role`, `tier` and `tier_expires_at` are unwritable from the browser
-- while SECURITY DEFINER functions (admin_set_tier) still reach them.
--
-- If you add a column the client must write, name it here or the write
-- silently no-ops. That has bitten this project once already.
revoke update on public.profiles from anon, authenticated;
grant  update (name, grade, consent_at) on public.profiles to authenticated;
revoke insert on public.profiles from anon;

-- ------------------------------------------------------------
-- 2. contact_submissions
-- ------------------------------------------------------------
-- Anonymous submission still works: auth.uid() and user_id are both NULL,
-- which `is not distinct from` accepts. What it blocks is a caller posting
-- somebody else's user_id and having the enquiry attributed to them.
create policy "contact_insert_anyone" on public.contact_submissions
  for insert to anon, authenticated
  with check (user_id is not distinct from auth.uid());

create policy "contact_select_own" on public.contact_submissions
  for select to authenticated
  using (auth.uid() = user_id);

create policy "contact_select_admin" on public.contact_submissions
  for select to authenticated
  using (public.is_admin());

-- No UPDATE, no DELETE. An enquiry is a record of something someone sent.

-- ------------------------------------------------------------
-- 3. tournaments and workshops
-- ------------------------------------------------------------
create policy "tournaments_select_published" on public.tournaments
  for select to anon, authenticated
  using (published);

create policy "tournaments_select_admin" on public.tournaments
  for select to authenticated
  using (public.is_admin());

create policy "tournaments_insert_admin" on public.tournaments
  for insert to authenticated with check (public.is_admin());

-- USING and WITH CHECK both, on every admin UPDATE: USING alone would let an
-- admin edit a row into a shape the policy would not have allowed them to
-- see in the first place.
create policy "tournaments_update_admin" on public.tournaments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "tournaments_delete_admin" on public.tournaments
  for delete to authenticated using (public.is_admin());

create policy "workshops_select_published" on public.workshops
  for select to anon, authenticated
  using (published);

create policy "workshops_select_admin" on public.workshops
  for select to authenticated
  using (public.is_admin());

create policy "workshops_insert_admin" on public.workshops
  for insert to authenticated with check (public.is_admin());

create policy "workshops_update_admin" on public.workshops
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "workshops_delete_admin" on public.workshops
  for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- 4. Registrations — read-only to clients, written only by RPC
-- ------------------------------------------------------------
-- There is deliberately NO INSERT policy on either table. Rows arrive only
-- through public.register_for_event(), which owns the row lock, the capacity
-- check, the duplicate message and the rate limit. A direct INSERT would
-- walk past all four, so it is refused rather than merely discouraged.
--
-- No UPDATE and no DELETE either: a registration is a business record for an
-- event a parent booked. Admins manage events, not other people's bookings.
create policy "tournament_registrations_select_own" on public.tournament_registrations
  for select to authenticated
  using (auth.uid() = user_id);

create policy "tournament_registrations_select_admin" on public.tournament_registrations
  for select to authenticated
  using (public.is_admin());

create policy "workshop_registrations_select_own" on public.workshop_registrations
  for select to authenticated
  using (auth.uid() = user_id);

create policy "workshop_registrations_select_admin" on public.workshop_registrations
  for select to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------
-- 5. The three DEFINER-only tables — no policies at all
-- ------------------------------------------------------------
-- event_meeting_links, registration_rate_limit and puzzle_allowance carry no
-- policy in any direction. RLS is on, so that is a total refusal for every
-- client role, and the only way in is the SECURITY DEFINER functions in 02.
--
-- The REVOKEs are belt and braces: Supabase grants table privileges to anon
-- and authenticated by default and relies on RLS to gate them. Removing the
-- privilege as well means these three stay closed even if RLS were ever
-- switched off on one of them by accident.
revoke all on public.event_meeting_links      from anon, authenticated;
revoke all on public.registration_rate_limit  from anon, authenticated;
revoke all on public.puzzle_allowance         from anon, authenticated;

-- ------------------------------------------------------------
-- 6. puzzle_attempts
-- ------------------------------------------------------------
-- The client still logs its own attempts — that is what feeds the dashboard
-- streak. It no longer decides anything: the allowance is metered at
-- delivery in random_puzzles_for_user(), so a client that logs nothing gets
-- an accurate streak of zero and exactly the same number of puzzles.
create policy "puzzle_attempts_insert_own" on public.puzzle_attempts
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "puzzle_attempts_select_own" on public.puzzle_attempts
  for select to authenticated
  using (user_id = auth.uid());

create policy "puzzle_attempts_select_admin" on public.puzzle_attempts
  for select to authenticated
  using (public.is_admin());

-- No UPDATE, no DELETE: an attempt is a fact about what happened.

-- ------------------------------------------------------------
-- 7. payments — readable, never writable by a client
-- ------------------------------------------------------------
-- Payments are stubbed: nothing writes here in this architecture. The read
-- policies exist so the admin Members tab and a member's own dashboard can
-- show a ledger the day one exists. There is deliberately no INSERT and no
-- UPDATE policy — a client that could write here could grant itself a
-- membership, and that must stay impossible whatever happens later.
create policy "payments_select_own" on public.payments
  for select to authenticated
  using (auth.uid() = user_id);

create policy "payments_select_admin" on public.payments
  for select to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------
-- 8. Course content — public to list, gated to watch
-- ------------------------------------------------------------
-- `using (true)` here is intentional and is NOT the paywall. These rows are
-- the course outline: chapter titles, video titles, and the object path a
-- video lives at. The paywall is in 04_storage.sql, on the object itself —
-- knowing the name of a file you cannot read is harmless, and the chapter
-- list has to render (with padlocks) for a visitor deciding whether to pay.
--
-- This is the change that makes audit SEC-02 fixable at all: the old `videos`
-- table carried a `url` column holding a public CDN link, so "world-readable
-- listing" and "world-readable video" were the same thing. The column is gone.
create policy "course_chapters_select_all" on public.course_chapters
  for select to anon, authenticated using (true);

create policy "course_chapters_insert_admin" on public.course_chapters
  for insert to authenticated with check (public.is_admin());

create policy "course_chapters_update_admin" on public.course_chapters
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "course_chapters_delete_admin" on public.course_chapters
  for delete to authenticated using (public.is_admin());

create policy "videos_select_all" on public.videos
  for select to anon, authenticated using (true);

create policy "videos_insert_admin" on public.videos
  for insert to authenticated with check (public.is_admin());

create policy "videos_update_admin" on public.videos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "videos_delete_admin" on public.videos
  for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- 9. Marketing content
-- ------------------------------------------------------------
create policy "carousel_select_published" on public.carousel_slides
  for select to anon, authenticated using (published);

create policy "carousel_select_admin" on public.carousel_slides
  for select to authenticated using (public.is_admin());

create policy "carousel_insert_admin" on public.carousel_slides
  for insert to authenticated with check (public.is_admin());

create policy "carousel_update_admin" on public.carousel_slides
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "carousel_delete_admin" on public.carousel_slides
  for delete to authenticated using (public.is_admin());

create policy "gallery_select_published" on public.gallery_images
  for select to anon, authenticated using (published);

create policy "gallery_select_admin" on public.gallery_images
  for select to authenticated using (public.is_admin());

create policy "gallery_insert_admin" on public.gallery_images
  for insert to authenticated with check (public.is_admin());

create policy "gallery_update_admin" on public.gallery_images
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "gallery_delete_admin" on public.gallery_images
  for delete to authenticated using (public.is_admin());

create policy "testimonials_select_published" on public.testimonials
  for select to anon, authenticated using (published);

create policy "testimonials_select_admin" on public.testimonials
  for select to authenticated using (public.is_admin());

create policy "testimonials_insert_admin" on public.testimonials
  for insert to authenticated with check (public.is_admin());

create policy "testimonials_update_admin" on public.testimonials
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "testimonials_delete_admin" on public.testimonials
  for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- 10. lichess_puzzles
-- ------------------------------------------------------------
-- `using (true)`, and this one is genuinely public: it is CC0 data from
-- database.lichess.org. What is metered is DELIVERY through
-- random_puzzles_for_user(), not the existence of the rows — and the client
-- has no way to read them directly, because there is no `.from()` path in
-- the app and the sampling function's EXECUTE is revoked from every client
-- role in 02_functions.sql.
create policy "lichess_puzzles_select_all" on public.lichess_puzzles
  for select to anon, authenticated using (true);

-- No client write policy at all: the import runs with the service_role key,
-- which bypasses RLS.

-- ============================================================
-- 11. SELF-CHECK — this file fails loudly rather than quietly
-- ============================================================
-- Three assertions. If any raises, STOP: do not run 04, and do not treat the
-- reset as done. Each names exactly what is wrong.

-- (a) Every table in `public` has RLS enabled.
do $$
declare
  bad text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;

  if bad is not null then
    raise exception 'RLS SELF-CHECK FAILED: row level security is OFF on: %', bad;
  end if;
  raise notice 'RLS self-check (a): row level security is enabled on every public table.';
end;
$$;

-- (b) No table is left with RLS on and no policy AND no explicit revoke —
--     i.e. every table is either policied, or deliberately DEFINER-only.
do $$
declare
  expected_definer_only constant text[] :=
    array['event_meeting_links', 'registration_rate_limit', 'puzzle_allowance'];
  bad text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname)
     and not (c.relname = any (expected_definer_only));

  if bad is not null then
    raise exception 'RLS SELF-CHECK FAILED: these tables have RLS on but no policy, and are not on the DEFINER-only list: %', bad;
  end if;
  raise notice 'RLS self-check (b): the only policy-free tables are the three DEFINER-only ones.';
end;
$$;

-- (c) No policy anywhere still inlines the admin role subquery (audit SEC-06).
do $$
declare
  bad text;
begin
  select string_agg(tablename || '.' || policyname, ', ')
    into bad
    from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%role%=%admin%';

  if bad is not null then
    raise exception 'RLS SELF-CHECK FAILED: policies still inline the admin check instead of is_admin(): %', bad;
  end if;
  raise notice 'RLS self-check (c): every admin check goes through is_admin().';
end;
$$;

-- (d) The report. Read it: the counts should match the matrix above, and
--     the three DEFINER-only tables should read 0.
select
  c.relname                                       as table_name,
  c.relrowsecurity                                as rls_enabled,
  count(p.policyname)                             as policies,
  count(*) filter (where p.cmd = 'SELECT')        as select_policies,
  count(*) filter (where p.cmd = 'INSERT')        as insert_policies,
  count(*) filter (where p.cmd = 'UPDATE')        as update_policies,
  count(*) filter (where p.cmd = 'DELETE')        as delete_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relname;
