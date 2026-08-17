-- ============================================================
-- EDUCHESS — Homepage carousel migration
-- ------------------------------------------------------------
-- Run this AFTER schema.sql and migration_admin_videos.sql (it
-- reuses the admin-role RLS pattern from that file).
--
-- What this adds:
--   1. public.carousel_slides — image + caption slides for the
--      auto-advancing carousel on the homepage.
--   2. Storage bucket "carousel-images" + RLS, mirroring the
--      "course-videos" / "gallery-images" bucket setup.
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE
-- / DROP ... IF EXISTS guards.
-- ============================================================

create table if not exists public.carousel_slides (
  id             bigint generated always as identity primary key,
  storage_path   text not null,
  caption        text,
  position       integer not null default 0,
  published      boolean not null default true,
  uploaded_by    uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.carousel_slides enable row level security;

drop policy if exists "Published carousel slides are viewable by everyone" on public.carousel_slides;
create policy "Published carousel slides are viewable by everyone"
  on public.carousel_slides for select
  using (published = true);

drop policy if exists "Admins can view all carousel slides" on public.carousel_slides;
create policy "Admins can view all carousel slides"
  on public.carousel_slides for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can insert carousel slides" on public.carousel_slides;
create policy "Only admins can insert carousel slides"
  on public.carousel_slides for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Only admins can delete carousel slides" on public.carousel_slides;
create policy "Only admins can delete carousel slides"
  on public.carousel_slides for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- Storage bucket + policies
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('carousel-images', 'carousel-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to carousel images" on storage.objects;
create policy "Public read access to carousel images"
  on storage.objects for select
  using (bucket_id = 'carousel-images');

drop policy if exists "Admins can upload carousel images" on storage.objects;
create policy "Admins can upload carousel images"
  on storage.objects for insert
  with check (
    bucket_id = 'carousel-images'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Admins can delete carousel images" on storage.objects;
create policy "Admins can delete carousel images"
  on storage.objects for delete
  using (
    bucket_id = 'carousel-images'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
