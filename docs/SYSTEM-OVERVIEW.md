# EduChess — System Overview

A single self-contained description of the product, architecture and data model,
written to be pasted into another tool as context. Accurate as of 2026-08-05.

---

## 1. What the product is

**EduChess** is the public website and learning platform for a chess coaching
academy in Visakhapatnam, Andhra Pradesh, India.

- **EduChess** is the online brand. **Champion Chess Academy** is the offline,
  in-person entity. The site uses EduChess everywhere except the postal address.
- Two physical academies: Gajuwaka (HQ) and opposite Timpany School, VUDA Colony.
  Founded 2016.
- **Chess is the entire product.** Maths, English and AI are announced as future
  "Edu Courses" and appear only as unlinked *Coming soon* cards.
- Students are children. Every form collects a child's name, grade and a
  parent's phone/email, so PII handling and India's DPDP Act matter. Consent is
  recorded before the app can be used: email sign-up requires the checkbox, and
  Google/phone users hit a **non-dismissable** `ProfileCompletionDialog` that
  must be completed (name + consent) or the user signs out (audit FL-04).
- **Three membership tiers, sold through the site**: Free ₹0, Pro ₹1,999/mo,
  Academy ₹3,999/mo. Paid by Razorpay Checkout; the membership is granted by a
  signed webhook, never by the browser. A month at a time, expiry applied at
  read time.
- Tiers decide two things: the daily puzzle allowance (5 / 50 / unlimited) and
  which course chapters are watchable (`course_chapters.min_tier`).
- **Puzzles now require an account.** The free tier is the top of the funnel —
  five a day, one tap with Google. Engine play at `/practice` remains free and
  unauthenticated.
- In-person coaching at the two academies is still arranged and billed offline.
  It is not what the tiers sell.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite 5, react-router-dom 6, Tailwind 3, Framer Motion (About page only) |
| UI primitives | Hand-rolled shadcn-style in `src/components/ui/` (Radix Slot + CVA + tailwind-merge) |
| Auth / DB / Storage | Supabase (Postgres + Auth + Storage), accessed from the browser with the anon key |
| Sign-in | Google OAuth by default. Email/password and phone OTP are built and gated behind `VITE_AUTH_METHODS` |
| Serverless | Supabase Edge Functions (Deno/TypeScript) — `send-email`, `razorpay-order`, `razorpay-webhook` |
| Transactional email | Resend, called from `send-email`, triggered by Database Webhooks |
| Payments | Razorpay Checkout (script loaded on demand, not bundled) |
| Chess rules | `chess.js` v1 |
| Chess engine | Stockfish 16 NNUE single-threaded WASM, **vendored** in `public/stockfish/`, run in a Web Worker |
| Backend | FastAPI (Python 3.12 target), in `backend/`. **Written and tested, still not deployed** — nothing shipped depends on it |
| Lint | ESLint 9 flat config with `react`, `react-hooks`, `jsx-a11y` |
| Tests | None. No test runner is configured |
| Language | JavaScript, no TypeScript |

There is **no server-side rendering**. It is a static SPA plus Supabase.

---

## 3. Repository layout

```
src/
  pages/          one component per route
  components/
    admin/        one component per admin tab
    ui/           shadcn-style primitives
  lib/            supabaseClient, AuthContext, api, media, sound,
                  stockfishEngine, gameAnalysis, chessMoves, puzzles, utils
  data/mockData.js  all static copy and config
backend/          FastAPI service (own Dockerfile, own requirements.txt)
  app/            main.py, auth.py, config.py
  scripts/        import_lichess_puzzles.py (one-off operational script)
supabase/         flat .sql migrations, run MANUALLY in the SQL editor
  functions/      Edge Functions (Deno/TypeScript), deployed with the CLI
emails/auth/      Supabase Auth templates, pasted into the dashboard by hand
public/           stockfish WASM, sounds, icons, _redirects
assets-src/       full-resolution artwork, deliberately NOT shipped
docs/             ARCHITECTURE.md, ROADMAP.md, TESTING.md, this file
```

**Migrations are manual.** Adding a `.sql` file does nothing until someone runs
it in the Supabase dashboard, in the order listed in `docs/DEPLOYMENT.md §5`.
(Filename order is **not** a valid run order — see audit finding DB-01.)

---

## 4. Routes

| Path | Page | Auth | Footer |
|---|---|---|---|
| `/` | Home | public | yes |
| `/about` | About | public | yes |
| `/courses` | Courses index | public | no |
| `/courses/:subject` | Course detail (only `chess` is valid) | public | no |
| `/workshops` | Workshops + registration | public | yes |
| `/puzzles` | Puzzle trainer | **required** | no |
| `/practice` | Play vs engine | public | no |
| `/tournaments` | Tournaments + registration | public | yes |
| `/upgrade` | Plan comparison + Razorpay checkout | public | yes |
| `/contact` | Contact form | public | yes |
| `/dashboard` | Plan, puzzle progress, registrations, profile | **required** | no |
| `/mylearning` | Course shortcuts | **required** | no |
| `/admin` | Admin panel | **admin role** | no |
| `*` | 404 page | public | no |

- Auth-gated routes use `<RequireAuth>`, which prompts in place with a sign-in
  modal rather than redirecting (sign-in is a modal, so a redirect loses intent).
  It takes its eyebrow/title/blurb as props — `/puzzles` pitches the free
  account rather than saying "we need to know who you are".
- `/admin` self-gates on `profile.role === 'admin'` inside the page.
- The footer is an allow-list (`FOOTER_ROUTES` in `App.jsx`), not global.
- SPA fallback is configured via `public/_redirects` (Netlify/Cloudflare) and
  `vercel.json` (Vercel).

---

## 5. Feature inventory

### 5.1 Marketing site
- **Home**: hero + video, an auto-advancing "Why playing chess" slider (6
  benefits, inline SVG art, 2s cadence, pause on hover/focus, arrows flanking
  the slide, dots, swipe, arrow keys, disabled under `prefers-reduced-motion`),
  "What we offer" (3 cards), "Achievements" carousel, testimonials, contact form.
- **About**: story, values, milestones (2016 founded, 5000+ students, 2 offline
  academies, 100k+ puzzles), pricing tiers, gallery, CTAs.
- **Courses**: Chess section (linked) + Edu Courses section (Maths, English, AI
  as unlinked *Coming soon* cards).
- **Course detail**: chapter accordion backed by `course_chapters` + `videos`,
  with an inline player.
- **Workshops**: database-backed since the workshops schema landed. Lists
  published, future rows and takes registrations, same shape as tournaments.
  Seeded with the four formats the static page used to describe.
- **Tournaments**: lists published, future tournaments; per-tournament
  registration form writing to `tournament_registrations`.
- **Upgrade**: the three plans, with Razorpay checkout. The same cards and the
  same checkout hook power the Programs & Pricing block on About — they are
  one component (`PlanCard` + `usePlanCheckout`) so the two can't drift.
- **Contact**: form writing to `contact_submissions`.
- **Footer**: two academies, hours, email, phone, nav links.

Tournaments and workshops share `EventCard`, `EventRegistrationForm` and the
`AdminEvents` management surface: identical fields into identically shaped
tables. Capacity and the registration deadline are enforced by a `BEFORE
INSERT` trigger, not by the form; `tournament_spots_left()` /
`workshop_spots_left()` expose a count to `anon` and nothing else.

### 5.2 Puzzle trainer (`/puzzles`)
- 13 categories x 3 difficulty bands, backed by 123,297 imported Lichess puzzles.
- Categories: mateIn1/2/3, backRankMate, smotheredMate, fork, pin, skewer,
  hangingPiece, discoveredAttack, doubleCheck, deflection, sacrifice.
- Difficulty from rating: easy <1300, medium 1300-1800, hard >1800.
- Random batch of 20 per session via the `random_puzzles` RPC; reshuffles when
  exhausted so the stream never ends.
- Solve flow: student plays the expected move; wrong moves flash and reset;
  multi-ply puzzles auto-play the opponent's forced reply.
- Board flips when the student plays Black (~half of all Lichess puzzles).
- **Sign-in required, and the daily allowance comes from the tier** — 5 / 50 /
  unlimited. This is a **soft** cap, not a hard boundary (audit finding FE-02).
  A `BEFORE INSERT` trigger on `puzzle_attempts` refuses rows past the limit,
  batches are handed out by `random_puzzles_for_user()` which checks the
  allowance first, and `EXECUTE` on `random_puzzles()` is revoked from PUBLIC,
  `anon` and `authenticated` so the wrapper can't be stepped around. But the
  count is derived from `puzzle_attempts`, which the client writes, so a client
  that never logs an attempt is never counted. That is accepted here: the
  puzzles are free public Lichess data, so the cap is a signup/upgrade nudge,
  not protection of a scarce resource.
- **Progress is recorded.** One `puzzle_attempts` row per concluded puzzle;
  a puzzle that needed a retry is `solved = false`. Logging is fire-and-forget
  so a failed insert never interrupts a child mid-puzzle.
- `puzzle_stats()` feeds the dashboard: totals, solved today, current streak,
  per-category counts. Days bucket in **Asia/Kolkata**, not UTC — a UTC day
  ends at 5:30 AM local and would break every evening streak.

### 5.3 Play vs engine (`/practice`)
- Stockfish in a Web Worker, fully offline once loaded.
- Six difficulty tiers exposed as a dropdown on the board's top bar.
- **Strength model**: tiers at 1500+ use Stockfish's own `UCI_LimitStrength` +
  `UCI_Elo` and are genuinely calibrated. `UCI_Elo` bottoms out at **1320**, so
  the 500 and 1000 tiers are approximated by hand: `Skill Level 0`, a shallow
  depth cap, and MultiPV candidate sampling that deliberately picks a weaker
  *engine line* (never a random legal move, which would look broken rather than
  weak). Measured on 24 one-move tactics: 1 / 11 / 22 / 23 / 24 / 24 solved
  across the six tiers.
- "Play as Black/White" swaps colour and starts a fresh game; the engine opens
  as White when the student takes Black.
- Undo, reset, board coordinates (a-h, 1-8) inside the edge squares.
- **Game review** on game over: every position analysed at depth 12 by a
  *separate full-strength* engine instance. Reports per-side accuracy, estimated
  rating, average centipawn loss, a Best/Excellent/Good/Inaccuracy/Mistake/
  Blunder breakdown, and the three costliest moves with the engine's preference.

### 5.4 Auth
- **Google OAuth is the default and only enabled method.** `VITE_AUTH_METHODS`
  (default `google`) decides what the modal offers. Email/password and phone
  OTP are written and working but switched off, because Supabase's built-in
  email sender is throttled to a few messages an hour and phone OTP needs a
  paid SMS provider plus TRAI DLT registration. Google needs neither: it is on
  the free plan and sends no email through Supabase at all.
- Email sign-up (when enabled) requires 8+ chars with a letter and a number,
  plus a parent/guardian consent checkbox passed through as user metadata.
- `AuthContext` exposes `session`, `user`, `profile`, `tier`, `loading`,
  `authError`, `refreshProfile`, `signUp`, `signIn`, `signInWithGoogle`,
  `signInWithPhone`, `verifyPhoneOtp`, `signOut`. `tier` already has expiry
  applied.
- `handle_new_user()` creates the `profiles` row. It is null-safe on purpose:
  phone-only users have no email, Google sends `full_name` not `name`, and the
  name is truncated to 80 chars or the `profiles_name_len` constraint would
  abort the sign-up with an opaque error.
- `ProfileCompletionDialog` at the app root collects name and consent (grade
  optional) from anyone who arrived by a route with no form to ask on (Google,
  phone). It is **non-dismissable** — complete it or sign out — so consent is
  recorded before the app is used (audit FL-04).
- Roles: `student` (default) and `admin`. Promotion is manual via SQL.

### 5.5 Admin panel (`/admin`)
Eight tabs, all writing directly to Supabase from the browser under admin RLS:
Videos (upload to Storage, chapter management with a per-chapter tier
selector, delete), Carousels, Testimonials, Gallery, Tournaments, Workshops,
Members, Enquiries inbox.

- Tournaments and Workshops share `AdminEvents`: create, **real UPDATE
  editing**, publish/unpublish, delete, the registration list, CSV export.
  Editing used to be delete-and-recreate, which cascade-deleted registrations;
  the foreign keys are `ON DELETE RESTRICT` now and the UPDATE policies exist.
- Members lists everyone with their plan and expiry (via the admin-gated
  `admin_list_members()`, because emails live in `auth.users`) and sets a tier
  through `admin_set_tier()`. For comps and for payments the webhook missed —
  ordinary upgrades activate themselves.
- CSV export guards against formula injection: a cell starting `=`, `+`, `-`
  or `@` is prefixed with a quote, and the file carries a UTF-8 BOM so Excel
  doesn't mangle non-ASCII names.

### 5.6 Payments
- `/upgrade` (and the About pricing block) opens Razorpay Checkout. The script
  is injected on first click, not bundled.
- `razorpay-order` decides the **amount** from the tier server-side and creates
  the order with the key secret. Neither may ever reach the browser.
- `razorpay-webhook` verifies Razorpay's HMAC over the **raw** body and calls
  `record_razorpay_payment()`. That function is what grants a membership. The
  browser's success callback grants nothing — it can be forged, and it never
  fires if the customer closes the tab after paying.
- Activation is idempotent: the row is locked and an already-paid order
  returns early, so Razorpay's retries and its duplicate
  `payment.captured`/`order.paid` pair cannot buy two months.
- Time is added from whichever is later, the current expiry or now.

### 5.7 Transactional email
`send-email` (Edge Function) is called by three Database Webhooks — INSERT on
`tournament_registrations`, `workshop_registrations` and `contact_submissions`
— and relays a branded email through Resend. Registration rows carry only the
event FK, so the function reads the parent row back with the service-role
client. It rejects any request whose `Authorization` bearer doesn't match, and
fails closed if no secret is configured. Supabase's own auth emails (confirm
signup, reset password) are separate templates in `emails/auth/`, pasted into
the dashboard by hand.

---

## 6. Data model

All tables are in `public`, all have RLS enabled. `is_admin()` is a
`SECURITY DEFINER` helper that reads `profiles.role`, used by every admin policy
(defined this way to avoid infinite RLS recursion on `profiles`).

### profiles
```
id               uuid PK -> auth.users(id) on delete cascade
name             text
grade            text
role             text not null default 'student'   -- 'student' | 'admin'
tier             text not null default 'free'      -- 'free' | 'pro' | 'academy'
tier_expires_at  timestamptz                       -- null = no expiry (comped)
consent_at       timestamptz                       -- parent/guardian consent
rank_points      integer not null default 0        -- legacy, no longer written
created_at       timestamptz not null default now()
```
RLS: a user reads and updates **only their own row**. The client's UPDATE
privilege is column-level and covers exactly `name`, `grade`, `consent_at` —
so `role`, `tier` and `tier_expires_at` are unwritable from the browser. That
grant is the whole defence; if you add a column the client must write, you
have to name it in the grant or the write silently no-ops. Tier changes go
through `admin_set_tier()` or the Razorpay webhook. Admins read all rows.
Auto-created by the `handle_new_user()` trigger.

### quest_progress
```
id            bigint identity PK
user_id       uuid not null -> auth.users(id) cascade
subject       text not null
quest_key     text not null
points        integer not null default 0
completed_at  timestamptz not null default now()
unique (user_id, quest_key)
```
**Legacy.** The client no longer writes here; the points feature was removed.
Rows and columns are retained so the decision is reversible.

### contact_submissions
```
id          bigint identity PK
user_id     uuid -> auth.users(id) on delete set null
name        text not null
grade       text
email       text not null
struggles   text
created_at  timestamptz not null default now()
```
RLS: anyone may insert (with a forged-`user_id` guard and length caps); users
read their own; admins read all.

### tournaments
```
id                     bigint identity PK
title                  text not null
description            text
format                 text not null check in ('online','offline')
venue                  text            -- address, or platform/link if online
start_at               timestamptz not null
registration_deadline  timestamptz
fee                    text            -- free text, e.g. "Free" or "₹500"
capacity               integer
published              boolean not null default true
created_at             timestamptz not null default now()
```
RLS: published rows are public; admins see and manage all.

### tournament_registrations
```
id             bigint identity PK
tournament_id  bigint not null -> tournaments(id) on delete cascade
user_id        uuid -> auth.users(id) on delete set null
child_name     text not null
grade          text
parent_name    text not null
parent_email   text not null
parent_phone   text
notes          text
created_at     timestamptz not null default now()
```
RLS: anyone may insert (forged-`user_id` guard, plus a published + deadline
check in the policy itself); users read their own; admins read all. A unique
index on `(tournament_id, lower(parent_email), lower(child_name))` blocks
duplicates. The FK is `ON DELETE RESTRICT` — these are business records for a
paid event, and cascade-delete behind one `window.confirm()` is not
recoverable. A `BEFORE INSERT` trigger raises `EVENT_FULL` or
`REGISTRATION_CLOSED`, taking an advisory transaction lock so two parents
taking the last seat at once is settled by the database, not by luck.

### workshops / workshop_registrations
The same two tables again, same columns, same policies, same trigger, same
unique index, same `ON DELETE RESTRICT`. Seeded with four published rows so
`/workshops` is never empty.

### puzzle_attempts
```
id          bigint identity PK
user_id     uuid not null -> auth.users(id) cascade
puzzle_id   text not null -> lichess_puzzles(puzzle_id)
solved      boolean not null
category    text
difficulty  text
created_at  timestamptz not null default now()
```
RLS: insert and read **own rows only**; admins read all. No UPDATE or DELETE
policy at all — an attempt is a fact about what happened and nothing edits
one. Index on `(user_id, created_at)`. A `BEFORE INSERT` trigger enforces the
tier's daily allowance.

### payments
```
id                   bigint identity PK
user_id              uuid not null -> auth.users(id) cascade
tier                 text not null check in ('pro','academy')
months               integer not null default 1
amount_paise         integer not null
currency             text not null default 'INR'
razorpay_order_id    text not null unique
razorpay_payment_id  text
status               text not null default 'created'  -- created|paid|failed
created_at           timestamptz not null default now()
paid_at              timestamptz
```
RLS: users read their own, admins read all, and **there is deliberately no
INSERT or UPDATE policy**. Every write comes from an Edge Function using the
service-role key, because a client that could write here could grant itself a
membership.

### videos
```
id            bigint identity PK
title         text not null
category      text not null check in ('chess','maths','english')
chapter       text            -- matches course_chapters.title
url           text not null   -- public Storage CDN URL
storage_path  text
uploaded_by   uuid -> auth.users(id) on delete set null
created_at    timestamptz not null default now()
```
RLS: **world-readable** (`using (true)`) and the `course-videos` bucket is
public. See the security notes below.

### course_chapters
```
id          bigint identity PK
category    text not null check in ('chess','maths','english')
title       text not null
position    integer not null default 0
created_at  timestamptz not null default now()
min_tier    text not null default 'pro'   -- 'free' | 'pro' | 'academy'
unique (category, title)
```
`min_tier` decides who can open a chapter. Defaulting to `pro` means existing
chapters became paid the moment the migration ran; mark a taster chapter
`free` from the admin Videos tab.

### carousel_slides / gallery_images
```
id            bigint identity PK
storage_path  text not null
caption       text
position      integer not null default 0     -- carousel only
category      text                           -- gallery only, e.g. 'about'
published     boolean not null default true
uploaded_by   uuid -> auth.users(id) on delete set null
created_at    timestamptz not null default now()
```

### testimonials
```
id          bigint identity PK
name        text not null
role        text
quote       text not null
rating      integer not null default 5 check between 1 and 5
published   boolean not null default true
created_at  timestamptz not null default now()
```

### puzzles
Legacy hand-generated set, superseded by `lichess_puzzles`. Not read by the app.

### lichess_puzzles  (the live puzzle source, 123,297 rows)
```
puzzle_id     text PK            -- Lichess id, e.g. '00sHx'
fen           text not null      -- position BEFORE the opponent's move
moves         text[] not null    -- UCI; moves[1] is the OPPONENT's move
rating        integer not null
rating_dev    integer
popularity    integer
nb_plays      integer
themes        text[] not null default '{}'
game_url      text
opening_tags  text[]
rand          double precision not null default random()
```
Indexes: GIN on `themes`, btree on `rating`, `rand`, and `(rating, rand)`.
RLS: world-readable, no client write policy at all.

**FEN convention (verified against the real import, do not change):** the stored
`fen` is the position *before* the opponent's move. `moves[0]` (JS index) is
played by the opponent; the student solves from the position after it. Verified:
75/75 sampled mate puzzles reach real checkmate with solution lengths of exactly
1/3/5 plies for mateIn1/2/3, and the student plays Black in roughly half.

### RPC: `random_puzzles(p_themes text[], p_min_rating int, p_max_rating int, p_limit int)`
`VOLATILE`, `SECURITY INVOKER` (RLS still applies), granted to `anon` and
`authenticated`. Filters into a materialised pool by theme + rating, then
`order by random() limit N`. The earlier `rand > random() order by rand` version
made the planner walk the `rand` index hunting for rare themes, which hit the
statement timeout on cold cache and returned short batches; the pool is small by
construction so sorting it is cheap.

**Not callable from the client any more.** `EXECUTE` is revoked from `PUBLIC`,
`anon` and `authenticated`; the app calls `random_puzzles_for_user()` instead,
which checks the caller's allowance and then delegates. Revoking from `PUBLIC`
matters — Postgres grants EXECUTE to `PUBLIC` by default and a revoke aimed
only at the two roles leaves that in place.

### Other RPCs

| Function | Security | Granted to | Purpose |
|---|---|---|---|
| `random_puzzles_for_user(...)` | DEFINER | authenticated | quota check, then delegates to `random_puzzles` |
| `puzzle_quota()` | DEFINER | authenticated | `{tier, daily_limit, used_today, remaining}` |
| `puzzle_stats()` | INVOKER | authenticated | totals, streak, per-category |
| `current_tier()` | DEFINER | authenticated | tier with expiry applied |
| `tier_rank()`, `tier_daily_puzzles()` | immutable | anon, authenticated | the tier table, as functions |
| `tournament_spots_left(bigint)` | DEFINER | anon, authenticated | a count, no PII |
| `workshop_spots_left(bigint)` | DEFINER | anon, authenticated | a count, no PII |
| `admin_set_tier(uuid,text,timestamptz)` | DEFINER | authenticated (gated on `is_admin()`) | comps and fixes |
| `admin_list_members()` | DEFINER | authenticated (gated on `is_admin()`) | joins `auth.users` for emails |
| `record_razorpay_payment(text,text)` | DEFINER | **service_role only** | grants the membership |
| `is_admin()` | DEFINER | anon, authenticated | the admin predicate every policy uses |

`tier_daily_puzzles()` is the single source of truth for 5 / 50 / unlimited.
`src/lib/tiers.js` mirrors it for display only — if you change one, change
both, or the UI promises a limit the database refuses.

### Storage buckets
`course-videos`, `carousel-images`, `gallery-images` — all currently **public
read**.

---

## 7. Frontend architecture notes

- **`src/data/mockData.js`** holds all static copy and config: `NAV_LINKS`,
  `COURSES_DROPDOWN`, `SUBJECT_TILES`, `EDU_COURSES`, `CHESS_BENEFITS`,
  `PRICING_TIERS`, `CORPORATE_DETAILS`, `ENGINE_LEVELS`, `GLYPHS_B`.
  `PRICING_TIERS` is **derived** from `src/lib/tiers.js`, not written out
  again — a price card that disagreed with what the account actually grants is
  worse than no card.
- **`src/lib/tiers.js`** is the display half of the tier contract: names,
  prices, `amountPaise`, feature lists, `tierAllows()`, `effectiveTier()`.
  The charging half is the `PRICES` table in `supabase/functions/razorpay-order`.
  Both must be changed together; each file says so.
- **`stockfishEngine.js`** wraps the worker in a UCI text protocol client:
  `init()` resolves only on real `readyok` (15s cap), `search()` returns
  `{best, candidates, score}` parsed from `info` lines, `evaluate()` for
  analysis, `setStrength(level)` for the two strength regimes. Every search has
  a timeout and the pending queue stays aligned with `go` commands so a late
  reply is never handed to the next caller.
- **`gameAnalysis.js`** holds the scoring maths: Lichess win-percent curve,
  chess.com per-move accuracy, class thresholds, and a rating estimate fitted to
  published benchmarks (10cp→2500, 40cp→1675, 150cp→900), suppressed under 20
  moves. Centipawn loss is capped at 1000 when averaging, and the engine's own
  choice is pinned to zero loss.
- **`chessMoves.js`** exists because chess.js v1 **throws** on illegal moves
  rather than returning null. `tryMove()` restores the nullable contract.
- **`Chessboard.jsx`** is deliberately rigid: fluid mode pins an explicit
  `grid-cols-8 grid-rows-[repeat(8,minmax(0,1fr))]` to `absolute inset-0`. Do
  **not** reintroduce per-cell `aspect-square`. Every square is a button with an
  `aria-label` like `"e4, white pawn"`.
- **`ErrorBoundary`** wraps both the app root and the route outlet.
- Supabase errors are surfaced, never swallowed: "failed to load" and "empty"
  are always distinct states.

---

## 8. Backend (`backend/`) — written, not deployed

FastAPI. Endpoints: `GET /health`, `GET /me` (auth required),
`GET /whoami` (auth optional). `/docs` is disabled when
`ENVIRONMENT=production`. CORS is an explicit origin list, never `*`.

**JWT verification** (`app/auth.py`): this Supabase project signs with an
asymmetric **ECC P-256 key (ES256)**, so tokens are verified against
`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached, with a refresh-and-retry
on an unknown `kid` so key rotation does not 401 everyone. A legacy HS256 path
remains behind `ALLOW_LEGACY_HS256` for tokens signed by the old shared secret.
Algorithm confusion is explicitly defended: key material is never chosen by the
token, so a forged HS256 token signed with the JWKS public key is rejected.
`smoke_test.py` asserts this with 17 checks.

Config (`backend/.env`): `SUPABASE_URL` (required, also the JWKS source),
`SUPABASE_JWT_SECRET` (legacy only), `SUPABASE_SERVICE_ROLE_KEY` (unused so
far), `ALLOW_LEGACY_HS256`, `CORS_ORIGINS`, `ENVIRONMENT`.

Frontend client `src/lib/api.js` attaches the Supabase access token and unwraps
FastAPI's `detail` into a typed `ApiError`. **It is not imported anywhere yet.**

---

## 9. Known gaps and constraints (important for planning changes)

**Security, still open — read this before selling course access:**
- **Chapter locks are a UI boundary, not a security one.** `videos` is
  world-readable and `course-videos` is a public CDN bucket, so anyone reading
  the network tab can fetch a locked video's URL while signed out. Pro and
  Academy are now sold partly on course access, which makes this the most
  commercially significant open item in the project. Fixing it means signed
  URLs, which needs a server — the Edge Functions could do it, the FastAPI
  service does not have to be deployed for this.
  The puzzle quota, by contrast, **is** enforced in the database.
- Unpublished gallery photos of children remain downloadable: `published` hides
  the row, not the file, and buckets grant anon `list`.

**Closed since the last revision:** the missing UPDATE policies (all seven
content tables have them, with `USING` *and* `WITH CHECK`); admin edit no
longer destroys registrations; workshops have a real schema; capacity and
registration deadlines are enforced server-side; payments exist; parental
consent is recorded at sign-up (`profiles.consent_at`).

**Not built:** entitlements beyond the tier check, classrooms and homework, AI
features, PGN-to-video, a published privacy policy (recording consent is not
the same as having one, and the DPDP Act wants both), subscription
auto-renewal (a month is bought at a time; nothing charges the card again),
refunds through the UI, rate limiting or CAPTCHA on the two public forms,
video captions, per-route SEO metadata.

**Operational notes:**
- Migrations are manual. The authoritative run order is `docs/DEPLOYMENT.md §5`
  (filename order is not valid — see audit finding DB-01); each file's header
  also states its prerequisite.
- Three Edge Functions must be deployed for the site to be fully functional.
  `razorpay-webhook` needs `--no-verify-jwt` — Razorpay does not send a
  Supabase JWT, and the function checks the HMAC itself.
- Nothing downgrades a lapsed member on a schedule; expiry is applied at read
  time by `current_tier()` and `effectiveTier()`. This project has no cron.

**Other constraints:** no tests; migrations are manual; the JS bundle is ~715 KB
(~210 KB gzipped) with no code splitting; `framer-motion` is used by one page.
The Razorpay checkout script is deliberately *not* in that bundle — it is
injected on the first upgrade click.
