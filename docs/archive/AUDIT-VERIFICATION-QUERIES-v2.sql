-- ============================================================================
-- EduChess — Audit v2 verification queries
-- ----------------------------------------------------------------------------
-- Companion to AUDIT-REPORT-v2.md section 8 ("Unverifiable locally").
-- Everything here needs the LIVE Supabase project. The repo cannot prove:
--   (a) which migrations were actually applied (the user confirmed only that
--       the TWO newest files are unapplied, but the whole chain is assumed),
--   (b) table data,
--   (c) dashboard-only config: key rotation, Edge Function deploys, Database
--       Webhooks, Auth providers, redirect URLs, OTP rate limits.
--
-- READ-ONLY. Paste a section into the Supabase SQL editor. Items marked
-- "dashboard/CLI" cannot be answered by SQL.
-- ============================================================================


-- ============================================================================
-- A. RLS ENABLED + FULL POLICY SET  (backs the RLS matrix, report section 3)
-- ============================================================================

-- A1. Confirm RLS is enabled on every public table (relrowsecurity = true).
--     A "false" here on any table with a permissive policy = CRITICAL.
select c.relname as table, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- A2. Every policy, public + storage — compare against the migrations; flag any
--     out-of-band permissive policy, and any inline role='admin' that should be
--     is_admin() (finding SEC-06 / v1 SEC-01).
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, cmd, policyname;

-- A3. storage.objects RLS state + the three bucket policies (public buckets).
select relrowsecurity from pg_class where oid = 'storage.objects'::regclass;
select policyname, cmd, roles from pg_policies
where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- A4. Are the storage buckets actually public? (course-videos public = the
--     paid-video paywall gap, finding SEC-02.)
select id, name, public from storage.buckets order by id;


-- ============================================================================
-- B. GRANTS & COLUMN PRIVILEGES  (self-promotion / self-upgrade / paid bypass)
-- ============================================================================

-- B1. profiles column-level UPDATE grant to authenticated/anon MUST be only
--     name/grade/consent_at — never role/tier/tier_expires_at/rank_points.
--     (self-promotion C1 + self-upgrade + AC-02 basis.)
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('authenticated', 'anon')
order by grantee, privilege_type, column_name;

-- B2. profiles INSERT column grant — finding SEC-05 (AC-02): can a client insert
--     role/tier? (The signup trigger normally pre-creates the row, but confirm.)
select grantee, privilege_type, string_agg(column_name, ', ' order by column_name) as cols
from information_schema.role_column_grants
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('authenticated', 'anon')
group by grantee, privilege_type;

-- B3. record_razorpay_payment EXECUTE must be service_role ONLY.
select grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public' and routine_name = 'record_razorpay_payment';

-- B4. random_puzzles() must have NO anon/authenticated EXECUTE (finding SEC-07):
--     confirms the phase8 revoke won over the rpc_v2 re-grant.
select has_function_privilege('anon',          'public.random_puzzles(text[],integer,integer,integer)', 'execute') as anon_exec,
       has_function_privilege('authenticated', 'public.random_puzzles(text[],integer,integer,integer)', 'execute') as authed_exec,
       has_function_privilege('authenticated', 'public.random_puzzles_for_user(text[],integer,integer,integer)', 'execute') as wrapper_authed;


-- ============================================================================
-- C. FUNCTIONS  (search_path safety + applied-state of the two new migrations)
-- ============================================================================

-- C1. Every SECURITY DEFINER function pins search_path (proconfig has search_path).
select p.proname, p.prosecdef as security_definer, p.provolatile, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;

-- C2. FL-03 applied-state: do the registration triggers raise ALREADY_REGISTERED?
--     (true only if migration_registration_dupe_message.sql was run — reported UNAPPLIED.)
select proname,
       pg_get_functiondef(oid) ilike '%ALREADY_REGISTERED%' as has_already_registered
from pg_proc
where proname in ('enforce_tournament_registration', 'enforce_workshop_registration');

-- C3. Migration applied-state: core payment/tier objects exist.
select to_regclass('public.payments') as payments_table;
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('tier', 'tier_expires_at', 'consent_at', 'role');
select proname from pg_proc
where proname in ('record_razorpay_payment','admin_set_tier','admin_list_members','current_tier','is_admin');


-- ============================================================================
-- D. CONSTRAINTS, FOREIGN KEYS, TRIGGERS
-- ============================================================================

-- D1. DB-02 applied-state: payments.user_id ON DELETE action.
--     confdeltype: c = CASCADE (still the live baseline), r = RESTRICT (fix applied).
select con.conname, con.confdeltype as on_delete
from pg_constraint con join pg_class rel on rel.oid = con.conrelid
where rel.relname = 'payments' and con.contype = 'f' and con.conname like '%user_id%';

-- D2. All ON DELETE actions across public FKs (registrations RESTRICT, etc.).
select con.conname, rel.relname as child, con.confdeltype as on_delete
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
where con.contype = 'f' and rel.relnamespace = 'public'::regnamespace
order by child, conname;

-- D3. Enforcement triggers exist AND are enabled (tgenabled = 'O').
select tgrelid::regclass as table_name, tgname, tgenabled
from pg_trigger
where not tgisinternal
  and tgname in ('on_auth_user_created','on_quest_completed',
                 'enforce_tournament_registration_trg','enforce_workshop_registration_trg',
                 'enforce_puzzle_quota_trg')
order by table_name, tgname;

-- D4. Indexes on the tables that grow (finding DB-03: FK columns unindexed).
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('puzzle_attempts','tournament_registrations','workshop_registrations','payments')
order by tablename, indexname;


-- ============================================================================
-- E. DATA CHECKS
-- ============================================================================

-- E1. Any published event storing a real joining link in the world-readable
--     venue column (workshops/tournaments SELECT is anon-readable).
select 'workshop' as kind, id, title, venue from public.workshops
where published and venue ~* '(https?://|zoom|meet\.google|teams\.microsoft|/j/)'
union all
select 'tournament', id, title, venue from public.tournaments
where published and venue ~* '(https?://|zoom|meet\.google|teams\.microsoft|/j/)';

-- E2. Accounts using the app with NO parental consent recorded (PRIV-01 exposure).
select count(*) filter (where consent_at is null) as no_consent, count(*) as total
from public.profiles;

-- E3. Orphan / stuck payment rows (PAY-02): status never leaves 'created'.
select status, count(*) from public.payments group by status order by status;

-- E4. rank_points inflation check (DI-02 / quest_progress dead surface).
select max(rank_points) as max_rank_points, count(*) filter (where rank_points > 0) as nonzero
from public.profiles;

-- E5. Row counts behind the unpaginated admin queries (PERF-01/PERF-02).
select 'contact_submissions' as tbl, count(*) from public.contact_submissions
union all select 'tournament_registrations', count(*) from public.tournament_registrations
union all select 'workshop_registrations', count(*) from public.workshop_registrations;


-- ============================================================================
-- F. OUT-OF-BAND CONFIG (dashboard / CLI — NOT answerable by SQL)
-- ============================================================================

-- F1. SEC-01 (Critical) — the leaked service_role + legacy JWT secret must be
--     ROTATED. No SQL validates a key.
--     Dashboard: Project Settings -> API -> "Reset service_role key";
--               Settings -> JWT Keys -> revoke the "Legacy JWT Secret".
--     The leaked service_role JWT (project ref wskvfidhkujdrjumndly) had
--     iat 1784440711 / exp 2100016711 (2036); confirm the CURRENT key's iat
--     is newer than 1784440711. Then redeploy Edge Functions + update the
--     send-email webhook Authorization header.

-- F2. SVR-01 — send-email Edge Function redeployed (Idempotency-Key + try/catch)
--     and the three Database Webhooks (INSERT on tournament_registrations,
--     workshop_registrations, contact_submissions) exist and are enabled.
--     CLI:  supabase functions list
--     Dashboard: Database -> Webhooks.

-- F3. Payments go-live (Path A): razorpay-order + razorpay-webhook deployed
--     (webhook with --no-verify-jwt); secrets RAZORPAY_KEY_ID / KEY_SECRET /
--     WEBHOOK_SECRET / SITE_URL set; Razorpay dashboard webhook for
--     payment.captured + order.paid points at the function with a matching secret.
--     CLI:  supabase functions list ;  supabase secrets list

-- F4. Auth providers actually enabled (Email / Phone / Google). VITE_AUTH_METHODS
--     gates only the client UI; a provider enabled in the dashboard is reachable
--     via supabase.auth regardless. Dashboard: Authentication -> Providers.

-- F5. OAuth redirect-URL allowlist is not over-permissive (no wildcards).
--     Dashboard: Authentication -> URL Configuration -> Redirect URLs.

-- F6. Phone-OTP server-side rate limits (client only enforces a 30s resend
--     cooldown). Dashboard: Authentication -> Rate Limits.
