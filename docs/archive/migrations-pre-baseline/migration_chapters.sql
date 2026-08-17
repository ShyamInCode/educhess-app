-- ============================================================
-- EDUCHESS — Chapters + video-chapter linkage migration
-- ------------------------------------------------------------
-- Run this AFTER schema.sql and migration_admin_videos.sql.
--
-- What this adds:
--   1. public.course_chapters — the "folders" inside each course
--      (e.g. Chess → Opening Principles, Tactical Motifs, ...).
--      Seeded once from the original static curriculum so existing
--      chapter names show up immediately; admins can add more from
--      the Admin Panel's "+ Add new chapter" option from here on.
--   2. public.videos.chapter — which chapter a given uploaded video
--      belongs to within its category.
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE
-- / DROP ... IF EXISTS guards.
-- ============================================================

-- ------------------------------------------------------------
-- 1. course_chapters
-- ------------------------------------------------------------
create table if not exists public.course_chapters (
  id           bigint generated always as identity primary key,
  category     text not null check (category in ('chess', 'maths', 'english')),
  title        text not null,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (category, title)
);

alter table public.course_chapters enable row level security;

drop policy if exists "Chapters are viewable by everyone" on public.course_chapters;
create policy "Chapters are viewable by everyone"
  on public.course_chapters for select
  using (true);

drop policy if exists "Only admins can add chapters" on public.course_chapters;
create policy "Only admins can add chapters"
  on public.course_chapters for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Seed with the platform's original static curriculum titles so the
-- Admin Panel + Courses page have something to show on first run.
insert into public.course_chapters (category, title, position) values
  ('chess', 'Opening Principles', 1),
  ('chess', 'Tactical Motifs', 2),
  ('chess', 'Endgame Fundamentals', 3),
  ('chess', 'Positional Play', 4),
  ('chess', 'Calculation & Visualization', 5),
  ('chess', 'Game Annotation & Review', 6),
  ('maths', 'Fractions via Rank Puzzles', 1),
  ('maths', 'Coordinate Planes as Chess Axes', 2),
  ('maths', 'Combinatorics Vector Mapping', 3),
  ('maths', 'Geometry of the 64 Squares', 4),
  ('maths', 'Aptitude & Speed Tactics', 5),
  ('maths', 'Algebra via Material Equations', 6),
  ('maths', 'Probability of the Next Move', 7),
  ('maths', 'Mensuration on the Board', 8),
  ('maths', 'Ratios, Percentages & Time Controls', 9),
  ('english', 'Conditional If/Then Calculation Syntax', 1),
  ('english', 'Active vs Passive Tactical Voices', 2),
  ('english', 'Narrative Arc via Game Annotation', 3),
  ('english', 'Grammar Fundamentals on the Board', 4),
  ('english', 'Vocabulary Building — The Strategist''s Lexicon', 5),
  ('english', 'Reading Comprehension — Match Reports', 6),
  ('english', 'Essay & Opinion Writing — Defend Your Opening', 7),
  ('english', 'Public Speaking & Debate — Post-Match Analysis', 8),
  ('english', 'Punctuation & Mechanics in Annotation', 9)
on conflict (category, title) do nothing;

-- ------------------------------------------------------------
-- 2. videos.chapter
-- ------------------------------------------------------------
alter table public.videos
  add column if not exists chapter text;
