-- ============================================================
-- EDUCHESS — Tournaments migration
-- ------------------------------------------------------------
-- Run this AFTER schema.sql and migration_admin_videos.sql (it
-- reuses the admin-role RLS pattern from that file).
--
-- What this adds:
--   1. public.tournaments — upcoming online/offline tournament
--      listings, admin-managed.
--   2. public.tournament_registrations — child/parent registration
--      details submitted from the public Tournaments page. Anyone
--      (including logged-out visitors) can register, same open-insert
--      pattern as contact_submissions.
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE
-- / DROP ... IF EXISTS guards.
-- ============================================================

-- ------------------------------------------------------------
-- 1. tournaments
-- ------------------------------------------------------------
create table if not exists public.tournaments (
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

alter table public.tournaments enable row level security;

drop policy if exists "Published tournaments are viewable by everyone" on public.tournaments;
create policy "Published tournaments are viewable by everyone"
  on public.tournaments for select
  using (published = true);

drop policy if exists "Admins can view all tournaments" on public.tournaments;
create policy "Admins can view all tournaments"
  on public.tournaments for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can insert tournaments" on public.tournaments;
create policy "Only admins can insert tournaments"
  on public.tournaments for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can delete tournaments" on public.tournaments;
create policy "Only admins can delete tournaments"
  on public.tournaments for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 2. tournament_registrations
-- ------------------------------------------------------------
create table if not exists public.tournament_registrations (
  id             bigint generated always as identity primary key,
  tournament_id  bigint not null references public.tournaments (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  child_name     text not null,
  grade          text,
  parent_name    text not null,
  parent_email   text not null,
  parent_phone   text,
  notes          text,
  created_at     timestamptz not null default now()
);

alter table public.tournament_registrations enable row level security;

drop policy if exists "Anyone can register for a tournament" on public.tournament_registrations;
create policy "Anyone can register for a tournament"
  on public.tournament_registrations for insert
  with check (true);

drop policy if exists "Users can view their own registrations" on public.tournament_registrations;
create policy "Users can view their own registrations"
  on public.tournament_registrations for select
  using (auth.uid() = user_id);

drop policy if exists "Admins can view all registrations" on public.tournament_registrations;
create policy "Admins can view all registrations"
  on public.tournament_registrations for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
