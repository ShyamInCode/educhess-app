-- ============================================================
-- EDUCHESS — Supabase schema
-- ------------------------------------------------------------
-- How to run this:
--   1. Open your project at https://app.supabase.com
--   2. Go to SQL Editor → New query
--   3. Paste this whole file in and click Run
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE
-- / DROP ... IF EXISTS guards.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles — one row per signed-up user, linked to Supabase Auth
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text,
  grade        text,
  rank_points  integer not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profiles row the moment someone signs up via Supabase Auth.
-- `name` is pulled from the signup metadata EduChess sends (options.data.name).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data ->> 'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 2. quest_progress — which quests each user has cleared
-- ------------------------------------------------------------
create table if not exists public.quest_progress (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  subject        text not null,
  quest_key      text not null,
  points         integer not null default 0,
  completed_at   timestamptz not null default now(),
  unique (user_id, quest_key)
);

alter table public.quest_progress enable row level security;

drop policy if exists "Users can view their own quest progress" on public.quest_progress;
create policy "Users can view their own quest progress"
  on public.quest_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own quest progress" on public.quest_progress;
create policy "Users can insert their own quest progress"
  on public.quest_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own quest progress" on public.quest_progress;
create policy "Users can update their own quest progress"
  on public.quest_progress for update
  using (auth.uid() = user_id);

-- Whenever a quest is logged, add its points onto the user's profile.
create or replace function public.handle_quest_completed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set rank_points = rank_points + new.points
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_quest_completed on public.quest_progress;
create trigger on_quest_completed
  after insert on public.quest_progress
  for each row execute procedure public.handle_quest_completed();

-- ------------------------------------------------------------
-- 3. contact_submissions — entries from the "Talk to us" / Contact forms
-- ------------------------------------------------------------
create table if not exists public.contact_submissions (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users (id) on delete set null,
  name         text not null,
  grade        text,
  email        text not null,
  struggles    text,
  created_at   timestamptz not null default now()
);

alter table public.contact_submissions enable row level security;

-- Anyone (including logged-out visitors) can submit the contact form.
drop policy if exists "Anyone can submit a contact form" on public.contact_submissions;
create policy "Anyone can submit a contact form"
  on public.contact_submissions for insert
  with check (true);

-- Only the row's own user (if any) can read their past submissions back.
drop policy if exists "Users can view their own submissions" on public.contact_submissions;
create policy "Users can view their own submissions"
  on public.contact_submissions for select
  using (auth.uid() = user_id);
