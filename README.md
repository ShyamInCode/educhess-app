# EduChess

The website and learning platform for a chess coaching academy in
Visakhapatnam, India. Chess coaching, a puzzle trainer backed by ~123k Lichess
puzzles, engine practice, courses with video, workshops and tournaments.

A static React bundle plus Supabase. **The entire server side is six SQL files
in `supabase/`, pasted into the Supabase SQL Editor once.** There is no
deployed server code — no Edge Functions, no backend service, no cron.

## Run it locally

```bash
npm install
```

Copy `.env.example` to `.env` and fill in the two Supabase values, then:

```bash
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Without a configured Supabase project the marketing pages render but anything
data-backed shows its empty or error state, and `/puzzles` will not load.
`/practice` works with no backend at all — Stockfish runs in a Web Worker.

## Set up the backend

Once, in one sitting of about 30–45 minutes: **`RESET-AND-APPLY.md`**. It
covers key regeneration, the six SQL files in order, the smoke tests and the
verification queries.

## Build

```bash
npm run build
```

Output goes to `dist/`. SPA fallback config ships for Vercel (`vercel.json`)
and Netlify/Cloudflare (`public/_redirects`); build command `npm run build`,
output directory `dist`, Node 18+.

## Lint

```bash
npm run lint
```

## Where things are

| Path | What |
|---|---|
| `docs/SYSTEM-OVERVIEW.md` | **Start here.** Architecture, data model, and the four rules that carry the weight. |
| `RESET-AND-APPLY.md` | The one manual session that applies the backend. |
| `supabase/` | The backend. Six numbered `.sql` files; the numbers are a dependency order. |
| `src/pages/`, `src/components/` | One component per route; `admin/` is one per admin tab. |
| `src/lib/` | Supabase client, auth context, media/signed URLs, puzzles, tiers, Stockfish. |
| `scripts/` | `import_lichess_puzzles.py` — the only operational script. |
| `docs/archive/` | What this replaced and why: the audits, the 22 old migrations, the deleted Edge Functions and FastAPI service. |

## Videos

Course and marketing video lives in the Supabase Storage bucket
`course-videos`, not in `public/`. The bucket is **private**: the browser mints
a short-lived signed URL per object, and a policy on `storage.objects` decides
whether it may. Two clips at the bucket root — `homepage.mp4` and `chess.mp4` —
are readable by anyone; everything else is gated on the chapter's tier.
