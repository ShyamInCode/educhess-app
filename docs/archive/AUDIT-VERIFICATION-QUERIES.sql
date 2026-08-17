-- ============================================================================
-- EduChess — Audit verification queries
-- ----------------------------------------------------------------------------
-- Companion to AUDIT-REPORT.md section 6 ("Unverifiable locally").
-- Everything here needs the LIVE Supabase project because the repo cannot
-- prove the deployed state: which policies/triggers/functions actually exist,
-- what data is in the tables, and what lives only in the dashboard
-- (Database Webhooks, Edge Function JWT gates, key rotation).
--
-- READ-ONLY. Paste a section into Supabase SQL Editor and run. Nothing here
-- mutates. Items marked "dashboard/CLI" cannot be answered by SQL at all.
-- ============================================================================


-- ============================================================================
-- A. RLS POLICIES & COLUMN PRIVILEGES
-- ============================================================================

-- A1. Full policy set for every public table — confirm it matches the
--     migrations and that no permissive/leftover policy was added out-of-band.
--     (Backs the whole RLS coverage matrix in report section 3.)
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- A2. profiles column-level UPDATE privileges — the anti-self-promotion /
--     anti-self-upgrade control. authenticated must be able to UPDATE only
--     name/grade/consent_at, and NOT role/tier/tier_expires_at/rank_points.
--     (Backs SEC verified-OK C1, and FE-02/self-upgrade concerns.)
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and privilege_type = 'UPDATE'
order by grantee, column_name;

-- A3. Storage object policies for the public buckets — confirm anon cannot
--     INSERT/UPDATE/DELETE, only public SELECT + admin write.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;


-- ============================================================================
-- B. FUNCTIONS (SECURITY DEFINER, grants, quota logic)
-- ============================================================================

-- B1. Every SECURITY DEFINER function in public — confirm each pins
--     search_path (proconfig should contain search_path=public) and has the
--     expected volatility. (Backs is_admin() audit + SEC verified-OK.)
select p.proname,
       p.prosecdef              as security_definer,
       p.provolatile            as volatility,   -- i=immutable, s=stable, v=volatile
       p.proconfig              as settings,      -- expect {search_path=public}
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;

-- B2. random_puzzles() must have NO EXECUTE for anon/authenticated; only the
--     wrapper random_puzzles_for_user() should be reachable by clients.
select has_function_privilege('anon',          'public.random_puzzles(text[],integer,integer,integer)', 'execute') as anon_can_random,
       has_function_privilege('authenticated', 'public.random_puzzles(text[],integer,integer,integer)', 'execute') as authed_can_random,
       has_function_privilege('authenticated', 'public.random_puzzles_for_user(text[],integer,integer,integer)', 'execute') as authed_can_wrapper;

-- B3. Full body of the quota functions — needed to confirm FE-02: whether the
--     signed-in daily cap is derived ONLY from client-inserted puzzle_attempts
--     rows (bypassable by withholding logPuzzleAttempt) or whether the wrapper
--     records consumption itself.
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('puzzle_quota','random_puzzles_for_user','enforce_puzzle_quota','tier_daily_puzzles','current_tier')
order by p.proname;

-- B4. record_razorpay_payment() body + payments constraints — the webhook's
--     no-double-grant / idempotency guarantee depends entirely on these.
select pg_get_functiondef(oid) as record_razorpay_payment
from pg_proc where proname = 'record_razorpay_payment';

select conname, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid = 'public.payments'::regclass;


-- ============================================================================
-- C. CONSTRAINTS, FOREIGN KEYS, TRIGGERS, INDEXES
-- ============================================================================

-- C1. ON DELETE action stored on every public FK. Confirms registrations are
--     RESTRICT (r) and, for DB-02, that payments.user_id is CASCADE (c).
--     confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT
select con.conname,
       rel.relname     as child_table,
       confrel.relname as parent_table,
       con.confdeltype as on_delete
from pg_constraint con
join pg_class rel     on rel.oid     = con.conrelid
join pg_class confrel on confrel.oid = con.confrelid
where con.contype = 'f'
  and rel.relnamespace = 'public'::regnamespace
order by child_table, conname;

-- C2. The three enforcement triggers exist AND are enabled (tgenabled = 'O').
select tgrelid::regclass as table_name, tgname, tgenabled
from pg_trigger
where not tgisinternal
  and tgname in ('enforce_tournament_registration_trg',
                 'enforce_workshop_registration_trg',
                 'enforce_puzzle_quota_trg');

-- C3. Indexes on the tables that grow + the two unique registration indexes.
--     Backs DB-03 (missing FK indexes on puzzle_id / *_registrations.user_id).
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('puzzle_attempts','lichess_puzzles','payments',
                    'tournament_registrations','workshop_registrations')
order by tablename, indexname;


-- ============================================================================
-- D. OPERATIONAL DATA CHECKS
-- ============================================================================

-- D1. Operational leak check — no PUBLISHED event is currently storing a live
--     joining link in the world-readable `venue` column (ROADMAP warns against
--     this for children's classes; the venue is anon-readable via published=true).
select 'workshop' as kind, id, title, venue
from public.workshops
where published and venue ~* '(https?://|zoom|meet\.google|teams\.microsoft|/j/)'
union all
select 'tournament', id, title, venue
from public.tournaments
where published and venue ~* '(https?://|zoom|meet\.google|teams\.microsoft|/j/)';

-- D2. Any duplicate registrations that slipped past the unique index
--     (validates the unique index is holding; backs SEC-21/FL-01 impact).
select tournament_id, lower(parent_email) as email, lower(child_name) as child, count(*)
from public.tournament_registrations
group by 1,2,3 having count(*) > 1;

select workshop_id, lower(parent_email) as email, lower(child_name) as child, count(*)
from public.workshop_registrations
group by 1,2,3 having count(*) > 1;

-- D3. How many accounts are using the app with NO parental consent recorded
--     (validates FL-04 real-world exposure for OAuth/phone users who dismissed
--     the ProfileCompletionDialog). Children's PII under India's DPDP Act.
select count(*) filter (where consent_at is null) as no_consent,
       count(*)                                   as total
from public.profiles;

-- D4. Row counts for the unpaginated admin queries (PERF-01, PERF-02) — how
--     close these are to being a real problem.
select 'contact_submissions'      as tbl, count(*) from public.contact_submissions
union all select 'tournament_registrations', count(*) from public.tournament_registrations
union all select 'workshop_registrations',   count(*) from public.workshop_registrations;


-- ============================================================================
-- E. OUT-OF-BAND CONFIG (dashboard / CLI — NOT answerable by SQL)
-- ============================================================================

-- E1. KEY ROTATION (SEC-20, Critical). No SQL can validate a key.
--     Dashboard: Project Settings -> API -> "Reset service_role key".
--               Settings -> JWT Keys -> revoke the "Legacy JWT Secret".
--     Then redeploy all Edge Functions and set ALLOW_LEGACY_HS256=false once
--     legacy tokens have aged out (access tokens last ~1h). The leaked
--     service_role JWT for project ref wskvfidhkujdrjumndly had iat 1784440711
--     (2026-07-19) / exp 2100016711 (2036) — confirm the CURRENT key's iat is
--     newer than 1784440711.

-- E2. The three Database Webhooks (INSERT on tournament_registrations,
--     workshop_registrations, contact_submissions -> send-email) exist ONLY in
--     the dashboard. The entire confirmation-email flow depends on them.
--     Try (may vary by project) or inspect Database -> Webhooks in the dashboard:
select tgrelid::regclass as table_name, tgname, pg_get_triggerdef(oid) as def
from pg_trigger
where not tgisinternal
  and tgrelid in ('public.tournament_registrations'::regclass,
                  'public.workshop_registrations'::regclass,
                  'public.contact_submissions'::regclass);
-- Retry history (turns a transient Resend 502 into a duplicate send — FL-01):
-- select * from net._http_response order by created desc limit 50;

-- E3. Edge Function JWT gates (razorpay-webhook must be deployed with
--     --no-verify-jwt; send-email/razorpay-order keep the platform gate).
--     Not visible from SQL. Run:  supabase functions list
--     and inspect each function's verify_jwt (config.toml [functions.<name>]).

-- E4. WEBHOOK_SECRET on the three send-email webhooks defaults to the (leaked)
--     service_role key. When rotating in E1, also update the Authorization
--     header configured on each webhook, or set an explicit WEBHOOK_SECRET.
