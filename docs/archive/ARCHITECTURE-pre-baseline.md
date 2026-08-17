# EduChess / Champion Chess Academy — Target Architecture

> Status: proposed, not yet implemented. Decisions here were made in the
> planning session; revisit before executing each phase.

## Guiding principle

**Don't rewrite what works.** Supabase auth, RLS, Storage and the existing React
app are functioning. We add a Python service *alongside* them for the work
Postgres and the browser genuinely can't do — we do not migrate off Supabase.

## The shape

```
┌──────────────────────────────────────────────┐
│ React 18 + Vite  (existing, keep)            │
│  • supabase-js → auth, DB reads, storage     │
│  • fetch → FastAPI for AI / video / sync     │
│  • Stockfish WASM stays client-side          │
└────────┬───────────────────────┬─────────────┘
         │ Supabase JWT          │ same JWT
         ▼                       ▼
┌──────────────────────┐  ┌──────────────────────────┐
│ Supabase             │  │ FastAPI (Python 3.12)    │
│  • Postgres + RLS    │◄─┤  • Lichess puzzle import │
│  • Auth (issues JWT) │  │  • AI endpoints          │
│  • Storage (images,  │  │  • PGN → video jobs      │
│    video)            │  │  • python-chess          │
│  • Realtime          │  │  • validates Supabase JWT│
└──────────────────────┘  └───────────┬──────────────┘
                                      ▼
                          ┌──────────────────────────┐
                          │ Worker: RQ + Redis       │
                          │ + ffmpeg (video render)  │
                          └──────────────────────────┘
```

## Why this stack

**Python/FastAPI for the backend service.** Driven by two stated future
requirements: AI integration and a PGN→video generator. `python-chess` is the
best-in-class library for PGN parsing/board rendering, `ffmpeg`/`moviepy` for
video, and the AI SDKs are first-class in Python. Choosing Node here would mean
a second language the moment video generation lands. One language for all the
heavy lifting.

**Not Supabase Edge Functions** for the main service: they're Deno/TypeScript,
have execution time limits unsuitable for video rendering, and would split the
backend across two runtimes. (They remain fine for small webhooks.)

**Auth bridge:** Supabase issues the JWT; FastAPI *validates* it with the project
JWT secret (HS256). No second auth system, no session syncing. Frontend sends
`Authorization: Bearer <session.access_token>`.

**Deployment:** Railway or Fly.io for FastAPI + Redis + worker (both handle
Python and ffmpeg without fuss). Frontend stays on any static host.

## Decision: keep Stockfish client-side (recommendation, pending your call)

You asked to move bots server-side. My recommendation is **keep the WASM engine
in the browser**, because:

- Zero server CPU cost — server-side Stockfish costs real money per concurrent user
- Zero latency
- Works offline
- Scales infinitely for free

Lichess's Bot API is for running *your bot on lichess.org*, not for embedding an
opponent in your app — it does not do what you want here.

**The one real argument for server-side:** students on low-end Android phones,
where WASM Stockfish is slow. If that's the actual motivation, the right answer
is a *hybrid* — client-side by default, with a server endpoint as fallback for
weak devices — not a wholesale move. Decide based on whether your students are
actually hitting this.

## Decision: Lichess puzzles go in Postgres, not called live

Do **not** call the Lichess API per puzzle at runtime (rate limits, latency, an
outage takes your feature down). Instead do a one-time bulk import.

Source: <https://database.lichess.org/#puzzles> — `lichess_db_puzzle.csv.zst`,
~5M puzzles, **CC0 licensed** (public domain; credit is courteous, not required).

Columns: `PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays,
Themes, GameUrl, OpeningTags`

**Critical gotcha — read before implementing.** The `FEN` is the position
*before the opponent's move*. `Moves[0]` is played *by the opponent*; the student
solves from the resulting position. So:

```
load(FEN) → apply(Moves[0]) → now it's the student's turn
student's moves  = Moves[1], Moves[3], Moves[5] …
opponent replies = Moves[2], Moves[4] …
```

This maps exactly onto the alternating `solution` array `PuzzleTrainer.jsx`
already consumes, so the trainer needs little change.

**Sizing:** Supabase free tier is 500 MB. Don't import all 5M. Filter to
~100–200k high-quality puzzles (`NbPlays` high, `Popularity` high) — that is far
more than the academy will ever exhaust.

**Mapping to the current UI:**
- Category ← `Themes` (`mateIn1`, `mateIn2`, `mateIn3`, `fork`, `pin`,
  `skewer`, `backRankMate`, `smotheredMate`, …) — enables many more categories
  than the 4 we have
- Difficulty ← `Rating` buckets (easy `<1300`, medium `1300–1800`, hard `>1800`)

**Efficient random selection** (`ORDER BY random()` degrades on large tables):
add a `rand double precision default random()` column with a btree index, then
`WHERE rand > random() ORDER BY rand LIMIT 20`.

This permanently retires the hand-generated puzzle set and the "same few puzzles"
problem.

## Media handling

**Root cause of the current cropping complaint:** containers use a hardcoded
`aspect-video` (16:9) with `object-cover`, which crops anything that isn't 16:9.
Uploading a portrait photo or a 4:3 video shows a zoomed fragment.

**Fix:**
1. Capture intrinsic `width`/`height` at upload time (browser `Image` /
   `HTMLVideoElement.loadedmetadata`) and store them on the row.
2. `<SmartImage>` component — fixed frame + `object-contain` + a blurred copy of
   the same image as backdrop fill (the YouTube/Instagram treatment). Never
   crops, still looks deliberate.
3. Video: **always** `object-contain`. Never crop video. Add a `poster`.
4. Gallery grid: masonry that respects each image's natural aspect ratio.
5. Optional: client-side downscale before upload to cap file size.

## Lightbox

One reusable `<Lightbox>` used by carousel, gallery, and admin grids:
portal-rendered, ←/→/Esc keyboard nav, swipe on touch, focus trap,
`role="dialog" aria-modal="true"`, neighbour preloading.

## Workshops (live Sunday sessions)

```
workshops              — template: title, description, cover, capacity, price,
                         recurrence (e.g. weekly Sunday), published
workshop_sessions      — concrete dated occurrences: starts_at, ends_at,
                         meeting_url, status
workshop_registrations — session_id, user_id?, child_name, grade,
                         parent_name/email/phone, status
```

**Security note:** `meeting_url` must **not** be publicly readable, or anyone can
crash a live class of children. Expose it only to registered users — separate
table or a `security definer` function gated on a registration row.

**"LIVE NOW" badge:** compute from `starts_at`/`ends_at` **server-side** (a
Postgres view or generated column), not from the browser clock — client clocks
are wrong often enough to matter.

**Recurrence:** simplest workable approach is a scheduled job that materialises
the next 8 Sundays from the template. Avoid full RRULE expansion until you need
it.

## Phasing

Each phase is independently shippable and roughly one focused session:

| # | Phase | Depends on |
|---|-------|-----------|
| 0 | Security + audit fixes (see `docs/ROADMAP.md`) | — |
| 1 | Media sizing fix + `<SmartImage>` + `<Lightbox>` | — |
| 2 | FastAPI skeleton + JWT bridge + deploy | — |
| 3 | Lichess puzzle import + retire generated puzzles | 2 |
| 4 | Workshops (schema, public page, admin, registration) | — |
| 5 | AI endpoints | 2 |
| 6 | PGN → video worker | 2 |

Phases 0, 1 and 4 need no backend and can ship immediately.
