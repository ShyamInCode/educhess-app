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
  parent's phone/email, so PII handling and India's DPDP Act matter.
- Three coaching tiers are advertised (Basic ₹1,999 / Tournament ₹2,999 /
  Advanced ₹4,999 per month). **There is no billing system.** Nothing is sold
  through the site yet; pricing is marketing copy.
- Puzzles and engine play are free and unauthenticated. They are the top of the
  funnel; paid coaching happens offline.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite 5, react-router-dom 6, Tailwind 3, Framer Motion (About page only) |
| UI primitives | Hand-rolled shadcn-style in `src/components/ui/` (Radix Slot + CVA + tailwind-merge) |
| Auth / DB / Storage | Supabase (Postgres + Auth + Storage), accessed from the browser with the anon key |
| Chess rules | `chess.js` v1 |
| Chess engine | Stockfish 16 NNUE single-threaded WASM, **vendored** in `public/stockfish/`, run in a Web Worker |
| Backend | FastAPI (Python 3.12 target), in `backend/`. **Written and tested, not deployed** |
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
public/           stockfish WASM, sounds, icons, _redirects
assets-src/       full-resolution artwork, deliberately NOT shipped
docs/             ARCHITECTURE.md, ROADMAP.md, TESTING.md, this file
```

**Migrations are manual.** Adding a `.sql` file does nothing until someone runs
it in the Supabase dashboard, in filename order.

---

## 4. Routes

| Path | Page | Auth | Footer |
|---|---|---|---|
| `/` | Home | public | yes |
| `/about` | About | public | yes |
| `/courses` | Courses index | public | no |
| `/courses/:subject` | Course detail (only `chess` is valid) | public | no |
| `/workshops` | Workshops | public | yes |
| `/puzzles` | Puzzle trainer | public | no |
| `/practice` | Play vs engine | public | no |
| `/tournaments` | Tournaments + registration | public | yes |
| `/contact` | Contact form | public | yes |
| `/dashboard` | Profile settings | **required** | no |
| `/mylearning` | Course shortcuts | **required** | no |
| `/admin` | Admin panel | **admin role** | no |
| `*` | 404 page | public | no |

- Auth-gated routes use `<RequireAuth>`, which prompts in place with a sign-in
  modal rather than redirecting (sign-in is a modal, so a redirect loses intent).
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
- **Workshops**: four formats described; **static copy, no database table yet**.
- **Tournaments**: lists published, future tournaments; per-tournament
  registration form writing to `tournament_registrations`.
- **Contact**: form writing to `contact_submissions`.
- **Footer**: two academies, hours, email, phone, nav links.

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
- **No points, no progress tracking.** Solving records nothing.

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
- Supabase email/password. Sign-up requires 8+ chars with a letter and a number.
- `AuthContext` exposes `session`, `user`, `profile`, `loading`, `authError`,
  `refreshProfile`, `signUp`, `signIn`, `signOut`.
- A trigger creates a `profiles` row on sign-up.
- Roles: `student` (default) and `admin`. Promotion is manual via SQL.

### 5.5 Admin panel (`/admin`)
Six tabs, all writing directly to Supabase from the browser under admin RLS:
Videos (upload to Storage + chapter management + delete), Tournaments,
Carousels, Gallery, Testimonials, Enquiries inbox.

---

## 6. Data model

All tables are in `public`, all have RLS enabled. `is_admin()` is a
`SECURITY DEFINER` helper that reads `profiles.role`, used by every admin policy
(defined this way to avoid infinite RLS recursion on `profiles`).

### profiles
```
id           uuid PK -> auth.users(id) on delete cascade
name         text
grade        text
role         text not null default 'student'     -- 'student' | 'admin'
rank_points  integer not null default 0          -- legacy, no longer written
created_at   timestamptz not null default now()
```
RLS: a user reads and updates **only their own row**, and cannot change `role`
or `rank_points` (enforced with `WITH CHECK` + column comparison). Admins read
all. Auto-created by the `handle_new_user()` trigger.

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
RLS: anyone may insert; users read their own; admins read all. A unique
constraint blocks duplicate registrations.

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
unique (category, title)
```

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

### Storage buckets
`course-videos`, `carousel-images`, `gallery-images` — all currently **public
read**.

---

## 7. Frontend architecture notes

- **`src/data/mockData.js`** holds all static copy and config: `NAV_LINKS`,
  `COURSES_DROPDOWN`, `SUBJECT_TILES`, `EDU_COURSES`, `CHESS_BENEFITS`,
  `PRICING_TIERS`, `CORPORATE_DETAILS`, `ENGINE_LEVELS`, `GLYPHS_B`.
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

**Security, still open:**
- Course videos are advertised at ₹1,999-4,999/mo but `videos` is
  world-readable and `course-videos` is a public CDN bucket. The library is
  downloadable while logged out. Fixing it needs the backend for signed URLs.
- Unpublished gallery photos of children remain downloadable: `published` hides
  the row, not the file, and buckets grant anon `list`.
- No UPDATE policies on `videos`, `tournaments`, `carousel_slides`,
  `gallery_images`, `course_chapters`, so admins can only delete-and-recreate.
  For tournaments that cascade-deletes registrations.

**Not built:** payments/Razorpay, entitlements, workshops schema, classrooms and
homework, AI features, PGN-to-video, privacy policy and parental consent (India's
DPDP Act requires verifiable parental consent for children's data), rate limiting
or CAPTCHA on the two public forms, video captions, per-route SEO metadata.

**Other constraints:** no tests; migrations are manual; the JS bundle is ~690 KB
(~200 KB gzipped) with no code splitting; `framer-motion` is used by one page.
