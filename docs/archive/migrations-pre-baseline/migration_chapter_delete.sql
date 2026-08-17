-- ============================================================
-- EDUCHESS — Allow admins to delete chapters
-- ------------------------------------------------------------
-- Run this AFTER schema.sql, migration_admin_videos.sql, and
-- migration_chapters.sql.
--
-- course_chapters previously only had SELECT + INSERT policies, so
-- an admin's chapter-delete request from the Admin Panel would be
-- silently blocked by RLS. This adds the missing DELETE policy.
--
-- The Admin Panel deletes a chapter's videos (rows + Storage files)
-- before deleting the chapter row itself — the existing "Only admins
-- can delete videos" / "Admins can delete course videos" policies
-- from migration_admin_videos.sql already cover that part.
-- Safe to re-run: uses DROP POLICY IF EXISTS.
-- ============================================================

drop policy if exists "Only admins can delete chapters" on public.course_chapters;
create policy "Only admins can delete chapters"
  on public.course_chapters for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
