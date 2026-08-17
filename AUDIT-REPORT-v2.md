# EduChess — Full-App Re-Audit (v2)

Read-only re-audit of the EduChess codebase (React SPA + Supabase). Fresh sweep +
re-test of every v1 finding, with a new **Client/Server Responsibility Map**.
Method: 6 phase-finders reading in parallel, Critical/High findings adversarially
re-verified, and the load-bearing facts (RLS core, payments, entitlements,
repo-vs-live state) read and quoted first-hand by the orchestrator. Nothing was
modified; the only new files are this report and `AUDIT-VERIFICATION-QUERIES-v2.sql`.

Audit date: 2026-08-11 · Baseline commit: `dbfa39a` (v1) · HEAD: `50bcfa0`
(branch `audit-fixes-phase1-3` = v1 + one commit of Phase 1-3 remediations)

---

## 1. Executive summary

Overall health: **structurally sound, operationally unfinished.** The security
*architecture* is good — RLS is enabled on every table, `is_admin()` is a hardened
gate, self-promotion and self-upgrade are blocked by column grants, capacity is
race-safe, and the payment money-path is server-authoritative and idempotent.

But two things dominate. **(1) Repo ≠ live.** Since v1 exactly one commit landed
(Phase 1-3 fixes); most of those are code-present but **not applied** — the two new
migrations, the `send-email` redeploy, and the SEC-20 key rotation are all pending
manual steps you confirmed you have not run, so the *running system* still has those
gaps. **Only ~4 of ~21 prior findings are actually live-effective** (all client-side
or docs). **(2) The billing is server-side but the entitlements are not** — course
videos (the paid product) sit in a public bucket, and the puzzle allowance is a
bypassable soft limit; both are things the paid tiers sell.

Finding counts (v2): **1 Critical · 1 High · 6 Medium · ~19 Low.**

**Fix first:** (1) **SEC-01** rotate the leaked service_role + legacy JWT secret
(still unrotated; total RLS/payment bypass). (2) **SEC-02** move paid course-video
delivery server-side (public bucket = free paywall). (3) apply the pending
migrations + redeploy `send-email` so the Phase 1-3 fixes actually take effect.

**Is the current client/server split safe to keep building on?** **Yes — with two
non-negotiables before monetizing:** rotate SEC-20, and put every *paid entitlement*
(course video now; puzzle-tier benefit if it's ever sold) behind a server gate. The
money mechanics themselves are already correctly server-side.

---

## 2. Phase 1 — verification of the v1 findings

Re-tested every finding from `AUDIT-REPORT.md`. **Status legend:** `FIXED` = in code
**and** live-effective · `FIXED*` = fixed in the repo but **NOT applied** to the
running system (needs a manual migration / redeploy / rotation you have not run) ·
`PARTIAL` · `NOT FIXED`.

**Count: 4 of 21 tracked findings are live-effective (FE-01, DB-01, plus the copy
half of FL-02 and the lockfile half of QUAL-01). 3 more are fixed-in-repo-not-applied
(SEC-21/FL-01, DB-02, FL-03). 1 Critical (SEC-20) remains fully open. The rest (~13)
are untouched.**

| v1 ID | Title | Status | Evidence (current) |
|---|---|---|---|
| **SEC-20** | Leaked service_role + legacy JWT secret in git history | **NOT FIXED** (Critical) | Keys not rotated (you ran nothing). `git cat-file -t 002da27:backend/.env.example` → `blob`; JWT `exp` 2036. Untracking ≠ rotation. Re-listed as **SEC-01** below. |
| SEC-21 / FL-01 | send-email duplicate emails (no idempotency) | **FIXED\*** | Repo: `send-email/index.ts:90-99` sends `Idempotency-Key`, `:166` derives `${table}:${record.id}`. But function **not redeployed** → live still duplicates. |
| FL-02 | UI asserts email delivery; Resend fetch unguarded | **PARTIAL** | Copy fixed & live-on-next-build (`EventCard.jsx:126`); try/catch added but rides the same un-run redeploy; persisted status/dead-letter unbuilt. |
| SEC-22 | backend `/health` reports wrong auth signal | **NOT FIXED** | `backend/app/main.py:36` unchanged; backend not deployed. |
| SEC-01 | ~20 admin policies inline `role='admin'` vs `is_admin()` | **NOT FIXED** | Inline subqueries unchanged across tournaments/videos/carousel/gallery/testimonials/chapters/contact/puzzles + storage. Re-listed **SEC-06**. |
| SEC-02 (TOCTOU) | quota trigger counts without a lock | **NOT FIXED** | `migration_phase8_tiers.sql:157-165` still lockless. Re-listed **DB-05**. |
| DB-01 | "filename order" not a valid migration order | **FIXED** (docs) | `SYSTEM-OVERVIEW`/`DEPLOYMENT.md §5` corrected; files deliberately not renumbered (hazard persists). |
| DB-02 | payments.user_id ON DELETE CASCADE | **FIXED\*** | `migration_payments_fk_restrict.sql` written, **not applied**; live FK still `on delete cascade` (`phase11:26`). Re-listed **DB-01**. |
| DB-03 | Missing FK indexes | **NOT FIXED** | No index migration in `dbfa39a..HEAD`. Re-listed **DB-04**. |
| DB-04 | quota trigger off-by-one race | **NOT FIXED** | (same as SEC-02 above.) |
| FE-01 | Admin "no access" flash on refresh | **FIXED** | `AuthContext.jsx` adds `profileLoading`; `AdminPage.jsx:11` gates on `checking = loading \|\| (user && profileLoading)`. Live on next build. |
| FE-02 | Puzzle quota "DB-enforced" but bypassable | **PARTIAL** | Docs made honest (soft limit); **bypass unchanged**. Re-framed as a paid-value gap — **ENT-01** below. |
| FE-03 | ContactForm no maxLength/trim | **NOT FIXED** | `ContactForm.jsx:45-61` unchanged. Re-listed **FE-05**. |
| FL-03 | "full" shown instead of "already registered" | **FIXED\*** | `migration_registration_dupe_message.sql` written, **not applied**; live triggers still raise `EVENT_FULL` first. |
| FL-04 | Parental consent cosmetic/dismissable | **FIXED** (client) | Dialog non-dismissable (`ProfileCompletionDialog.jsx:42`, name+consent gate). Still client-only → **PRIV-01**. |
| QUAL-01 | npm audit advisories | **PARTIAL** | nanoid/postcss patched in lockfile; react-router-dom still pre-v7 (breaking). Re-listed **QUAL-01**. |
| QUAL-02 | No code splitting | **NOT FIXED** | `App.jsx`/`vite.config.js` unchanged. Re-listed **QUAL-02**. |
| QUAL-03 | Tournaments/Workshops page duplication | **NOT FIXED** | Neither page in the delta. Re-listed **QUAL-03**. |
| QUAL-04 | Google Fonts `@import` render-blocking | **NOT FIXED** | `App.jsx` unchanged. Re-listed **QUAL-04**. |
| PERF-01 | AdminEvents counts by downloading all rows | **NOT FIXED** | `AdminEvents.jsx:134-136` unchanged. Re-listed **PERF-01**. |
| PERF-02 | EnquiriesInbox unpaginated | **NOT FIXED** | `EnquiriesInbox.jsx:10-13` unchanged. Re-listed **PERF-02**. |
| PERF-03 | Oversized wordmark PNG | **NOT FIXED** | Asset unchanged. Re-listed **PERF-03**. |

---

## 3. RLS coverage matrix

Each cell shows behavior for **anon / authenticated / admin**. `DEFAULT DENY` = RLS
on, no policy (correct for immutable/service-role-only). `OPEN (by design)` =
`using(true)` intended public read. **RLS is enabled on all 16 tables** — no
policy-on-disabled-table (no Critical RLS gap). Inline = `exists(select 1 from
profiles where id=auth.uid() and role='admin')` instead of `is_admin()` (SEC-06).

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **profiles** | own OR admin; anon deny | own (`auth.uid()=id`) | own row, **columns limited to name/grade/consent_at** (role/tier not writable) | DEFAULT DENY (via auth.users cascade) |
| **quest_progress** | own | own; points 0..50 | own (upsert) | DEFAULT DENY |
| **contact_submissions** | own OR admin (inline) | anyone (`user_id is not distinct from auth.uid()`) | DEFAULT DENY | DEFAULT DENY |
| **tournaments** | published / anon-public OR admin (inline) | admin (inline) | admin (`is_admin()`) | admin (inline) |
| **tournament_registrations** | own OR admin (inline) | anyone (uid-bound + published + window) + capacity trigger | DEFAULT DENY | DEFAULT DENY (FK RESTRICT) |
| **workshops** | published OR `is_admin()` | `is_admin()` | `is_admin()` | `is_admin()` |
| **workshop_registrations** | own OR `is_admin()` | anyone (uid-bound + published + window) + capacity trigger | DEFAULT DENY | DEFAULT DENY (FK RESTRICT) |
| **puzzle_attempts** | own OR `is_admin()` | own + quota trigger | DEFAULT DENY (immutable) | DEFAULT DENY |
| **payments** | own OR `is_admin()` | DEFAULT DENY (service-role only) | DEFAULT DENY (activation via RPC) | DEFAULT DENY |
| **videos** | **OPEN (by design)** — all incl anon | admin (inline) | admin (`is_admin()`) | admin (inline) |
| **course_chapters** | **OPEN (by design)** — all | admin (inline) | admin (`is_admin()`) | admin (inline) |
| **carousel_slides** | published OR admin (inline) | admin (inline) | admin (`is_admin()`) | admin (inline) |
| **gallery_images** | published OR admin (inline) | admin (inline) | admin (`is_admin()`) | admin (inline) |
| **testimonials** | published OR admin (inline) | admin (inline) | admin (`is_admin()`) | admin (inline) |
| **lichess_puzzles** | **OPEN (by design)** — all | DEFAULT DENY (service-role import) | DEFAULT DENY | DEFAULT DENY |
| **puzzles** (legacy) | **OPEN (by design)** | admin (inline) | DEFAULT DENY (superseded) | admin (inline) |
| **storage.objects** (course-videos, gallery-images, carousel-images) | public read per bucket (buckets are `public:true`) | admin (bucket + inline) | DEFAULT DENY | admin (bucket + inline) |

Note: `videos` OPEN + a `public:true` **course-videos** bucket is what makes the
paid-video paywall bypassable (**SEC-02**). The three OPEN puzzle/video tables are
intentional public reads; the concern is only that one of them (course video) gates
paid content.

---

## 4. Client/Server Responsibility Map

`A` = pure client OK · `B` = client→DB direct, OK **only if** fully RLS-guarded ·
`C` = must be server-side (capacity/`FOR UPDATE`, payment state, any paid/quota gate,
any amount, any secret). Verdict: **OK / MOVE / SIMPLIFY**.

| Operation | Current impl | Req. | Verdict | Evidence |
|---|---|---|---|---|
| Browse public content (home, courses list, events, testimonials, gallery) | DB direct | B | OK | world-readable tables, public SELECT policies |
| "Spots left" on an event | RPC | B | OK | `EventCard.jsx:46` → `*_spots_left()` (count-only, SECURITY DEFINER) |
| Sign up / sign in (Google, phone OTP, email) | client (Supabase Auth) | A | OK | `AuthContext.jsx:107-148` |
| Complete profile + consent | DB direct | B | OK | `ProfileCompletionDialog.jsx:95-102`; column grant + RLS |
| Edit profile (name/grade) | DB direct | B | OK | `DashboardPage.jsx:49-52` |
| Browse chapters + video list | DB direct | B | OK | `CourseDetail.jsx:39-51` |
| **Watch a tier-gated course video (the paid product)** | **mixed (client lock + public CDN)** | **C** | **MOVE** | `CourseDetail.jsx:98-99` UI-only; `media.js:31-33` `getPublicUrl` on public bucket — **SEC-02** |
| Fetch a puzzle batch (signed-in only) | RPC | C | OK | `puzzles.js:97` → `random_puzzles_for_user` (auth + quota gate; direct fn revoked) |
| Record a puzzle attempt / count vs daily cap | DB direct + trigger | C | OK\* | `enforce_puzzle_quota` trigger; **but count is client-logged → bypassable (ENT-01)** |
| Read quota / puzzle stats | RPC | B | OK | `puzzle_quota()`, `puzzle_stats()` |
| Play Stockfish + analysis | client (WebWorker) | A | OK | `StockfishPractice.jsx:103-135`; no DB/secret |
| Register for tournament / workshop | DB direct + trigger | C | OK | insert + `pg_advisory_xact_lock` capacity trigger + uid-bound RLS |
| View own registrations | DB direct | B | OK | `DashboardPage.jsx:216-225` (own rows) |
| Submit contact form | DB direct | B | OK | `ContactForm.jsx:16-22` (uid-bound RLS) |
| Upgrade checkout — create order / derive amount | Edge Function | C | OK | `razorpay-order` PRICES server-side; secret server-only |
| Payment verify + activate membership | Edge Function | C | OK | `razorpay-webhook` HMAC + idempotent `record_razorpay_payment` (service_role) |
| Post-payment tier reflection | DB direct (poll) | A | OK | `razorpay.js:96-103` polls own profile; browser callback non-authoritative |
| Admin content CRUD | DB direct | B | OK | `is_admin()` RLS on every table; UI role-check is cosmetic |
| Admin set member tier | RPC | C | OK | `admin_set_tier` (`is_admin()` gate); tier outside column grant |
| Admin list members w/ email | RPC | C | OK | `admin_list_members` (`is_admin()`, joins auth.users) |
| Admin view payments | DB direct | B | OK | admin/own SELECT only |
| Registration confirmation email | Edge Function | C | OK | `send-email` (service-role, webhook-driven) |
| **FastAPI JWT bridge (`src/lib/api.js` + `backend/app`)** | client | A | **SIMPLIFY** | imported nowhere; `VITE_API_URL` blank — dead weight (**SVR-02**) |
| **Legacy `quest_progress` self-award** | DB direct | C | **SIMPLIFY** | no client reads it; still a self-writable trigger surface (**DB-06**) |

**Only two operations are misplaced:** the paid course video (C living in the
client — **SEC-02/MOVE**) and the puzzle-attempt count (server-checked but fed by a
client log — **ENT-01**). Everything touching money is already category-C and
correct. Two server pieces are dead weight (SIMPLIFY).

---

## 5. Findings by layer

Severity: **Critical** = exploitable now / data loss / payment bypass · **High** =
security/correctness gap needing intent or timing · **Medium** = correctness/abuse ·
**Low** = hygiene.

### 5.1 Database, RLS & access control

#### SEC-01 · Critical · secret-leak · `backend/.env.example` @ `002da27` (git history) · *carry-forward of v1 SEC-20, still open*
Still exploitable. The leaked `SUPABASE_SERVICE_ROLE_KEY` (JWT decoding to
`role:service_role`, `exp` 2036) and the legacy HS256 secret remain fetchable from
pushed history and **have not been rotated** (you ran nothing). The service_role key
bypasses all RLS: a holder can write `payments`, call `record_razorpay_payment`, or
set any `profiles.tier` — a total payment bypass, which makes this a hard blocker for
going live. **Fix:** Supabase → API → *Reset service_role key*; JWT Keys → revoke the
legacy secret; redeploy Edge Functions; update the `send-email` webhook header. History
rewrite (BFG) is cleanup *after* rotation, not a substitute.

#### SEC-02 · High · paid-content-unprotected · `migration_admin_videos.sql:38-40,68-70`; `src/components/CourseDetail.jsx:98-99`; `src/lib/media.js:31-33` · *CONFIRMED (2 finders + verify)*
The Pro/Academy course-video paywall — the actual paid product — is enforced only by
a React `tierAllows()` check. `videos` is world-readable (`using (true)`) and the
`course-videos` bucket is `public:true`, so `media.js` returns a public CDN URL for
every chapter regardless of lock. A free or anonymous user can `select url from videos`
with the anon key (or read the network tab) and stream any locked video. The code
itself admits it (`phase8_tiers.sql:16-19`: "the chapter lock is a UI boundary, not a
security one"). Stubbed payments cap the blast radius *today*, but this is exploitable
the instant paid tiers go live. **Fix:** make `course-videos` private; serve
short-lived signed URLs from a SECURITY DEFINER RPC / Edge Function that checks
`current_tier() >= course_chapters.min_tier`; stop returning `url` for chapters the
caller's tier disallows.

#### DB-01 · Medium · cascade-data-loss · `migration_phase11_payments.sql:26` (live) vs `migration_payments_fk_restrict.sql` (repo, unapplied) · *carry-forward v1 DB-02*
On the **live** DB `payments.user_id` is still `on delete cascade`, so deleting an
auth user destroys their payment/receipt history — contradicting the RESTRICT rule the
project uses for registrations. The fix exists only as an unapplied migration file. No
live payment rows exist yet (stub), so nothing is lost today, but this becomes real the
moment payments go live or a DPDP erasure removes a paying user. **Fix:** apply
`migration_payments_fk_restrict.sql` before enabling payments; for erasure prefer
`ON DELETE SET NULL` (nullable `user_id`) so anonymised financial records survive.

#### SEC-03 · Medium · abuse / rate-limiting · `migration_security_fixes.sql:125-136`; `migration_phase5_capacity_enforcement.sql:57-65`
Event registration is open to anonymous callers with no rate limit, CAPTCHA, or
sign-in requirement. The unique index and capacity trigger stop *oversubscription* and
exact duplicates, but a scripted loop with the public anon key can register fake
children (distinct names/emails) up to `capacity` — denying real parents the last
seats of a paid event — and can flood no-capacity events with unbounded junk PII (a
DPDP liability, since these are children's records). **Fix:** throttle registrations
(Edge Function or per-IP / per-email limit), add a lightweight bot check, or require
sign-in to register; alert admins on abnormal bursts.

#### SEC-05 · Low · latent-privesc · `supabase/schema.sql:31-33`; `migration_security_fixes.sql:85-86`
The profiles **INSERT** policy has no column restriction and INSERT grants were never
narrowed (only UPDATE was). Not exploitable today — `handle_new_user()` pre-creates the
row with `role='student'` inside the signup transaction and there is no client DELETE
policy, so the row can't be dropped and re-inserted. But it's a defence-in-depth gap:
if the signup trigger is ever disabled/bypassed, a client could `INSERT` its own
profile with `role='admin'`/`tier='academy'`. **Fix:** revoke INSERT on `profiles`
from authenticated/anon (the DEFINER trigger doesn't need it), or add a `WITH CHECK`
pinning `role='student'` and `tier='free'`.

#### SEC-06 · Low · privilege-model-hygiene · ~20 policies (`migration_admin_videos.sql:45-49`, etc.) · *carry-forward v1 SEC-01*
~20 SELECT/INSERT/DELETE policies still inline the `role='admin'` subquery instead of
`is_admin()`. Functionally equivalent and not exploitable, but any change to admin
semantics must be duplicated ~20×. **Fix:** route them all through `public.is_admin()`.

#### SEC-07 · Low · migration-hygiene · `migration_lichess_puzzles_rpc_v2.sql:84-85` vs `migration_phase8_tiers.sql:225-226`
`rpc_v2` re-`grant`s EXECUTE on `random_puzzles()` to anon/authenticated "to stay
self-contained"; only phase8's later `revoke` closes it. Because the folder is flat
with no ledger and `rpc_v2` is headed "safe to re-run", re-applying `rpc_v2` after
phase8 silently reopens direct, un-quota'd anon access to the sampler. Latent (fine on
a clean single pass). **Fix:** drop the grant in `rpc_v2`, or append the revoke to it;
confirm live with `has_function_privilege` (query B4).

#### DB-04 · Low · concurrency · `migration_phase8_tiers.sql:157-165` · *carry-forward v1 DB-04/SEC-02*
`enforce_puzzle_quota` counts then checks with no `pg_advisory_xact_lock` (unlike the
registration triggers), so concurrent attempt inserts can overshoot the cap by one.
Soft limit + single-board UI → Low. **Fix:** advisory-lock on `new.user_id` first.

#### DB-05 · Low · missing-index · `migration_phase3_puzzle_attempts.sql:25`, registrations `user_id`, `uploaded_by` · *carry-forward v1 DB-03*
FK columns unindexed (`puzzle_attempts.puzzle_id`, `*_registrations.user_id`,
`uploaded_by`). Harmless while small; the registration/attempt tables grow. **Fix:**
add btree indexes.

#### DB-06 · Low · dead-surface · `supabase/schema.sql:82,96-99`; `migration_security_fixes.sql:96-97`
`quest_progress` is dead client-side (no React reads/writes it) but remains a live,
self-writable surface: the INSERT policy + AFTER INSERT trigger let a signed-in user
self-award up to 50 `rank_points` per invented `quest_key`, for a value the app no
longer shows. **Fix:** drop `quest_progress`, its trigger and `rank_points` in a
cleanup migration, or award points from a server-side mapping.

### 5.2 Auth & entitlements

#### ENT-01 · Medium · paid-feature not enforceable · `migration_phase8_tiers.sql:205-213`; `src/lib/puzzleProgress.js:56-70`; `src/lib/puzzles.js:97`
The daily puzzle allowance is a **paid-tier differentiator** (free 5 / pro 50 /
academy unlimited — `SYSTEM-OVERVIEW §5.2`), yet it is not enforceable. Two gaps
compound: (a) `used_today` is counted from `puzzle_attempts` that the client logs
fire-and-forget, so a client that never logs keeps `remaining>0` and gets unlimited
batches; (b) `random_puzzles_for_user` gates on `remaining>0` but returns `p_limit`
(20) rows **unclamped**, so even an honest client over-fetches past a nominal `5`.
v1 accepted the soft limit because puzzles are free public data — correct for the
*free* nudge, but the *pro/academy* puzzle benefit cannot actually be delivered as a
paid feature. **Fix:** if the allowance is sold, meter delivery server-side (record
consumption in `random_puzzles_for_user`, return `least(p_limit, remaining)`); if not,
stop listing it as a tier benefit. At minimum, clamp the batch (fixes (b) cheaply).

#### PRIV-01 · Low · consent-client-only · `src/components/ProfileCompletionDialog.jsx:40-42,95-102` · *refinement of v1 FL-04*
The non-dismissable consent dialog is a React gate; no RLS policy or trigger checks
`profiles.consent_at` before a user reads/writes data. A user driving supabase-js
directly, or dismissing via devtools, can use the app with `consent_at` NULL. Consent
is a children's-data (DPDP) requirement but is not a technical boundary. **Fix:** if
consent must bind, gate sensitive writes on `consent_at is not null` via RLS/trigger;
otherwise document the residual UI-only nature.

### 5.3 Payments (Razorpay — stubbed)

#### PAY-01 · Low · go-live-hardening · `razorpay-webhook/index.ts:98-101`; `migration_phase11_payments.sql:74-103`
Activation grants the stored tier without re-verifying the **captured amount/currency**
against the `payments` row. Low today (amount is fixed server-side and Razorpay enforces
the order amount), but a live system should assert `captured_amount == amount_paise` so
partial payments or future PRICES drift can't grant a tier for an underpayment. **Fix:**
pass and compare the captured amount/currency in `record_razorpay_payment`.

#### PAY-02 · Low · reconciliation · `razorpay-order/index.ts:133-141`; `razorpay-webhook/index.ts:88-90`
Abandoned/failed checkouts leave orphan `status='created'` rows forever; the schema's
`'failed'` state is never written, so a genuine failure is indistinguishable from an
abandoned modal and the admin ledger accrues noise. **Fix:** handle `payment.failed`
→ `status='failed'` and/or expire stale `created` rows.

**Payment reconciliation gap (Path B):** `admin_set_tier` updates `profiles.tier` but
there is **no way to write a `payments` ledger row from the UI** (no client INSERT
policy), so a manual Payment-Links flow marks the member paid but leaves no receipt.
Acceptable interim; note the ledger is tier-only.

### 5.4 Frontend & code quality

#### QUAL-01 · Medium · dependencies · `package.json` (`npm audit`) · *carry-forward, partial*
`npm audit`: 1 high + 3 moderate. nanoid/postcss are patched in the committed lockfile;
`vite`/`esbuild` are dev-server-only (fix = breaking `vite@8`); the one runtime-shipping
item, `react-router-dom` open-redirect, needs a breaking v6→v7 bump and is **not
reachable here** (all `<Link to>` are static, no SSR). **Fix:** schedule the v7/vite8
bumps as tested migrations; don't `--force`.

#### QUAL-02 · Medium · performance · `vite.config.js`; `src/App.jsx:9-21` · *carry-forward*
No route code splitting; one 741 KB JS chunk (`vite build` emits the >500 KB warning),
downloaded up front on the money paths on low-end Android. **Fix:** `React.lazy` the
`/admin` + `/practice` routes; `manualChunks` for framer-motion / chess.js.

#### PERF-01 · Medium · performance · `src/components/admin/AdminEvents.jsx:134-136` · *carry-forward*
Admin event counts fetch **every** registration row (`.select(foreignKey)`, no limit)
and tally in JS — unbounded as the academy grows. **Fix:** DB-side aggregate count.

**Low (carry-forward, unchanged — see v1 report for full detail):** **SEC-08** backend
`/health` auth signal (`main.py:36`); **FE-05** ContactForm no maxLength/trim
(`ContactForm.jsx:45-61`); **QUAL-03** Tournaments/Workshops page duplication;
**QUAL-04** Google-Fonts `@import`; **PERF-02** EnquiriesInbox unpaginated
(`EnquiriesInbox.jsx:10-13`); **PERF-03** 218 KB wordmark PNG; **FE-06** 20 ESLint
warnings (video `<track>` captions a11y, `react-hooks` informational).

#### SVR-02 · Low · dead-code / simplify · `src/lib/api.js`; `backend/app/*`
The FastAPI service and its client bridge are dead weight: `api.js` is imported nowhere,
`VITE_API_URL` is blank by design, and nothing in the frontend uses the backend (only
`backend/scripts/import_lichess_puzzles.py` runs, offline). It implies a server layer
that doesn't exist. **Fix:** delete `src/lib/api.js` + `backend/app` (keep the importer),
or wire the backend if signed-URL/AI features land.

---

## 6. Verified-OK (checked, passing)

**RLS / access control**
- RLS enabled on all 16 tables; no disabled-RLS-with-policy, no `force`, no `grant all`.
- `is_admin()` hardened (`SECURITY DEFINER`, `search_path=public`, reads `profiles.role`); the **only** admin gate — no hardcoded admin emails/UUIDs (`admin_videos.sql:20` is a commented example; client `role==='admin'` is UI-only).
- **Self-promotion & self-upgrade blocked:** `revoke update on profiles ... grant update (name,grade,consent_at)` — `role`/`tier`/`tier_expires_at`/`rank_points` not client-writable; tier changes only via `admin_set_tier` (is_admin) or the webhook.
- Public-PII leak fixed (profiles SELECT is own-row OR is_admin()).
- All 14 SECURITY DEFINER functions pin `search_path`; admin-only ones self-check `is_admin()`.
- All 7 admin content tables have UPDATE policies with `USING` + `WITH CHECK`.
- **Non-admin replay enumeration:** the only writes a non-admin can perform are their own (contact, registrations, own quest_progress, own puzzle_attempts, own profile name/grade/consent). No admin-only write is reachable by a crafted call.
- Capacity is race-safe (`pg_advisory_xact_lock` before a live count, BEFORE INSERT). *(Note: implemented as an advisory-lock trigger, not the `SELECT … FOR UPDATE` the brief assumed — functionally equivalent, and direct client INSERT is allowed but the RLS `WITH CHECK` binds `user_id` + published + window.)*
- Registration `user_id` spoofing and out-of-window inserts refused by RLS `WITH CHECK`.
- **Meeting-URL protection:** there is no `meeting_url` column and no view+RPC design (grep: 0 hits); links are emailed manually; `venue` is a public placeholder. Nothing to leak (query E1 checks no live link was pasted in).

**Payments (money path)**
- No secret ships client-side (only the publishable `VITE_RAZORPAY_KEY_ID`).
- Amount derived server-side from PRICES; client sends only `{tier}`.
- `payments` denies all client writes; `record_razorpay_payment` is service_role-only + idempotent (`FOR UPDATE` + `status='paid'` short-circuit); `razorpay_order_id` UNIQUE.
- Webhook verifies HMAC over the **raw** body, constant-time, before parse.
- Client "paid" callback grants nothing; the client polls the server for the tier.
- **Payment code is essentially code-complete** (Path A) — see §7.

**Puzzles / other**
- Puzzle delivery is auth-gated (`random_puzzles_for_user`; direct sampler revoked); `/puzzles` behind RequireAuth.
- Stockfish + analysis are correctly pure-client (no DB/secret).
- Build green (`vite build` exits 0); ESLint 0 errors; money-path screens have distinct loading/empty/error states; all internal `<Link>`s resolve; 404 wired.
- FK ON DELETE hygiene matches intent (registrations RESTRICT; user-owned CASCADE; uploaders SET NULL); no cached-count drift (counts are live).

---

## 7. Razorpay readiness (both go-live paths)

**Stub status:** not a code stub — a complete, unconfigured implementation. Frontend
`.env` (untracked) holds a `rzp_test_` publishable key; `.env.example` ships it blank,
so `paymentsEnabled=false` and upgrade buttons fall back to a "Talk to us" link. No
secret exists in the repo.

**Path A — Edge Function checkout (recommended): CODE-COMPLETE.**
- *Exists:* `razorpay-order` (verifies caller, derives amount from PRICES, writes a
  `created` row, aborts on failure); `razorpay-webhook` (raw-body HMAC verify, handles
  `payment.captured`/`order.paid`, idempotent `record_razorpay_payment`, UNKNOWN_ORDER→200).
  Signature verification lives *inside* the webhook (no separate endpoint needed).
- *Missing (config/deploy, not code):* deploy both functions (webhook `--no-verify-jwt`);
  set `RAZORPAY_KEY_ID`/`KEY_SECRET`/`WEBHOOK_SECRET`/`SITE_URL`; create the Razorpay
  dashboard webhook (matching secret); set frontend `VITE_RAZORPAY_KEY_ID`; confirm
  phase8+phase11 migrations are applied live. Optional: PAY-01 (assert captured amount).

**Path B — Payment Links + admin reconciliation: WORKS TODAY, ledger-incomplete.**
- *Exists:* `admin_list_members` + `admin_set_tier` + the AdminMembers UI let an admin
  mark any member Pro/Academy by hand after an out-of-band payment.
- *Missing:* no way to write a `payments` receipt row from the UI (tier-only, no ledger).

**Recommendation:** the app-logic layer is **green** — go live on **Path A** (deploy +
secrets + webhook + confirm migrations), keeping Path B as the manual fallback.
**Hard blocker: rotate SEC-01 first** — the entire server-side payment-integrity model
assumes the service_role key is secret, and it is currently leaked and unrotated; anyone
holding it can grant tiers or write `payments` directly. Also apply DB-01 before go-live.

---

## 8. Unverifiable locally

Needs the live project. Each has a paste-ready query in
`AUDIT-VERIFICATION-QUERIES-v2.sql` (section letters below map to that file).

| What to confirm | File § |
|---|---|
| RLS enabled on every table; full live policy set matches the migrations | A1, A2 |
| `storage.objects` RLS + the three buckets are `public:true` (SEC-02) | A3, A4 |
| profiles UPDATE/INSERT column grants exclude role/tier (self-promo / SEC-05) | B1, B2 |
| `record_razorpay_payment` EXECUTE is service_role-only | B3 |
| `random_puzzles()` has no anon/authenticated EXECUTE (SEC-07) | B4 |
| Every SECURITY DEFINER fn pins `search_path` | C1 |
| **FL-03 applied?** triggers raise `ALREADY_REGISTERED` (reported unapplied) | C2 |
| Migration applied-state: payments/tier/consent objects exist | C3 |
| **DB-01 applied?** `payments.user_id` CASCADE vs RESTRICT | D1, D2 |
| Enforcement triggers exist + enabled | D3 |
| FK indexes present (DB-05) | D4 |
| No live `venue` holds a real link; consent-NULL count; orphan payments; rank_points | E1–E5 |
| **SEC-01: keys rotated?** (dashboard) | F1 |
| `send-email` redeployed + 3 Database Webhooks exist (SVR-01) | F2 |
| Edge Functions deployed + secrets set (payments go-live) | F3 |
| Auth providers enabled / redirect-URL allowlist / OTP rate limits (dashboard) | F4–F6 |

---

## 9. Doc drift

| Doc claim | Reality | Location |
|---|---|---|
| "No … linter configured" | ESLint 9 is configured; `npm run lint` runs (20 warnings). | `CLAUDE.md:18` |
| App.jsx is "the entire application … quest, curriculum, quiz" / single-page prototype | App.jsx is a 13-route router shell; no quest/quiz/curriculum in current code. | `README.md:3,30-31` |
| "expects homepage.mp4 / maths.mp4 / english.mp4 in public/" | Videos come from the `course-videos` Storage bucket; seeds are `homepage.mp4`/`chess.mp4`. | `README.md:22-26` |
| Backend "validates JWT with the project JWT secret (HS256)" | Backend verifies ES256/RS256 via JWKS; HS256 is legacy-only behind a flag. (ARCHITECTURE is "proposed".) | `ARCHITECTURE.md:51-53` |
| Random selection via `rand > random() ORDER BY rand` | That approach was implemented then **retired** (planner/timeout); replaced by a materialised pool. | `ARCHITECTURE.md:111-113` |
| Puzzles fetched "via the `random_puzzles` RPC" | Client calls `random_puzzles_for_user`; `random_puzzles` EXECUTE is revoked (same doc, internal inconsistency). | `SYSTEM-OVERVIEW.md:154` |
| "bundle is ~715 KB (~210 KB gzipped)" | Current build is 741 KB / 215 KB gzip — stale by ~26 KB. | `SYSTEM-OVERVIEW.md:602-603` |

*(SYSTEM-OVERVIEW now correctly describes the mandatory consent dialog, the soft
puzzle limit, and the corrected migration order — those were fixed in the Phase 1-3
commit and verified accurate.)*

---

## 10. Fix roadmap v2

Migrations/rotation before client code; each phase scoped to its own fresh session.

**Phase A — Unblock go-live (do first).**
- **SEC-01** rotate the leaked service_role + legacy JWT secret; redeploy Edge
  Functions; update the `send-email` webhook header. *(Then, optionally, BFG the history.)*
- **Apply the pending migrations** you have not run: `migration_payments_fk_restrict.sql`
  (DB-01) and `migration_registration_dupe_message.sql` (FL-03); **redeploy `send-email`**
  (SVR-01/FL-02). Verify with the SQL in §8.

**Phase B — Close the paid-entitlement gaps (before monetizing).**
- **SEC-02** private `course-videos` bucket + signed-URL RPC gated on `current_tier()`.
- **ENT-01** decide: meter the puzzle allowance server-side, or stop selling it; at
  minimum clamp `random_puzzles_for_user` to `least(p_limit, remaining)`.
- **SEC-03** rate-limit / bot-check public registration.

**Phase C — Hardening & correctness.**
- **PAY-01** assert captured amount; **PAY-02** handle `payment.failed`; **PRIV-01**
  server-side consent gate (if required); **SEC-05** lock down profiles INSERT;
  **DB-04** advisory-lock the quota trigger.

**Phase D — Hygiene / simplification.**
- **SEC-06** route inline admin checks through `is_admin()`; **DB-05** FK indexes;
  **DB-06 / SVR-02** delete dead `quest_progress` + FastAPI bridge; **QUAL-01/02**,
  **PERF-01/02/03**, **FE-05/06**, **SEC-07/08**, **QUAL-03/04**.
- **Update `SYSTEM-OVERVIEW.md` / `CLAUDE.md` / `README.md` to match verified reality**
  (§9 drift) — done in the fix pass, not now.

---

*Method: 6 phase-finders (read-only) with adversarial re-verification of Critical/High
findings; the security core, payments, entitlements, and repo-vs-live state were also
read and quoted first-hand by the orchestrator. The working tree was committed to branch
`audit-fixes-phase1-3` before the audit, so the only new diff is this report and
`AUDIT-VERIFICATION-QUERIES-v2.sql`. Nothing in the application was modified.*
