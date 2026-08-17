-- ============================================================
-- EDUCHESS — 05. Seed
-- ------------------------------------------------------------
-- Run AFTER 04_storage.sql. The last file.
--
-- Every insert here is guarded, so this file is a NO-OP on a project that
-- already has content. That is the point: on Path A (same Supabase project,
-- regenerated keys) 01-04 converge the schema without touching row data, and
-- this file adds only what is missing. Your chapters, videos, workshops,
-- tournaments, testimonials, gallery, enquiries, registrations, profiles and
-- all ~123k imported puzzles survive the rebuild untouched.
--
-- On Path B (a brand-new project) this file is what makes the site render
-- instead of showing eleven empty states.
--
-- WHAT THIS FILE DOES NOT CONTAIN, and why:
--   * lichess_puzzles. ~123,000 rows is not a SQL file — see section 4 for
--     the re-import command. On Path A it is already there and 01_schema.sql
--     deliberately used `create table if not exists` so it stays there.
--   * Your admin-entered content. On Path A it is already there. If you want
--     a backup before starting anyway — and you should — the export queries
--     are in RESET-AND-APPLY.md section 0.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Course chapters — the original curriculum
-- ------------------------------------------------------------
-- `on conflict do nothing` against the (category, title) unique constraint,
-- so re-running never duplicates and never overwrites a min_tier you have
-- since changed from the admin panel.
--
-- NOTE on min_tier: the column defaults to 'pro', so every chapter below
-- lands as paid. Mark one 'free' from Admin -> Videos to give visitors a
-- taster — that is the free preview the storage policy in 04 lets anyone
-- watch. A course with no free chapter has no shop window.
insert into public.course_chapters (category, title, position) values
  ('chess',   'Opening Principles', 1),
  ('chess',   'Tactical Motifs', 2),
  ('chess',   'Endgame Fundamentals', 3),
  ('chess',   'Positional Play', 4),
  ('chess',   'Calculation & Visualization', 5),
  ('chess',   'Game Annotation & Review', 6),
  ('maths',   'Fractions via Rank Puzzles', 1),
  ('maths',   'Coordinate Planes as Chess Axes', 2),
  ('maths',   'Combinatorics Vector Mapping', 3),
  ('maths',   'Geometry of the 64 Squares', 4),
  ('maths',   'Aptitude & Speed Tactics', 5),
  ('maths',   'Algebra via Material Equations', 6),
  ('maths',   'Probability of the Next Move', 7),
  ('maths',   'Mensuration on the Board', 8),
  ('maths',   'Ratios, Percentages & Time Controls', 9),
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
-- 2. Workshops — the four formats the static page described
-- ------------------------------------------------------------
-- Only when the table is completely empty, so this cannot resurrect a
-- workshop you deliberately deleted. Dates are relative placeholders for the
-- admin to correct; capacity and fee are left NULL rather than invented.
insert into public.workshops (title, description, format, venue, start_at, fee, capacity, published)
select * from (values
  (
    'Weekend intensive',
    'A half day on one theme, usually openings or endgames, with a coach working through positions on the board.',
    'offline',
    'EduChess, Champion Chess Academy, Gajuwaka, Visakhapatnam',
    now() + interval '14 days',
    null::text,
    null::integer,
    true
  ),
  (
    'School session',
    'An introductory chess session at your school, anywhere around Visakhapatnam — from a single assembly to a full term.',
    'offline',
    'At your school, Visakhapatnam',
    now() + interval '21 days',
    null::text,
    null::integer,
    true
  ),
  (
    'Simul and guest session',
    'One strong player against many students at once. The fastest way for a beginner to learn how a stronger player thinks.',
    'offline',
    'Opposite Timpany School, VUDA Colony, Visakhapatnam',
    now() + interval '28 days',
    null::text,
    null::integer,
    true
  ),
  (
    'Tournament preparation',
    'A short course before local events: time management, opening choices, and playing under a clock.',
    'online',
    'Online — joining link shared with registrants',
    now() + interval '35 days',
    null::text,
    null::integer,
    true
  )
) as seed(title, description, format, venue, start_at, fee, capacity, published)
where not exists (select 1 from public.workshops);

-- ------------------------------------------------------------
-- 3. Promote yourself to admin
-- ------------------------------------------------------------
-- There is no other way in: `profiles.role` is outside the client's
-- column-level UPDATE grant (03_rls.sql §1), which is exactly what stops a
-- student doing this from the browser console. So the first admin is made
-- here, by hand, by someone with SQL Editor access.
--
-- Sign up through the app FIRST so the row exists, then uncomment ONE of
-- these and run it.
--
--   update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'you@example.com');
--
--   -- or, if you already know the uuid:
--   update public.profiles set role = 'admin'
--    where id = '00000000-0000-0000-0000-000000000000';
--
-- Confirm it took:
--   select p.id, u.email, p.role, p.tier
--     from public.profiles p join auth.users u on u.id = p.id
--    where p.role = 'admin';

-- ------------------------------------------------------------
-- 4. Puzzles — not a seed file, an import
-- ------------------------------------------------------------
-- PATH A (same project): nothing to do. The rows are already in
-- lichess_puzzles and 01_schema.sql left them alone.
--
-- PATH B (new project) only. ~123,000 rows arrive through a one-off script;
-- the source CSV is ~300 MB and is deliberately not in the repo (.gitignore
-- says why: it is operational input, re-downloadable any time, and GitHub
-- rejects any single file over 100 MB).
--
--   # 1. Download the dataset (CC0 / public domain)
--   curl -LO https://database.lichess.org/lichess_db_puzzle.csv.zst
--
--   # 2. The DIRECT Postgres URI, not the REST URL:
--   #    Dashboard -> Project Settings -> Database -> Connection string -> URI
--   export DATABASE_URL='postgresql://...'
--
--   # 3. One dependency, deliberately not in requirements.txt
--   pip install "psycopg[binary]"
--
--   # 4. Import. Idempotent: `on conflict (puzzle_id) do nothing`, so
--   #    re-running only adds what is missing.
--   python scripts/import_lichess_puzzles.py lichess_db_puzzle.csv.zst --limit 150000
--
-- The script balances quotas across 13 categories x 3 difficulty bands and
-- filters on plays/popularity. Its 13 themes must stay in step with
-- CATEGORIES in src/lib/puzzles.js — a category listed there but not
-- imported renders a tile that always says "no puzzles available".
--
-- The script is the ONLY thing kept from the deleted backend/ directory. It
-- now lives at scripts/import_lichess_puzzles.py.

-- ------------------------------------------------------------
-- 5. Where restored content goes, if you ever need it
-- ------------------------------------------------------------
-- Path A does not need this. It exists for the case where you took the
-- backup from RESET-AND-APPLY.md section 0 and are restoring into a fresh
-- project: paste the generated INSERT statements below this line, in this
-- order (parents before children), and re-run this file.
--
--   1. testimonials
--   2. carousel_slides, gallery_images
--   3. course_chapters   (on conflict (category, title) do nothing)
--   4. videos            (needs course_chapters; storage_path must match a
--                         real object, or 04's policy denies every read)
--   5. tournaments, workshops
--   6. tournament_registrations, workshop_registrations
--   7. contact_submissions
--
-- profiles and payments are NOT restorable this way: profiles.id is a FK to
-- auth.users, so the users have to exist first. Moving accounts between
-- Supabase projects is an auth-level migration, not a SQL paste — which is
-- the strongest single argument for Path A.

-- ============================================================
-- End of 05. That is the entire backend: five files, no deployed code.
-- ============================================================
