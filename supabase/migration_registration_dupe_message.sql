-- ============================================================
-- EDUCHESS — friendlier "already registered" message
-- ------------------------------------------------------------
-- Run this AFTER migration_phase5_capacity_enforcement.sql.
--
-- Addresses audit finding FL-03. The BEFORE INSERT capacity trigger raised
-- EVENT_FULL before the row ever reached the unique-entry index, so a parent
-- who was already registered for a FULL event was told "this one is full"
-- instead of "you're already registered" — confusing, though harmless.
--
-- Fix: check for an existing registration for the same (event, parent_email,
-- child_name) FIRST, and raise a distinct ALREADY_REGISTERED. The unique index
-- (migration_security_fixes.sql / migration_phase4_workshops.sql) is still the
-- real constraint; this only decides which message the parent sees, and it is
-- deliberately raised before both the closed and full checks because "you are
-- already in" is the most useful thing to tell someone who resubmits.
--
-- Only the two trigger functions change; the triggers themselves already point
-- at these names, so `create or replace function` is enough.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tournaments
-- ------------------------------------------------------------
create or replace function public.enforce_tournament_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev    record;
  taken integer;
begin
  perform pg_advisory_xact_lock(hashtext('tournament_registrations'), new.tournament_id::int);

  select capacity, registration_deadline, start_at, published
    into ev
    from public.tournaments
   where id = new.tournament_id;

  if not found then
    raise exception 'REGISTRATION_CLOSED: that tournament no longer exists';
  end if;

  -- Already registered? Say so, ahead of the closed/full checks (audit FL-03).
  if exists (
    select 1 from public.tournament_registrations r
     where r.tournament_id = new.tournament_id
       and lower(r.parent_email) = lower(new.parent_email)
       and lower(r.child_name) = lower(new.child_name)
  ) then
    raise exception 'ALREADY_REGISTERED: this child is already registered for this tournament';
  end if;

  if not ev.published or coalesce(ev.registration_deadline, ev.start_at) <= now() then
    raise exception 'REGISTRATION_CLOSED: registration for this tournament has closed';
  end if;

  if ev.capacity is not null then
    select count(*) into taken
      from public.tournament_registrations
     where tournament_id = new.tournament_id;

    if taken >= ev.capacity then
      raise exception 'EVENT_FULL: this tournament is full';
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Workshops
-- ------------------------------------------------------------
create or replace function public.enforce_workshop_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev    record;
  taken integer;
begin
  perform pg_advisory_xact_lock(hashtext('workshop_registrations'), new.workshop_id::int);

  select capacity, registration_deadline, start_at, published
    into ev
    from public.workshops
   where id = new.workshop_id;

  if not found then
    raise exception 'REGISTRATION_CLOSED: that workshop no longer exists';
  end if;

  -- Already registered? Say so, ahead of the closed/full checks (audit FL-03).
  if exists (
    select 1 from public.workshop_registrations r
     where r.workshop_id = new.workshop_id
       and lower(r.parent_email) = lower(new.parent_email)
       and lower(r.child_name) = lower(new.child_name)
  ) then
    raise exception 'ALREADY_REGISTERED: this child is already registered for this workshop';
  end if;

  if not ev.published or coalesce(ev.registration_deadline, ev.start_at) <= now() then
    raise exception 'REGISTRATION_CLOSED: registration for this workshop has closed';
  end if;

  if ev.capacity is not null then
    select count(*) into taken
      from public.workshop_registrations
     where workshop_id = new.workshop_id;

    if taken >= ev.capacity then
      raise exception 'EVENT_FULL: this workshop is full';
    end if;
  end if;

  return new;
end;
$$;
