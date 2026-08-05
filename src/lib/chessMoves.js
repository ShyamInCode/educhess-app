/**
 * chess.js v1 **throws** on an illegal move — it does not return null the way
 * v0.x did. Both boards were written against the old contract:
 *
 *     const move = game.move({ from, to });
 *     if (!move) { ...offer to select a different piece... }
 *
 * so the `if (!move)` branch was unreachable dead code, and a student clicking
 * a piece and then an illegal square got an uncaught "Invalid move" error
 * thrown out of the React click handler. Everything after the `.move()` call
 * was skipped, which left the piece stuck in its selected state with no
 * feedback — the board just looked frozen.
 *
 * This restores the intended nullable contract in one place.
 *
 * @returns the chess.js move object, or null if the move was illegal.
 */
export function tryMove(game, move) {
  try {
    return game.move(move) || null;
  } catch {
    return null;
  }
}
