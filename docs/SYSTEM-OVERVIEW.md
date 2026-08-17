# EduChess — System Overview

A single self-contained description of the product, architecture and data
model, written to be pasted into another tool as context.

Accurate as of the frontend-only consolidation. **Everything a previous
revision said about Edge Functions, Database Webhooks, a FastAPI service or a
Razorpay checkout is gone** — not disabled, deleted. They are archived under
`docs/archive/` with a README explaining what each was.

---

## 1. The architecture, in one paragraph

A static React bundle talks directly to Supabase with the anon key. The entire
server side is six SQL files in `supabase/`, pasted into the SQL Editor once.
There is no deployed server code of any kind: no Edge Functions, no Database
Webhooks, no backend service, no cron. Every rule that a server would normally
enforce is either a Row Level Security policy or a `SECURITY DEFINER` function,
and both live in files you can read end to end in about twenty minutes.

**If a rule is not in `supabase/*.sql`, it is not enforced.** The React app
contains no security boundary anywhere. That is worth internalising before
changing anything: the padlock on a course chapter, the "5 left today" counter,
the disabled Register button — all three are labels describing a decision the
database already made.

---

## 2. What the product is

**EduChess** is the public website and learning platform for a chess coaching
academy in Visakhapatnam, Andhra Pradesh, India.

- **EduChess** is the online brand. **Champion Chess Academy** is the offline,
  in-person entity. The site uses EduChess everywhere except the postal address.
- Two physical academies: Gajuwaka (HQ) and opposite Timpany School, VUDA
  Colony. Founded 2016.
- **Chess is the entire product.** Maths, English and AI are announced as
  future "Edu Courses" and appear only as unlinked *Coming soon* cards.
- Students are children. Every form collects a child's name, grade and a
  parent's phone/email, so PII handling and India's DPDP Act matter.
- **Three membership tiers**: Free ₹0, Pro ₹1,999/mo, Academy ₹3,999/mo.
  Tiers decide two things: the daily puzzle allowance (5 / 50 / unlimited) and
  which course chapters are watchable (`course_chapters.min_tier`).
- **Payments are stubbed.** The `payments` table exists with its columns and
  its RESTRICT foreign key so a receipt has somewhere to go, but nothing in the
  app writes one and no code processes money. A family pays at the academy or
  by transfer and an admin sets their plan in Admin → Members. The pricing
  cards all read "Talk to us about <plan>" and link to `/contact` — which is
  what every visitor already saw, because the publishable key shipped blank.
- In-person coaching is arranged and billed offline. It is not what the tiers
  sell.

---

## 3. Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite 5, react-router-dom 6, Tailwind 3, Framer Motion (About page only) |
| UI primitives | Hand-rolled shadcn-style in `src/components/ui/` — `Button` and `Card`, both used only by About |
| Auth / DB / Storage | Supabase (Postgres + Auth + Storage), accessed from the browser with the anon key |
| Sign-in | Email/password and Google OAuth by default; phone OTP is built and gated behind `VITE_AUTH_METHODS` |
| Server code | **None.** Six SQL files, run by hand |
| Transactional email | **None.** Supabase's default auth emails only |
| Payments | Stubbed. Schema present, no flow |
| Chess rules | `chess.js` v1 |
| Chess engine | Stockfish 16 NNUE single-threaded WASM, vendored in `public/stockfish/`, run in a Web Worker |
| Lint | ESLint 9 flat config with `react`, `react-hooks`, `jsx-a11y`. `npm run lint` — 0 errors, 23 warnings |
| Tests | None. No test runner is configured |
| Language | JavaScript, no TypeScript |

There is no server-side rendering. It is a static SPA plus Supabase.

---

## 4. Repository layout

```
src/
  pages/          one component per route
  components/
    admin/        one component per admin tab
    ui/           Button, Card
  lib/            supabaseClient, AuthContext, media, useSignedVideo, sound,
                  stockfishEngine, gameAnalysis, chessMoves, puzzles,
                  puzzleProgress, tiers, authMethods, utils
  data/mockData.js  all static copy and config
supabase/         THE BACKEND. Six numbered .sql files, run by hand
scripts/          import_lichess_puzzles.py — the one operational script
public/           stockfish WASM, sounds, icons, _redirects
docs/             this file, ARCHITECTURE, ROADMAP, TESTING, archive/
RESET-AND-APPLY.md  the one manual session that applies all of the above
```

### The six files, and the order they run in

Order is the file number. It is not a convention, it is a dependency: `03`
calls functions defined in `02`, `04` calls functions defined in `02` and reads
tables defined in `01`.

| File | What it owns |
|---|---|
| `00_teardown.sql` | **Path A only.** Drops the old policies, trigger functions and two dead tables, then reports anything the baseline does not manage. |
| `01_schema.sql` | Every table, column, constraint and index. Enables RLS immediately after each `CREATE TABLE`, so no table exists un-RLS'd for even one file. |
| `02_functions.sql` | The complete function set. Nineteen functions and one trigger. |
| `03_rls.sql` | The whole policy matrix, plus four self-checks that raise rather than warn. |
| `04_storage.sql` | Buckets and storage policies. This is the paid-video paywall. |
| `05_seed.sql` | Guarded seeds. A no-op on a project that already has content. |

This replaced 22 flat migration files with no ledger, whose filename order was
not a valid run order. They are archived at
`docs/archive/migrations-pre-baseline/`.

---

## 5. Routes

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
| `/upgrade` | Plan comparison | public | yes |
| `/contact` | Contact form | public | yes |
| `/dashboard` | Plan, puzzle progress, registrations, profile | **required** | no |
| `/mylearning` | Course shortcuts | **required** | no |
| `/admin` | Admin panel | **admin role** | no |
| `*` | 404 | public | no |

`<RequireAuth>` prompts in place with a sign-in modal rather than redirecting.
`/admin` self-gates on `profile.role === 'admin'` in the page — cosmetically;
`is_admin()` in RLS is what actually enforces it.

---

## 6. The four rules worth understanding

Everything else is ordinary CRUD. These four are where the thinking is.

### 6.1 The course-video paywall

The paid product is course video, and it used to be protected by a React
`tierAllows()` check while `videos` carried a public CDN `url` and the bucket
was public. A signed-out visitor could read a locked video's link out of the
network tab and stream it. The code admitted this in a comment.

How it works now:

1. `course-videos` is a **private** bucket. There is no public URL.
2. `videos.url` is **gone**. The table stores `storage_path` only.
3. A SELECT policy on `storage.objects` calls
   `can_read_course_object(name)`, which looks the object up in `videos`,
   joins to its chapter, and compares `course_chapters.min_tier` against
   `current_tier()`.
4. The browser calls `createSignedUrl()`, which requires exactly one thing:
   SELECT permission on `storage.objects`. So the policy is the whole gate.

Two consequences that are easy to get wrong:

- **`videos` is still world-readable, deliberately.** It is the course outline
  — chapter titles, video titles, object paths. A locked chapter has to render
  with a padlock for someone deciding whether to pay. Knowing the name of a
  file you cannot read is harmless.
- **The marketing clips are an allowlist, not a path rule.** `homepage.mp4`
  and `chess.mp4` are named literally in `can_read_course_object()`. The
  tempting version — "anything at the bucket root is public" — reads well and
  fails badly, because the Storage dashboard's default upload target *is* the
  root, so one drag-and-drop would publish a paid lesson silently.

**Residual, and it is real:** the policy is evaluated once, at signing time,
and `expiresIn` is chosen by the caller. A paying Pro subscriber can enumerate
`storage_path`, mass-sign every chapter their tier allows with a ten-year
expiry, and publish the list; a lapsed membership does not invalidate URLs
already minted. What this design stops is the *anonymous* bypass. What it does
not stop is a paying customer abusing their own access. Capping the TTL needs a
server-fixed value, which means one Edge Function — see §9.

### 6.2 The puzzle allowance

Free 5 / Pro 50 / Academy unlimited, and it is a real boundary now.

It used to be counted from `puzzle_attempts` — rows the client writes
fire-and-forget — so a client that never logged an attempt was never counted.
The tier difference could not actually be delivered.

Counting happens **on the way out**. `random_puzzles_for_user()` takes a row
lock on `puzzle_allowance` for (user, IST day), clamps the batch to what is
left, hands over puzzles, and increments by the number of rows it actually
returned. The client cannot decline to be counted because it is not counting.

Follow-on effects, all deliberate:

- `puzzle_attempts` is now purely a record of outcomes. It feeds the dashboard
  streak and gates nothing. A lost row costs a tick, not an entitlement.
- The old `enforce_puzzle_quota` trigger is deleted rather than fixed. It
  counted then checked with no lock and could overshoot by one; the row lock
  makes the whole class of problem disappear.
- **`lichess_puzzles` has no policy and no client grant.** This is the part
  that is easy to miss: PostgREST serves every table in `public` that a client
  role can select, whatever the React app happens to call. A `using (true)`
  policy on the puzzle table meant `GET /rest/v1/lichess_puzzles?limit=1000`
  returned puzzles in bulk to anyone with the anon key, which walked around the
  meter entirely. Delivery still works because `random_puzzles()` is called
  from inside a `SECURITY DEFINER` function, where `current_user` is the table
  owner.
- The client asks for **5** at a time, not 20. Puzzles are charged when handed
  over, so a 20-batch would spend a Free account's whole day on page load.
- The picker shows the allowance *before* a category is chosen, via the
  read-only `puzzle_quota()`, so nobody spends five puzzles finding out they
  had five.

Days bucket in **Asia/Kolkata** (`ist_today()`). A UTC day ends at 5:30 AM in
Visakhapatnam and would reset the allowance mid-morning.

### 6.3 Event registration

There is no client INSERT policy on either registration table. Rows arrive
only through `register_for_event()`, which does, in order:

1. Rate-limit checks on three scopes: email (5/hour), account (10/hour) and
   **event** (30/hour).
2. Records the **attempt** — before the decision, not after the success.
3. `SELECT … FOR UPDATE` on the event row, so everyone racing for the last
   seat of that event is serialised until COMMIT.
4. Already-registered → closed → full, in that order. "You are already in" is
   the most useful thing to tell someone who resubmits, and it is true whether
   or not the event is now full.
5. Inserts, taking `user_id` from `auth.uid()` — never from the caller.

**It returns a status; it does not raise.** This is the non-obvious part. A
raised exception aborts the transaction, which rolls back the rate-limit row
too — so a *failed* attempt cost nothing and never accrued against the
throttle. That turned the friendly duplicate check into a free, unlimited
oracle: "is child X registered for event Y under parent Z's email?", answered
from the error text, forever. Returning a status commits the attempt record.
For the same reason, a missing event and an unpublished draft return the
*same* status — two different answers would let anyone enumerate unpublished
events by walking the id.

**Residual:** the throttle is keyed on values the caller supplies, so someone
with an endless supply of fresh email addresses and patience can still fill an
event a burst at a time. The per-event ceiling bounds the rate, not the total.
Closing it needs something the caller cannot invent — required sign-in, or a
CAPTCHA. Meanwhile admins *can* delete registrations, so a burst is cleanable
from the panel rather than the SQL Editor.

### 6.4 The joining link

`event_meeting_links` is a separate table with RLS on and **no policies at
all**, which is a total refusal for every client role in every direction. The
only ways in are `event_meeting_url()` (signed in, and registered for that
event, or admin) and `admin_set_meeting_url()`.

It is a separate table rather than a `meeting_url` column on `workshops`
because RLS is row-level: a column could only be hidden with column-level
SELECT grants, which stop protecting anything the first time someone adds a
column and forgets to restate the grant — and which break `select *` across
the whole client. A table with no policies cannot be undone by forgetting.

An **anonymous** registration cannot see the link; there is no account to match
it to. Register while signed in.

---

## 7. Data model

All tables are in `public`. All have RLS enabled. `is_admin()` is the single
admin gate, used by every admin policy — there are zero inline
`role = 'admin'` subqueries, and `03_rls.sql` has a self-check that fails if
one reappears.

### Tables a client can reach

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | own, or admin | own, pinned to `role='student'`, `tier='free'` | own row; **columns limited to `name`, `grade`, `consent_at`** | — |
| `contact_submissions` | own, or admin | anyone (uid-bound) | — | — |
| `tournaments` / `workshops` | published, or admin | admin | admin | admin |
| `tournament_registrations` / `workshop_registrations` | own, or admin | — (RPC only) | — | admin |
| `puzzle_attempts` | own, or admin | own | — | — |
| `payments` | own, or admin | — | — | — |
| `videos` / `course_chapters` | **anyone** (the course outline) | admin | admin | admin |
| `carousel_slides` / `gallery_images` / `testimonials` | published, or admin | admin | admin | admin |

### Tables no client can reach

RLS on, zero policies, privileges revoked. Reachable only through
`SECURITY DEFINER` functions.

`event_meeting_links` · `registration_rate_limit` · `puzzle_allowance` ·
`lichess_puzzles`

### The column grant

```sql
revoke update on public.profiles from anon, authenticated;
grant  update (name, grade, consent_at) on public.profiles to authenticated;
```

This, not any policy, is what stops a student promoting themselves to admin or
upgrading themselves to academy. **If you add a column the client must write,
name it here or the write silently no-ops.** That has bitten this project once.

`role`, `tier` and `tier_expires_at` are outside it. Tier changes go through
`admin_set_tier()`.

### profiles

```
id               uuid PK -> auth.users(id) on delete cascade
name             text            -- <= 80 chars
grade            text            -- <= 40 chars
role             text not null default 'student'   -- 'student' | 'admin'
tier             text not null default 'free'      -- 'free' | 'pro' | 'academy'
tier_expires_at  timestamptz                       -- null = no expiry (comped)
consent_at       timestamptz                       -- parent/guardian consent
created_at       timestamptz not null default now()
```

`rank_points` is gone, with `quest_progress` and its self-award trigger.

### puzzle_allowance — the meter

```
user_id     uuid    -> auth.users(id) cascade
usage_date  date                     -- Asia/Kolkata day
delivered   integer not null default 0
primary key (user_id, usage_date)
```

### registration_rate_limit

```
id          bigint identity PK
scope       text not null check in ('email','user','event')
key         text not null
created_at  timestamptz not null default now()
```

### event_meeting_links

```
id             bigint identity PK
workshop_id    bigint -> workshops(id) cascade      -- exactly one of these
tournament_id  bigint -> tournaments(id) cascade    -- two is not null
meeting_url    text not null   -- must match ^https?://, <= 500 chars
updated_at     timestamptz not null default now()
```

### payments — stubbed

Columns are provider-agnostic now (`provider_order_id`,
`provider_payment_id`); nothing in the app names a payment provider.
`user_id` is **ON DELETE RESTRICT** — deleting an auth user must not destroy
their financial record. For a future DPDP erasure flow, prefer making
`user_id` nullable and switching to `ON DELETE SET NULL` so an anonymised
receipt survives the account.

### lichess_puzzles

~123,297 rows imported from database.lichess.org (CC0). Not client-readable.

**FEN convention, verified against the real import, do not change:** the
stored `fen` is the position *before* the opponent's move. `moves[1]`
(1-indexed SQL) is played by the OPPONENT; the student solves from the
position after it. The board flips when the student plays Black, which is
about half of all puzzles.

---

## 8. The function set

Nineteen functions, one trigger. Every `SECURITY DEFINER` one pins
`search_path = public` and checks its own caller; `02_functions.sql` ends with
a self-check that fails if either stops being true.

| Function | Callable by | Purpose |
|---|---|---|
| `is_admin()` | anon, authenticated | the single admin gate |
| `handle_new_user()` | *(trigger only)* | creates the profile row at sign-up |
| `tier_rank()`, `tier_daily_puzzles()` | anon, authenticated | the tier table, as functions |
| `current_tier()` | authenticated | tier with expiry applied |
| `ist_today()` | anon, authenticated | the project's day boundary |
| `random_puzzles()` | **nobody** | the un-metered sampler; internal only |
| `random_puzzles_for_user()` | authenticated | meters, clamps, delivers, returns the count |
| `puzzle_quota()` | authenticated | reads the allowance without spending it |
| `puzzle_stats()` | authenticated | totals, streak, per-category |
| `tournament_spots_left()`, `workshop_spots_left()` | anon, authenticated | a count, and only a count |
| `register_for_event()` | anon, authenticated | the only way a registration is created |
| `event_meeting_url()` | authenticated | the joining link, for registrants |
| `admin_set_meeting_url()` | authenticated (`is_admin()`) | sets or clears it |
| `admin_list_members()` | authenticated (`is_admin()`) | joins `auth.users` for emails |
| `admin_set_tier()` | authenticated (`is_admin()`) | the only way a plan changes |
| `event_registration_counts()` | authenticated (`is_admin()`) | one aggregate instead of every row |
| `can_read_course_object()` | anon, authenticated | the storage paywall predicate |

`tier_daily_puzzles()` is the single source of truth for 5 / 50 / unlimited.
`src/lib/tiers.js` mirrors it for display only — change one and you must change
the other, or a price card promises an allowance the database refuses.

---

## 9. Known gaps, stated plainly

Each of these is a decision, not an oversight. Two of them have money or
children's data attached, so they are worth re-reading before the next change.

- **Signed-URL lifetime is client-chosen** (§6.1). A paying subscriber can
  mint long-lived links for the catalogue their tier allows. Fixing it needs a
  server-fixed TTL.
- **Registration throttling is keyed on caller-supplied values** (§6.3). A
  determined flood with fresh addresses still works, slowly.
- **Consent is a UI affordance, not a technical boundary.** `consent_at` is in
  the client's column grant, so a signed-in student can set it from the console
  exactly as the dialog does, and the result is indistinguishable in
  `admin_list_members()`. Nothing gates any read or write on
  `consent_at is not null`. Making it real needs something only a parent holds
  — a link mailed to the parent's address — which needs the email path this
  architecture gave up.
- **Unpublished gallery images stay downloadable.** `published = false` hides
  the row, not the file; those buckets are public for CDN caching on the
  logged-out homepage. Since these are photographs of children: to take one
  down, **delete** it from the admin panel, do not unpublish it.
- **No transactional email.** Registering for a workshop and submitting the
  contact form send nothing. Admins see both in the panel. Supabase's own auth
  emails (confirm signup, reset password) still work, on the default templates.
- **No auto-renewal, no refund flow, no cron.** Expiry is applied at read time
  by `current_tier()`, which is why nothing needs to run on a schedule.
- **No tests.** Verification is `RESET-AND-APPLY.md` §7.
- **One 743 KB JS chunk**, no code splitting.

### If payments are ever switched on

Two options, in increasing order of code:

1. **Razorpay Payment Links — zero code.** Generate a link per plan in the
   Razorpay dashboard, put it on the pricing card, and mark the member up in
   Admin → Members when it clears. Works today. The ledger stays empty.
2. **One Edge Function pair** — an order-creation function that derives the
   amount server-side, and a webhook that verifies Razorpay's HMAC and grants
   the tier. This is the *only* server code this architecture would ever
   justify, and it would also be the natural home for the signed-URL TTL cap
   in §6.1. The previous implementation of both is archived at
   `docs/archive/edge-functions-pre-baseline/` — read it before rewriting it;
   it was audited and found correct.

---

## 10. Frontend notes

- **`src/data/mockData.js`** holds all static copy and config. `PRICING_TIERS`
  is *derived* from `src/lib/tiers.js`, not written out again.
- **`src/lib/useSignedVideo.js`** owns the private-bucket player contract:
  fetch a signed URL, keep `denied` and `failed` as distinct states, re-mint on
  `<video onError>` because that is what an expired URL looks like from the
  element.
- **`stockfishEngine.js`** wraps the worker in a UCI client. `init()` resolves
  only on real `readyok` (15s cap); every search has a timeout and the pending
  queue stays aligned with `go` commands so a late reply is never handed to the
  next caller.
- **`gameAnalysis.js`** holds the scoring maths: Lichess win-percent curve,
  chess.com per-move accuracy, a rating estimate fitted to published
  benchmarks, suppressed under 20 moves.
- **`chessMoves.js`** exists because chess.js v1 **throws** on illegal moves
  rather than returning null. `tryMove()` restores the nullable contract.
- **`Chessboard.jsx`** is deliberately rigid: fluid mode pins an explicit
  `grid-cols-8 grid-rows-[repeat(8,minmax(0,1fr))]` to `absolute inset-0`. Do
  **not** reintroduce per-cell `aspect-square` — that made squares shift and
  collapse between renders.
- **Puzzle positions must be legal both ways.** Check that the side to move is
  not in check *and* that the side not to move is not in check. Missing this
  shipped broken puzzles once.
- Supabase errors are surfaced, never swallowed: "failed to load" and "empty"
  are always distinct states.
