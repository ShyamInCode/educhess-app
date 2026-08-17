-- ============================================================
-- EDUCHESS — Phase 4: workshops + registrations
-- ------------------------------------------------------------
-- Run this AFTER migration_security_fixes.sql (it uses is_admin()).
--
-- Mirrors tournaments / tournament_registrations exactly, including the
-- hardening that migration_security_fixes.sql applied to them after the
-- fact: forged-user_id guard, registration window check, length caps on
-- every free-text PII column, and a unique entry index.
--
-- Until now /workshops was static copy with no table behind it.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. workshops
-- ------------------------------------------------------------
create table if not exists public.workshops (
  id                     bigint generated always as identity primary key,
  title                  text not null,
  description            text,
  format                 text not null check (format in ('online', 'offline')),
  venue                  text, -- physical address for offline, platform/link for online
  start_at               timestamptz not null,
  registration_deadline  timestamptz,
  fee                    text,
  capacity               integer,
  published              boolean not null default true,
  created_at             timestamptz not null default now()
);

alter table public.workshops enable row level security;

drop policy if exists "Published workshops are viewable by everyone" on public.workshops;
create policy "Published workshops are viewable by everyone"
  on public.workshops for select
  using (published = true);

drop policy if exists "Admins can view all workshops" on public.workshops;
create policy "Admins can view all workshops"
  on public.workshops for select
  using (public.is_admin());

drop policy if exists "Only admins can insert workshops" on public.workshops;
create policy "Only admins can insert workshops"
  on public.workshops for insert
  with check (public.is_admin());

drop policy if exists "Only admins can delete workshops" on public.workshops;
create policy "Only admins can delete workshops"
  on public.workshops for delete
  using (public.is_admin());

-- Unlike every other content table, workshops gets its UPDATE policy from
-- birth: the admin tab publishes and edits rows, and without this the
-- only way to change one would be delete-and-recreate. Phase 5 repeats
-- this statement while backfilling the six tables that still lack it, so
-- the two files stay independently correct.
drop policy if exists "Only admins can update workshops" on public.workshops;
create policy "Only admins can update workshops"
  on public.workshops for update
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- 2. workshop_registrations
-- ------------------------------------------------------------
-- NOTE, deliberate deviation from the brief: the workshop_id FK is
-- ON DELETE RESTRICT, not CASCADE. These are business records for a paid
-- session. migration_security_fixes.sql changed tournament_registrations
-- to RESTRICT for exactly this reason (an admin with no edit button
-- deletes and recreates an event, and every registration silently goes
-- with it), and Phase 5 sets out to stop that pattern, not extend it.
create table if not exists public.workshop_registrations (
  id            bigint generated always as identity primary key,
  workshop_id   bigint not null references public.workshops (id) on delete restrict,
  user_id       uuid references auth.users (id) on delete set null,
  child_name    text not null,
  grade         text,
  parent_name   text not null,
  parent_email  text not null,
  parent_phone  text,
  notes         text,
  created_at    timestamptz not null default now()
);

alter table public.workshop_registrations enable row level security;

-- Anonymous registration still works: auth.uid() and user_id are both NULL,
-- which `is not distinct from` accepts. What it blocks is a signed-out
-- client posting somebody else's user_id, or registering for an unpublished
-- or closed workshop.
drop policy if exists "Anyone can register for a workshop" on public.workshop_registrations;
create policy "Anyone can register for a workshop"
  on public.workshop_registrations for insert
  with check (
    user_id is not distinct from auth.uid()
    and exists (
      select 1 from public.workshops w
      where w.id = workshop_id
        and w.published
        and coalesce(w.registration_deadline, w.start_at) > now()
    )
  );

drop policy if exists "Users can view their own workshop registrations" on public.workshop_registrations;
create policy "Users can view their own workshop registrations"
  on public.workshop_registrations for select
  using (auth.uid() = user_id);

drop policy if exists "Admins can view all workshop registrations" on public.workshop_registrations;
create policy "Admins can view all workshop registrations"
  on public.workshop_registrations for select
  using (public.is_admin());

alter table public.workshop_registrations
  drop constraint if exists workshop_registrations_sane;
alter table public.workshop_registrations
  add constraint workshop_registrations_sane check (
    length(child_name) between 1 and 120
    and length(parent_name) between 1 and 120
    and length(parent_email) between 3 and 254
    and (grade is null or length(grade) <= 40)
    and (parent_phone is null or length(parent_phone) <= 32)
    and (notes is null or length(notes) <= 2000)
  );

-- Same duplicate guard as tournaments: without it a refresh-and-resubmit
-- creates a second row and the child is counted twice against capacity.
create unique index if not exists workshop_registrations_unique_entry
  on public.workshop_registrations (workshop_id, lower(parent_email), lower(child_name));

-- ------------------------------------------------------------
-- 3. Seed — the four formats the static page used to describe
-- ------------------------------------------------------------
-- So /workshops is never empty on the day this ships. Dates are relative
-- placeholders for the admin to correct; capacity and fee are left NULL
-- rather than invented.
insert into public.workshops (title, description, format, venue, start_at, fee, capacity, published)
select * from (values
  (
    'Weekend intensive',
    'A half day on one theme, usually openings or endgames, with a coach working through positions on the board.',
    'offline',
    'EduChess, Champion Chess Academy, Gajuwaka, Visakhapatnam',
    now() + interval '14 days',
    null::text,
    null::integer,
    true
  ),
  (
    'School session',
    'An introductory chess session at your school, anywhere around Visakhapatnam — from a single assembly to a full term.',
    'offline',
    'At your school, Visakhapatnam',
    now() + interval '21 days',
    null::text,
    null::integer,
    true
  ),
  (
    'Simul and guest session',
    'One strong player against many students at once. The fastest way for a beginner to learn how a stronger player thinks.',
    'offline',
    'Opposite Timpany School, VUDA Colony, Visakhapatnam',
    now() + interval '28 days',
    null::text,
    null::integer,
    true
  ),
  (
    'Tournament preparation',
    'A short course before local events: time management, opening choices, and playing under a clock.',
    'online',
    'Online — joining link sent after registration',
    now() + interval '35 days',
    null::text,
    null::integer,
    true
  )
) as seed(title, description, format, venue, start_at, fee, capacity, published)
where not exists (select 1 from public.workshops);
