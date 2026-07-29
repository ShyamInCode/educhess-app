-- ============================================================
-- EDUCHESS — Testimonials + Gallery migration
-- ------------------------------------------------------------
-- Run this AFTER schema.sql and migration_admin_videos.sql (it
-- reuses the admin-role RLS pattern from that file).
--
-- What this adds:
--   1. public.testimonials — replaces the hardcoded TESTIMONIALS
--      array in mockData.js with admin-manageable content.
--   2. public.gallery_images — photo gallery metadata.
--   3. Storage bucket "gallery-images" + RLS, mirroring the
--      "course-videos" bucket setup in migration_admin_videos.sql.
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE
-- / DROP ... IF EXISTS guards.
-- ============================================================

-- ------------------------------------------------------------
-- 1. testimonials
-- ------------------------------------------------------------
create table if not exists public.testimonials (
  id           bigint generated always as identity primary key,
  name         text not null,
  role         text,
  quote        text not null,
  rating       integer not null default 5 check (rating between 1 and 5),
  published    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.testimonials enable row level security;

drop policy if exists "Published testimonials are viewable by everyone" on public.testimonials;
create policy "Published testimonials are viewable by everyone"
  on public.testimonials for select
  using (published = true);

drop policy if exists "Admins can view all testimonials" on public.testimonials;
create policy "Admins can view all testimonials"
  on public.testimonials for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can insert testimonials" on public.testimonials;
create policy "Only admins can insert testimonials"
  on public.testimonials for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can update testimonials" on public.testimonials;
create policy "Only admins can update testimonials"
  on public.testimonials for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can delete testimonials" on public.testimonials;
create policy "Only admins can delete testimonials"
  on public.testimonials for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 2. gallery_images
-- ------------------------------------------------------------
create table if not exists public.gallery_images (
  id             bigint generated always as identity primary key,
  storage_path   text not null,
  caption        text,
  category       text,
  published      boolean not null default true,
  uploaded_by    uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.gallery_images enable row level security;

drop policy if exists "Published gallery images are viewable by everyone" on public.gallery_images;
create policy "Published gallery images are viewable by everyone"
  on public.gallery_images for select
  using (published = true);

drop policy if exists "Admins can view all gallery images" on public.gallery_images;
create policy "Admins can view all gallery images"
  on public.gallery_images for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can insert gallery images" on public.gallery_images;
create policy "Only admins can insert gallery images"
  on public.gallery_images for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can delete gallery images" on public.gallery_images;
create policy "Only admins can delete gallery images"
  on public.gallery_images for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 3. Storage bucket + policies
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('gallery-images', 'gallery-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to gallery images" on storage.objects;
create policy "Public read access to gallery images"
  on storage.objects for select
  using (bucket_id = 'gallery-images');

drop policy if exists "Admins can upload gallery images" on storage.objects;
create policy "Admins can upload gallery images"
  on storage.objects for insert
  with check (
    bucket_id = 'gallery-images'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Admins can delete gallery images" on storage.objects;
create policy "Admins can delete gallery images"
  on storage.objects for delete
  using (
    bucket_id = 'gallery-images'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
