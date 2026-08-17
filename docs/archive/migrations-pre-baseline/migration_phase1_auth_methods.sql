-- ============================================================
-- EDUCHESS — Phase 1: Google + phone (OTP) sign-in support
-- ------------------------------------------------------------
-- Run this AFTER migration_security_fixes.sql.
--
-- What this adds:
--   1. profiles.consent_at — when the parent/guardian confirmed they
--      are a parent or have a parent's permission (DPDP Act: children's
--      data needs verifiable parental consent).
--   2. A rewritten handle_new_user() that survives the two new sign-in
--      methods. The old version read only raw_user_meta_data->>'name',
--      which Google (sends 'full_name'/'name') and phone OTP (sends
--      nothing, and has no email either) do not populate.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles.consent_at
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists consent_at timestamptz;

-- migration_security_fixes.sql revoked blanket UPDATE on profiles and
-- re-granted it column by column, so a new column is NOT writable by the
-- client until it is named here. Without this the consent dialog would
-- silently no-op ("Saved." with consent_at still null).
grant update (name, grade, consent_at) on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 2. handle_new_user() — must not fail for ANY auth method
-- ------------------------------------------------------------
-- This trigger runs inside the auth.users INSERT. If it raises, the whole
-- sign-up fails with an opaque "Database error saving new user", so every
-- expression below has to be null-safe:
--   * phone-only users have new.email = NULL   -> split_part(NULL,...) = NULL
--   * Google users have no 'name', only 'full_name'
--   * left(..., 80) protects the profiles_name_len check constraint; a
--     Google account with a long display name would otherwise abort signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
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
    -- parent/guardian checkbox is ticked. Everyone else (Google, phone)
    -- gets NULL and is asked by the "Complete your profile" dialog.
    -- Compared as text, not cast to boolean: a ::boolean cast on an
    -- unexpected value would raise and take the whole sign-up down with it.
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
  for each row execute procedure public.handle_new_user();
