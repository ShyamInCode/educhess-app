-- ============================================================
-- EDUCHESS — Phase 11: Razorpay payments
-- ------------------------------------------------------------
-- Run this AFTER migration_phase8_tiers.sql.
--
-- The money path, in order:
--   1. Browser asks the `razorpay-order` Edge Function for an order.
--      The function decides the AMOUNT from the tier — never the client —
--      and writes a payments row with status 'created'.
--   2. Razorpay Checkout takes the payment.
--   3. Razorpay calls the `razorpay-webhook` Edge Function, which verifies
--      the HMAC signature and calls record_razorpay_payment() below.
--
-- Activation is driven by the webhook, NOT by the browser's success
-- callback. A callback can be forged, dropped, or fired by someone who
-- closed the tab; the signed webhook is the only statement about money
-- that can be trusted.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. payments
-- ------------------------------------------------------------
create table if not exists public.payments (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null references auth.users (id) on delete cascade,
  tier                 text not null check (tier in ('pro', 'academy')),
  months               integer not null default 1 check (months between 1 and 24),
  amount_paise         integer not null check (amount_paise > 0),
  currency             text not null default 'INR',
  razorpay_order_id    text not null unique,
  razorpay_payment_id  text,
  status               text not null default 'created' check (status in ('created', 'paid', 'failed')),
  created_at           timestamptz not null default now(),
  paid_at              timestamptz
);

create index if not exists payments_user_created_idx
  on public.payments (user_id, created_at desc);

alter table public.payments enable row level security;

-- Read-only to everyone who is not the service role. There is deliberately
-- no INSERT or UPDATE policy: every write comes from an Edge Function using
-- the service-role key, because a client that could write here could grant
-- itself a membership.
drop policy if exists "Users can view their own payments" on public.payments;
create policy "Users can view their own payments"
  on public.payments for select
  using (auth.uid() = user_id);

drop policy if exists "Admins can view all payments" on public.payments;
create policy "Admins can view all payments"
  on public.payments for select
  using (public.is_admin());

-- ------------------------------------------------------------
-- 2. Activation, in one atomic and idempotent step
-- ------------------------------------------------------------
-- Razorpay retries a webhook until it gets a 2xx, and sends both
-- payment.captured and order.paid for the same money. Handling either one
-- twice must not buy two months, hence the row lock and the status check.
create or replace function public.record_razorpay_payment(
  p_order_id   text,
  p_payment_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pay public.payments%rowtype;
begin
  select * into pay
    from public.payments
   where razorpay_order_id = p_order_id
   for update;

  if not found then
    raise exception 'UNKNOWN_ORDER: %', p_order_id;
  end if;

  if pay.status = 'paid' then
    return false; -- already applied; this is a retry
  end if;

  update public.payments
     set status = 'paid',
         razorpay_payment_id = p_payment_id,
         paid_at = now()
   where id = pay.id;

  -- Extend from whichever is later, the current expiry or now. Someone who
  -- renews early keeps the time they already paid for; someone whose
  -- membership lapsed starts fresh today rather than backdated.
  update public.profiles
     set tier = pay.tier,
         tier_expires_at = greatest(coalesce(tier_expires_at, now()), now())
                           + make_interval(months => pay.months)
   where id = pay.user_id;

  return true;
end;
$$;

-- Only the Edge Function (service role) may call this. It is the function
-- that hands out memberships.
revoke all on function public.record_razorpay_payment(text, text) from public, anon, authenticated;
grant execute on function public.record_razorpay_payment(text, text) to service_role;

-- ------------------------------------------------------------
-- 3. Admin view of who is on what
-- ------------------------------------------------------------
-- profiles already lets admins SELECT every row (migration_security_fixes),
-- so the Members tab needs no new policy — only a way to see the email
-- address, which lives in auth.users and is not client-readable.
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

revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated;
