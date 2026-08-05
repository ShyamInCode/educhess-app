# EduChess — Roadmap

Prioritised and executable. Each phase is ~one focused session. Read
`CLAUDE.md` and `docs/ARCHITECTURE.md` first.

Legend: **[!]** = do not defer · **[db]** = needs a migration run manually in
the Supabase SQL editor · **[be]** = needs the Python backend

> **Shipped since this file was last revised** (see `docs/SYSTEM-OVERVIEW.md`
> for the current state, which is authoritative):
> Google OAuth sign-in and parental consent · branded transactional email via
> Resend + Edge Function · puzzle attempt tracking and a tier-based daily
> allowance, enforced in the database · workshops schema, public page and
> admin tab · the missing admin UPDATE policies · server-side capacity and
> deadline enforcement · a real student dashboard · **Free / Pro / Academy
> membership with Razorpay checkout**.
>
> **[be] no longer implies the FastAPI service.** Several things this file
> assumed needed it were built on Supabase Edge Functions instead, which the
> project was already using. The FastAPI service in `backend/` remains written
> and undeployed, and nothing shipped depends on it.

---

## P0 — Security (do this first, today) — ✅ MOSTLY DONE

Found by audit. Exploitable right now with only the anon key from the public JS
bundle.

- **[!][db] P0-1 — ✅ DONE. `supabase/migration_security_fixes.sql` has been
  run** against the live project (verified: `is_admin()` exists and returns
  false for anon). Covers:
  - **C1 (critical):** any signed-up user could run
    `update profiles set role='admin'` from the browser console and gain read
    access to every enquiry and tournament registration (children's names,
    grades, parent phone/email) plus delete rights on all content. Cause: the
    self-update policy had no `WITH CHECK` and no column restriction.
  - **C2 (critical):** `profiles` was readable by *anonymous* users
    (`using (true)`) — a bulk dump of every enrolled child's name, grade,
    signup date and user-id with no login. Only `AuthContext` reads this table,
    and only its own row, so restricting it breaks nothing.
  - Forged `user_id` on both public insert endpoints; unbounded
    `rank_points`/`points`; missing length caps on free-text PII; duplicate
    tournament registrations; cascade-delete of registrations.
- **P0-2 — Verify after running:** log in as a normal student and confirm
  (a) `select * from profiles` returns only your own row, (b)
  `update profiles set role='admin'` fails, (c) the app still loads, the
  contact form still submits, and puzzle points still award.
- **[!] P0-3 — STILL OPEN, and now the most commercially significant item in
  this file.** `videos` is `select using (true)` and `course-videos` is a
  public CDN bucket. Course access is now a thing people **pay for** — Pro
  ₹1,999/mo and Academy ₹3,999/mo are sold partly on it — so the gap has gone
  from theoretical to a live revenue leak.
  What exists today is `course_chapters.min_tier`, which padlocks a chapter in
  the UI. That is an honesty box: the CDN URL is still fetchable from the
  network tab while signed out. `CourseDetail.jsx` and
  `migration_phase8_tiers.sql` both say so in comments; do not let anyone
  describe it as DRM.
  **Fix:** flip the bucket to private and issue short-lived signed URLs after
  checking the caller's tier against `min_tier`. A Supabase Edge Function can
  do this — the FastAPI service does **not** have to be deployed first, which
  is what previously blocked it.
- ✅ **P0-4 — Points were client-authoritative. RESOLVED BY REMOVAL.** The
  browser sent its own `points` value and a `security definer` trigger added it
  verbatim. **DECIDED: the points system is gone** — all `rank_points` displays
  (nav profile menu, dashboard) and both client-side `quest_progress` writes
  (homepage quest, puzzle solve) were deleted. Nothing consumed the total, so
  there was no feature to protect, only an exploit surface.

  Nothing was dropped server-side: the `quest_progress` and `profiles` columns
  and their existing rows are untouched, so this is reversible. **If points
  ever come back** (leaderboard, certificates, prizes) they must be
  server-authoritative from day one — a `quest_definitions(quest_key, points)`
  lookup or a `security definer` RPC that accepts only `quest_key`, never an
  amount. See also P4.6-7, which depends on server-verified completion.
- **P0-5 — Unpublished photos of children stay publicly retrievable.** The
  `published` flag hides the *row*, not the *file*; storage buckets grant anon
  `list`. A "removed" gallery photo is still downloadable by anyone who
  enumerates the bucket. Fix = drop blanket bucket SELECT, serve via signed URLs.
- **P0-6 — No UPDATE policies exist** on `videos`, `tournaments`,
  `carousel_slides`, `gallery_images`, `course_chapters`. Admins can only
  *delete and recreate* — which for tournaments destroys registrations. Add
  symmetric `for update using (is_admin()) with check (is_admin())`.
- ✅ **P0-7 — `migration_puzzles_v2.sql` claimed "safe to re-run" but does an
  unguarded `delete from public.puzzles`.** Comment fixed rather than the
  delete guarded: the wipe-then-reseed is the *point* of that migration on a
  first run (it replaces a seed set containing illegal positions), so guarding
  it would break it. The header now says NOT SAFE TO RE-RUN in full, explains
  why, and marks the file superseded — the app reads `lichess_puzzles` now, so
  there is no reason to run it against a database that already has it. The
  `delete` itself carries a `>>> DESTRUCTIVE <<<` marker.

---

## P1 — Media handling (no backend needed)

Directly addresses the reported cropping/zooming complaint. Audit found
**six** cropping sites, all the same root cause: a hardcoded `aspect-video`
box + `object-cover`.

- **[!] P1-1 — Remove `object-cover` from the six sites** (~10 lines total):
  | File:line | What |
  |---|---|
  | `Carousel.jsx:45-50` | homepage carousel — worst offender |
  | `AboutPage.jsx:166-170` | About gallery |
  | `HomePage.jsx:116-127` | hero video |
  | `CourseDetail.jsx:132-141` | every lesson video |
  | `AdminCarousels.jsx:128` | admin preview (crops the *preview*, so admins can't see what they're losing) |
  | `AdminGallery.jsx:122` | admin preview |
  For `<video>`, just delete `object-cover` — video letterboxes correctly by
  default, and `object-cover` also clips the native control bar.
- **P1-2 — `<SmartImage>` component.** Fixed frame + `object-contain` + blurred
  copy of the image as backdrop. Never crops; still looks deliberate.
- **[db] P1-3 — Store intrinsic `width`/`height` at upload** on
  `gallery_images` and `carousel_slides`, then set `style={{aspectRatio}}`
  per asset. Kills both cropping *and* layout shift.
- **P1-4 — `<Lightbox>` component.** Portal, ←/→/Esc, swipe, focus trap,
  `role="dialog" aria-modal="true"`, neighbour preloading. Wire into carousel,
  About gallery, and admin grids.
- **P1-5 — Videos need a `poster`, `onError`, and `<track kind="captions">`**
  (captions matter for a children's education product).
- **P1-6 — Optional:** downscale client-side before upload to cap egress cost.

---

## P2 — Content integrity (no backend needed)

Fabricated numbers on a site selling ₹1,999–₹3,999/mo are a trust and
advertising-standards problem, not a cosmetic one — and more so now that the
site takes the money itself rather than routing to a conversation. Most of
this phase is deletions.

- **[!] P2-1 — Fake statistics, and they contradict each other.**
  `HomePage.jsx:226-231` claims 4,870 students / 96% parent satisfaction /
  312 weekly quests / 58 arenas. `AboutPage.jsx:137-141` repeats them — while
  `AboutPage.jsx:34-39` says **5000+** students on the same page. `"Est."` is a
  placeholder that never got a founding year. Replace with real numbers or cut.
- **[!] P2-2 — `LiveTicker` invents six named children** ("Aarav just cleared…")
  scrolling on every page with a green "live" dot. Delete it, or back it with
  real anonymised `quest_progress` rows.
- **P2-3 — Unverified authority claims.** "In collaboration with international
  FIDE players and IITians" (`HomePage.jsx:104`) and "FIDE-aligned curricula"
  (`AboutPage.jsx:25`) need a named coach with a FIDE ID on the About page, or
  should be softened.
- **P2-4 — Fake subscription state.** `DashboardPage.jsx:80-82` tells *every*
  user they're on the ₹2,999/mo Tournament plan — it's reading a static
  marketing flag. There is no billing system. Remove the tab.
- **P2-5 — Fake progress.** `MyLearningPage.jsx:5`
  `PROGRESS_BY_KEY = {chess:35, maths:60, english:20}` — identical fake progress
  for everyone including logged-out visitors, under "Continue where you left off".
- **P2-6 — 15 downloadable PDFs that don't exist.** `ResourcesPage.jsx:27` —
  buttons with no `onClick`, no `href`, no file, with invented page counts.
- **P2-7 — Dead Dashboard controls.** "Save Changes" has no handler; the name
  field is uncontrolled so edits vanish; three notification checkboxes default-on
  and never persist (promising a "Weekly progress email" that doesn't exist).
- ✅ **P2-8 — Assets.** Both PNGs exist. The favicon was an 844 KB, 878×916 PNG
  served for a 16×16 tab render — roughly half the gzipped JS bundle, for an
  icon. Now `favicon-32.png` (**3 KB**) and `apple-touch-icon.png` (180×180,
  56 KB); the full-resolution original moved to `assets-src/` so it is no
  longer copied into `dist/`. `public/` went 1.7 MB → 884 KB.

  **The title is NOT a bug — DECIDED.** "EduChess" is the online brand and
  "Champion Chess Academy" is the offline/in-person entity, so the site is
  EduChess throughout. Site copy that used the offline name (About heading and
  intro, Courses eyebrow, image alt text) was switched to EduChess. The single
  deliberate exception is the HQ address in `mockData.js` `CORPORATE_DETAILS`,
  which reads "EduChess — Champion Chess Academy, Gajuwaka…" because that is
  the name on the building people are navigating to. Flip it if the signage
  changes.
- **P2-9 — Delete dead fabricated data** still shipping in the bundle:
  `mockData.js` `TESTIMONIALS` (4 invented parent quotes), `CURRICULA`, `GLYPHS`
  — all unreferenced now.

---

## P2.5 — Correctness & failure handling (no backend needed) — ✅ DONE

Verified in the browser: wrong quest moves rejected, route guard prompts,
courses round-trip, engine boots to `readyok` and replies to 1.e4. Build clean.

- ✅ **[!] P2.5-1 — Homepage quest accepted *any* move and declared checkmate.**
  Now requires the actual `h5→f7` queen move; a wrong piece or wrong
  destination gets a hint and awards nothing. `HomePage.jsx`.
- ✅ **[!] P2.5-2 — "No upcoming tournaments" was shown when the query *failed*.**
  Load errors are now distinct from empty results in `TournamentsPage`,
  `Carousel`, `Testimonials` and `AboutPage`; `AuthContext` keeps the existing
  profile on a failed refetch instead of quietly demoting an admin.
- ✅ **[!] P2.5-3 — Unmuted autoplay hijacked the first tap anywhere on the page.**
  `useAutoplaySound.js` tries unmuted once and falls back to muted; no global
  listeners.
- ✅ **P2.5-4 — Engine could hang forever.** `init()` now resolves on `readyok`
  (15 s cap) and `getBestMove` rejects on timeout (20 s), with the pending
  queue kept aligned so a late reply can't be handed to the next caller.
  `destroy()` cancels the init timer, and `StockfishPractice` ignores results
  from a superseded engine.
- ✅ **P2.5-5 — Timer/rAF leaks.** `CountUp` cancels correctly; `PuzzleTrainer`
  routes every delayed transition through a cleared-on-unmount `schedule()`;
  `TournamentsPage` has a cancellation flag. `App.jsx` no longer remounts the
  tree per navigation — the page-enter animation restarts via class toggle and
  scroll resets explicitly.
- ✅ **P2.5-6 — `AuthProvider` could deadlock on `loading: true`.**
  `getSession()` now has `.catch`/`.finally` and surfaces `authError`.
- ✅ **P2.5-7 — Points awarded but never displayed.** `refreshProfile()` added to
  `AuthContext` and called after both quest-point writes.
- ✅ **P2.5-8 — No error boundary.** `ErrorBoundary` wraps the app root and the
  route outlet (the latter keyed on pathname so navigating away clears it).
- ✅ **P2.5-9 — `/dashboard` and `/mylearning` had no auth guard.** `RequireAuth`
  prompts in place rather than redirecting, since sign-in is a modal.
- ✅ **P2.5-10 — Deep-link dead-end.** `CoursesPage` derives the open course from
  the URL instead of mirroring it into state; Back navigates, and the tiles are
  real `<Link>`s (middle-clickable, crawlable).

---

## P2.6 — Accessibility & mobile (no backend needed) — ✅ DONE

Verified in the browser: 64/64 squares named, 0 unlabelled fields, modal traps
and restores focus, Escape closes modal and dropdowns, no horizontal scroll at
320 px, mobile menu overlays instead of resizing `<main>`.

- ✅ **A11y — labels.** Every field across `ContactForm`, `AuthModal`, the
  tournament registration form and all five admin panels now has a
  `htmlFor`/`id` pair, plus `autoComplete` and `aria-invalid`/`aria-describedby`
  on the auth fields. The tournament form uses `useId()` because one renders
  per card. The quest answer box gets an `sr-only` label (a placeholder is not
  a label).
- ✅ **A11y — chessboard.** Each square is labelled `"e4, white pawn"` /
  `"d5, empty"` with `aria-pressed` on the selected square, and the grid is a
  `role="group"` named "Chess board". Was 64 anonymous buttons per board.
- ✅ **A11y — `AuthModal`.** `role="dialog"`, `aria-modal`, `aria-labelledby`,
  Escape to close, a Tab/Shift-Tab focus trap, and focus restored to the
  trigger on close.
- ✅ **A11y — dropdowns.** `aria-expanded`/`aria-haspopup` on every toggle, and
  a single Escape handler that closes the desktop dropdowns, the profile menu
  and the mobile panel.
- ✅ **Mobile.** `h-screen` → `h-[100dvh]` (and the hero's `76vh` → `76dvh`);
  the mobile panel is `absolute` so it overlays instead of squeezing `<main>`;
  the board's smallest square step is 28 px so the quest board fits a 320 px
  screen. The clipped-third-tab item was already moot — those Dashboard tabs
  were removed in P2.
- ✅ **Navigation uses real `<Link>`s** — nav bar, both dropdown menus, the
  mobile panel, course tiles, homepage CTAs, About pricing/footer CTAs and
  My Learning's Resume. Middle-click, copy-link and crawlable hrefs all work
  now, and `aria-current="page"` marks the active route. `ui/button.jsx`
  already supported `asChild`, so the styled CTAs became links without
  nesting a `<button>` inside an `<a>`.
- ✅ **404 page + SPA fallback.** `*` renders `NotFoundPage` (which shows the
  bad path) instead of silently replacing history with `/`. `public/_redirects`
  covers Netlify/Cloudflare Pages and `vercel.json` covers Vercel; the file
  comments list the nginx/Apache/Firebase equivalents.

---

## P2.7 — Compliance (do before marketing push)

- **Privacy policy + parental consent.** The tournament and contact forms
  collect children's names, grades and parent phone/email with no privacy page,
  no consent checkbox, and no erasure path. India's DPDP Act requires verifiable
  parental consent for processing children's data. There is no `/privacy` route
  in the app at all.

---

## P2.8 — Tooling (prevents recurrence)

- **No ESLint config exists**, yet the code has four
  `// eslint-disable-next-line react-hooks/exhaustive-deps` comments suppressing
  a rule that isn't running. Most of P2.5 would have been caught automatically.
  Add `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y` and a `lint` script.
- ✅ **ESLint configured** — `eslint.config.js` (flat config, ESLint 9) with
  `react`, `react-hooks` and `jsx-a11y`; `npm run lint` / `npm run lint:fix`.
  First run: 90 errors. Now **0 errors, 12 warnings**, exit 0.

  Most of the 90 were noise and are turned off with reasons in the config
  (38 × unescaped apostrophes in prose, ~15 × the `React` import being unused
  under the automatic JSX runtime, and rules firing on generic `ui/` wrappers).
  What it caught for real: a **stale `useMemo` in `Chessboard`** keyed only on
  `fenKey` while reading `game` — exactly the class of bug the four decorative
  `eslint-disable-next-line react-hooks/exhaustive-deps` comments were
  suppressing while no linter was installed.

  `react-hooks` v7's compiler-era rules (`set-state-in-effect`, `refs`) are
  warnings, not errors: both fire on deliberate working architecture here (the
  mutable chess.js ref, `setLoading(true)` at the top of fetch effects) and
  changing either is a refactor, not a lint fix.

- ✅ **Dead deps removed.** `lucide-react` (31 MB, zero imports) and `stockfish`
  (88 MB, never imported — the engine build is vendored into
  `public/stockfish/` and committed, which it has to be: bundlers can't wrap
  Stockfish's own worker/wasm loading, so it must be served as a static Worker
  script either way). `node_modules` 199 MB → **80 MB**. Verified after
  removal that `/practice` still boots the engine and replies to 1.e4.
  The setup notes in `stockfishEngine.js` were rewritten accordingly, and the
  error panel in `StockfishPractice.jsx` no longer tells a *student* to run
  `npm install stockfish` — it now offers a reload and a link to the puzzle
  trainer.
- `framer-motion` (~110 KB) is used by one page with no code splitting.
- README is stale — describes `App.jsx` as "the entire application", points at a
  `public/README-VIDEOS.md` that doesn't exist, and never mentions `.env` or the
  ten SQL migrations.

---

## P3 — Backend foundation [be] — ✅ CODE DONE, DEPLOY PENDING

Lives in `backend/`. See `backend/README.md` to run it.

- ✅ **P3-1 — FastAPI skeleton.** `/health`, `/me`, `/whoami`, CORS from env,
  docs disabled in production.
- ✅ **P3-2 — Supabase JWT validation** (`backend/app/auth.py`).
  `aud=authenticated`, requires `exp`+`sub`, fails **closed** if nothing is
  configured. `RequireUser` / `OptionalUser` dependencies — the latter for free
  features like puzzles that personalise when signed in.

  **Reworked for asymmetric keys.** This project's current signing key is
  `ECC (P-256)` (Settings → JWT Keys), i.e. **ES256** — the legacy HMAC secret
  is only listed as PREVIOUS KEY. The original verifier hardcoded
  `algorithms=["HS256"]` against the shared secret, so it would have rejected
  every token the project issues today. It now verifies against the project
  JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached, with a refresh
  retry so key rotation doesn't 401 everyone), and keeps the HS256 path only
  while `SUPABASE_JWT_SECRET` is set — set `ALLOW_LEGACY_HS256=false` to turn
  it off once old tokens expire.

  **Algorithm confusion is explicitly defended:** key material is never chosen
  by the token. `ES256/RS256` resolve from JWKS; `HS256` *always* uses the
  configured secret and never a JWKS key. `smoke_test.py` now runs 17
  assertions including a hand-crafted HS256 token signed with the ES256 public
  key (rejected) and `alg: none` (rejected). Requires `cryptography`, now in
  `requirements.txt`.
- ✅ **P3-4 — API client** (`src/lib/api.js`). Attaches the Supabase token,
  unwraps FastAPI's `detail` into a typed `ApiError`. Not yet imported anywhere.
- ⬜ **P3-3 — Deploy.** `Dockerfile` ready (python:3.12-slim). Remaining:
  1. Push to Railway/Fly/Render, set env vars in the dashboard
  2. Set `CORS_ORIGINS` to the deployed frontend origin (**not** `*`)
  3. Set `VITE_API_URL` in the frontend `.env`
  4. Confirm `api.health()` then `api.me()` from the browser with a live session

**Note on Python version:** local venv is 3.14, which had no prebuilt
`pydantic-core` wheel for pinned versions — `requirements.txt` is therefore
unpinned at the minor level and the Dockerfile targets 3.12. Pin exactly once
the deploy image is settled.

---

## P4 — Lichess puzzles [be][db]

Permanently retires the hand-generated puzzle set and the "same few puzzles"
problem.

**Puzzles and engine play stay FREE and unauthenticated** — this is the top of
the funnel. Students come to play, then convert to paid courses and get pulled
back by classroom homework (P4.6). Only *course videos*, tournaments and
workshops are paid.

**Progress: ✅ DONE.** Migration run, **123,297 puzzles imported**, frontend
switched over and verified in the browser against the live table. All 18
category × difficulty buckets return rows.

**FEN convention: ✅ VERIFIED against the real import** (the `[!]` warning below
is now settled). 75/75 sampled mate puzzles reach actual checkmate, with
solution lengths of exactly 1 / 3 / 5 plies for mateIn1 / 2 / 3, and every
sampled puzzle across all 18 buckets is playable move-by-move. The student
plays Black in ~half of them (31 w / 29 b in a 60-row sample), so the
board-flip path is real and exercised.

**Bug found and fixed during that verification:** chess.js v1 *throws* on an
illegal move rather than returning null, but `PuzzleTrainer` and
`StockfishPractice` both did `const move = game.move(...); if (!move) {...}`.
That branch was unreachable dead code, and clicking a piece then an illegal
square threw out of the React click handler, skipping the `setSelected(null)`
below it and leaving the piece stuck selected. Both now go through
`tryMove()` in `src/lib/chessMoves.js`.

**✅ All 13 categories now surfaced.** `CATEGORIES` in `src/lib/puzzles.js` was
6 entries, leaving roughly a third of the import unreachable. It now lists all
13 the importer files into — back rank / smothered mates, hanging pieces,
discovered attacks, double checks, deflection, sacrifices — each checked
against the live table before being added. Keep this list a subset of the
importer's `KEEP_THEMES` or a tile will render that always says "no puzzles".

**✅ Sampling RPC fixed — `supabase/migration_lichess_puzzles_rpc_v2.sql`
(run).** The original `rand > random() order by rand` is correct for sampling
an unfiltered huge table (P4-4) but misbehaved once every call also filtered
hard on theme + rating: the planner walked the `rand` index hunting for rare
matches, and the probabilistic cut discarded half an already-small pool.
Symptoms were a cold-cache **statement timeout** on `smotheredMate/easy`
(surfacing as "Couldn't load puzzles") and **short batches** — 15 and 19 rows
when 20 were asked for. Now filters into a materialised pool first, then
samples that.

Verified after running: all **39 buckets return a full 20 rows**, 0 errors,
0 short batches; 16 hammered calls on the rarest buckets had a 255 ms median /
524 ms max; randomness intact (0/20 overlap between draws on a large pool,
no duplicates within a draw); 60/60 mate puzzles still end in checkmate with
the right ply count. A 7-ply smothered mate was solved end-to-end through the
UI — 4 student moves with 3 auto-played opponent replies — which also
exercises the forced-reply timer.

> **[!] Verify the FEN convention against real data before trusting it.**
> Lichess documents `FEN` as the position *before the opponent's move* with
> `Moves[0]` played by the opponent. That is what the schema comment and the
> importer assume, but it has **not** been checked against a real downloaded
> row — the sample used in testing was hand-written. After importing, take one
> `mateIn1` puzzle, apply `moves[1]` (SQL 1-indexed), and confirm with chess.js
> that the resulting position is White-to-move and that `moves[2]` is mate.
> If the convention is inverted the whole Puzzles page will be subtly wrong.

- **P4-1 — Import** `lichess_db_puzzle.csv.zst` (CC0). Default is **20,000**
  puzzles, balanced across (category × difficulty) by per-bucket quotas —
  without those, common themes like `fork` crowd out `mateIn3` at small import
  sizes. 20k is far more than students will exhaust.

  **Free-tier note:** Supabase Storage (1 GB — photos/video) is a *separate*
  quota from the Database (500 MB — puzzles). They don't compete. Check actual
  usage after import with:
  ```sql
  select pg_size_pretty(pg_total_relation_size('public.lichess_puzzles'));
  ```
  Raise `--limit` later if there's headroom; re-running is idempotent
  (`on conflict do nothing`), so it only adds what's missing.
- **P4-2 — Schema:** `puzzle_id, fen, moves text[], rating, themes text[],
  popularity, nb_plays, game_url, rand double precision default random()`.
  Index `themes` (GIN), `rating`, `rand`.
- **P4-3 — Mind the FEN convention.** The stored FEN is the position *before the
  opponent's move*; `moves[0]` is the opponent's. Apply it, then the student
  solves. See `docs/ARCHITECTURE.md`.
- **P4-4 — Random selection:** `where rand > random() order by rand limit N`,
  not `order by random()`.
- **P4-5 — Map to UI:** category ← `themes`, difficulty ← `rating` buckets
  (easy <1300, medium 1300–1800, hard >1800). Unlocks far more categories than
  the current four.
- **P4-6 — Adapt `PuzzleTrainer.jsx`** — its alternating solution array already
  matches Lichess's move list, so changes should be small.

---

## P5 — Workshops (no backend needed) [db] — ✅ SHIPPED, SIMPLER THAN PLANNED

- **P5-1 — ✅ DONE, but two tables not three.** Shipped as `workshops` +
  `workshop_registrations`, mirroring tournaments exactly. The
  `workshop_sessions` layer was dropped: it only earns its keep once
  recurrence exists (P5-4), and a template with no occurrences would have been
  a second concept for the admin to learn for no present benefit. Add it when
  recurrence lands — the registration FK moves from `workshop_id` to
  `session_id` at that point, which is the one real cost of deferring.
- **P5-2 — N/A for now.** There is no `meeting_url` column; an online workshop
  puts its platform in `venue`, which **is** publicly readable. So do not put
  a live joining link in `venue` for a children's class — the original warning
  stands, it has just moved. Sending the link by email after registration is
  what the confirmation email is for. A gated `meeting_url` should land with
  P5-4.
- **P5-3 — Not built.** No "LIVE NOW" badge. When it is built, compute it
  server-side as originally specified.
- **P5-4 — Not built.** No recurrence, no scheduled job. This project still
  has no cron. Admins create each workshop by hand.
- **P5-5 — ✅ DONE.** Public page, admin tab and registration form, sharing
  `EventCard` / `EventRegistrationForm` / `AdminEvents` with tournaments,
  including the P0-1 insert-policy hardening (forged-`user_id` guard, published
  + deadline check, length caps, unique entry index) and server-side capacity
  enforcement.

---

## P4.5 — Paid content & Razorpay [db] — ⚠️ PARTLY SHIPPED

**The backend prerequisite turned out not to be one.** Both halves that need a
server — creating an order with the key secret, and verifying the webhook
signature — are Supabase Edge Functions (`razorpay-order`,
`razorpay-webhook`). FastAPI was never involved. Deployment notes live in
`supabase/functions/RAZORPAY.md`.

**What shipped is subscription-shaped, not per-item.** The plan below assumed
you buy *a course* or *a tournament entry*. What exists is a monthly
membership — Free / Pro / Academy — that grants a puzzle allowance and course
chapters. Tournament and workshop fees are still collected offline; the `fee`
column remains free text. Read the two designs as alternatives, not stages.

### Entitlements

- **[db] P4.5-1 — ✅ DONE differently.** Gating is per *chapter*, not per
  video: `course_chapters.min_tier` ∈ free/pro/academy, with a selector in
  the admin Videos tab. Marking a chapter `free` is the "free preview" idea.
- **[db] P4.5-2 — ✅ DONE differently.** No `entitlements` table. Access is
  `profiles.tier` + `tier_expires_at`, resolved by `current_tier()` with
  expiry applied at read time. Manual grants for parents who pay in person —
  which the original note rightly called important — are the Members tab in
  the admin panel, backed by `admin_set_tier()`.
  Revisit a real `entitlements` table if you ever sell a single course
  outright, or need per-course rather than per-tier access.
- **[!] P4.5-3 — STILL OPEN. This is P0-3 and it is now urgent.**
  `course-videos` is still a public bucket, so what the tiers sell is not
  actually protected. An Edge Function issuing signed URLs after a
  `min_tier` check is the fix, and no longer blocked on anything.

### Admin experience (requested)

The admin must never touch the Razorpay dashboard. Whatever amount they type
when creating a tournament or pricing a course becomes a working payment
automatically.

- **Admin types an amount, nothing else.** Tournament form already has a `fee`
  field (currently free text like "₹500") — change it to
  `fee_paise integer` so it's machine-usable. Same for course pricing, which is
  currently hardcoded in `mockData.js` `PRICING_TIERS` and needs to move to a
  `courses`/`plans` table before it can be sold.
- **Backend auto-creates the Razorpay object on save.** When a tournament or
  course is created/priced, the backend calls Razorpay to mint a payment target
  for that exact amount and stores its id + URL + QR image on the row. Admin
  sees "Payment ready ✓" and a QR they can print or WhatsApp.
- **Which Razorpay product:** use **Payment Links** or the **QR Code API** —
  both return a hosted URL *and* a UPI QR for a fixed amount, which is what
  parents in India will actually use. Standard Checkout is still the path for
  in-app card/UPI flow; the QR is for offline/WhatsApp sharing. Support both:
  same underlying order, two entry points.
- **QR display:** show it on the tournament card and in the admin panel.
  Registration stays `pending` until the webhook confirms — a QR being scanned
  is not proof of payment.
- **Refunds/cancellations** need an admin action too (Razorpay refund API),
  since cancelled tournaments will happen.

### Razorpay — security essentials, do not shortcut

- **P4.5-4 — ✅ DONE.** `RAZORPAY_KEY_SECRET` is a Supabase secret, read only
  inside `razorpay-order`. `VITE_RAZORPAY_KEY_ID` (publishable) is the only
  half in the bundle; blank it and the upgrade buttons fall back to a contact
  link rather than showing a button that cannot work.
- **[!] P4.5-5 / P4.5-6 — ✅ DONE, webhook only.** The browser's success
  callback grants nothing at all — the app does not even check its signature,
  because it never acts on it. `razorpay-webhook` verifies the HMAC over the
  **raw** request body (parsing and re-serialising would change the bytes and
  fail every check), with a constant-time compare, then calls
  `record_razorpay_payment()`. That function locks the row and returns early
  if the order is already paid, so Razorpay's retries and its duplicate
  `payment.captured` / `order.paid` pair cannot buy two months.
  `refund.processed` is **not** handled — see the remaining work below.
- **[db] P4.5-7 — ✅ DONE as `payments`.** Same idea, membership-shaped:
  `tier` and `months` instead of `purpose`/`target_id`. Amount is integer
  paise. RLS lets users read their own and admins read all, with **no INSERT
  or UPDATE policy at all** — every write is service-role, because a client
  that could write here could grant itself a membership. `raw_payload jsonb`
  was not kept; add it if you ever need to reconcile against Razorpay.
- **P4.5-8 — ✅ DONE.** The client sends `{ tier }` and nothing else. The
  amount comes from a `PRICES` table inside `razorpay-order`, which must be
  kept in step with `src/lib/tiers.js` — the file the customer sees. Both
  files carry a comment saying so.
- **P4.5-9 — Not applicable as written.** There is one purchase path, the
  membership. Tournament and workshop registrations are still free to submit
  and their fees are settled offline; nothing is created `pending`.
- **P4.5-10 — Compliance: STILL REQUIRED and gates go-live.** Razorpay's India
  onboarding needs a registered business entity, and the site needs Terms,
  Refund/Cancellation, Privacy and Contact pages. Contact exists; the other
  three do not. The privacy policy also carries the DPDP obligation —
  `profiles.consent_at` records that consent was given, which is not the same
  as telling anyone what you do with the data.

### Remaining payment work

- **Refunds.** No `refund.processed` handling and no admin refund action. A
  refund today means refunding in the Razorpay dashboard and then setting the
  member back to Free in the admin Members tab, by hand, in two places.
- **Renewal.** A month is bought at a time; nothing charges the card again and
  nothing warns a member that they are about to lapse. Razorpay Subscriptions
  would replace the one-shot order flow if you want true auto-renewal.
- **Lapse notice.** Expiry is applied silently at read time. A member loses
  access with no email and no in-app warning. The `send-email` function is
  already deployed and could carry this, but it is webhook-driven and there is
  no cron to trigger a "your plan ends in three days" job.
- **QR / Payment Links.** The original plan wanted a printable, WhatsApp-able
  fixed-amount QR for parents who pay offline. Standard Checkout shipped
  instead. The QR shown inside Checkout is **not** that — in test mode it is
  not a real UPI address at all, and scanning it with a real app correctly
  reports an invalid VPA. If offline QR sharing matters, that is the Payment
  Links or QR Code API, and it is still unbuilt.

---

## P4.6 — Classrooms & homework [db]

The referral engine: instructors assign puzzle homework, students come back to
the site to do it.

- **[db] P4.6-1 — Add an `instructor` role.** Currently only `student`/`admin`.
  After the P0-1 fix, `role` is not client-writable — admins promote via SQL or
  a backend endpoint.
- **[db] P4.6-2 — Schema:**
  ```
  classrooms          id, name, instructor_id, join_code unique, is_active
  classroom_students  classroom_id, student_id, joined_at   (unique pair)
  assignments         id, classroom_id, title, instructions, due_at,
                      kind='puzzles', config jsonb {themes[], difficulty, count}
  assignment_puzzles  assignment_id, puzzle_id, position   (frozen set)
  assignment_progress assignment_id, student_id, puzzle_id, solved_at, attempts
  ```
- **[!] P4.6-3 — Join codes. DECIDED — no instructor-side student search.**
  The instructor generates a classroom code and shares it; the student enters it
  to join. Student-initiated, no searchable directory of children, and it can't
  reopen the leak P0-1 just closed.

  Design details that matter:
  - **Code format:** 6–8 chars from an unambiguous alphabet — exclude `0/O`,
    `1/I/L`. These get read aloud in class and copied off a whiteboard, so
    ambiguity is a real support cost. Store uppercase, compare
    case-insensitively, unique index.
  - **Joining must go through a `security definer` RPC** — e.g.
    `join_classroom(code text)`. A student cannot `select` a `classrooms` row
    they're not a member of yet (RLS forbids it), so the lookup has to run as
    the definer, validate the code, and insert the membership row itself.
    Return a generic failure on a bad code — never reveal whether a code exists.
  - **Rate-limit join attempts** per user/IP. A 6-char code space is brute
    forceable otherwise, and the prize is access to a roster of children.
  - **Codes must be rotatable.** Instructor can regenerate (invalidating the
    old one) if a code leaks to a class WhatsApp group. Keep `is_active` so a
    classroom can stop accepting joins without being deleted.
  - **Instructor can remove a student** from the roster; the student can leave.
  - Require an authenticated session to join — no anonymous classroom members.
- **P4.6-4 — Freeze the puzzle set at assignment time** (`assignment_puzzles`)
  rather than re-rolling random puzzles per student — otherwise the instructor
  can't review the same work twice and students can reroll away hard ones.
- **P4.6-5 — RLS:** a student sees only their own classrooms/assignments/
  progress; an instructor sees only their own classrooms and the progress of
  students in them; admins see all. This is the most RLS-sensitive feature yet —
  write the policies before the UI.
- **P4.6-6 — UI:** instructor dashboard (classroom list → roster → create
  assignment → completion grid) and a student "Homework" section with due dates.
  Reuse `PuzzleTrainer` with an assignment-scoped puzzle queue.
- **P4.6-7 — Depends on P0-4** (server-side points). Homework completion must be
  server-verified or students will simply POST themselves a completed status.

---

## P-practice — Engine strength & game review — ✅ DONE

- ✅ **Engine difficulty now matches the chosen rating.** The old code sent only
  `Skill Level` and **never enabled `UCI_LimitStrength`**, so Stockfish's own
  calibrated Elo limiter stayed off and every tier played near full strength.
  Measured on 24 one-move tactics: the old "500 Beginner" found **22/24** —
  indistinguishable from the current 1500 tier, which is exactly the reported
  symptom.

  Now `setStrength()` picks between two regimes:
  - **elo ≥ 1320** → `UCI_LimitStrength` + `UCI_Elo`. Genuinely calibrated.
  - **elo < 1320** → below the limiter's floor on this build, so weakened by
    hand: Skill 0, shallow depth, and MultiPV candidate sampling
    (`pickMoveForLevel`) that deliberately plays a worse *engine* line rather
    than a random legal move — weak play that still looks plausible.

  After: **1/24 · 11/24 · 22/24 · 23/24 · 24/24** across the six tiers. In a
  full game against a strong engine, the 500 tier now analyses at ~173cp
  average loss (est. 825) versus ~79cp (est. 1275) before tuning. The two
  sub-1320 tiers are labelled as approximations in the UI rather than
  overclaiming, since the engine cannot actually be driven below 1320.

- ✅ **Post-game analysis** (`src/lib/gameAnalysis.js`, `GameAnalysis.jsx`).
  On checkmate/stalemate/draw a Game Review panel appears above the difficulty
  picker: per-side accuracy, estimated rating, average centipawn loss, a
  best/excellent/good/inaccuracy/mistake/blunder breakdown, and the three
  costliest moves with the engine's preference. Runs on its own full-strength
  engine — never the handicapped one that played the game — with a progress
  bar, cancel-on-unmount, and depth fixed at 12 so numbers are comparable.

  Verified end to end: played to checkmate through the real UI, analysed 71
  positions, report rendered. On Scholar's Mate it correctly flags 3…Nf6 as
  the blunder (White 93.5%, Black 43.7%); on ten book Ruy Lopez moves both
  sides score 97-99%.

  Three calibration fixes found by testing: centipawn loss is capped at 1000
  when averaging (a mate scored 10000cp made "average loss" read 3344cp);
  accuracy blends the arithmetic and harmonic means so one blunder actually
  registers (Scholar's Mate Black went 67% → 44%); and the engine's own choice
  is pinned to zero loss, which removed a self-contradicting
  "Best — cost 0.6 pawns" row. Rating anchors are fitted to the published rules
  of thumb (10cp→2500, 40cp→1675, 150cp→900) and suppressed entirely below 20
  moves, because a short quiet opening flatters weak play badly.

---

## P-positioning — Chess-only site & board UX — ✅ DONE

- ✅ **The site is a chess academy again.** The homepage opened with a maths
  word problem ("Queen = Rook + Bishop + X") gating a Scholar's Mate board;
  both are gone. In their place `ChessBenefits` rotates through what the game
  builds (memory, concentration, planning, decisions under pressure, learning
  from mistakes, confidence), pausing on hover/focus and not animating at all
  under `prefers-reduced-motion`. Claims are phrased as what playing involves,
  not as health outcomes, so nothing needs substantiating.

  Maths and English are out of the hero, About, Resources and the nav
  dropdown. Dead exports `CURRICULA`, `TESTIMONIALS` and `GLYPHS` were deleted
  (ROADMAP P2-9, finally closed) which removed most of that copy at a stroke.

- ✅ **Courses is two sections.** Chess is live and linked; **Edu Courses**
  (Maths, English, AI) render as unlinked "Coming soon" cards from a new
  `EDU_COURSES` list. Deliberately not links: a tile that navigates into an
  empty course reads as broken, one that says Coming soon reads as a roadmap.
  Verified the only course link on the page is `/courses/chess`.

- ✅ **Em dashes removed from user-facing copy.** 55 in visible strings became
  full stops or conjunctions; code comments were left alone since nobody reads
  those on the site. Verified 0 remaining across all nine routes.

- ✅ **Practice board.** Engine difficulty is now a dropdown on the board's top
  bar instead of a six-button card below it. Board coordinates (a-h, 1-8) ride
  inside the edge squares, so the rigid 8x8 grid is untouched and they follow
  the flip. The "Offline Engine Play" eyebrow is gone.

- ✅ **Flip board actually swaps sides.** It was a view-only rotation: the
  board turned around but the student still moved White and the engine still
  answered as Black. Colour is now the real state (`playerColor`) and
  orientation follows it, so the control is "Play as Black/White", it starts a
  fresh game, and the engine opens as White when the student takes Black.
  Sides can only change between games because swapping mid-game would leave
  the student owning pieces they never moved. Verified: board flips, engine
  opens, White pieces become unselectable and Black's become selectable.

  The opponent/you bars no longer swap with the flip either. The opponent is
  always the top bar, which is what the orientation already expresses.

### Follow-up pass

- ✅ **Footer is opt-in per route**, not global: `/`, `/about`, `/contact`,
  `/tournaments`, `/workshops`. It is a marketing surface, so it belongs at the
  end of pages a visitor *reads* and gets in the way on the ones they *use*
  (courses, puzzles, practice) where the page already ends in controls.

- ✅ **Resources replaced by Workshops.** `/resources` and
  `RESOURCE_CATEGORIES` are gone; `/workshops` describes the four formats and
  routes people to the contact form. No invented sessions or dates, because
  there is still no `workshops` table (P5). When that lands, the static list
  becomes a query and the call to action becomes a registration form.

- ✅ **Homepage cut back.** Roughly 310 words total. The
  "Chess Academy · Visakhapatnam" eyebrow, the long hero paragraph and the
  contact-detail cards beside the form are gone (the footer carries them).
  "What we offer" is three items: coaching, three levels, workshops and
  tournaments. Achievements lost its subheading.

- ✅ **Slider retitled "Why playing chess"**, with the arrows moved out of the
  header to flank the slide, so the control that changes an item sits next to
  the item it changes.

- ✅ **Practice: analysis hint is a control, not a card.** A magnifier-over-a-
  chart button sits at the right of the "You" bar; clicking it explains the
  game review, and any click or Escape closes it. A permanent card below the
  board was too loud for a feature you cannot use until the game ends, but with
  nothing at all the review is undiscoverable.

  Note the toggle calls `stopPropagation`: the close-on-any-click listener is
  on `document`, and React delegates from `#root`, so without it the opening
  click would immediately close the popover again.

- ✅ **"Help" removed from the profile menu** (About covers it) and the contact
  page trimmed to just the form.

- ✅ **"What the game builds" is now an auto-advancing slider**, one benefit per
  slide, illustrated. Two seconds a slide is fast, so the controls carry more
  weight than usual: prev/next buttons, dots, arrow keys, swipe, pause on hover
  and on focus, and no auto-advance at all under `prefers-reduced-motion`.
  Verified it advances and wraps, and that hovering genuinely stops it.

  The illustrations (`BenefitArt.jsx`) are inline SVG rather than image files:
  crisp at any size, nothing to download, no `public/` assets to keep in sync,
  and they inherit the palette. Raster assets on a CDN would also have broken
  the offline story.

- ✅ **Homepage sections.** A "What we offer" block with six concrete points,
  and the carousel is now **Achievements** ("Our students and their
  tournaments"). Testimonials lost the "From the Cohort" eyebrow.

- ✅ **Footer** on every route, built from `CORPORATE_DETAILS` so the two
  academies, phone, email and hours are stated in exactly one place. It renders
  *inside* `<main>` because that is the scroll container; outside it, the footer
  would be pinned to the viewport on every page.

- ✅ **Second academy** added: opposite Timpany School, VUDA Colony.

- ✅ **About milestones** corrected: founded 2016, and "Offline Academies: 2"
  replaces the coaching-levels line.

- ✅ **Practice.** The "this tier is approximate" note is gone, and a card now
  advertises the game review while a game is in progress, since otherwise the
  only way to discover the feature is to finish a game by accident.

---

## P6 — AI [be]

- Server-side only — the API key must never reach the browser.
- Candidate first features: game/PGN analysis in plain language for students,
  auto-drafted blog posts, enquiry triage for admins.

---

## P7 — PGN → video [be]

- `python-chess` for parsing and board SVGs → frames → `ffmpeg`.
- Long-running, so it needs a real queue (RQ + Redis) and a jobs table with
  status polling. Do not run this inside a request handler.
- Render to Supabase Storage, then reuse the existing `videos` pipeline.

---

## Deferred / consider later

- TypeScript, ESLint/Prettier, and a test runner (none configured today)
- Error boundary + user-visible failure states (Supabase errors are largely
  swallowed today)
- SEO: per-route `<title>`/meta, sitemap. Would argue for Next.js — but that's a
  migration, only worth it if organic search matters to the business.
- Rate limiting / CAPTCHA on the two public forms (floodable today)
- `contact_submissions.user_id on delete set null` leaves orphaned children's
  data with no erasure path — relevant to India's DPDP Act.
