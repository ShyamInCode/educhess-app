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
}) {
  const fenKey = game ? game.fen() : null;
  const resolvedBoard = useMemo(() => (game ? fromChessJs(game) : board || initialBoard()), [fenKey, board]);
  const squareDim = size === "small" ? "w-7 h-7 xs:w-9 xs:h-9 text-base xs:text-xl" : "w-8 h-8 xs:w-10 xs:h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 text-xl xs:text-2xl sm:text-3xl md:text-4xl";
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

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <div className="grid grid-cols-8">
        {rowOrder.map((r) => {
          const colOrder = flipped ? [...resolvedBoard[r].keys()].reverse() : [...resolvedBoard[r].keys()];
          return colOrder.map((c) => {
            const sq = resolvedBoard[r][c];
            const dark = (r + c) % 2 === 1;
            const key = `${r}-${c}`;
            const isSel = selected && selected[0] === r && selected[1] === c;
            const isHi = highlights.some(([hr, hc]) => hr === r && hc === c);
            return (
              <button
                key={key}
                disabled={disabled}
                onClick={() => onSquareClick && onSquareClick(r, c, squareName(r, c))}
                style={fluid ? { fontSize: "clamp(1.1rem, 7vw, 3.4rem)" } : undefined}
                className={`${fluid ? "aspect-square w-full" : squareDim} flex items-center justify-center select-none transition-colors
                  ${dark ? SQUARE_DARK : SQUARE_LIGHT}
                  ${isSel ? "ring-4 ring-inset ring-[#34d399]" : ""}
                  ${isHi ? "bg-[#d4af37]/50" : ""}
                  ${!disabled ? "hover:brightness-110 cursor-pointer" : "cursor-not-allowed"}
                `}
              >
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
