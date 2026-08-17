-- ============================================================
-- EDUCHESS — 01. Schema
-- ------------------------------------------------------------
-- The first of five files that ARE the entire backend. Paste them into
-- the Supabase SQL Editor in order: 01 → 02 → 03 → 04 → 05.
-- Nothing else runs anywhere: no Edge Functions, no Database Webhooks,
-- no deployed server. See RESET-AND-APPLY.md for the full session.
--
-- This file owns tables, columns, constraints, indexes, and turning RLS
-- on. Policies live in 03; functions in 02. RLS is enabled in THIS file,
-- immediately after each table, so no table exists un-RLS'd for even one
-- file — 02 and 03 both run against a database where every table is
-- already closed by default.
--
-- IDEMPOTENT AND CONVERGENT. Every statement is guarded, so this file:
--   * creates the schema from nothing on a fresh project (Path B), and
--   * converges an existing EduChess project onto the baseline WITHOUT
--     touching row data (Path A) — which is why no export/re-import of
--     puzzles or admin content is needed. `lichess_puzzles` and every
--     content table keep their rows.
-- Safe to re-run.
--
-- Replaces, in full: schema.sql, migration_admin_videos.sql,
-- migration_chapters.sql, migration_chapter_delete.sql,
-- migration_carousel.sql, migration_testimonials_gallery.sql,
-- migration_contact_admin_view.sql, migration_lichess_puzzles.sql,
-- migration_lichess_puzzles_rpc_v2.sql, migration_tournaments.sql,
-- migration_security_fixes.sql, migration_phase1_auth_methods.sql,
-- migration_phase3_puzzle_attempts.sql, migration_phase4_workshops.sql,
-- migration_phase5_admin_update_policies.sql,
-- migration_phase5_capacity_enforcement.sql, migration_phase8_tiers.sql,
-- migration_phase11_payments.sql, migration_payments_fk_restrict.sql,
-- migration_registration_dupe_message.sql, migration_puzzles.sql,
-- migration_puzzles_v2.sql.  (Archived at docs/archive/migrations-pre-baseline/.)
-- ============================================================

-- ------------------------------------------------------------
-- 0. Retire the dead surfaces (audit DB-06)
-- ------------------------------------------------------------
-- `quest_progress` was a self-writable points table for a feature that no
-- longer exists: no React code reads or writes it, but its INSERT policy
-- plus AFTER INSERT trigger let any signed-in user award themselves up to
-- 50 rank_points per invented quest_key. Dropping the table takes the
-- trigger with it; `profiles.rank_points` is the value it fed and goes too.
--
-- `puzzles` is the retired hand-generated set, superseded by
-- lichess_puzzles and read by nothing.
drop trigger if exists on_quest_completed on public.quest_progress;
drop table if exists public.quest_progress cascade;
drop function if exists public.handle_quest_completed() cascade;
drop table if exists public.puzzles cascade;

-- ------------------------------------------------------------
-- 1. profiles — one row per signed-up user, linked to Supabase Auth
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  name             text,
  grade            text,
  role             text        not null default 'student',
  tier             text        not null default 'free',
  tier_expires_at  timestamptz,                      -- null = no expiry (comped)
  consent_at       timestamptz,                      -- parent/guardian consent
  created_at       timestamptz not null default now()
);

-- Convergence for an existing project: these columns arrived across four
-- separate migrations, and rank_points leaves with quest_progress.
alter table public.profiles add column if not exists role            text not null default 'student';
alter table public.profiles add column if not exists tier            text not null default 'free';
alter table public.profiles add column if not exists tier_expires_at timestamptz;
alter table public.profiles add column if not exists consent_at      timestamptz;
alter table public.profiles drop column if exists rank_points;

alter table public.profiles drop constraint if exists profiles_role_valid;
alter table public.profiles add  constraint profiles_role_valid
  check (role in ('student', 'admin'));

alter table public.profiles drop constraint if exists profiles_tier_valid;
alter table public.profiles add  constraint profiles_tier_valid
  check (tier in ('free', 'pro', 'academy'));

-- 80 chars, and handle_new_user() truncates to match. A Google display
-- name longer than this would otherwise abort the whole sign-up with an
-- opaque "Database error saving new user".
alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add  constraint profiles_name_len
  check (name is null or length(name) <= 80);

alter table public.profiles drop constraint if exists profiles_grade_len;
alter table public.profiles add  constraint profiles_grade_len
  check (grade is null or length(grade) <= 40);

alter table public.profiles enable row level security;

-- Admin lookups (`is_admin()` runs on every policy evaluation) hit this.
create index if not exists profiles_role_idx on public.profiles (role) where role = 'admin';

-- ------------------------------------------------------------
-- 2. contact_submissions — the "Talk to us" / Contact form
-- ------------------------------------------------------------
create table if not exists public.contact_submissions (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete set null,
  name        text not null,
  grade       text,
  email       text not null,
  struggles   text,
  created_at  timestamptz not null default now()
);

alter table public.contact_submissions drop constraint if exists contact_submissions_sane;
alter table public.contact_submissions add  constraint contact_submissions_sane check (
  length(name) between 1 and 120
  and length(email) between 3 and 254
  and (grade is null or length(grade) <= 40)
  and (struggles is null or length(struggles) <= 2000)
);

alter table public.contact_submissions enable row level security;

create index if not exists contact_submissions_user_idx    on public.contact_submissions (user_id);
create index if not exists contact_submissions_created_idx on public.contact_submissions (created_at desc);

-- ------------------------------------------------------------
-- 3. tournaments + workshops — identical shape, two tables
-- ------------------------------------------------------------
-- These are twins everywhere in this project: same columns, same policies,
-- same capacity rule, same unique index, same shared React components
-- (EventCard, EventRegistrationForm, AdminEvents). Keeping them literally
-- identical is what stops the two from drifting.
create table if not exists public.tournaments (
  id                     bigint generated always as identity primary key,
  title                  text not null,
  description            text,
  format                 text not null check (format in ('online', 'offline')),
  venue                  text,          -- address when offline, platform when online
  start_at               timestamptz not null,
  registration_deadline  timestamptz,
  fee                    text,          -- free text, e.g. "Free" or "₹500"
  capacity               integer,
  published              boolean not null default true,
  created_at             timestamptz not null default now()
);

alter table public.tournaments drop constraint if exists tournaments_capacity_sane;
alter table public.tournaments add  constraint tournaments_capacity_sane
  check (capacity is null or capacity > 0);

alter table public.tournaments enable row level security;

create index if not exists tournaments_published_start_idx
  on public.tournaments (published, start_at);

create table if not exists public.workshops (
  id                     bigint generated always as identity primary key,
  title                  text not null,
  description            text,
  format                 text not null check (format in ('online', 'offline')),
  venue                  text,
  start_at               timestamptz not null,
  registration_deadline  timestamptz,
  fee                    text,
  capacity               integer,
  published              boolean not null default true,
  created_at             timestamptz not null default now()
);

alter table public.workshops drop constraint if exists workshops_capacity_sane;
alter table public.workshops add  constraint workshops_capacity_sane
  check (capacity is null or capacity > 0);

alter table public.workshops enable row level security;

create index if not exists workshops_published_start_idx
  on public.workshops (published, start_at);

-- ------------------------------------------------------------
-- 4. Registrations — business records, ON DELETE RESTRICT
-- ------------------------------------------------------------
-- RESTRICT, not CASCADE: an admin with no edit button deletes and recreates
-- an event, and every registration silently goes with it. That happened once.
-- The admin panel does real UPDATEs now, and the FK makes the old mistake
-- impossible rather than merely discouraged.
--
-- NOTE: there is no client INSERT path to these tables any more. Rows are
-- written only by public.register_for_event() (02_functions.sql), which owns
-- the lock, the capacity check, the duplicate message and the rate limit.
-- 03_rls.sql leaves INSERT at DEFAULT DENY on purpose — a direct insert would
-- walk straight past all four.
create table if not exists public.tournament_registrations (
  id             bigint generated always as identity primary key,
  tournament_id  bigint not null references public.tournaments (id) on delete restrict,
  user_id        uuid references auth.users (id) on delete set null,
  child_name     text not null,
  grade          text,
  parent_name    text not null,
  parent_email   text not null,
  parent_phone   text,
  notes          text,
  created_at     timestamptz not null default now()
);

-- Converge an existing project: this FK shipped as CASCADE and was changed
-- to RESTRICT by migration_security_fixes.sql. Re-state it either way.
alter table public.tournament_registrations
  drop constraint if exists tournament_registrations_tournament_id_fkey;
alter table public.tournament_registrations
  add  constraint tournament_registrations_tournament_id_fkey
  foreign key (tournament_id) references public.tournaments (id) on delete restrict;

alter table public.tournament_registrations drop constraint if exists tournament_registrations_sane;
alter table public.tournament_registrations add  constraint tournament_registrations_sane check (
  length(child_name) between 1 and 120
  and length(parent_name) between 1 and 120
  and length(parent_email) between 3 and 254
  and (grade is null or length(grade) <= 40)
  and (parent_phone is null or length(parent_phone) <= 32)
  and (notes is null or length(notes) <= 2000)
);

alter table public.tournament_registrations enable row level security;

-- The real duplicate constraint. register_for_event() raises a friendlier
-- ALREADY_REGISTERED before a row ever reaches this, but the index is what
-- makes the rule true rather than merely usually-observed.
create unique index if not exists tournament_registrations_unique_entry
  on public.tournament_registrations (tournament_id, lower(parent_email), lower(child_name));

-- audit DB-05: FK columns were unindexed. Capacity counts read the first,
-- the dashboard's "my registrations" reads the second.
create index if not exists tournament_registrations_tournament_idx
  on public.tournament_registrations (tournament_id);
create index if not exists tournament_registrations_user_idx
  on public.tournament_registrations (user_id);

create table if not exists public.workshop_registrations (
  id            bigint generated always as identity primary key,
  workshop_id   bigint not null references public.workshops (id) on delete restrict,
  user_id       uuid references auth.users (id) on delete set null,
  child_name    text not null,
  grade         text,
  parent_name   text not null,
  parent_email  text not null,
  parent_phone  text,
  notes         text,
  created_at    timestamptz not null default now()
);

alter table public.workshop_registrations
  drop constraint if exists workshop_registrations_workshop_id_fkey;
alter table public.workshop_registrations
  add  constraint workshop_registrations_workshop_id_fkey
  foreign key (workshop_id) references public.workshops (id) on delete restrict;

alter table public.workshop_registrations drop constraint if exists workshop_registrations_sane;
alter table public.workshop_registrations add  constraint workshop_registrations_sane check (
  length(child_name) between 1 and 120
  and length(parent_name) between 1 and 120
  and length(parent_email) between 3 and 254
  and (grade is null or length(grade) <= 40)
  and (parent_phone is null or length(parent_phone) <= 32)
  and (notes is null or length(notes) <= 2000)
);

alter table public.workshop_registrations enable row level security;

create unique index if not exists workshop_registrations_unique_entry
  on public.workshop_registrations (workshop_id, lower(parent_email), lower(child_name));

create index if not exists workshop_registrations_workshop_idx
  on public.workshop_registrations (workshop_id);
create index if not exists workshop_registrations_user_idx
  on public.workshop_registrations (user_id);

-- ------------------------------------------------------------
-- 5. event_meeting_links — the joining link for an online event
-- ------------------------------------------------------------
-- A separate table rather than a `meeting_url` column on the event, and the
-- reason is the security model: RLS is row-level, so a column on `workshops`
-- could only be hidden with column-level SELECT grants — which silently stop
-- protecting anything the day someone adds a column and forgets to re-state
-- the grant, and which break `select *` across the whole client.
--
-- This table gets RLS enabled and NO POLICIES AT ALL (see 03_rls.sql). That
-- is DEFAULT DENY for every client, in every direction, permanently. The only
-- way in or out is public.event_meeting_url() and public.admin_set_meeting_url(),
-- both SECURITY DEFINER with their own auth checks.
create table if not exists public.event_meeting_links (
  id             bigint generated always as identity primary key,
  workshop_id    bigint references public.workshops (id) on delete cascade,
  tournament_id  bigint references public.tournaments (id) on delete cascade,
  meeting_url    text not null,
  updated_at     timestamptz not null default now()
);

alter table public.event_meeting_links drop constraint if exists event_meeting_links_one_target;
alter table public.event_meeting_links add  constraint event_meeting_links_one_target check (
  (workshop_id is not null)::int + (tournament_id is not null)::int = 1
);

alter table public.event_meeting_links drop constraint if exists event_meeting_links_url_sane;
alter table public.event_meeting_links add  constraint event_meeting_links_url_sane check (
  meeting_url ~ '^https?://' and length(meeting_url) between 8 and 500
);

alter table public.event_meeting_links enable row level security;

create unique index if not exists event_meeting_links_workshop_key
  on public.event_meeting_links (workshop_id) where workshop_id is not null;
create unique index if not exists event_meeting_links_tournament_key
  on public.event_meeting_links (tournament_id) where tournament_id is not null;

-- ------------------------------------------------------------
-- 6. registration_rate_limit — audit SEC-03
-- ------------------------------------------------------------
-- Public event registration was open to anonymous callers with no throttle:
-- the unique index and the capacity check stop oversubscription and exact
-- duplicates, but a scripted loop with the anon key could book out the last
-- seats of a paid event under invented names, or flood a no-capacity event
-- with junk records of children — a DPDP liability, not just noise.
--
-- One row per accepted registration attempt. register_for_event() counts the
-- recent ones before it will accept another. Kept deliberately dumb: no
-- external service, no Edge Function, one table and one count.
-- RLS on, no policies — DEFINER-only, same as event_meeting_links.
create table if not exists public.registration_rate_limit (
  id          bigint generated always as identity primary key,
  scope       text not null check (scope in ('email', 'user')),
  key         text not null,
  created_at  timestamptz not null default now()
);

alter table public.registration_rate_limit enable row level security;

create index if not exists registration_rate_limit_lookup_idx
  on public.registration_rate_limit (scope, key, created_at desc);

-- ------------------------------------------------------------
-- 7. course_chapters + videos
-- ------------------------------------------------------------
create table if not exists public.course_chapters (
  id          bigint generated always as identity primary key,
  category    text not null check (category in ('chess', 'maths', 'english')),
  title       text not null,
  position    integer not null default 0,
  min_tier    text not null default 'pro',
  created_at  timestamptz not null default now(),
  unique (category, title)
);

alter table public.course_chapters add column if not exists min_tier text not null default 'pro';

alter table public.course_chapters drop constraint if exists course_chapters_min_tier_valid;
alter table public.course_chapters add  constraint course_chapters_min_tier_valid
  check (min_tier in ('free', 'pro', 'academy'));

alter table public.course_chapters enable row level security;

create index if not exists course_chapters_category_position_idx
  on public.course_chapters (category, position, title);

-- `min_tier = 'free'` is the free preview, and it is a real boundary now:
-- 04_storage.sql lets anyone — including a logged-out visitor — read the
-- objects behind a free chapter, and nobody below the required tier read the
-- objects behind a paid one.
create table if not exists public.videos (
  id            bigint generated always as identity primary key,
  title         text not null,
  category      text not null check (category in ('chess', 'maths', 'english')),
  chapter       text,                  -- matches course_chapters.title
  storage_path  text not null,         -- object name inside the course-videos bucket
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.videos add column if not exists chapter      text;
alter table public.videos add column if not exists storage_path text;

-- Convergence for an existing project. `url` held a public CDN URL, which is
-- exactly the thing audit SEC-02 is about: it made the paywall a UI boundary.
-- The bucket is private from 04_storage.sql onward, so a stored public URL is
-- worse than useless — it is a URL that no longer works and still looks
-- authoritative. Recover the object path from it, then drop the column.
update public.videos
   set storage_path = regexp_replace(url, '^.*/object/(public|sign)/course-videos/', '')
 where storage_path is null
   and url is not null;

-- Fails loudly if a video row has neither a path nor a recoverable URL,
-- which is the right outcome: that row points at nothing.
alter table public.videos alter column storage_path set not null;
alter table public.videos drop column if exists url;

alter table public.videos drop constraint if exists videos_storage_path_sane;
alter table public.videos add  constraint videos_storage_path_sane
  check (length(storage_path) between 1 and 1024);

alter table public.videos enable row level security;

create index if not exists videos_category_chapter_idx on public.videos (category, chapter);
create index if not exists videos_uploaded_by_idx      on public.videos (uploaded_by);
-- 04_storage.sql's policies look an object name up in this table on every
-- read, so this index is load-bearing, not housekeeping.
create unique index if not exists videos_storage_path_key on public.videos (storage_path);

-- ------------------------------------------------------------
-- 8. Marketing content — carousel, gallery, testimonials
-- ------------------------------------------------------------
create table if not exists public.carousel_slides (
  id            bigint generated always as identity primary key,
  storage_path  text not null,
  caption       text,
  position      integer not null default 0,
  published     boolean not null default true,
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.carousel_slides enable row level security;
create index if not exists carousel_slides_published_position_idx
  on public.carousel_slides (published, position);
create index if not exists carousel_slides_uploaded_by_idx on public.carousel_slides (uploaded_by);

create table if not exists public.gallery_images (
  id            bigint generated always as identity primary key,
  storage_path  text not null,
  caption       text,
  category      text,
  published     boolean not null default true,
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.gallery_images enable row level security;
create index if not exists gallery_images_published_category_idx
  on public.gallery_images (published, category);
create index if not exists gallery_images_uploaded_by_idx on public.gallery_images (uploaded_by);

create table if not exists public.testimonials (
  id          bigint generated always as identity primary key,
  name        text not null,
  role        text,
  quote       text not null,
  rating      integer not null default 5 check (rating between 1 and 5),
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.testimonials enable row level security;
create index if not exists testimonials_published_idx on public.testimonials (published);

-- ------------------------------------------------------------
-- 9. lichess_puzzles — the puzzle library (~123k rows)
-- ------------------------------------------------------------
-- `create table if not exists` on purpose: on an existing project this
-- statement is a no-op and every imported row survives the rebuild. Only a
-- brand-new project (Path B) needs the importer re-run — see RESET-AND-APPLY.md.
--
-- FEN convention, verified against the real import and NOT to be changed:
-- `fen` is the position BEFORE the opponent's move. moves[1] (1-indexed SQL)
-- is played by the OPPONENT; the student solves from the position after it.
create table if not exists public.lichess_puzzles (
  puzzle_id     text primary key,            -- Lichess id, e.g. '00sHx'
  fen           text not null,
  moves         text[] not null,             -- UCI, opponent's move first
  rating        integer not null,
  rating_dev    integer,
  popularity    integer,
  nb_plays      integer,
  themes        text[] not null default '{}',
  game_url      text,
  opening_tags  text[],
  rand          double precision not null default random()
);

alter table public.lichess_puzzles enable row level security;

create index if not exists lichess_puzzles_themes_idx      on public.lichess_puzzles using gin (themes);
create index if not exists lichess_puzzles_rating_idx      on public.lichess_puzzles (rating);
create index if not exists lichess_puzzles_rand_idx        on public.lichess_puzzles (rand);
-- Covers the hot shape: theme filter + rating band + random pick.
create index if not exists lichess_puzzles_rating_rand_idx on public.lichess_puzzles (rating, rand);

-- ------------------------------------------------------------
-- 10. puzzle_attempts — what happened, not what you are owed
-- ------------------------------------------------------------
-- This table is now PURELY a record of outcomes: it feeds the dashboard's
-- totals, streak and per-category counts, and it gates nothing.
--
-- It used to be the meter for the daily allowance, which is what made the
-- allowance unenforceable (audit ENT-01): the count came from rows the client
-- writes fire-and-forget, so a client that simply never logged an attempt was
-- never counted. The meter moved to puzzle_allowance below, which only the
-- server writes. That also retires the enforce_puzzle_quota trigger and, with
-- it, the lockless count that could overshoot the cap by one (audit DB-04).
create table if not exists public.puzzle_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  puzzle_id   text not null references public.lichess_puzzles (puzzle_id),
  solved      boolean not null,
  category    text,
  difficulty  text,
  created_at  timestamptz not null default now()
);

alter table public.puzzle_attempts drop constraint if exists puzzle_attempts_sane;
alter table public.puzzle_attempts add  constraint puzzle_attempts_sane check (
  (category is null or length(category) <= 40)
  and (difficulty is null or length(difficulty) <= 20)
);

alter table public.puzzle_attempts enable row level security;

create index if not exists puzzle_attempts_user_created_idx
  on public.puzzle_attempts (user_id, created_at);
-- audit DB-05: the FK to lichess_puzzles was unindexed.
create index if not exists puzzle_attempts_puzzle_idx
  on public.puzzle_attempts (puzzle_id);

-- The old meter. Dropping the trigger is what makes puzzle_attempts a record
-- rather than a gate; the function goes with it in 02_functions.sql.
drop trigger if exists enforce_puzzle_quota_trg on public.puzzle_attempts;

-- ------------------------------------------------------------
-- 11. puzzle_allowance — the server-side meter (audit ENT-01)
-- ------------------------------------------------------------
-- One row per user per Asia/Kolkata day, counting puzzles DELIVERED, not
-- puzzles logged. random_puzzles_for_user() takes a row lock on it, clamps
-- the batch to what is left, and increments by the number of rows it actually
-- returned. A client cannot decline to be counted, because the counting
-- happens on the way out rather than on the way back.
--
-- Days bucket in Asia/Kolkata, matching puzzle_stats(): a UTC day ends at
-- 5:30 AM in Visakhapatnam and would break every streak built in the evening.
--
-- RLS on, no policies — the client reads this only through puzzle_quota().
create table if not exists public.puzzle_allowance (
  user_id     uuid not null references auth.users (id) on delete cascade,
  usage_date  date not null,
  delivered   integer not null default 0 check (delivered >= 0),
  primary key (user_id, usage_date)
);

alter table public.puzzle_allowance enable row level security;

-- ------------------------------------------------------------
-- 12. payments — stubbed, schema present, no live flow
-- ------------------------------------------------------------
-- The columns exist so the tier model has somewhere to write a receipt when
-- payments are switched on, and so `admin_set_tier()` is not the only record
-- that money changed hands. Nothing writes here today: there is no checkout,
-- no Edge Function and no webhook in this architecture. 03_rls.sql denies
-- every client write, which is the correct end state either way.
create table if not exists public.payments (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null references auth.users (id) on delete restrict,
  tier                 text not null check (tier in ('pro', 'academy')),
  months               integer not null default 1 check (months between 1 and 24),
  amount_paise         integer not null check (amount_paise > 0),
  currency             text not null default 'INR',
  provider_order_id    text not null unique,
  provider_payment_id  text,
  status               text not null default 'created' check (status in ('created', 'paid', 'failed')),
  created_at           timestamptz not null default now(),
  paid_at              timestamptz
);

-- Convergence: the columns were Razorpay-specific by name. The stub is
-- provider-agnostic now — nothing in the app names a payment provider.
alter table public.payments rename column razorpay_order_id   to provider_order_id;
alter table public.payments rename column razorpay_payment_id to provider_payment_id;

-- audit DB-01. This shipped as ON DELETE CASCADE, so deleting an auth user
-- destroyed their entire payment history — the opposite of the RESTRICT rule
-- the project already applies to registrations, and applied to the stronger
-- financial record. For a future DPDP erasure flow, prefer making user_id
-- nullable and switching to ON DELETE SET NULL so an anonymised receipt
-- survives the account; RESTRICT is the safe default that refuses to decide
-- that policy silently.
alter table public.payments drop constraint if exists payments_user_id_fkey;
alter table public.payments add  constraint payments_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete restrict;

alter table public.payments enable row level security;

create index if not exists payments_user_created_idx on public.payments (user_id, created_at desc);

-- ============================================================
-- End of 01. Every table above has RLS enabled; none has a policy yet,
-- so at this moment the database is closed to every client. 03_rls.sql
-- opens exactly what the app needs and nothing else.
-- ============================================================
