-- ===========================================================================
-- 06_studio.sql — the Video Studio job queue
-- ===========================================================================
--
-- Run this AFTER 05_seed.sql. It is additive: it creates one table and two
-- functions and touches nothing that already exists, so it is safe to run on
-- a live project without a teardown.
--
-- WHAT THIS IS
--
-- Rendering a narrated chess video needs Python, ffmpeg and cairo. None of
-- those exist in a static React bundle, and this project deliberately has no
-- server. So the studio is a queue, not a service:
--
--     admin panel  ->  insert a row in video_jobs (status 'queued')
--     local worker ->  claim_next_video_job(), render, upload, mark 'ready'
--     admin panel  ->  preview the mp4, then publish_video_job()
--
-- The worker is `studio/worker.py`, running on the academy PC with the
-- service-role key in a local .env. The service role bypasses RLS, which is
-- the entire reason the key never goes near the browser.
--
-- WHAT THIS IS NOT
--
-- This adds no Edge Function, no Database Webhook and no cron. The worker
-- polls. If the worker is not running, jobs sit in 'queued' and the admin
-- panel says so — which is the honest failure, and it is recoverable by
-- starting the worker rather than by anyone touching SQL.
--
-- ===========================================================================


-- ------------------------------------------------------------
-- 1. The queue
-- ------------------------------------------------------------
create table if not exists public.video_jobs (
  id               bigint generated always as identity primary key,

  -- queued    : waiting for a worker
  -- claimed   : a worker has taken it, has not started rendering
  -- rendering : frames/audio/ffmpeg in progress
  -- ready     : mp4 is in storage and previewable, not yet in the course
  -- published : a videos row exists and students can see it
  -- failed    : see `error`; re-queue by setting status back to 'queued'
  -- cancelled : abandoned by the admin
  status           text not null default 'queued',

  -- module : a multi-segment lesson built from a chapter template
  -- moves  : one pasted PGN / move sequence
  -- topic  : one entry from the curated library (opening, tactic, piece)
  kind             text not null default 'module',

  title            text not null,
  category         text not null default 'chess',
  chapter          text,

  -- The whole video, declared. `spec.segments[]` is the timeline: each entry
  -- carries its own position, its moves, and — this is the point — the exact
  -- narration text. The worker never writes a word of its own. What the
  -- admin read in the browser is what the voice says, which is what makes
  -- the preview trustworthy.
  spec             jsonb not null default '{}'::jsonb,

  -- voice, rate, aspect, fps, silent, revoice_only …
  options          jsonb not null default '{}'::jsonb,

  storage_path     text,          -- rendered mp4 in course-videos
  narration_path   text,          -- admin-recorded audio, when replacing TTS
  duration_seconds numeric,
  size_bytes       bigint,

  progress         integer not null default 0,   -- 0..100, for the UI only
  stage            text,                         -- "Rendering frame 12 of 48"
  error            text,
  log              text,
  worker           text,

  video_id         bigint references public.videos (id) on delete set null,
  created_by       uuid   references auth.users (id)    on delete set null,

  claimed_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.video_jobs drop constraint if exists video_jobs_status_valid;
alter table public.video_jobs add  constraint video_jobs_status_valid
  check (status in ('queued', 'claimed', 'rendering', 'ready',
                    'published', 'failed', 'cancelled'));

alter table public.video_jobs drop constraint if exists video_jobs_kind_valid;
alter table public.video_jobs add  constraint video_jobs_kind_valid
  check (kind in ('module', 'moves', 'topic'));

-- Mirrors the check on videos.category and course_chapters.category. Three
-- places state it; a fourth spelling of the same list is how they drift.
alter table public.video_jobs drop constraint if exists video_jobs_category_valid;
alter table public.video_jobs add  constraint video_jobs_category_valid
  check (category in ('chess', 'maths', 'english'));

alter table public.video_jobs drop constraint if exists video_jobs_progress_sane;
alter table public.video_jobs add  constraint video_jobs_progress_sane
  check (progress between 0 and 100);

alter table public.video_jobs enable row level security;

-- The worker's hot path: "give me the oldest queued job".
create index if not exists video_jobs_queue_idx
  on public.video_jobs (status, created_at)
  where status = 'queued';

-- The panel's list.
create index if not exists video_jobs_recent_idx
  on public.video_jobs (created_at desc);


-- ------------------------------------------------------------
-- 2. updated_at
-- ------------------------------------------------------------
-- The panel polls on `updated_at` to decide whether anything moved, so this
-- is load-bearing rather than bookkeeping: without it a worker that only
-- changes `stage` would look idle.
create or replace function public.touch_video_job()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists video_jobs_touch on public.video_jobs;
create trigger video_jobs_touch
  before update on public.video_jobs
  for each row execute function public.touch_video_job();


-- ------------------------------------------------------------
-- 3. RLS — admins only, and only admins
-- ------------------------------------------------------------
-- A job row carries no student data, but it does carry storage paths into
-- the private bucket. PostgREST exposes every table a client role can
-- select, so "the React app only calls this from the admin page" is not a
-- boundary. `public.is_admin()` is.
drop policy if exists "video_jobs_select_admin" on public.video_jobs;
create policy "video_jobs_select_admin" on public.video_jobs
  for select to authenticated
  using (public.is_admin());

drop policy if exists "video_jobs_insert_admin" on public.video_jobs;
create policy "video_jobs_insert_admin" on public.video_jobs
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "video_jobs_update_admin" on public.video_jobs;
create policy "video_jobs_update_admin" on public.video_jobs
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "video_jobs_delete_admin" on public.video_jobs;
create policy "video_jobs_delete_admin" on public.video_jobs
  for delete to authenticated
  using (public.is_admin());

-- The admin panel writes these and nothing else. Same defence as the
-- profiles column grant: a column the client must not set is one it is not
-- granted, rather than one we hope it never mentions. Note what is missing —
-- storage_path, status, video_id, progress. Those are the worker's and the
-- publish function's to write, and the worker uses the service role.
revoke update on public.video_jobs from authenticated;
grant  update (title, chapter, spec, options, narration_path, error)
  on public.video_jobs to authenticated;


-- ------------------------------------------------------------
-- 4. claim_next_video_job — the worker's only read path
-- ------------------------------------------------------------
-- `for update skip locked` is what makes a second worker safe: two of them
-- racing take two different jobs instead of both taking the oldest one.
-- Renders are minutes long and not idempotent, so double-claiming is not a
-- harmless retry — it is two ffmpeg processes writing one object.
create or replace function public.claim_next_video_job(p_worker text)
returns public.video_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.video_jobs;
begin
  select * into v_job
    from public.video_jobs
   where status = 'queued'
   order by created_at
   limit 1
     for update skip locked;

  if not found then
    return null;
  end if;

  update public.video_jobs
     set status     = 'claimed',
         worker     = p_worker,
         claimed_at = now(),
         error      = null,
         progress   = 0,
         stage      = 'Claimed'
   where id = v_job.id
   returning * into v_job;

  return v_job;
end;
$$;

-- Only the worker calls this, and the worker is the service role. Nothing a
-- browser holds should be able to move a job out of the queue.
revoke all on function public.claim_next_video_job(text) from public;
revoke all on function public.claim_next_video_job(text) from anon, authenticated;
grant execute on function public.claim_next_video_job(text) to service_role;


-- ------------------------------------------------------------
-- 5. publish_video_job — the one write that makes a video real
-- ------------------------------------------------------------
-- Three writes have to land together: the chapter must exist, the videos row
-- must point at the object, and the job must record which video it became.
-- Split across three client calls, a failure in the middle leaves an object
-- in the bucket that no policy can account for and no page can reach.
--
-- SECURITY DEFINER, so it re-checks is_admin() itself. A definer function
-- that skips that check is a hole with a nice name.
create or replace function public.publish_video_job(
  p_job_id   bigint,
  p_chapter  text,
  p_title    text default null,
  p_min_tier text default null
)
returns public.videos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job    public.video_jobs;
  v_video  public.videos;
  v_title  text;
  v_next   integer;
begin
  if not public.is_admin() then
    raise exception 'publish_video_job: admin only';
  end if;

  select * into v_job from public.video_jobs where id = p_job_id;
  if not found then
    raise exception 'publish_video_job: no job %', p_job_id;
  end if;

  if v_job.storage_path is null then
    raise exception 'publish_video_job: job % has no rendered file yet', p_job_id;
  end if;

  if v_job.status = 'published' then
    raise exception 'publish_video_job: job % is already published', p_job_id;
  end if;

  if coalesce(trim(p_chapter), '') = '' then
    raise exception 'publish_video_job: a chapter is required';
  end if;

  v_title := coalesce(nullif(trim(p_title), ''), v_job.title);

  -- Create the chapter if this is the first video in it. `position` counts
  -- from the end of the category so a new module lands last rather than
  -- silently sharing position 0 with everything else.
  select coalesce(max(position), 0) + 1 into v_next
    from public.course_chapters
   where category = v_job.category;

  insert into public.course_chapters (category, title, position, min_tier)
  values (v_job.category, trim(p_chapter), v_next,
          coalesce(nullif(p_min_tier, ''), 'pro'))
  on conflict (category, title) do nothing;

  -- An explicit tier on an existing chapter is a deliberate change; absent,
  -- the chapter keeps whatever it had. Publishing a video must not quietly
  -- re-open a paid module.
  if p_min_tier is not null and p_min_tier <> '' then
    update public.course_chapters
       set min_tier = p_min_tier
     where category = v_job.category and title = trim(p_chapter);
  end if;

  insert into public.videos (title, category, chapter, storage_path, uploaded_by)
  values (v_title, v_job.category, trim(p_chapter), v_job.storage_path, auth.uid())
  returning * into v_video;

  update public.video_jobs
     set status      = 'published',
         video_id    = v_video.id,
         chapter     = trim(p_chapter),
         title       = v_title,
         stage       = 'Published',
         progress    = 100,
         finished_at = now()
   where id = p_job_id;

  return v_video;
end;
$$;

revoke all on function public.publish_video_job(bigint, text, text, text) from public;
grant execute on function public.publish_video_job(bigint, text, text, text) to authenticated;


-- ------------------------------------------------------------
-- 6. set_video_job_status — the only status the panel may write
-- ------------------------------------------------------------
-- §3 revoked UPDATE and granted it back column by column, and `status` is
-- deliberately not in that list: a client that can write `status` can write
-- 'published', and a job marked published with no videos row is a lesson
-- that exists in the panel and nowhere else.
--
-- But the panel does have two honest reasons to move a job: retrying one
-- that failed, and abandoning one. So it gets those two transitions and no
-- others, through a function that names them.
create or replace function public.set_video_job_status(
  p_job_id bigint,
  p_status text
)
returns public.video_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.video_jobs;
begin
  if not public.is_admin() then
    raise exception 'set_video_job_status: admin only';
  end if;

  if p_status not in ('queued', 'cancelled') then
    raise exception 'set_video_job_status: % is not a status the panel may set', p_status;
  end if;

  select * into v_job from public.video_jobs where id = p_job_id;
  if not found then
    raise exception 'set_video_job_status: no job %', p_job_id;
  end if;

  -- A published job is done. Re-queueing it would render over the object a
  -- videos row already points at, and students would watch the change happen.
  if v_job.status = 'published' then
    raise exception 'set_video_job_status: job % is published — make a new one instead', p_job_id;
  end if;

  update public.video_jobs
     set status   = p_status,
         stage    = case when p_status = 'queued' then 'Waiting for the studio'
                         else 'Cancelled' end,
         progress = case when p_status = 'queued' then 0 else v_job.progress end,
         error    = case when p_status = 'queued' then null else v_job.error end,
         worker   = null
   where id = p_job_id
   returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.set_video_job_status(bigint, text) from public;
grant execute on function public.set_video_job_status(bigint, text) to authenticated;


-- ------------------------------------------------------------
-- 7. Self-check
-- ------------------------------------------------------------
-- Same contract as 03_rls.sql: every policy on this table names is_admin(),
-- and the file fails loudly rather than leaving a queue readable by every
-- signed-in student.
do $$
declare
  v_open text;
  v_count integer;
begin
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public' and tablename = 'video_jobs';

  if v_count <> 4 then
    raise exception 'STUDIO SELF-CHECK FAILED: expected 4 policies on video_jobs, found %', v_count;
  end if;

  select string_agg(policyname, ', ') into v_open
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'video_jobs'
     and coalesce(qual, '')       not like '%is_admin%'
     and coalesce(with_check, '') not like '%is_admin%';

  if v_open is not null then
    raise exception 'STUDIO SELF-CHECK FAILED: policy without is_admin() on video_jobs: %', v_open;
  end if;

  raise notice 'Studio self-check: video_jobs is admin-only; worker claims via service_role.';
end;
$$;
