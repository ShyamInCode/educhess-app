# EduChess — Full-App Security & Correctness Audit

Read-only audit of the EduChess codebase (React SPA + Supabase). Scope: security,
database integrity, frontend correctness, data flows, code quality, performance.
Method: every load-bearing security claim was read first-hand and quoted; a
7-dimension agent sweep produced the finding set, and every Critical/High finding
was adversarially re-verified against its cited evidence. No application code,
migration, or config was changed. Only this file and `AUDIT-VERIFICATION-QUERIES.sql`
were created.

Audit date: 2026-08-11 · Commit at HEAD: `dbfa39a`

---

## 1. Executive summary

Overall health is **good** — the security core is genuinely solid. RLS is enabled
on all 16 public tables, `is_admin()` is a hardened `SECURITY DEFINER` helper,
self-promotion to admin and self-upgrade to a paid tier are both blocked by
column-level grants, event capacity is race-safe under an advisory lock, and the
Razorpay activation path is idempotent. The two prior "critical holes" (public
profiles PII, self-promotion) are confirmed fixed, and the suspected missing-UPDATE-
policy gap is fully closed.

There is **one Critical**: a live Supabase `service_role` key and the legacy JWT
secret remain in git history and must be **rotated**, not just untracked.

Counts: **1 Critical · 0 High · 9 Medium · 11 Low** (21 findings).

**Fix these three first:**
1. **SEC-20** — rotate the leaked `service_role` + legacy JWT secret in Supabase (exploitable now; RLS bypass).
2. **SEC-21/FL-01 + FL-02** — the confirmation-email path both sends duplicates on retry and fails silently while the UI promises "email on its way."
3. **QUAL-01** — clear the dependency advisories (`npm audit fix` fixes nanoid + postcss non-breaking; the rest need breaking major upgrades — see remediation note and the corrected QUAL-01 finding).

Close behind: **FE-02** (the signed-in puzzle quota is bypassable despite the code
claiming DB enforcement) and **FL-04** (parental consent is cosmetic for Google/phone
sign-in — relevant because every user is a child under India's DPDP Act).

---

## 1a. Remediation applied — 2026-08-11

Phase-1 batch fixed in this session (Critical + the three fix-first Mediums). Verified with
`npm run lint` (0 errors) and `npm run build` (succeeds).

| Finding | Status | What changed |
|---|---|---|
| **SEC-20** (Critical) | **Owner action — not code** | Key rotation is a Supabase dashboard step and involves live credentials, so it is left to the owner (see §7 Phase 1 / SQL §E). The leaked file is already untracked and gitignored; per decision, no git-history rewrite was performed. |
| **SEC-21 / FL-01** (Medium) | **Fixed** | `send-email/index.ts` now sends a deterministic `Idempotency-Key` (`${table}:${record.id}`) to Resend, so a re-fired webhook or Resend retry no longer produces a duplicate email. |
| **FL-02** (Medium) | **Fixed** | The Resend `fetch` is wrapped in try/catch so a network failure is logged and returns 502 (safe to retry now that sends are idempotent) instead of throwing an opaque uncaught 500. The `EventCard` success copy no longer asserts delivery: it now reads "A confirmation email should arrive shortly; if it doesn't, just get in touch." *(Full delivery observability — a persisted send status + admin surface + dead-letter — remains a larger follow-up.)* |
| **QUAL-01** (Medium) | **Partially fixed** | `npm audit fix` cleared **nanoid** (high) and **postcss** (moderate) and bumped react-router-dom 6.27→6.30.4. The remaining 4 advisories (react-router-dom ×2, esbuild/vite) require **breaking** major upgrades and are **not exploitable in this app** — see the corrected QUAL-01 finding. Not upgraded. |

**Phase 2 batch (correctness of "enforced" claims)** — verified with `npm run lint`
(0 errors) and `npm run build` (succeeds).

| Finding | Status | What changed |
|---|---|---|
| **FE-02** (Medium) | **Resolved — documented** | Per decision, the daily puzzle allowance is treated as the soft cap it actually is (free public Lichess data, zero marginal cost). No enforcement change; the overstated "DB-enforced" claims are corrected in `puzzleProgress.js`, `AuthContext.jsx`, and `SYSTEM-OVERVIEW §5.2` so the code/docs match reality. |
| **FL-04** (Medium) | **Fixed** | `ProfileCompletionDialog` is now **non-dismissable**: "Not now" → "Cancel and sign out", and it gates on name + consent (grade no longer traps a user without one). Google/phone users must record consent before using the app; `SYSTEM-OVERVIEW §1/§5.4` updated. Client-side gate; a server-side consent gate (puzzle RPC + registration RLS) remains an optional defence-in-depth follow-up. |
| **DB-01** (Medium) | **Fixed — docs** | `CLAUDE.md` and `SYSTEM-OVERVIEW` no longer say "filename order"; both point at `docs/DEPLOYMENT.md §5` as the authoritative run order, which now carries a "filename order is not valid" note. Files were not renumbered (chosen over the larger rename diff). |
| **DB-02** (Low) | **Migration written — run pending** | New `supabase/migration_payments_fk_restrict.sql` changes `payments.user_id` to `ON DELETE RESTRICT`, matching the registrations philosophy. **Manual migration — you must run it** (added to `DEPLOYMENT.md §5` as item 16). |

**Phase 3 batch (registration / admin-panel UX)** — verified with `npm run lint`
(0 errors) and `npm run build` (succeeds).

| Finding | Status | What changed |
|---|---|---|
| **FE-01** (Medium) | **Fixed** | AuthContext now exposes a `profileLoading` flag (separate from the session `loading`), and `AdminPage` shows "Checking access…" until *both* resolve. A legitimate admin no longer flashes the red "no admin access" card on hard refresh / deep link. |
| **FL-03** (Low) | **Migration written — run pending** | New `supabase/migration_registration_dupe_message.sql` makes both capacity triggers raise `ALREADY_REGISTERED` (before the closed/full checks), and `EventRegistrationForm.friendlyRegistrationError` maps it to "already registered." A parent resubmitting for a full event now gets the useful message. **Manual migration — you must run it** (`DEPLOYMENT.md §5` item 17). |

---

## 2. Findings by layer

Severity: **Critical** = exploitable now / data loss · **High** = security or
correctness gap needing intent or timing · **Medium** = correctness/UX · **Low** = hygiene.

### 2.1 Database & RLS

#### DB-01 · Medium · migration-hygiene · `supabase/*.sql`, `CLAUDE.md:64`, `docs/SYSTEM-OVERVIEW.md:584` · *fixed (docs) — see §1a*
**What & why.** The migrations are a flat folder with no numeric prefixes or ledger, and
`CLAUDE.md:64` / `SYSTEM-OVERVIEW.md:81` instruct running them "in filename order."
Filename order is **not** a valid execution order: lexical sort puts `schema.sql`
(which creates `profiles`) *after* every `migration_*` file, puts
`migration_security_fixes.sql` (which defines `is_admin()`) *after*
`migration_phase4_workshops.sql` (which calls it), and puts `migration_phase11_*`
before `phase1/3/8`. A fresh rebuild done the way the docs say fails with
`function public.is_admin() does not exist` / `relation public.course_chapters does not exist`.
The correct order exists only as prose in `docs/DEPLOYMENT.md §5`, which self-describes
as "reconstructed from filenames… not from a migration ledger."
**Fix.** Rename every file with a numeric/timestamp prefix so lexical sort equals run
order (`0001_schema.sql`, `0002_admin_videos.sql`, … `security_fixes` before the phase
files, `chapters` before `chapter_delete`), or adopt `supabase/migrations` with the CLI
ledger. Correct the "filename order" wording in CLAUDE.md and SYSTEM-OVERVIEW to point at
DEPLOYMENT.md §5 as the single source.

#### SEC-01 · Low · privilege-model-hygiene · `migration_admin_videos.sql:47-49` (+8 tables)
**What & why.** ~20 SELECT/INSERT/DELETE policies inline
`exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')`
instead of calling the `is_admin()` helper. Phase 5 converted the *UPDATE* policies to
`is_admin()` but left the others inlined on tournaments, tournament_registrations,
testimonials, gallery_images, carousel_slides, videos, course_chapters,
contact_submissions and legacy puzzles. Functionally equivalent today, but any future
change to admin semantics (role rename, a superadmin, gating on `tier_expires_at`) must
be duplicated across ~20 policies or they silently diverge; the inline form also depends
on the `profiles` self-SELECT policy staying in place, which the `DEFINER` helper does not.
**Fix.** Replace each inline subquery with `public.is_admin()`, matching what
`migration_phase5_admin_update_policies.sql` already did for the UPDATE policies.

#### DB-02 · Low · cascade-data-loss · `migration_phase11_payments.sql:26` · *migration written, run pending — see §1a*
**What & why.** `payments.user_id … references auth.users (id) on delete cascade`. Deleting
an auth user (one dashboard click) silently destroys their entire payment/receipt history
— the exact opposite of the deliberate `ON DELETE RESTRICT` chosen for registrations
(`migration_phase4_workshops.sql:69` reasons "these are business records for a paid
session"). Financial records are the stronger business record, yet they cascade.
**Fix.** Confirm intent; consider `ON DELETE RESTRICT`, or `SET NULL` with a retained
email/amount snapshot, so paid-membership history survives account deletion.

#### DB-03 · Low · missing-index · `migration_phase3_puzzle_attempts.sql:25`, `migration_tournaments.sql:78`, `migration_phase4_workshops.sql:77`
**What & why.** Several FK columns have no supporting index: `puzzle_attempts.puzzle_id`
(only `(user_id, created_at)` is indexed), `tournament_registrations.user_id`,
`workshop_registrations.user_id` (the unique indexes lead with the *event* id, not
user_id), and the `uploaded_by`/`user_id` columns on the content tables. Deleting an auth
user (SET NULL) or the "view own registrations" policy (`auth.uid() = user_id`) then does a
sequential scan. Harmless while tiny; `puzzle_attempts` and the registration tables are the
ones that grow.
**Fix.** Add btree indexes on `puzzle_attempts(puzzle_id)`,
`tournament_registrations(user_id)`, `workshop_registrations(user_id)`, and the content
tables' `uploaded_by` columns.

#### DB-04 · Low · race-condition · `migration_phase8_tiers.sql:142-169`
**What & why.** `enforce_puzzle_quota()` counts today's `puzzle_attempts` then checks the
cap with **no lock**, unlike the registration triggers which take
`pg_advisory_xact_lock(...)` before counting (`migration_phase5_capacity_enforcement.sql:42`).
Two attempt inserts racing between the count and commit can both see `used < lim` and both
land, letting a user exceed 5/50 by one. The single-board UI serialises conclusions so it is
hard to trigger, and the quota is a soft business limit — hence Low — but it is a genuine
gap versus the locked capacity path. (This is the same root cause the sweep surfaced three
times; it is one issue.)
**Fix.** Take `pg_advisory_xact_lock(hashtext('puzzle_quota'), hashtext(new.user_id::text))`
at the top of `enforce_puzzle_quota()`, mirroring the registration triggers — or accept and
document it as soft-limit slack.

### 2.2 Auth & Edge Functions

#### SEC-20 · Critical · secret-leak · `backend/.env.example` @ commit `002da27` · **VERIFIED (adversarial + first-hand)**
**What & why.** `git show 002da27:backend/.env.example` returns a live
`SUPABASE_SERVICE_ROLE_KEY` (a genuine JWT decoding to `{"role":"service_role",
"ref":"wskvfidhkujdrjumndly","iat":1784440711,"exp":2100016711}` — issued 2026-07-19,
**not** expiring until 2036) and, concatenated onto the `ALLOW_LEGACY_HS256=true` line,
the legacy HS256 secret (`BtelHU…`). The project ref matches the live frontend config
(`.env:1`), proving it is the real project's key, not a placeholder. The service_role key
**bypasses every RLS policy** (full read/write of all tables, including children's PII);
the legacy secret lets anyone **mint a valid token for any user id** that the FastAPI
backend accepts while `ALLOW_LEGACY_HS256=true`. The service_role key is also the default
`WEBHOOK_SECRET` for `send-email`, so a holder can drive that function as an open email
relay. Commit `dbfa39a` `git rm`'d the file but the blob is still reachable in pushed
history (`git cat-file -t 002da27:backend/.env.example` → `blob`); that commit's own message
concedes untracking "does NOT undo the exposure… Rotating the keys in Supabase is the only fix."
**Fix.** Rotate **both** now: Project Settings → API → *Reset service_role key*, and
Settings → JWT Keys → revoke the *Legacy JWT Secret*; then redeploy all Edge Functions,
update the `send-email` webhook Authorization headers to the new secret, and set
`ALLOW_LEGACY_HS256=false` once legacy tokens have aged out (~1h). Rewriting git history
(git-filter-repo / BFG) is cleanup *after* rotation, not a substitute for it.

#### SEC-21 / FL-01 · Medium · idempotency · `supabase/functions/send-email/index.ts:90-106,160-168`
**What & why.** `sendViaResend()` posts to Resend with **no `Idempotency-Key` header** and
nothing records that a row was already emailed. Supabase Database Webhooks (pg_net) can
re-fire the same INSERT, and the function returns **502 on a Resend error**
(`index.ts:164`), which invites a retry; a network drop after Resend accepts but before its
response arrives also re-sends on retry. Each re-fire produces a second identical
confirmation email to the parent from the brand domain. Impact is UX/reputation, not data
loss.
**Fix.** Send a deterministic `Idempotency-Key` derived from row identity
(`${table}:${record.id}`), or persist a `sent_at`/message-id on the registration row and
skip if already set.

#### FL-02 · Medium · failure-visibility · `src/components/EventCard.jsx:124-128`
**What & why.** On insert success the UI states "You're registered. A confirmation email is
on its way." But delivery is a separate async webhook chain the browser never observes: a
Resend rejection only `console.error`s and returns 502 (`send-email/index.ts:163-167`), and
the `fetch` in `sendViaResend` (`index.ts:91`) is not wrapped in try/catch, so a network
error throws out of the handler. If the three Database Webhooks are misconfigured/absent,
or Resend rejects (unverified domain, bad key), the parent gets **no** confirmation while
the page told them one is coming — with no trace beyond a function log.
**Fix.** Either soften the copy so it does not assert delivery, or make delivery observable:
wrap the Resend fetch in try/catch and log every failure, persist a send status the admin
panel surfaces, and add a retry/dead-letter path for missed confirmations.

#### SEC-22 · Low · correctness · `backend/app/main.py:36`
**What & why.** The `/health` probe reports `"auth_configured": bool(settings.supabase_jwt_secret)`,
but the current verification path (`app/auth.py`) verifies tokens against the project JWKS
built from `supabase_url` and only falls back to `supabase_jwt_secret` for legacy HS256. An
operator running the recommended asymmetric-only setup (no legacy secret) sees
`auth_configured=false` even though `/me` works — misleading during deploy, and could prompt
setting the unnecessary legacy secret. Cosmetic; the actual verification logic is correct,
and the backend is written-but-not-deployed.
**Fix.** Report readiness as
`bool(settings.supabase_url or (settings.allow_legacy_hs256 and settings.supabase_jwt_secret))`,
matching the fail-closed condition in `auth.py._decode()`.

### 2.3 Frontend

#### FE-02 · Medium · quota-enforcement · `src/lib/puzzleProgress.js:50-64`, `migration_phase8_tiers.sql:118-135,205-212` · **VERIFIED first-hand** · *resolved (documented as soft limit) — see §1a*
**What & why.** The signed-in daily puzzle allowance is claimed to be "enforced in the
database, not the client" (`AuthContext.jsx:150-151`, `SYSTEM-OVERVIEW §5.2`), but it is
effectively **bypassable**. The entire quota is computed from `puzzle_attempts` rows:
`puzzle_quota()` derives `used_today` as `count(*) from puzzle_attempts … today`
(`phase8:118-124`), and `random_puzzles_for_user()` reads that `remaining` and refuses a
batch only when it is `<= 0` (`phase8:205-209`) — **but the wrapper hands out the batch
without recording any consumption** (`phase8:211-212`). Those `puzzle_attempts` rows are
inserted only by the client's fire-and-forget `logPuzzleAttempt` (`puzzleProgress.js:50-64`).
A client that keeps calling the RPC but never logs attempts keeps `used_today = 0` forever,
so `remaining` never drops, the overlay (a local counter, `PuzzleTrainer.jsx:316`) never
trips, and the `enforce_puzzle_quota` trigger never fires because no inserts happen →
**unlimited puzzles**. The resource is low value (public Lichess puzzles), so severity is
Medium, but the "DB-enforced" claim is false as written.
**Fix.** Make consumption server-authoritative and independent of client self-reporting:
have `random_puzzles_for_user()` itself record the batch (insert a lightweight per-batch
ledger row or increment a per-day counter) so fetching consumes quota regardless of whether
the client logs attempts — or reclassify the limit as a soft/advisory cap and correct the docs.

#### FL-04 · Medium · consent-enforcement · `src/components/ProfileCompletionDialog.jsx:19,88-95` · *fixed (client gate) — see §1a*
**What & why.** Parental consent (`profiles.consent_at`) is purely cosmetic for Google/phone
sign-in. `needsCompletion` is its only consumer (`return !profile.name || !profile.grade ||
!profile.consent_at;`, line 19), and the dialog is dismissable ("Not now" →
`dismiss()` sets sessionStorage, lines 88-95). No gate anywhere checks `consent_at` —
`RequireAuth` checks only `user`, and the puzzle/registration paths check
`auth.uid()`/quota/published, never consent. `SYSTEM-OVERVIEW.md:20-21` states "Sign-up
records an explicit parent/guardian consent timestamp," but for OAuth/phone that holds only
if the user completes a dialog they can skip. Every user is a child; India's DPDP Act wants
verifiable parental consent, and ROADMAP already tracks privacy/consent as pending — so the
gap is acknowledged, but the specific "records consent" claim is contradicted for OAuth/phone.
**Fix.** If consent is legally required, gate app usage on `consent_at` (make the dialog
non-dismissable for children, or check `consent_at` in `RequireAuth` and the puzzle/registration
paths) rather than nagging once per session.

#### FE-01 · Medium · auth-guard-race · `src/pages/AdminPage.jsx:22`, `src/lib/AuthContext.jsx:35-37` · *fixed — see §1a*
**What & why.** A real admin who hard-refreshes or deep-links to `/admin` sees a red "Your
account doesn't have admin access" card flash before the panel loads. `AdminPage` renders
that card when `!loading && user && !isAdmin` (line 22), but `loading` is cleared by the
*session* effect (`AuthContext.jsx:35-37`), while `profile` (hence `role`) is fetched in a
*separate* effect that has not resolved yet — so there is a render where `user` is truthy,
`loading` is false, and `profile` is still null. It self-corrects when the profile arrives.
Direction is safe (a non-admin never flashes the panel), so this is UX, not a privilege leak.
**Fix.** Gate the admin decision on the profile actually being loaded — expose a
`profileLoading` (or treat `user && profile === null` as still-loading) and keep showing
"Checking access…" until the profile row resolves.

#### FL-03 · Low · error-mapping · `migration_phase5_capacity_enforcement.sql:57-65` · *migration written, run pending — see §1a*
**What & why.** An already-registered parent who resubmits for a **full** event is told
"This one is full" instead of "already registered." The BEFORE INSERT capacity trigger
counts (`taken`, which includes the existing registration) and raises `EVENT_FULL`
(lines 62-64) *before* the row reaches the `_unique_entry` index that would raise 23505.
Confusing but harmless; no data effect.
**Fix.** Optionally check for an existing (event, email, child) registration — or catch
23505 — before the capacity check, so a duplicate submit reports "already registered"
regardless of fullness.

#### FE-03 · Low · input-validation · `src/components/ContactForm.jsx:16-22,45-60`
**What & why.** `ContactForm` applies no `maxLength` or trimming to any field and inserts the
raw payload, relying entirely on the DB `contact_submissions_sane` constraint. The sibling
`EventRegistrationForm` caps every field (`maxLength={120}`, notes `{2000}`,
`EventRegistrationForm.jsx:95-121`). An oversized `struggles` value fails the insert with the
generic "Something went wrong" rather than an actionable message.
**Fix.** Add `maxLength` caps (and `.trim()`/`.slice()` on submit) matching
`EventRegistrationForm`, and surface a length-specific message.

### 2.4 Code quality

#### QUAL-01 · Medium · dependencies · `package.json` (`npm audit`) · *partially remediated (see §1a)*
**What & why.** `npm audit` reported 6 known vulnerabilities. **Two are now fixed** by a
non-breaking `npm audit fix`: `nanoid` (high, infinite loop) and `postcss` (moderate). The
**four that remain cannot be fixed without a breaking major upgrade**, and — correcting the
first pass of this report — none is practically exploitable in *this* app:
- `react-router-dom` (direct dep, was `^6.27.0`) has two advisories (GHSA-wrjc-x8rr-h8h6
  open-redirect-via-backslash, GHSA-337j-9hxr-rhxg SSR constructor injection). `npm audit fix`
  bumped it to **6.30.4**, the newest 6.x, but the only *patched* release is **7.18.x** — a
  breaking v6→v7 migration. The open-redirect needs a user-controlled `<Link to>`/`navigate()`
  target, and this app has **none** (all route targets are static); the second is **SSR-only**
  and this is a static SPA with no SSR. So neither is reachable here.
- `esbuild`/`vite` (GHSA-67mh-4wv8-2f99) is a **dev-server-only** issue and its fix is a
  breaking bump to **vite 8**.

**Fix.** Keep the applied nanoid/postcss patches. Schedule the two breaking upgrades
(react-router-dom v7, vite 8) as a deliberate, separately-tested migration rather than a
`--force` — they are hygiene/future-proofing here, not live exposure. Do not `npm audit fix
--force` blindly (it would jump both frameworks at once).

#### QUAL-03 · Low · duplication · `src/pages/TournamentsPage.jsx:14-34` vs `src/pages/WorkshopsPage.jsx:20-42`
**What & why.** The two public list pages are near-identical copies: the same
`supabase.from(<table>).select("*").eq("published",true).gte("start_at",…).order(…)` inside
an identical cancellable effect, the same loading/error/empty machine, the same `EventCard`
map — differing only in table name, `kind`, copy, and Workshops' extra CTA block. The admin
side already collapsed this (one config-driven `AdminEvents`), so these two are the last
place the copy-paste survives and can drift.
**Fix.** Extract a shared `useUpcomingEvents(table)` hook or an `<EventListPage kind=… />`
component and pass the differing copy/CTA. (Recommend only — do not build here.)

#### QUAL-04 · Low · performance · `src/App.jsx:48-50,120-121`
**What & why.** Google Fonts are loaded via a CSS `@import` embedded in an inline `<style>`
rendered by React, forcing a serial chain (JS → style → discover `@import` → fetch Google CSS
→ fetch font files) that delays first meaningful text paint.
**Fix.** Move the font stylesheet to `<link rel="preconnect" href="https://fonts.gstatic.com"
crossorigin>` + `<link rel="stylesheet">` in `index.html`, or self-host the woff2.

### 2.5 Performance

#### QUAL-02 · Medium · performance · `src/App.jsx:9-21`, `vite.config.js`
**What & why.** There is zero route-based code splitting — all 13 pages are statically
imported and there is no `React.lazy`/`Suspense` (`grep` → none) and no
`manualChunks`. A first-time visitor on `/` downloads the entire admin CRUD tree, the
chess.js + Stockfish glue, and framer-motion (used only by AboutPage) up front, inflating
time-to-interactive on the exact page most visits land on — on the Indian mobile connections
this audience uses.
**Fix.** Convert the route element imports to `React.lazy()` behind a `<Suspense>` boundary
(at least AdminPage, PracticePage, PuzzlesPage, AboutPage), and/or add
`build.rollupOptions.output.manualChunks` to split vendor libs.

#### PERF-01 · Medium · performance · `src/components/admin/AdminEvents.jsx:134-136`
**What & why.** The admin events screen counts registrations by fetching **every**
registration row that has ever existed (`.select(config.foreignKey)` with no `.limit()`/
`.range()`) and tallying client-side. The registration tables grow for the life of the
academy, so every admin page load re-downloads the full history just to render "N registered"
badges — unbounded, and it degrades silently as the academy succeeds.
**Fix.** Replace with a DB-side aggregate — a per-event count view/RPC, or per-row
`select('*', { count: 'exact', head: true })` — so the row set never crosses the wire.

#### PERF-02 · Low · performance · `src/components/admin/EnquiriesInbox.jsx:10-13`
**What & why.** The enquiries inbox does `.from("contact_submissions").select("*")` with no
limit or pagination. Leads accumulate forever and are never pruned, so this view fetches and
renders every lead ever submitted on each open — unlike the members payments query
(`.limit(50)`) and the video list (`.limit(10)`).
**Fix.** Add `.range(0, 49)` with a "load more" control, or at least `.limit(N)`, consistent
with the bounded admin queries.

#### PERF-03 · Low · performance · `public/educhess_title.png` (`NavBar.jsx:83`, `Footer.jsx:30`)
**What & why.** The wordmark is a 934×235, 218 KB PNG rendered at ~36 px tall (`h-9`) in the
NavBar on every route (and again in the Footer) — ~6× oversized and ~10× heavier than needed,
a fixed per-visit cost. The team already fixed this exact class of problem for the favicon
(`index.html:6-14`), so it is an inconsistency.
**Fix.** Ship a correctly-sized asset (~300×75 for 2× DPR) or an inline SVG wordmark, and/or
serve WebP.

---

## 3. RLS coverage matrix

`S/I/U/D` = SELECT / INSERT / UPDATE / DELETE. "MISSING (denied)" = no policy, so the
operation is refused for all client roles (correct where writes are service-role-only or the
data is immutable). "inline role check" = `exists(select 1 from profiles … role='admin')`
rather than `is_admin()` (see **SEC-01**). RLS is **enabled on every table**.

| Table | S | I | U | D |
|---|---|---|---|---|
| **profiles** | own (`auth.uid()=id`) OR `is_admin()` | own (`auth.uid()=id`) | own (`auth.uid()=id`); **column grant limited to name/grade/consent_at** — role/tier/rank_points not writable | MISSING (denied; removed via `auth.users` cascade) |
| **quest_progress** | own | own; points capped 0..50 | own (for upsert onConflict) | MISSING (denied) |
| **contact_submissions** | own OR admin (inline) | anyone (`user_id is not distinct from auth.uid()`) | MISSING (denied) | MISSING (denied) |
| **tournaments** | published OR admin (inline) | admin (inline) | **admin `is_admin()`** (phase5) | admin (inline) |
| **tournament_registrations** | own OR admin (inline) | anyone (forged-uid guard + published/window) + capacity trigger | MISSING (denied) | MISSING (denied; FK RESTRICT) |
| **workshops** | published OR admin (`is_admin()`) | admin (`is_admin()`) | admin (`is_admin()`) | admin (`is_admin()`) |
| **workshop_registrations** | own OR admin (`is_admin()`) | anyone (forged-uid guard + published/window) + capacity trigger | MISSING (denied) | MISSING (denied; FK RESTRICT) |
| **puzzle_attempts** | own OR admin (`is_admin()`) | own + quota trigger | MISSING (denied) — *intentional, immutable* | MISSING (denied) — *intentional* |
| **payments** | own OR admin (`is_admin()`) | MISSING — *service-role only* | MISSING — *activation via `record_razorpay_payment`* | MISSING — *intentional* |
| **videos** | everyone (`true`) | admin (inline) | **admin `is_admin()`** (phase5) | admin (inline) |
| **course_chapters** | everyone (`true`) | admin (inline) | **admin `is_admin()`** (phase5) | admin (inline) |
| **carousel_slides** | published OR admin (inline) | admin (inline) | **admin `is_admin()`** (phase5) | admin (inline) |
| **gallery_images** | published OR admin (inline) | admin (inline) | **admin `is_admin()`** (phase5) | admin (inline) |
| **testimonials** | published OR admin (inline) | admin (inline) | **admin `is_admin()`** (phase5) | admin (inline) |
| **lichess_puzzles** | everyone (`true`) | MISSING — *service-role import* | MISSING — *intentional* | MISSING — *intentional* |
| **puzzles** (legacy) | everyone (`true`) | admin (inline) | MISSING (denied; superseded) | admin (inline) |
| **storage.objects** (course-videos, gallery-images, carousel-images) | public read per bucket | admin (bucket_id + inline) | MISSING (denied) | admin (bucket_id + inline) |

No table is RLS-disabled; no client-writable path exists to `role`, `tier`, `payments`, or
`lichess_puzzles`. The only "MISSING" entries that matter are all *intentional* (immutable
facts or service-role-only writes) — there is **no** accidental gap. This confirms and closes
the "suspected missing UPDATE policy" concern: all seven admin content tables have UPDATE
policies with both `USING` and `WITH CHECK`.

---

## 4. Verified-OK (checked and passing)

**Database / RLS**
- RLS enabled on all 16 public tables; no `disable row level`, no `force`, no `grant all` in any migration.
- **Self-promotion blocked (prior C1 fixed):** `revoke update on profiles from authenticated, anon` then `grant update (name, grade, consent_at)` (`security_fixes.sql:85-86`, `phase1:27`) — `role`/`tier`/`tier_expires_at`/`rank_points` are not client-writable even though the RLS row-check passes.
- **Public PII leak fixed (prior C2):** `Profiles are viewable by everyone using(true)` dropped; SELECT is own-row OR `is_admin()` (`security_fixes.sql:59-69`).
- `is_admin()` is `SECURITY DEFINER`, `STABLE`, `set search_path = public`, reads `profiles.role`, revoked from PUBLIC, granted to authenticated+anon (`security_fixes.sql:40-54`).
- All 14 `SECURITY DEFINER` functions pin `search_path = public`. None unpinned.
- **All 7 admin content tables have UPDATE policies with USING + WITH CHECK** (`phase5_admin_update_policies.sql:19-59`).
- **Capacity is race-safe:** `enforce_tournament/workshop_registration` take `pg_advisory_xact_lock(...)` before a live `count(*)`, raise `EVENT_FULL` inside the lock, run BEFORE INSERT (so the new row is excluded), and permit exactly `capacity` rows — no off-by-one. Deleting a registration frees a seat (live count, not a stored counter). *(Note: the mechanism is an advisory xact lock, not the `SELECT … FOR UPDATE` the audit brief assumed — functionally equivalent and arguably cleaner.)*
- **Payments idempotent:** `record_razorpay_payment()` locks the row `FOR UPDATE`, returns early when `status='paid'`, extends expiry via `greatest(coalesce(tier_expires_at,now()),now()) + make_interval(...)`; EXECUTE granted only to `service_role`; `razorpay_order_id` UNIQUE.
- **Self-upgrade blocked:** `admin_set_tier()`/`admin_list_members()` start `if not is_admin() then raise 'FORBIDDEN'`; `profiles.tier` excluded from the client UPDATE grant.
- **Duplicate registrations blocked** by unique indexes on `(event_id, lower(parent_email), lower(child_name))` on both tables; `parent_email`/`child_name` are NOT NULL (no null-uniqueness escape).
- **FK ON DELETE** matches docs: registrations RESTRICT, `puzzle_attempts.user_id` CASCADE, `puzzle_attempts.puzzle_id` NO ACTION (a puzzle can't be deleted while attempts reference it).
- Check constraints/enums all present and sane (format, category, tier, min_tier, status, months 1..24, amount>0, rating 1..5, points 0..50, PII length caps).
- `handle_new_user()` is null-safe across email/Google/phone and wraps name in `left(...,80)` so the name-length constraint can't abort signup.
- The DEPLOYMENT.md §5 documented order **does** replay cleanly, dependency-checked (the hazard is only if you ignore it and glob — see DB-01).

**Puzzle quota (server-side machinery)**
- `random_puzzles()` EXECUTE revoked from **PUBLIC, anon, and authenticated** (`phase8:225-226`); only the `SECURITY DEFINER` wrapper `random_puzzles_for_user()` (authenticated only, raises `SIGN_IN_REQUIRED` when anon) can reach it. *(But see **FE-02**: the wrapper's quota check reads a client-fed counter and does not itself consume quota.)*
- A BEFORE INSERT `enforce_puzzle_quota` trigger exists on `puzzle_attempts` and caps *logged* attempts; day-buckets are computed in Asia/Kolkata.

**Auth & Edge Functions**
- Client tree clean of server secrets: `grep` of `src/` finds only the cautionary comment in `supabaseClient.js:15`; the client uses only `VITE_SUPABASE_ANON_KEY`.
- No real Razorpay/Resend secret was ever committed — history holds only placeholders (`rzp_live_xxxxxxxx`, `re_…`). The only real committed secret is SEC-20.
- `.env`/`.env.local`/`.env.*.local` and all `.env.example` are gitignored.
- All Edge Function secrets read from `Deno.env`, no literals.
- `send-email` **fails closed**: `authorized()` returns false when no `WEBHOOK_SECRET`, uses a constant-time-ish compare, 401 on mismatch, 500 when `RESEND_API_KEY` unset.
- `razorpay-order` computes the charge **server-side** from a fixed `PRICES` map keyed by tier (never a client amount) and re-verifies the caller's bearer token.
- `razorpay-webhook` verifies the HMAC-SHA256 over the **raw** body *before* `JSON.parse`, constant-time hex compare, fails closed; `--no-verify-jwt` is documented and justified (Razorpay sends no Supabase JWT); delegates idempotency to `record_razorpay_payment()`.
- Backend `auth.py` defends **algorithm confusion**: HS256 only ever verifies against the legacy shared secret, ES256/RS256 only against the pinned JWKS key; `none`/unknown rejected. JWKS cached with kid-refresh-and-retry. `ALLOW_LEGACY_HS256` properly gated, fails closed. `smoke_test.py` asserts a forged HS256-with-public-key and `alg=none` are both 401.
- `src/lib/api.js` imported nowhere (matches the "written, not deployed" backend claim).

**Frontend**
- `RequireAuth` gates correctly on hard refresh/deep link (shows "Checking access…" while `loading`, no flash of protected content, no false redirect).
- No `.single()` misuse anywhere; the only single-row read uses `.maybeSingle()`.
- **Stockfish worker lifecycle is clean:** the play engine is `terminate()`d on unmount (`StockfishPractice.jsx:66`, `stockfishEngine.js:265-268`), StrictMode double-mount is guarded, and the separate full-strength analysis engine is `destroy()`ed on unmount and re-keyed per game — no memory growth across sessions.
- Razorpay UI is correctly gated as stubbed-until-configured (`paymentsEnabled = !!RAZORPAY_KEY_ID`; falls back to a "Talk to us" link); pricing is server-created and the tier is granted by the signed webhook, never the client.
- Double-submit protection present on every form (`disabled={loading/saving/busyTier}`).
- Real 404 route (`NotFoundPage`); all in-app `<Link>` targets resolve.
- Anonymous puzzle access is fully removed (not a bypassable localStorage soft-limit): `/puzzles` is wrapped in `RequireAuth`.

**Design decisions confirmed (recorded as intentional, not findings)**
- **Workshop meeting URLs:** the audit brief assumed a "public view + authenticated RPC" design — **that design does not exist**, and it doesn't need to. There is no `meeting_url` column; the base `workshops` table is anon-readable for published rows (`using (published = true)`), the online `venue` is a human placeholder ("Online — joining link sent after registration"), and links are delivered by **manual email**. `ROADMAP.md:447-452` explicitly warns "do not put a live joining link in venue for a children's class" and defers a gated URL to P5-4. So there is nothing to leak *around* — the only residual risk is an admin pasting a real link into `venue` (query D1 in the SQL file checks this). Note the flip side: joining-link delivery is a **manual workflow**, a process gap, not a security one.
- Anonymous puzzle soft-limit is gone entirely (sign-in required) rather than a client-bypassable counter.
- `videos` world-readable + public `course-videos` bucket — the acknowledged open chapter-lock gap (docs call it a UI boundary, not a security one).
- `razorpay-order` CORS `*` fallback is safe (no credentials/cookies; every call re-verifies the bearer).
- Fire-and-forget attempt logging is intentional (a failed insert never interrupts a child).

**Code quality**
- No `console.log/debug/info` in `src/` (only legitimate `console.error/warn`); no TODO/FIXME/HACK markers.
- `mockData.js` and `razorpay.js` are live, not dead code.
- No hardcoded project refs/secrets in `src/`; env handled via `import.meta.env` with safe fallbacks.
- `framer-motion` used by one file via a tree-shakeable named import (no `import * as`, no lodash).
- Admin members/videos queries are correctly bounded (`.limit(50)`, `.limit(10)`).

---

## 5. Doc drift

Every mismatch found between `CLAUDE.md` / `docs/*` and the actual code. None is itself a
security hole; several are cosmetic staleness, but a few (marked ⚠) can mislead a future
maintainer into a wrong mental model.

| # | Doc claim | Reality | Location |
|---|---|---|---|
| 1 ⚠ | "Run order is by phase" / "run in filename order" | Filename order is not runnable; correct order is DEPLOYMENT.md §5 only (see **DB-01**). | `SYSTEM-OVERVIEW.md:584`, `CLAUDE.md:64` |
| 2 ⚠ | "granted to anon and authenticated" for `random_puzzles()` | EXECUTE is **revoked** from public/anon/authenticated two lines later (`phase8:225-226`); the clause is self-contradictory. Posture is fine (wrapper is the entry point). | `SYSTEM-OVERVIEW.md:457` |
| 3 ⚠ | ARCHITECTURE.md: "FastAPI validates with the project JWT secret (HS256)" | Backend now verifies against project JWKS (ES256); HS256 is legacy-only behind a flag. ARCHITECTURE.md is headed "proposed, not implemented," but a reader landing there first gets an algorithm-confusion-prone model. | `ARCHITECTURE.md:52` |
| 4 | tournament_registrations FK diagram says "on delete cascade" | Code (and the same doc's prose 3 lines later) says `ON DELETE RESTRICT`. | `SYSTEM-OVERVIEW.md:322` |
| 5 | "No TypeScript, no tests, no linter configured" | ESLint 9 flat config exists and `npm run lint` runs (0 errors, 12 warnings). No-test-runner half is still true. | `CLAUDE.md:18`, `TESTING.md:211` |
| 6 | "Chess is the primary course; Maths and English are separate courses" | Chess is the entire product; Maths/English/AI are unlinked "coming soon" cards. | `CLAUDE.md:4` |
| 7 | README: "App.jsx is the entire application (…quest, curriculum, quiz, pricing, resources)" | App.jsx is just a 14-route router table; those features were removed. | `README.md:30` |
| 8 | README: "expects homepage.mp4 / maths.mp4 / english.mp4 in public/; see README-VIDEOS.md" | Videos come from the `course-videos` Storage bucket; no `.mp4` and no `README-VIDEOS.md` in `public/`. | `README.md:23` |
| 9 | ROADMAP §P2 lists fake-stats/LiveTicker/fake-plan/PROGRESS_BY_KEY as open | None exist in `src/` anymore (grep: zero matches); the work is done but the section isn't marked done. | `ROADMAP.md:133` |
| 10 | "Migrations… now number twelve files" | 19 `migration_*.sql` (+`schema.sql`). | `SYSTEM-OVERVIEW.md:584` |
| 11 | Repo layout omits `docs/DEPLOYMENT.md` | DEPLOYMENT.md exists (10-section runbook). | `SYSTEM-OVERVIEW.md:77` |
| 12 | "18 category × difficulty buckets" | 13 categories × 3 = 39 buckets (the same doc says 39 elsewhere). | `TESTING.md:180` |

Also: `SYSTEM-OVERVIEW.md:20-21` "Sign-up records an explicit parent/guardian consent
timestamp" is contradicted for Google/phone sign-in (see **FL-04**).

---

## 6. Unverifiable locally

These need the **live** Supabase project (deployed policy/trigger/function state, table
data, or dashboard-only config). Each has a ready-to-paste query in
`AUDIT-VERIFICATION-QUERIES.sql` (section letters below map to that file).

| What to confirm | Where | File §|
|---|---|---|
| Live policy set matches the migrations (no out-of-band permissive policy) | `pg_policies` | A1 |
| `profiles` UPDATE column grant excludes role/tier/tier_expires_at/rank_points | `information_schema.column_privileges` | A2 |
| Storage bucket policies deny anon write | `pg_policies` (storage) | A3 |
| Every `SECURITY DEFINER` fn still pins `search_path` | `pg_proc.proconfig` | B1 |
| `random_puzzles()` has **no** anon/authenticated EXECUTE | `has_function_privilege` | B2 |
| **FE-02:** whether the quota consumes server-side or only reads client-fed counts | `pg_get_functiondef` | B3 |
| `record_razorpay_payment()` idempotency + payments constraints | `pg_proc`, `pg_constraint` | B4 |
| Actual `ON DELETE` on each FK (esp. payments CASCADE, DB-02) | `pg_constraint.confdeltype` | C1 |
| The three enforcement triggers exist and are enabled | `pg_trigger` | C2 |
| Expected/unique indexes exist (DB-03) | `pg_indexes` | C3 |
| **No published event currently stores a live link in `venue`** | `workshops`/`tournaments` | D1 |
| No duplicate registrations slipped the unique index | registration tables | D2 |
| How many accounts have `consent_at IS NULL` (FL-04 exposure) | `profiles` | D3 |
| Row counts behind the unpaginated admin queries (PERF-01/02) | counts | D4 |
| **SEC-20:** the leaked keys are actually rotated | dashboard (no SQL) | E1 |
| The three Database Webhooks exist/are enabled (whole email flow depends on them) | dashboard / `pg_trigger` | E2 |
| Edge Function `verify_jwt` config (razorpay-webhook `--no-verify-jwt`) | Supabase CLI | E3 |
| `send-email` webhook Authorization header (defaults to the leaked key) | dashboard | E4 |

---

## 7. Fix roadmap

Four phases, ordered by severity × blast radius, each scoped to run as its own fresh-session
Claude Code prompt.

**Phase 1 — Contain the credential exposure (do first, today).**
- **SEC-20** — rotate the `service_role` key and legacy JWT secret in Supabase; redeploy
  Edge Functions; update the `send-email` webhook Authorization headers; set
  `ALLOW_LEGACY_HS256=false` after tokens age out; then git-history-rewrite as cleanup.
  Run SQL section E + D1 to confirm no live `venue` link and to check for prior misuse.

**Phase 2 — Make "enforced" claims actually true (correctness).**
- **FE-02** — make the puzzle quota consume server-side in `random_puzzles_for_user()`, or
  reclassify it as a soft limit and correct the docs.
- **FL-04** — decide whether parental consent must gate usage (DPDP); if so, enforce
  `consent_at` in `RequireAuth`/puzzle/registration paths.
- **DB-01** — renumber migrations so lexical order = run order, and fix the "filename order"
  wording. **DB-02** — reconsider `payments.user_id` cascade.

**Phase 3 — Registration / email / money flow reliability & UX.**
- **SEC-21/FL-01** — add a Resend idempotency key (kill duplicate emails).
- **FL-02** — stop asserting delivery / make send failures observable + recoverable.
- **FL-03** — report "already registered" before "full." **FE-01** — fix the admin-page
  profile-load flash.

**Phase 4 — Hygiene, performance, consistency.**
- **QUAL-01** — `npm audit fix` (react-router-dom XSS). **QUAL-02 / PERF-01 / PERF-02 /
  PERF-03 / QUAL-04** — code-splitting, DB-side registration counts, paginate the
  enquiries inbox, right-size the wordmark, un-block font loading.
- **SEC-01** — route the inline admin checks through `is_admin()`. **DB-03** — add FK
  indexes. **DB-04** — lock the quota trigger (or document the slack). **FE-03** — cap
  ContactForm fields. **QUAL-03** — share the two event list pages. **SEC-22** — fix the
  `/health` auth signal. Clear the section-5 doc drift.

---

*Method note: findings were produced by a 7-dimension read-only agent sweep with adversarial
re-verification of Critical/High items; the security core (RLS, `is_admin()`, capacity,
payments, quota, secrets, migration order, email idempotency) and the one point of
inter-agent disagreement (FE-02) were additionally read and quoted first-hand by the
orchestrator. Nothing in the application was modified.*
