# Testing the P2.5 / P2.6 changes

## Do I need the backend? No.

**Nothing in P2.5 or P2.6 touches the backend.** `backend/` is P3 scaffolding —
`/health`, `/me`, `/whoami` — and its client (`src/lib/api.js`) is still not
imported by any component. You can leave FastAPI stopped for all of this.

What you actually need:

| Layer | Needed? | Why |
|---|---|---|
| Vite dev server | **yes** | it's all frontend |
| Supabase (`.env`) | **for some checks** | auth, carousel, testimonials, tournaments, gallery, admin |
| FastAPI backend | no | nothing calls it yet |
| Lichess puzzle import | **blocks `/puzzles` only** | `lichess_db_puzzle.csv.zst` is still downloading |

```bash
npm run dev
```

Then open <http://localhost:5173>. (Or use the preview tooling — see `CLAUDE.md`;
the junction at `C:/Users/user/Downloads/claude1/app` exists because the real
path has spaces and parens that break `npm --prefix`.)

---

## A. Needs only the dev server

### 1. Homepage quest actually validates the move

The bug: any white piece to any square used to say "Checkmate! Quest Completed!".

1. Type `1` → **Verify Answer**. The board unlocks.
2. Click the **e4 pawn** → *"That piece can't deliver mate here…"*, nothing moves.
3. Click the **h5 queen**, then **h6** → *"Not mate. The queen and the bishop on
   c4 both hit f7…"*, nothing moves.
4. Click the **h5 queen**, then **f7** → *"Checkmate!"* and the completion card.

There should be **no mention of points** anywhere in that card.

### 2. 404 page

Visit `/anything-made-up`. You should get **"This square is empty"** showing the
bad path — not a silent bounce to the homepage. Press Back: it returns to where
you were (the old `replace` redirect broke that).

### 3. Courses deep-link round trip

1. Go to `/courses/chess` → detail page.
2. Click **← Back** → URL becomes `/courses` (it used to stay on
   `/courses/chess` while showing the grid).
3. Click the **Chess** tile → `/courses/chess` again. This is the click that
   used to do nothing.
4. Middle-click a course tile — it opens in a new tab now (real `<Link>`s).

### 4. Keyboard accessibility

- **Modal:** click Login. Focus lands inside the dialog. Tab to the last
  control, Tab again → it wraps back to Close instead of escaping behind the
  overlay. Press **Esc** → closes, and focus returns to the Login button.
- **Dropdowns:** open the Courses ▾ menu, press **Esc** → closes. The toggle
  reports `aria-expanded`.
- **Board:** every square announces as e.g. *"e4, white pawn"* / *"d5, empty"*
  instead of 64 anonymous "button"s.

### 5. Mobile at 320 px

Devtools → 320×720:

- The quest board fits — **no horizontal page scroll**.
- Open the hamburger: the panel **floats over** the page. `<main>` keeps its
  height (it used to be squeezed to a sliver).
- The app fills the visible viewport with the URL bar showing (`100dvh`).

### 5b. Engine difficulty actually differs

Pick **500 · Beginner**, play a few moves, then reset and pick **2500 · Master**
and play the same moves. The Beginner should hang material and miss simple
tactics; before the `UCI_LimitStrength` fix both tiers played nearly identically.

The two lowest tiers say "Approximately 500 — the engine's own rating limiter
stops at 1320" under the picker. That wording is deliberate: Stockfish cannot be
driven below 1320 natively, so those tiers are hand-weakened and will vary more
between games.

### 5c. Game review

Play any game to checkmate (or stalemate). A **Game Review** panel appears above
the difficulty picker with an "Analyse game" button. It analyses every position
at depth 12 with a progress bar — a 70-move game takes ~20-30 s on a laptop —
then shows accuracy, estimated rating, average centipawn loss, a move-quality
breakdown, and your three costliest moves.

Sanity checks if you want to confirm the numbers: a game you clearly played well
should score 90%+; a game where you hung your queen should show a Blunder and a
much lower accuracy. The estimated rating is hidden for games under 20 moves,
because a short opening doesn't carry enough signal.

### 6. Practice vs engine (Stockfish is local, no network)

Go to `/practice`, wait for the board to unlock, play **e2–e4**. The engine
should reply within a few seconds.

- The board no longer unlocks until the engine actually answers `isready`.
- If the engine dies, you now get *"The engine took too long to move"* instead
  of a permanent "Thinking…".
- Leave it sitting for 30 s after load — you should **not** see a spurious
  "practice mode is unavailable" panel appear (that was a real bug caught
  during this work: a torn-down engine's init timer firing on the live page).

### 7. Error boundary

Temporarily add `throw new Error("boom")` at the top of any page component. You
should get the styled "This part of the site didn't load" card **with the nav
still usable** — not a blank white page. Navigate away and the card clears.
Remove the throw afterwards.

---

## B. Needs Supabase (your `.env` is already wired to the live project)

### 8. Auth guard

Log **out**, then visit `/dashboard` and `/mylearning`. Both show **"Sign in to
continue"** with a working Sign in button — not the page contents. Signing in
from that prompt drops you straight onto the page.

### 9. Dashboard name save

Log in → `/dashboard` → change your name → Save. The name in the **header
updates immediately**. It used to say "Saved. Refresh to see it in the header."

Confirm there is **no "N pts earned" line** here or in the profile dropdown.

### 10. Failure states are distinct from empty states

This is the one worth actually forcing, because it's the change with the most
user-facing consequence.

In devtools → Network, block your Supabase domain (right-click a request →
*Block request domain*), then hard-reload:

- `/tournaments` → *"We couldn't load the tournament list just now"*, **not**
  "No upcoming tournaments right now". Telling a parent there are no
  tournaments when the request failed was the actual bug.
- Homepage carousel → a "couldn't load" card instead of vanishing silently.
- Testimonials → an error line instead of "will appear here soon".
- `/about` gallery → an error line.
- If you're an admin, you stay an admin (the Admin Panel link doesn't disappear
  on a failed profile refetch).

Unblock and reload — everything returns to normal empty/loaded states.

### 11. Admin forms

Log in as an admin → `/admin`. Every field in Videos, Tournaments, Carousels,
Gallery and Testimonials now has a real `<label for>` — click a label and the
matching field focuses.

---

## C. Puzzles — imported and verified

123,297 puzzles imported, **13 categories × 3 difficulties**. Two migrations
must be run for this to work: `migration_lichess_puzzles.sql` (table + RPC) and
`migration_lichess_puzzles_rpc_v2.sql` (the sampling fix). Both are run.

Verified against the real data, not a sample:

- All 39 category × difficulty buckets return a **full 20-row batch** — 0 short
  batches, 0 errors. Before the RPC v2 fix, rare buckets returned 15–19 rows
  and could time out on a cold cache.
- 255 ms median / 524 ms max across 16 hammered calls on the rarest buckets.
- Randomness intact: two draws from a large pool share 0/20 puzzles, no
  duplicates within a draw.
- A 7-ply smothered mate solved end-to-end through the UI (4 student moves,
  3 auto-played opponent replies).

- All 18 category × difficulty buckets return rows, and every puzzle is fully
  playable move-by-move through chess.js.
- 75/75 sampled mate puzzles end in actual checkmate, with solution lengths of
  exactly 1 / 3 / 5 plies for mateIn1 / 2 / 3. **This settles the FEN-convention
  warning in ROADMAP P4-3** — the stored FEN really is pre-opponent-move, and
  the adapter applies `moves[0]` correctly.
- The student plays Black in roughly half of them (31 white / 29 black in a
  60-row sample), so the board-flip path is genuinely exercised.

Worth clicking through yourself: pick **One Move Mate → Easy**, solve one
(counter increments, next puzzle loads), then deliberately play a legal but
wrong move — the board should show it, flash "Not quite — try again", and reset
after ~900 ms without touching the counter.

Also try selecting a piece and clicking an **illegal** destination. It should
just deselect or reselect. Before the `tryMove` fix this threw an uncaught
"Invalid move" error out of the click handler and left the piece stuck
selected.

> Note: an earlier draft of this doc suggested testing Skip during the green
> "correct" flash. That isn't possible — the Skip button is `disabled` while
> feedback is showing, so the collision it described can't occur.

---

## Quick sanity command

```bash
npm run build
```

Must finish without errors. There is no test runner or linter configured yet
(see ROADMAP P2.8).
