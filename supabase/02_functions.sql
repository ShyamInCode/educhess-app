-- ============================================================
-- EDUCHESS — 02. Functions
-- ------------------------------------------------------------
-- Run AFTER 01_schema.sql.
--
-- The complete function set, and nothing more. Every rule that cannot be
-- expressed as a row-level policy lives here: the admin gate, the tier
-- table, the puzzle meter, event registration, and the joining-link read.
--
-- Two invariants hold for every SECURITY DEFINER function below:
--   1. `set search_path = public` is pinned. Without it, a caller who can
--      create objects in an earlier schema on the search path can shadow a
--      table or operator this body relies on and have it run as the owner.
--   2. It does its own authorisation. DEFINER means RLS does not apply, so
--      the function is the only thing standing between the caller and the
--      whole table.
--
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Retire the functions this baseline replaces
-- ------------------------------------------------------------
-- Explicit drops, not `create or replace`, because several change shape:
-- random_puzzles_for_user returns json now rather than `setof
-- lichess_puzzles`, and Postgres refuses to replace a function's return
-- type. The rest are gone entirely.
--
--   record_razorpay_payment  — no payment flow exists in this architecture
--   enforce_puzzle_quota     — the meter moved to delivery (audit ENT-01/DB-04)
--   enforce_*_registration   — the trigger pair became register_for_event()
drop function if exists public.record_razorpay_payment(text, text);
drop function if exists public.enforce_puzzle_quota() cascade;
drop function if exists public.enforce_tournament_registration() cascade;
drop function if exists public.enforce_workshop_registration() cascade;
drop function if exists public.random_puzzles_for_user(text[], integer, integer, integer);

-- ------------------------------------------------------------
-- 1. is_admin() — the single admin gate
-- ------------------------------------------------------------
-- SECURITY DEFINER is required, not stylistic: an admin-read policy ON
-- profiles that itself queries profiles would recurse infinitely under RLS.
--
-- This is the ONLY admin check in the system. 03_rls.sql routes every admin
-- policy through it, so changing what "admin" means is a one-line change
-- here rather than an edit to ~20 inline subqueries (audit SEC-06).
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ------------------------------------------------------------
-- 2. The tier table, as functions
-- ------------------------------------------------------------
-- The numbers live here so the database and the browser cannot disagree
-- about them. src/lib/tiers.js mirrors this and is used only for display;
-- change one and you must change the other, or the price card promises an
-- allowance the database refuses.
create or replace function public.tier_rank(p_tier text)
returns integer
language sql
immutable
as $$
  select case p_tier
           when 'academy' then 3
           when 'pro'     then 2
           else 1
         end;
$$;

-- NULL return = unlimited. Callers must test for NULL before comparing.
create or replace function public.tier_daily_puzzles(p_tier text)
returns integer
language sql
immutable
as $$
  select case p_tier
           when 'academy' then null
           when 'pro'     then 50
           else 5
         end::integer;
$$;

-- The caller's tier, with expiry applied. A lapsed Pro account reads as free
-- from that moment, so nothing has to run on a schedule to downgrade anyone
-- — this project has no cron and does not need one.
create or replace function public.current_tier()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select case
               when p.tier = 'free' then 'free'
               when p.tier_expires_at is not null and p.tier_expires_at <= now() then 'free'
               else p.tier
             end
        from public.profiles p
       where p.id = auth.uid()
    ),
    'free'
  );
$$;

-- The project's day boundary, in one place. Days bucket in Asia/Kolkata:
-- a UTC day ends at 5:30 AM in Visakhapatnam, which would reset a child's
-- puzzle allowance mid-morning and break every streak built in the evening.
create or replace function public.ist_today()
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('Asia/Kolkata', now()))::date;
$$;

revoke all on function public.tier_rank(text)          from public;
revoke all on function public.tier_daily_puzzles(text) from public;
revoke all on function public.current_tier()           from public, anon;
revoke all on function public.ist_today()              from public;
grant execute on function public.tier_rank(text)          to anon, authenticated;
grant execute on function public.tier_daily_puzzles(text) to anon, authenticated;
grant execute on function public.current_tier()           to authenticated;
grant execute on function public.ist_today()              to anon, authenticated;

-- ------------------------------------------------------------
-- 3. handle_new_user() — create the profile row at sign-up
-- ------------------------------------------------------------
-- This trigger runs INSIDE the auth.users INSERT. If it raises, the whole
-- sign-up fails with an opaque "Database error saving new user", so every
-- expression has to be null-safe:
--   * phone-only users have new.email = NULL -> split_part(NULL, ...) = NULL
--   * Google sends 'full_name', not 'name'
--   * left(..., 80) protects profiles_name_len; a long Google display name
--     would otherwise abort the sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, consent_at)
  values (
    new.id,
    left(
      nullif(
        trim(
          coalesce(
            new.raw_user_meta_data ->> 'full_name',
            new.raw_user_meta_data ->> 'name',
            split_part(coalesce(new.email, ''), '@', 1)
          )
        ),
        ''
      ),
      80
    ),
    -- The email sign-up form sends options.data.consent = true when the
    -- parent/guardian checkbox is ticked. Everyone else (Google) gets NULL
    -- and is asked by the "Complete your profile" dialog. Compared as text,
    -- never cast: a ::boolean cast on an unexpected value would raise and
    -- take the whole sign-up down with it.
    case
      when lower(coalesce(new.raw_user_meta_data ->> 'consent', '')) in ('true', 't', 'yes', '1')
      then now()
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 4. Puzzle sampling — internal
-- ------------------------------------------------------------
-- Filter first into a materialised pool, then sample that. The earlier
-- `rand > random() order by rand limit N` shape is right for sampling an
-- unfiltered multi-million-row table, but every real call is highly
-- selective on theme + rating: the planner answers `order by rand` from the
-- rand index and walks most of it hunting for a rare theme (smotheredMate
-- has ~149 rows in the easy band), which hit the statement timeout on cold
-- cache. `rand > random()` then threw away half of an already tiny pool and
-- returned short batches. The pool is small by construction, so sorting it
-- is cheap and batches come back full.
--
-- VOLATILE, not STABLE: the body calls random(), and claiming stability
-- invites the planner to treat repeated calls as interchangeable.
--
-- NOT GRANTED TO ANY CLIENT ROLE. This is the side door that audit SEC-07
-- was about — a re-runnable migration re-granted EXECUTE here and quietly
-- reopened un-metered access. The grant below is a revoke, stated once, and
-- there is no other file that could contradict it.
create or replace function public.random_puzzles(
  p_themes     text[] default null,
  p_min_rating integer default 0,
  p_max_rating integer default 4000,
  p_limit      integer default 20
)
returns setof public.lichess_puzzles
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if p_themes is null or cardinality(p_themes) = 0 then
    return query
      select *
        from public.lichess_puzzles
       where rating between p_min_rating and p_max_rating
         and rand > random()
       order by rand
       limit v_limit;
  else
    return query
      with pool as materialized (
        select *
          from public.lichess_puzzles
         where rating between p_min_rating and p_max_rating
           and themes @> p_themes
      )
      select *
        from pool
       order by random()
       limit v_limit;
  end if;
end;
$$;

revoke execute on function public.random_puzzles(text[], integer, integer, integer)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. The daily allowance, metered at delivery (audit ENT-01)
-- ------------------------------------------------------------
-- What the old design got wrong: the allowance was counted from
-- `puzzle_attempts`, which the client writes fire-and-forget. A client that
-- simply never logged an attempt was never counted, so the free/pro/academy
-- puzzle difference — a thing the tiers are sold on — could not be
-- delivered. On top of that the wrapper checked `remaining > 0` and then
-- returned p_limit (20) rows unclamped, so even an honest client overshot a
-- nominal 5.
--
-- What this does instead: count puzzles on the way OUT, under a row lock,
-- and clamp the batch to what is left. A client cannot decline to be
-- counted, because it is not the one doing the counting. The row lock also
-- retires audit DB-04 — the old trigger counted then checked with no lock,
-- so two concurrent inserts could overshoot the cap by one.
--
-- Returns json rather than a rowset so the caller gets the batch AND the
-- updated remaining count in a single round trip; the UI reads the count
-- from here rather than keeping its own tally.
create or replace function public.puzzle_quota()
returns json
language sql
security definer
stable
set search_path = public
as $$
  with t as (
    select public.current_tier() as tier
  ),
  u as (
    select coalesce(
      (select a.delivered
         from public.puzzle_allowance a
        where a.user_id = auth.uid()
          and a.usage_date = public.ist_today()),
      0
    ) as used
  )
  select json_build_object(
    'tier',        t.tier,
    'daily_limit', public.tier_daily_puzzles(t.tier),
    'used_today',  u.used,
    'remaining',   case
                     when public.tier_daily_puzzles(t.tier) is null then null
                     else greatest(0, public.tier_daily_puzzles(t.tier) - u.used)
                   end
  )
  from t, u;
$$;

revoke all on function public.puzzle_quota() from public, anon;
grant execute on function public.puzzle_quota() to authenticated;

create or replace function public.random_puzzles_for_user(
  p_themes     text[] default null,
  p_min_rating integer default 0,
  p_max_rating integer default 4000,
  p_limit      integer default 20
)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_day   date;
  v_tier  text;
  v_limit integer;   -- the day's allowance; null = unlimited (academy)
  v_used  integer;
  v_room  integer;   -- how many this call may hand out
  v_batch json;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'SIGN_IN_REQUIRED: sign in to solve puzzles';
  end if;

  v_day   := public.ist_today();
  v_tier  := public.current_tier();
  v_limit := public.tier_daily_puzzles(v_tier);

  -- Take today's row, creating it if this is the first batch of the day,
  -- then lock it. Everything from here to COMMIT is serialised per user per
  -- day, so two tabs asking at once cannot both spend the same last puzzle.
  insert into public.puzzle_allowance (user_id, usage_date)
  values (v_uid, v_day)
  on conflict (user_id, usage_date) do nothing;

  select a.delivered
    into v_used
    from public.puzzle_allowance a
   where a.user_id = v_uid and a.usage_date = v_day
   for update;

  if v_limit is null then
    v_room := least(greatest(coalesce(p_limit, 20), 1), 100);
  else
    if v_used >= v_limit then
      raise exception 'PUZZLE_QUOTA_REACHED: daily puzzle limit reached for this account';
    end if;
    v_room := least(least(greatest(coalesce(p_limit, 20), 1), 100), v_limit - v_used);
  end if;

  select coalesce(json_agg(row_to_json(p)), '[]'::json), count(*)
    into v_batch, v_count
    from (
      select * from public.random_puzzles(p_themes, p_min_rating, p_max_rating, v_room)
    ) p;

  -- Charge for what was actually delivered, not for what was asked. A
  -- scarce category that can only produce 2 puzzles must not cost 5.
  update public.puzzle_allowance
     set delivered = delivered + v_count
   where user_id = v_uid and usage_date = v_day;

  return json_build_object(
    'tier',        v_tier,
    'daily_limit', v_limit,
    'used_today',  v_used + v_count,
    'remaining',   case when v_limit is null then null
                        else greatest(0, v_limit - (v_used + v_count)) end,
    'puzzles',     v_batch
  );
end;
$$;

revoke all on function public.random_puzzles_for_user(text[], integer, integer, integer) from public, anon;
grant execute on function public.random_puzzles_for_user(text[], integer, integer, integer) to authenticated;

-- SECURITY INVOKER on purpose: RLS still applies, so this can only ever
-- return the caller's own rows even if the WHERE clause were dropped.
create or replace function public.puzzle_stats()
returns json
language sql
security invoker
stable
set search_path = public
as $$
  with attempts as (
    select
      solved,
      coalesce(category, 'other') as category,
      (timezone('Asia/Kolkata', created_at))::date as day
    from public.puzzle_attempts
    where user_id = auth.uid()
  ),
  today as (
    select public.ist_today() as d
  ),
  solved_days as (
    select distinct day from attempts where solved
  ),
  -- Gaps and islands: consecutive dates share (day - row_number), so each
  -- group is one unbroken run. Keep the run that reaches today or yesterday
  -- — yesterday counts, so the number doesn't read as 0 first thing in the
  -- morning before the day's first puzzle.
  runs as (
    select grp, count(*)::int as len, max(day) as last_day
    from (
      select day, day - (row_number() over (order by day))::int as grp
      from solved_days
    ) g
    group by grp
  ),
  current_streak as (
    select coalesce(max(len), 0) as len
    from runs, today
    where runs.last_day >= today.d - 1
  ),
  per_category as (
    select category, count(*)::int as solved
    from attempts
    where solved
    group by category
  )
  select json_build_object(
    'total_attempted', (select count(*)::int from attempts),
    'total_solved',    (select count(*)::int from attempts where solved),
    'solved_today',    (select count(*)::int from attempts, today where solved and day = today.d),
    'streak',          (select len from current_streak),
    'by_category',     coalesce(
                         (select json_agg(json_build_object('category', category, 'solved', solved)
                                          order by solved desc, category)
                            from per_category),
                         '[]'::json
                       )
  );
$$;

revoke all on function public.puzzle_stats() from public, anon;
grant execute on function public.puzzle_stats() to authenticated;

-- ------------------------------------------------------------
-- 6. "X spots left" — a count, and only a count
-- ------------------------------------------------------------
-- SECURITY DEFINER is required, not cosmetic: an anonymous visitor has no
-- SELECT policy on the registrations table, so counting under the caller's
-- own rights would return 0 and every event would look empty forever.
-- No PII crosses this boundary: the return type is `integer`.
--
-- NULL means "no limit set". A row that does not exist or is unpublished
-- also yields NULL — the caller treats both as "no number to show", which
-- is the right behaviour for each.
create or replace function public.tournament_spots_left(p_tournament_id bigint)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case
           when t.capacity is null then null
           else greatest(0, t.capacity - (
                  select count(*)::int
                    from public.tournament_registrations r
                   where r.tournament_id = t.id))
         end
    from public.tournaments t
   where t.id = p_tournament_id and t.published;
$$;

create or replace function public.workshop_spots_left(p_workshop_id bigint)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case
           when w.capacity is null then null
           else greatest(0, w.capacity - (
                  select count(*)::int
                    from public.workshop_registrations r
                   where r.workshop_id = w.id))
         end
    from public.workshops w
   where w.id = p_workshop_id and w.published;
$$;

revoke all on function public.tournament_spots_left(bigint) from public;
revoke all on function public.workshop_spots_left(bigint)   from public;
grant execute on function public.tournament_spots_left(bigint) to anon, authenticated;
grant execute on function public.workshop_spots_left(bigint)   to anon, authenticated;

-- ------------------------------------------------------------
-- 7. register_for_event() — the only way a registration is created
-- ------------------------------------------------------------
-- This replaces a direct client INSERT plus a BEFORE INSERT trigger. The
-- registration tables have NO client INSERT policy in 03_rls.sql, so this
-- function is not a convenience wrapper — it is the only door, and every
-- rule below is therefore unavoidable rather than merely usual:
--
--   * user_id is taken from auth.uid() here, never from the caller, so a
--     forged user_id is not a thing that can be attempted.
--   * SELECT ... FOR UPDATE on the event row serialises everyone racing for
--     the last seat of THAT event; the lock is held to COMMIT, so the count
--     below cannot be stale by the time the row lands.
--   * ALREADY_REGISTERED is raised ahead of the closed and full checks
--     (audit FL-03). A parent who resubmits was previously told "this one is
--     full", which is both confusing and wrong about what to do next.
--   * The rate limit (audit SEC-03) is checked before any of it. Registration
--     is open to anonymous callers by design — a parent should not need an
--     account to book a seat — which also meant a scripted loop with the
--     public anon key could book out a paid event under invented names, or
--     flood a no-capacity event with junk records of children.
--
-- Returns the new registration id.
create or replace function public.register_for_event(
  p_kind          text,
  p_event_id      bigint,
  p_child_name    text,
  p_grade         text,
  p_parent_name   text,
  p_parent_email  text,
  p_parent_phone  text,
  p_notes         text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text := lower(btrim(coalesce(p_parent_email, '')));
  v_child   text := btrim(coalesce(p_child_name, ''));
  v_parent  text := btrim(coalesce(p_parent_name, ''));
  v_grade   text := nullif(btrim(coalesce(p_grade, '')), '');
  v_phone   text := nullif(btrim(coalesce(p_parent_phone, '')), '');
  v_notes   text := nullif(btrim(coalesce(p_notes, '')), '');
  v_pub     boolean;
  v_closes  timestamptz;
  v_cap     integer;
  v_taken   integer;
  v_recent  integer;
  v_id      bigint;
begin
  if p_kind not in ('workshop', 'tournament') then
    raise exception 'INVALID_KIND: %', p_kind;
  end if;
  if v_email = '' or v_child = '' or v_parent = '' then
    raise exception 'INVALID_INPUT: child name, parent name and parent email are all required';
  end if;

  -- --- audit SEC-03: throttle before doing any work ---
  select count(*) into v_recent
    from public.registration_rate_limit
   where scope = 'email'
     and key = v_email
     and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'RATE_LIMITED: too many registrations from this email address in the last hour';
  end if;

  if v_uid is not null then
    select count(*) into v_recent
      from public.registration_rate_limit
     where scope = 'user'
       and key = v_uid::text
       and created_at > now() - interval '1 hour';
    if v_recent >= 10 then
      raise exception 'RATE_LIMITED: too many registrations from this account in the last hour';
    end if;
  end if;

  -- --- lock the event, then decide ---
  if p_kind = 'workshop' then
    select w.published, coalesce(w.registration_deadline, w.start_at), w.capacity
      into v_pub, v_closes, v_cap
      from public.workshops w
     where w.id = p_event_id
     for update;
  else
    select t.published, coalesce(t.registration_deadline, t.start_at), t.capacity
      into v_pub, v_closes, v_cap
      from public.tournaments t
     where t.id = p_event_id
     for update;
  end if;

  if not found then
    raise exception 'REGISTRATION_CLOSED: that event no longer exists';
  end if;

  -- "You are already in" first: it is the most useful thing to tell someone
  -- who resubmits, and it is true regardless of whether the event is now
  -- full or closed.
  if p_kind = 'workshop' then
    if exists (
      select 1 from public.workshop_registrations r
       where r.workshop_id = p_event_id
         and lower(r.parent_email) = v_email
         and lower(r.child_name) = lower(v_child)
    ) then
      raise exception 'ALREADY_REGISTERED: this child is already registered for this workshop';
    end if;
  else
    if exists (
      select 1 from public.tournament_registrations r
       where r.tournament_id = p_event_id
         and lower(r.parent_email) = v_email
         and lower(r.child_name) = lower(v_child)
    ) then
      raise exception 'ALREADY_REGISTERED: this child is already registered for this tournament';
    end if;
  end if;

  if not v_pub or v_closes <= now() then
    raise exception 'REGISTRATION_CLOSED: registration for this one has closed';
  end if;

  if v_cap is not null then
    if p_kind = 'workshop' then
      select count(*) into v_taken from public.workshop_registrations where workshop_id = p_event_id;
    else
      select count(*) into v_taken from public.tournament_registrations where tournament_id = p_event_id;
    end if;
    if v_taken >= v_cap then
      raise exception 'EVENT_FULL: this one is full';
    end if;
  end if;

  if p_kind = 'workshop' then
    insert into public.workshop_registrations
      (workshop_id, user_id, child_name, grade, parent_name, parent_email, parent_phone, notes)
    values
      (p_event_id, v_uid, v_child, v_grade, v_parent, v_email, v_phone, v_notes)
    returning id into v_id;
  else
    insert into public.tournament_registrations
      (tournament_id, user_id, child_name, grade, parent_name, parent_email, parent_phone, notes)
    values
      (p_event_id, v_uid, v_child, v_grade, v_parent, v_email, v_phone, v_notes)
    returning id into v_id;
  end if;

  insert into public.registration_rate_limit (scope, key) values ('email', v_email);
  if v_uid is not null then
    insert into public.registration_rate_limit (scope, key) values ('user', v_uid::text);
  end if;

  -- Keep the throttle table from growing without bound. Nothing reads a row
  -- older than an hour; a day of slack costs nothing and keeps this cheap.
  delete from public.registration_rate_limit where created_at < now() - interval '1 day';

  return v_id;
end;
$$;

revoke all on function public.register_for_event(text, bigint, text, text, text, text, text, text) from public;
grant execute on function public.register_for_event(text, bigint, text, text, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. The joining link — registrants only
-- ------------------------------------------------------------
-- public.event_meeting_links has RLS on and no policies at all, so these two
-- functions are the only way in or out of it. Note what that buys: adding a
-- column to `workshops` can never accidentally expose a link, because the
-- link was never on `workshops`.
--
-- An anonymous registration cannot see the link — there is no account to
-- match it to. That is the intended shape of "visible only to registrants
-- via an authenticated RPC": book a seat while signed in, and the link is
-- on the event card afterwards.
create or replace function public.event_meeting_url(p_kind text, p_event_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_url text;
begin
  if p_kind not in ('workshop', 'tournament') then
    raise exception 'INVALID_KIND: %', p_kind;
  end if;
  if v_uid is null then
    raise exception 'SIGN_IN_REQUIRED: sign in to see the joining link';
  end if;

  if p_kind = 'workshop' then
    select l.meeting_url into v_url
      from public.event_meeting_links l where l.workshop_id = p_event_id;
  else
    select l.meeting_url into v_url
      from public.event_meeting_links l where l.tournament_id = p_event_id;
  end if;

  -- No link set for this event. Not an error: most events are offline.
  if v_url is null then
    return null;
  end if;

  if public.is_admin() then
    return v_url;
  end if;

  if p_kind = 'workshop' then
    if not exists (
      select 1 from public.workshop_registrations r
       where r.workshop_id = p_event_id and r.user_id = v_uid
    ) then
      raise exception 'NOT_REGISTERED: register for this workshop to see the joining link';
    end if;
  else
    if not exists (
      select 1 from public.tournament_registrations r
       where r.tournament_id = p_event_id and r.user_id = v_uid
    ) then
      raise exception 'NOT_REGISTERED: register for this tournament to see the joining link';
    end if;
  end if;

  return v_url;
end;
$$;

revoke all on function public.event_meeting_url(text, bigint) from public, anon;
grant execute on function public.event_meeting_url(text, bigint) to authenticated;

-- Admin write side. Passing NULL or an empty string clears the link.
create or replace function public.admin_set_meeting_url(
  p_kind      text,
  p_event_id  bigint,
  p_url       text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: admins only';
  end if;
  if p_kind not in ('workshop', 'tournament') then
    raise exception 'INVALID_KIND: %', p_kind;
  end if;

  if v_url is null then
    if p_kind = 'workshop' then
      delete from public.event_meeting_links where workshop_id = p_event_id;
    else
      delete from public.event_meeting_links where tournament_id = p_event_id;
    end if;
    return;
  end if;

  if p_kind = 'workshop' then
    insert into public.event_meeting_links (workshop_id, meeting_url)
    values (p_event_id, v_url)
    on conflict (workshop_id) where workshop_id is not null
    do update set meeting_url = excluded.meeting_url, updated_at = now();
  else
    insert into public.event_meeting_links (tournament_id, meeting_url)
    values (p_event_id, v_url)
    on conflict (tournament_id) where tournament_id is not null
    do update set meeting_url = excluded.meeting_url, updated_at = now();
  end if;
end;
$$;

revoke all on function public.admin_set_meeting_url(text, bigint, text) from public, anon;
grant execute on function public.admin_set_meeting_url(text, bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 9. Admin reads and writes that RLS cannot express
-- ------------------------------------------------------------
-- Emails live in auth.users, which is not client-readable at all.
create or replace function public.admin_list_members()
returns table (
  id              uuid,
  email           text,
  name            text,
  grade           text,
  role            text,
  tier            text,
  tier_expires_at timestamptz,
  created_at      timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: admins only';
  end if;

  return query
    select p.id, u.email::text, p.name, p.grade, p.role, p.tier, p.tier_expires_at, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at desc;
end;
$$;

-- For comped accounts and for fixing a membership by hand. A plain UPDATE
-- from the browser cannot do this: profiles.tier is outside the column-level
-- grant in 03_rls.sql, and that restriction is what stops a student from
-- promoting themselves.
create or replace function public.admin_set_tier(
  p_user_id    uuid,
  p_tier       text,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: admins only';
  end if;
  if p_tier not in ('free', 'pro', 'academy') then
    raise exception 'INVALID_TIER: %', p_tier;
  end if;

  update public.profiles
     set tier = p_tier,
         tier_expires_at = case when p_tier = 'free' then null else p_expires_at end
   where id = p_user_id;
end;
$$;

-- audit PERF-01: the admin events tab counted registrations by downloading
-- every registration row and tallying in JavaScript, which grows without
-- bound as the academy does. One aggregate, one round trip.
create or replace function public.event_registration_counts(p_kind text)
returns table (event_id bigint, registrations integer)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: admins only';
  end if;
  if p_kind not in ('workshop', 'tournament') then
    raise exception 'INVALID_KIND: %', p_kind;
  end if;

  if p_kind = 'workshop' then
    return query
      select w.id, (select count(*)::int from public.workshop_registrations r where r.workshop_id = w.id)
        from public.workshops w;
  else
    return query
      select t.id, (select count(*)::int from public.tournament_registrations r where r.tournament_id = t.id)
        from public.tournaments t;
  end if;
end;
$$;

revoke all on function public.admin_list_members()                         from public, anon;
revoke all on function public.admin_set_tier(uuid, text, timestamptz)      from public, anon;
revoke all on function public.event_registration_counts(text)              from public, anon;
grant execute on function public.admin_list_members()                    to authenticated;
grant execute on function public.admin_set_tier(uuid, text, timestamptz) to authenticated;
grant execute on function public.event_registration_counts(text)         to authenticated;

-- ============================================================
-- End of 02. Seventeen functions, one trigger. Every SECURITY DEFINER one
-- pins search_path and checks its own caller; 04_storage.sql's policies are
-- the only other place tier is consulted.
-- ============================================================
