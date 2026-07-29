-- ============================================================
-- EDUCHESS — Allow admins to view all contact submissions
-- ------------------------------------------------------------
-- Run this AFTER schema.sql and migration_admin_videos.sql (it
-- reuses the admin-role RLS pattern from that file).
--
-- contact_submissions previously only let a submitter read their
-- own row (or nothing, if submitted anonymously) — nobody could
-- see enquiries anywhere in the app. This adds an additional
-- SELECT policy so admins can view every submission, for the new
-- Enquiries inbox in the Admin Panel. Postgres RLS SELECT policies
-- are OR'd together, so the existing "own submission" policy from
-- schema.sql is untouched and still applies for non-admins.
-- Safe to re-run: uses DROP POLICY IF EXISTS.
-- ============================================================

drop policy if exists "Admins can view all contact submissions" on public.contact_submissions;
create policy "Admins can view all contact submissions"
  on public.contact_submissions for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
