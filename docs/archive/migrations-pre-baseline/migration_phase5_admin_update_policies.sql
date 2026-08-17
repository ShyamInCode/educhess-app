-- ============================================================
-- EDUCHESS — Phase 5: the missing admin UPDATE policies
-- ------------------------------------------------------------
-- Run this AFTER migration_phase4_workshops.sql.
--
-- Every content table shipped with SELECT, INSERT and DELETE policies
-- but no UPDATE policy, so RLS silently refused every edit. The admin
-- panel worked around it by deleting and recreating the row — which,
-- for tournaments, took the registrations with it. That is why
-- tournament_registrations.tournament_id is ON DELETE RESTRICT today,
-- and it is why editing has to become a real UPDATE.
--
-- Both USING and WITH CHECK are set on each: USING alone would let an
-- admin edit a row into a shape the policy would not have allowed them
-- to see.
-- Safe to re-run.
-- ============================================================

drop policy if exists "Only admins can update tournaments" on public.tournaments;
create policy "Only admins can update tournaments"
  on public.tournaments for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can update workshops" on public.workshops;
create policy "Only admins can update workshops"
  on public.workshops for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can update videos" on public.videos;
create policy "Only admins can update videos"
  on public.videos for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can update carousel slides" on public.carousel_slides;
create policy "Only admins can update carousel slides"
  on public.carousel_slides for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can update gallery images" on public.gallery_images;
create policy "Only admins can update gallery images"
  on public.gallery_images for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can update course chapters" on public.course_chapters;
create policy "Only admins can update course chapters"
  on public.course_chapters for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can update testimonials" on public.testimonials;
create policy "Only admins can update testimonials"
  on public.testimonials for update
  using (public.is_admin())
  with check (public.is_admin());
