import React, { useMemo } from "react";
import { GLYPHS_B } from "../data/mockData";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

export function initialBoard() {
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { t: back[c], w: false };
    board[1][c] = { t: "P", w: false };
    board[6][c] = { t: "P", w: true };
    board[7][c] = { t: back[c], w: true };
  }
  return board;
}

// Converts a chess.js `game.board()` grid (array of {type,color}|null,
// rank 8 first) into this component's plain { t, w } square format.
function fromChessJs(game) {
  return game.board().map((row) =>
    row.map((sq) => (sq ? { t: sq.type.toUpperCase(), w: sq.color === "w" } : null))
  );
}

export function squareName(r, c) {
  return `${FILES[c]}${RANKS[r]}`;
}

const PIECE_NAMES = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };

/**
 * Accessible name for a square, e.g. "e4, white pawn" or "d5, empty".
 *
 * Every square is a <button> whose only content is a Unicode glyph, which
 * screen readers announce as "button" and nothing else — 64 identical,
 * meaningless controls per board. This is what they read out instead.
 */
function describeSquare(r, c, sq) {
  const name = squareName(r, c);
  if (!sq) return `${name}, empty`;
  return `${name}, ${sq.w ? "white" : "black"} ${PIECE_NAMES[sq.t] || "piece"}`;
}

/**
 * Interactive/decorative chess board.
 *
 * Two ways to feed it a position:
 *  - `game` — a live chess.js Chess instance. The board is derived from
 *    it automatically, and `onSquareClick(r, c, square)` receives the
 *    algebraic square name as its third argument for legality checks.
 *  - `board` — a plain 8x8 array of { t: "P"|"N"|..., w: boolean } | null,
 *    for decorative/staged positions that don't need chess.js at all
 *    (marketing "quest" board, quiz puzzles).
 *
 * `flipped` reverses the visual orientation (black at the bottom) without
 * changing the underlying (r, c) -> square mapping.
 */
// Vintage gold & ivory board palette (replaces the old slate-blue squares).
const SQUARE_LIGHT = "bg-[#f2e7c9]"; // vintage ivory/parchment
const SQUARE_DARK = "bg-[#9c7a3f]"; // vintage antique gold
// Both colors render from the same *solid/filled* glyph shapes (see GLYPHS_B
// below) rather than mixing in the hollow-outline "white" unicode glyphs,
// which is what made white pieces disappear on light squares. Brightness +
// a firm dark outline keeps white pieces readable on both square colors;
// black pieces get a light outline for the same reason on dark squares.
const PIECE_WHITE = "piece-white";
const PIECE_BLACK = "piece-black";

export default function Chessboard({
  game,
  board,
  onSquareClick,
  selected,
  highlights = [],
  locked,
  interactionDisabled = false,
  size = "normal",
  flipped = false,
  // `fluid`: renders the board at full container width (capped so it never
  // needs the page to scroll to see the whole thing) instead of the fixed
  // per-breakpoint square sizes below — used by the Practice page so the
  // board can be "big and centered" like a chess.com board.
  fluid = false,
  // `bordered`: the board's own frame. Turned off when an outer wrapper
  // (e.g. the Practice page's opponent/you bars) already supplies one.
  bordered = true,
  // `coordinates`: file letters and rank numbers in the edge squares. On by
  // default because a student reading "play Qh5" needs to find h5.
  coordinates = true,
}) {
  // `game` is a chess.js instance mutated IN PLACE, so its identity does not
  // change when a move is played — hence the FEN string as the real cache key.
  // But identity does change when the instance is swapped (Reset Board, a new
  // puzzle), and the memo reads `game`, so both belong in the dependency list.
  // Keying on `fenKey` alone was a stale-read waiting to happen; recomputing a
  // 64-square array is cheap, so there is nothing to protect here.
  //
  // The rule below calls `fenKey` an unnecessary dependency because it sees
  // `game` already listed. It cannot model mutable deps: after `game.move()`
  // the instance is identical and ONLY the FEN has changed, so dropping fenKey
  // would freeze the board. Both entries are load-bearing.
  const fenKey = game ? game.fen() : null;
  const resolvedBoard = useMemo(
    () => (game ? fromChessJs(game) : board || initialBoard()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, fenKey, board]
  );
  // The smallest step starts at 7 (28px) so an 8-file board is 224px wide and
  // still fits inside a padded card on a 320px phone — at 8 (32px) the quest
  // board overflowed the viewport there.
  const squareDim =
    size === "small"
      ? "w-6 h-6 xs:w-9 xs:h-9 text-sm xs:text-xl"
      : "w-7 h-7 xs:w-10 xs:h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 text-lg xs:text-2xl sm:text-3xl md:text-4xl";
  const disabled = locked || interactionDisabled;

  const rowOrder = flipped ? [...resolvedBoard.keys()].reverse() : [...resolvedBoard.keys()];
  const frameClass = bordered ? "rounded-lg overflow-hidden border-2 border-[#d4af37]/60 shadow-2xl" : "overflow-hidden";

  const wrapperClass = fluid
    ? `relative w-full aspect-square mx-auto ${frameClass} ${locked ? "opacity-40 grayscale" : ""}`
    : `relative inline-block ${frameClass} ${locked ? "opacity-40 grayscale" : ""}`;
  // Width is driven by the smallest of: the container, 78% of viewport
  // height (so tall/large boards never force a scroll to see it all), and
  // a hard cap so it doesn't balloon on very wide screens.
  const wrapperStyle = fluid ? { width: "min(100%, 78vh, 640px)" } : undefined;

  // Fluid mode: the grid is pinned to fill the wrapper's exact (definite,
  // already-square) box via `absolute inset-0` + explicit row/col tracks,
  // instead of letting each cell's own `aspect-square` decide its height.
  // Per-cell aspect-ratio inside an auto-sized grid is what caused the
  // board to render with uneven/collapsing rows and drifting pieces —
  // an explicit 8x8 track grid is rigid no matter what re-renders happen.
  const gridClass = fluid
    ? "absolute inset-0 grid grid-cols-8 grid-rows-[repeat(8,minmax(0,1fr))]"
    : "grid grid-cols-8";

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <div className={gridClass} role="group" aria-label="Chess board">
        {rowOrder.map((r, visualRow) => {
          const colOrder = flipped ? [...resolvedBoard[r].keys()].reverse() : [...resolvedBoard[r].keys()];
          return colOrder.map((c, visualCol) => {
            const sq = resolvedBoard[r][c];
            const dark = (r + c) % 2 === 1;
            const key = `${r}-${c}`;
            const isSel = selected && selected[0] === r && selected[1] === c;
            const isHi = highlights.some(([hr, hc]) => hr === r && hc === c);
            // Coordinates ride inside the edge squares rather than in gutters
            // around the board, so the rigid 8x8 grid is untouched. Which
            // squares count as "edge" follows the visual order, so they stay
            // correct when the board is flipped.
            const showRank = coordinates && visualCol === 0;
            const showFile = coordinates && visualRow === 7;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                aria-label={describeSquare(r, c, sq)}
                aria-pressed={isSel || undefined}
                onClick={() => onSquareClick && onSquareClick(r, c, squareName(r, c))}
                style={fluid ? { fontSize: "clamp(1.1rem, 7vw, 3.4rem)" } : undefined}
                className={`relative ${fluid ? "w-full h-full" : squareDim} flex items-center justify-center select-none transition-colors
                  ${dark ? SQUARE_DARK : SQUARE_LIGHT}
                  ${isSel ? "ring-4 ring-inset ring-[#34d399]" : ""}
                  ${isHi ? "bg-[#d4af37]/50" : ""}
                  ${!disabled ? "hover:brightness-110 cursor-pointer" : "cursor-not-allowed"}
                `}
              >
                {showRank && (
                  <span
                    aria-hidden="true"
                    className={`absolute top-[2px] left-[3px] font-mono leading-none pointer-events-none ${
                      dark ? "text-[#f2e7c9]/80" : "text-[#9c7a3f]"
                    }`}
                    style={{ fontSize: "clamp(0.5rem, 1.5vw, 0.7rem)" }}
                  >
                    {RANKS[r]}
                  </span>
                )}
                {showFile && (
                  <span
                    aria-hidden="true"
                    className={`absolute bottom-[2px] right-[3px] font-mono leading-none pointer-events-none ${
                      dark ? "text-[#f2e7c9]/80" : "text-[#9c7a3f]"
                    }`}
                    style={{ fontSize: "clamp(0.5rem, 1.5vw, 0.7rem)" }}
                  >
                    {FILES[c]}
                  </span>
                )}
                {sq && (
                  <span className={sq.w ? PIECE_WHITE : PIECE_BLACK}>
                    {GLYPHS_B[sq.t]}
                  </span>
                )}
              </button>
            );
          });
        })}
      </div>
    </div>
  );
}
