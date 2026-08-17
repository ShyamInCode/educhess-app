-- ============================================================
-- EDUCHESS — Admin role + video library migration
-- ------------------------------------------------------------
-- Run this AFTER schema.sql. Adds what AdminPanel.jsx needs:
--   1. profiles.role — gates the Admin Panel (profile.role === 'admin')
--   2. public.videos — metadata for every uploaded course video
--   3. Storage bucket "course-videos" + RLS so only admins can
--      upload, but anyone can stream (public CDN playback)
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE
-- / DROP ... IF EXISTS guards.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles.role
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'student';

-- Optional: promote your own account to admin once you know your user id.
-- update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000000';

-- ------------------------------------------------------------
-- 2. videos — one row per uploaded/seeded course video
-- ------------------------------------------------------------
create table if not exists public.videos (
  id             bigint generated always as identity primary key,
  title          text not null,
  category       text not null check (category in ('chess', 'maths', 'english')),
  url            text not null,
  storage_path   text,
  uploaded_by    uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.videos enable row level security;

drop policy if exists "Videos are viewable by everyone" on public.videos;
create policy "Videos are viewable by everyone"
  on public.videos for select
  using (true);

drop policy if exists "Only admins can insert videos" on public.videos;
create policy "Only admins can insert videos"
  on public.videos for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can delete videos" on public.videos;
create policy "Only admins can delete videos"
  on public.videos for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 3. Storage bucket + policies
-- ------------------------------------------------------------
-- Create the bucket itself (id and name must match VIDEO_BUCKET in
-- src/lib/media.js — currently "course-videos"). Public so the CDN
-- URL works directly in <video src="...">.
insert into storage.buckets (id, name, public)
values ('course-videos', 'course-videos', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to course videos" on storage.objects;
create policy "Public read access to course videos"
  on storage.objects for select
  using (bucket_id = 'course-videos');

drop policy if exists "Admins can upload course videos" on storage.objects;
create policy "Admins can upload course videos"
  on storage.objects for insert
  with check (
    bucket_id = 'course-videos'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Admins can delete course videos" on storage.objects;
create policy "Admins can delete course videos"
  on storage.objects for delete
  using (
    bucket_id = 'course-videos'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
