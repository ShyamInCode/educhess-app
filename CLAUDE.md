# EduChess — Champion Chess Academy

Real business site for a chess coaching academy in **Gajuwaka, Visakhapatnam,
India**. Chess is the primary course; Maths and English are separate courses.
Students are children — treat PII accordingly.

## Read these first

- `docs/ARCHITECTURE.md` — target architecture, stack decisions and rationale
- `docs/ROADMAP.md` — prioritised, executable task list (start here to pick up work)

## Stack (current)

React 18 + Vite · react-router-dom 6 · Tailwind · Framer Motion ·
hand-rolled shadcn-style primitives in `src/components/ui/` ·
Supabase (Postgres + Auth + Storage) · chess.js · Stockfish WASM (client-side)

No TypeScript, no tests, no linter configured.

## Layout

```
src/
  pages/       route components (one per URL)
  components/  shared UI
    admin/     admin panel sections (one tab each)
    ui/        shadcn-style primitives (Button, Card, Input, …)
  lib/         supabaseClient, AuthContext, media, sound, stockfishEngine, utils
  data/        mockData.js — static copy/config (nav links, curricula, pricing)
supabase/      flat .sql migrations, run MANUALLY in the Supabase SQL editor
               (no CLI/migrations folder — run them in filename order)
public/        stockfish WASM engine, sounds/move.mp3
docs/          architecture + roadmap
```

## Conventions

- Colours are inline hex (`bg-[#1e293b]`) in older files; named Tailwind tokens
  (`bg-panel`, `text-gold`) exist in `tailwind.config.js` and are preferred for
  new code. Both work — don't mass-migrate.
- Palette: void `#0f172a`, panel `#1e293b`, line `#2d3b53`, gold `#d4af37`,
  emerald `#34d399`, ink `#e7ecf5`, ink-dim `#93a1b8`, danger `#f87171`
- Fonts: Cinzel (display), Inter (body), JetBrains Mono (notation/labels)
- RLS pattern for admin-gated writes:
  `exists (select 1 from profiles where id = auth.uid() and role = 'admin')`
- Admin access = `profiles.role === 'admin'`, checked in the UI **and** enforced
  in RLS. Promote a user manually via SQL.

## Gotchas

- **Migrations are manual.** Adding a `.sql` file does nothing until the user runs
  it in the Supabase dashboard. Always tell them explicitly which file to run.
- **`.env` is real and gitignored** — the project is wired to a live Supabase
  instance with real content. Don't commit it; don't print its values.
- **The board must stay rigid.** `Chessboard.jsx` fluid mode uses an explicit
  `grid-cols-8 grid-rows-[repeat(8,minmax(0,1fr))]` pinned `absolute inset-0`.
  Do **not** reintroduce per-cell `aspect-square` — that caused squares to
  shift/collapse between renders.
- **Puzzle positions must be legal both ways.** When generating/validating chess
  positions, check that the side to move is not in check **and** that the side
  *not* to move is not in check (the latter is an impossible position). Missing
  this shipped broken puzzles once already.
- **Lichess puzzle FEN is pre-opponent-move** — see `docs/ARCHITECTURE.md`.
- Dev server: use the preview tooling, not raw `npm run dev`. A junction at
  `C:/Users/user/Downloads/claude1/app` exists because the real path contains
  spaces/parens that break npm `--prefix`; `vite.config.js` sets
  `resolve.preserveSymlinks: true` for it.

## Working agreement

- Ask before schema changes or structural/architectural decisions.
- Don't break existing auth, chess play, or Supabase queries.
- Build incrementally, one section at a time, and verify in the browser before
  claiming something works.
