-- ============================================================
-- EDUCHESS — 04. Storage buckets and policies
-- ------------------------------------------------------------
-- Run AFTER 03_rls.sql.
--
-- This file is the fix for audit SEC-02 — the one finding that had real
-- money attached to it. The Pro/Academy course video is the paid product,
-- and it was protected by a React `tierAllows()` check: `videos` was
-- world-readable including a `url` column, and `course-videos` was a public
-- bucket, so a signed-out visitor could read a locked chapter's CDN link
-- straight out of the network tab and stream it. The code said so itself.
--
-- How it is closed, with no server:
--   1. `course-videos` becomes PRIVATE. A public URL now returns nothing.
--   2. A SELECT policy on storage.objects decides, per object, whether the
--      caller may read it — free preview, or tier good enough.
--   3. The browser calls storage.createSignedUrl(), which requires exactly
--      one thing: SELECT permission on storage.objects. So the policy in (2)
--      is the whole gate, and a short-lived signed URL is minted only for
--      someone who was already allowed to watch.
--
-- carousel-images and gallery-images stay PUBLIC on purpose: they are
-- marketing photos on the logged-out homepage and About page, they want CDN
-- caching, and nothing is sold on them. See the residual note at the end.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Buckets
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('course-videos', 'course-videos', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('carousel-images', 'carousel-images', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('gallery-images', 'gallery-images', true)
on conflict (id) do update set public = true;

-- ------------------------------------------------------------
-- 2. Can this caller read this course-video object?
-- ------------------------------------------------------------
-- Kept as a function rather than inlined into the policy so the rule is
-- readable, testable on its own (`select public.can_read_course_object(
-- 'chess/Opening-Principles/1706-lesson.mp4')`), and stated once.
--
-- The object path convention, which this depends on:
--   * bucket root, no slash  -> the seeded marketing/intro clips
--     (homepage.mp4, chess.mp4). These are the hero video and the course
--     introduction; they must play for a logged-out visitor, and they are
--     not what the tiers sell.
--   * category/chapter/file  -> everything the admin panel uploads
--     (AdminVideos builds `${category}/${safeChapter}/${Date.now()}-${name}`).
--
-- For the nested case the object is looked up by exact path in `videos`,
-- joined to its chapter, and compared against the caller's effective tier.
-- Note what the join implies: an object with NO matching `videos` row — a
-- file uploaded straight into the bucket from the dashboard, or one left
-- behind after its row was deleted — is readable by nobody but an admin.
-- That is the intended default. So is a video row whose `chapter` matches no
-- chapter row: unfiled content is treated as paid, not as free.
create or replace function public.can_read_course_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_name is null then false
    when position('/' in p_name) = 0 then true   -- bucket-root marketing clip
    else exists (
      select 1
        from public.videos v
        join public.course_chapters c
          on c.category = v.category
         and c.title    = v.chapter
       where v.storage_path = p_name
         and (
           -- The free preview. Stated explicitly rather than left to fall
           -- out of the rank comparison, because it is a product rule
           -- ("anyone can watch a taster chapter"), not an arithmetic
           -- coincidence.
           c.min_tier = 'free'
           or public.tier_rank(public.current_tier()) >= public.tier_rank(c.min_tier)
         )
    )
  end;
$$;

-- The policy is evaluated as the CALLER, so the caller needs EXECUTE.
revoke all on function public.can_read_course_object(text) from public;
grant execute on function public.can_read_course_object(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Clear the old storage policies
-- ------------------------------------------------------------
-- Same reasoning as 03_rls.sql §0: the old set includes
-- "Public read access to course videos" — `using (bucket_id =
-- 'course-videos')` with no further condition — and SELECT policies are
-- OR'd, so leaving it in place would keep every paid video world-readable no
-- matter what the new policy says. This is the single most important DROP in
-- the whole reset.
--
-- If this block raises a permission error, your SQL Editor role does not own
-- storage.objects. Drop the old policies from the dashboard instead:
-- Storage -> Policies -> course-videos, then re-run from section 4.
do $$
declare
  r record;
begin
  for r in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 4. course-videos — the paid product
-- ------------------------------------------------------------
create policy "course_videos_read_allowed" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'course-videos'
    and public.can_read_course_object(name)
  );

create policy "course_videos_read_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'course-videos' and public.is_admin());

create policy "course_videos_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'course-videos' and public.is_admin());

create policy "course_videos_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'course-videos' and public.is_admin())
  with check (bucket_id = 'course-videos' and public.is_admin());

create policy "course_videos_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'course-videos' and public.is_admin());

-- ------------------------------------------------------------
-- 5. carousel-images and gallery-images — public marketing assets
-- ------------------------------------------------------------
-- The buckets are public, so reads are served by the CDN without consulting
-- these policies at all. They are stated anyway so an authenticated API read
-- behaves the same as an anonymous CDN one, and so this file describes the
-- whole of storage rather than only the interesting third of it.
create policy "carousel_images_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'carousel-images');

create policy "carousel_images_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'carousel-images' and public.is_admin());

create policy "carousel_images_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'carousel-images' and public.is_admin())
  with check (bucket_id = 'carousel-images' and public.is_admin());

create policy "carousel_images_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'carousel-images' and public.is_admin());

create policy "gallery_images_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'gallery-images');

create policy "gallery_images_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gallery-images' and public.is_admin());

create policy "gallery_images_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'gallery-images' and public.is_admin())
  with check (bucket_id = 'gallery-images' and public.is_admin());

create policy "gallery_images_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gallery-images' and public.is_admin());

-- ============================================================
-- 6. SELF-CHECK
-- ============================================================
do $$
declare
  v_public boolean;
  v_open   text;
begin
  select public into v_public from storage.buckets where id = 'course-videos';
  if v_public is null then
    raise exception 'STORAGE SELF-CHECK FAILED: the course-videos bucket does not exist.';
  end if;
  if v_public then
    raise exception 'STORAGE SELF-CHECK FAILED: course-videos is still PUBLIC. Every paid video is world-readable (audit SEC-02).';
  end if;

  -- Any surviving unconditional read policy on the private bucket would
  -- defeat the whole file.
  select string_agg(policyname, ', ')
    into v_open
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
     and coalesce(qual, '') like '%course-videos%'
     and coalesce(qual, '') not like '%can_read_course_object%'
     and coalesce(qual, '') not like '%is_admin%';

  if v_open is not null then
    raise exception 'STORAGE SELF-CHECK FAILED: unconditional read policy still on course-videos: %', v_open;
  end if;

  raise notice 'Storage self-check: course-videos is private and gated; carousel/gallery are public by design.';
end;
$$;

-- The report.
select id as bucket, public as is_public from storage.buckets order by id;

select policyname, cmd, roles
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by policyname;

-- ------------------------------------------------------------
-- Residual, stated rather than hidden
-- ------------------------------------------------------------
-- `published = false` on a gallery image hides the ROW, not the FILE: the
-- bucket is public, so an unpublished photo remains downloadable by anyone
-- who knows or guesses its path. Making those buckets private would mean a
-- signed URL for every image on the logged-out homepage — losing CDN caching
-- on the marketing pages to protect content that is published to the public
-- web by design.
--
-- The practical rule, since these are photographs of children: to take a
-- gallery or carousel image down, DELETE it from the admin panel (which
-- removes the object as well as the row). Do not rely on unpublishing.
-- ============================================================
