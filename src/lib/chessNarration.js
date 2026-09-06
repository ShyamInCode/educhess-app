import { Chess } from "chess.js";

/*
  chessNarration.js — turn a move into a sentence a voice can read.

  This is a deliberate port of `speech_for()` in studio/engine/mate_engine.py,
  and the two must agree. The reason they exist twice is worth stating,
  because deleting one of them is the obvious-looking cleanup that would break
  the feature:

  The Python side writes narration only when nobody is watching. The studio's
  whole promise is that the admin reads the script in the browser, edits any
  line, and gets exactly that back as speech. So the browser has to be able to
  write the first draft — before a worker has ever seen the job — and whatever
  it produces travels in the spec as literal text. The worker never regenerates
  it. If these two ever drift, the old batch script narrates a shade
  differently; nothing the studio ships changes, because the studio ships the
  string, not the rule.

  Notation is never handed to the voice. "Nf3" read aloud is "enn eff three".
  So squares become "F three", pieces get their names, and the sentence is
  written the way a coach would say it standing at a demo board.
*/

const PIECE_NAMES = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

const RANK_WORDS = {
  1: "one", 2: "two", 3: "three", 4: "four",
  5: "five", 6: "six", 7: "seven", 8: "eight",
};

/** "f7" -> "F seven". */
export function spokenSquare(square) {
  if (!square || square.length < 2) return square || "";
  return `${square[0].toUpperCase()} ${RANK_WORDS[square[1]] ?? square[1]}`;
}

/**
 * The file or rank hint SAN inserts when two identical pieces can reach the
 * same square: "Nbd2" -> "b". Empty for pawn moves and castling.
 *
 * This is how the narration decides whether to say the origin square at all.
 * "Knight to F three" is what a coach says; "Knight from G one to F three" is
 * what a chess engine says, and only earns its place when there were two
 * knights that could have gone there.
 */
export function sanDisambiguator(san) {
  const core = san.replace(/[+#]/g, "").split("=")[0];
  if (core.startsWith("O-O")) return "";
  if (!/^[A-Z]/.test(core)) return "";
  return core.slice(1).replace(/x/g, "").slice(0, -2);
}

/**
 * One move as a spoken sentence.
 *
 * `move` is the object chess.js returns from .move(); `after` is the game
 * once the move has been made.
 */
export function speechForMove(move, after) {
  let phrase;

  if (move.flags.includes("k")) {
    phrase = "King castles kingside";
  } else if (move.flags.includes("q")) {
    phrase = "King castles queenside";
  } else {
    const name = PIECE_NAMES[move.piece] || "Piece";
    const target = spokenSquare(move.to);
    const origin = sanDisambiguator(move.san) ? ` from ${spokenSquare(move.from)}` : "";

    if (move.flags.includes("c") || move.flags.includes("e")) {
      phrase = `${name}${origin} takes ${target}`;
      if (move.flags.includes("e")) phrase += ", en passant";
    } else {
      phrase = `${name}${origin} to ${target}`;
    }
  }

  if (move.promotion) {
    phrase += `, promoting to ${PIECE_NAMES[move.promotion] || "Queen"}`;
  }

  if (after.isCheckmate()) phrase += ", checkmate, game over";
  else if (after.isCheck()) phrase += ", check";

  return `${phrase}.`;
}

/** "4. Qxf7#" — the caption printed in the gold bar under the board. */
export function captionForMove(game, move) {
  // chess.js counts the move number of the position that is now current, so
  // after White's move it has not advanced yet, and after Black's it has.
  const number = move.color === "w" ? game.moveNumber() : game.moveNumber() - 1;
  return move.color === "w" ? `${number}. ${move.san}` : `${number}... ${move.san}`;
}

/**
 * Parse a movetext string into studio frames.
 *
 * Accepts what a person actually pastes: "1. e4 e5 2. Nf3", bare SAN
 * separated by spaces or newlines, a trailing result token, and stray
 * annotation glyphs. Returns `{ frames, error, errorIndex, finalFen,
 * isCheckmate }` — `error` is a sentence meant for the admin, not a stack
 * trace, because this runs while they are typing.
 */
export function framesFromMoves(movesText, startFen = null) {
  const result = {
    frames: [], error: "", errorIndex: -1, finalFen: "", isCheckmate: false,
  };

  let game;
  try {
    game = startFen ? new Chess(startFen) : new Chess();
  } catch {
    result.error = "That starting position is not a valid FEN.";
    return result;
  }

  const tokens = (movesText || "")
    .replace(/\{[^}]*\}/g, " ")        // { comments }
    .replace(/\([^)]*\)/g, " ")        // ( side lines )
    .replace(/\$\d+/g, " ")            // $1 numeric annotation glyphs
    .replace(/\d+\.(\.\.)?/g, " ")     // move numbers, "1." and "1..."
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[?!]+$/, ""))
    .filter(Boolean);

  if (tokens.length === 0) {
    result.error = "No moves yet.";
    result.finalFen = game.fen();
    return result;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    let move;
    try {
      move = game.move(token);
    } catch {
      move = null;
    }
    if (!move) {
      const side = game.turn() === "w" ? "White" : "Black";
      result.error = `"${token}" is not a legal move here — it is ${side} to play.`;
      result.errorIndex = index;
      result.finalFen = game.fen();
      return result;
    }
    result.frames.push({
      san: move.san,
      cap: captionForMove(game, move),
      say: speechForMove(move, game),
    });
  }

  result.finalFen = game.fen();
  result.isCheckmate = game.isCheckmate();
  return result;
}

/** Is this a position the board can actually be set up in? */
export function validateFen(fen) {
  if (!fen) return { ok: true, error: "" };
  try {
    new Chess(fen);
    return { ok: true, error: "" };
  } catch (err) {
    return { ok: false, error: err?.message || "That is not a valid FEN." };
  }
}

/**
 * Replay a whole spec so the panel can show what each segment ends up as, and
 * refuse to queue something the worker would only reject four minutes later.
 *
 * Same checks as `plan()` in spec_render.py, and the same wording, so an
 * error the admin sees here reads identically to one that comes back from the
 * worker.
 */
export function validateSpec(spec) {
  const problems = [];
  const segments = spec?.segments || [];

  if (segments.length === 0) problems.push("This lesson has no segments yet.");

  segments.forEach((segment, sIndex) => {
    const where = `Segment ${sIndex + 1}`;
    let game;
    try {
      game = segment.startFen ? new Chess(segment.startFen) : new Chess();
    } catch {
      problems.push(`${where}: the starting position is not a valid FEN.`);
      return;
    }

    const frames = segment.frames || [];
    if (frames.length === 0) {
      problems.push(`${where} ("${segment.heading || "untitled"}") has no frames.`);
      return;
    }

    frames.forEach((frame, fIndex) => {
      if (frame.san) {
        let move = null;
        try {
          move = game.move(frame.san);
        } catch {
          move = null;
        }
        if (!move) {
          problems.push(`${where}, frame ${fIndex + 1}: "${frame.san}" is not a legal move there.`);
        }
      }
      (frame.sq || []).forEach((square) => {
        if (!/^[a-h][1-8]$/.test(square)) {
          problems.push(`${where}, frame ${fIndex + 1}: "${square}" is not a square.`);
        }
      });
      if (!frame.say && !frame.hold) {
        problems.push(`${where}, frame ${fIndex + 1} has no narration and no hold time.`);
      }
    });
  });

  return problems;
}

/** Roughly how long the finished video will run, for the queue button. */
export function estimateSeconds(spec) {
  const WORDS_PER_SECOND = 2.6;   // measured against edge-tts at +0% rate
  const BREATH = 0.3;
  let total = Number(spec?.introHold || 3) + Number(spec?.outroHold || 3);

  const speak = (text, floor = 0) => {
    if (!text) return floor;
    const words = String(text).trim().split(/\s+/).length;
    return Math.max(floor, words / WORDS_PER_SECOND + BREATH);
  };

  total += speak(spec?.introSpeech);
  total += speak(spec?.outroSpeech);

  (spec?.segments || []).forEach((segment) => {
    if (segment.heading) total += speak(segment.headingSpeech, 2.5);
    (segment.frames || []).forEach((frame) => {
      total += speak(frame.say, Number(frame.hold) || 1.5);
    });
  });

  return Math.round(total);
}
