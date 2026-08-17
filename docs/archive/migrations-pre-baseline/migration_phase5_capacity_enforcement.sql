-- ============================================================
-- EDUCHESS — Phase 5: server-side capacity + deadline enforcement
-- ------------------------------------------------------------
-- Run this AFTER migration_phase5_admin_update_policies.sql.
--
-- What this adds:
--   1. A BEFORE INSERT trigger on both registration tables that refuses
--      a registration once capacity is reached or the deadline has
--      passed. Until now capacity was decoration: it was displayed on
--      the card and enforced nowhere, so a popular tournament could be
--      oversubscribed by anyone who kept submitting.
--   2. tournament_spots_left() / workshop_spots_left() — SECURITY
--      DEFINER so the public page can show "3 spots left" without being
--      able to read a single registration row. They return a count and
--      nothing else; no PII crosses the boundary.
--
-- The client's own checks stay, but they are advisory. Two parents can
-- always submit the last seat at the same moment, and only the database
-- can settle that.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tournaments
-- ------------------------------------------------------------
-- SECURITY DEFINER is required, not cosmetic: an anonymous visitor has no
-- SELECT policy on the registrations table, so counting under the caller's
-- own rights would return 0 and every event would look empty forever.
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
  -- Serialise everyone racing for the last seat of THIS tournament. Held
  -- to the end of the transaction, so the count below can't be stale by
  -- the time the row lands.
  perform pg_advisory_xact_lock(hashtext('tournament_registrations'), new.tournament_id::int);

  select capacity, registration_deadline, start_at, published
    into ev
    from public.tournaments
   where id = new.tournament_id;

  if not found then
    raise exception 'REGISTRATION_CLOSED: that tournament no longer exists';
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

drop trigger if exists enforce_tournament_registration_trg on public.tournament_registrations;
create trigger enforce_tournament_registration_trg
  before insert on public.tournament_registrations
  for each row execute function public.enforce_tournament_registration();

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

drop trigger if exists enforce_workshop_registration_trg on public.workshop_registrations;
create trigger enforce_workshop_registration_trg
  before insert on public.workshop_registrations
  for each row execute function public.enforce_workshop_registration();

-- ------------------------------------------------------------
-- 3. "X spots left" — a count, and only a count
-- ------------------------------------------------------------
-- NULL means "no limit set". A row that does not exist or is unpublished
-- also yields NULL (no row to return) — the caller treats both as "no
-- number to show", which is the right behaviour for each.
create or replace function public.tournament_spots_left(p_tournament_id bigint)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case
           when t.capacity is null then null
           else greatest(
             0,
             t.capacity - (
               select count(*)::int
                 from public.tournament_registrations r
                where r.tournament_id = t.id
             )
           )
         end
    from public.tournaments t
   where t.id = p_tournament_id
     and t.published;
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
           else greatest(
             0,
             w.capacity - (
               select count(*)::int
                 from public.workshop_registrations r
                where r.workshop_id = w.id
             )
           )
         end
    from public.workshops w
   where w.id = p_workshop_id
     and w.published;
$$;

revoke all on function public.tournament_spots_left(bigint) from public;
revoke all on function public.workshop_spots_left(bigint) from public;
grant execute on function public.tournament_spots_left(bigint) to anon, authenticated;
grant execute on function public.workshop_spots_left(bigint) to anon, authenticated;
