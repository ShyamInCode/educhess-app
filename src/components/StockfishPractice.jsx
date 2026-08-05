import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Chess } from "chess.js";
import Chessboard, { squareName } from "./Chessboard";
import GameAnalysis from "./GameAnalysis";
import { tryMove } from "../lib/chessMoves";
import { ENGINE_LEVELS } from "../data/mockData";
import { StockfishEngine, parseUciMove, pickMoveForLevel } from "../lib/stockfishEngine";
import { playSoundForMove } from "../lib/sound";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

function squareToRC(square) {
  const file = FILES.indexOf(square[0]);
  const rank = RANKS.indexOf(Number(square[1]));
  return [rank, file];
}

export default function StockfishPractice() {
  const gameRef = useRef(new Chess());
  const engineRef = useRef(null);
  // Set when a new game starts with the student on Black, so the effect below
  // plays White's opening move exactly once.
  const pendingOpeningRef = useRef(false);
  const [, setTick] = useState(0); // forces a re-render when the mutable game/engine state changes
  const rerender = () => setTick((t) => t + 1);

  const [levelIdx, setLevelIdx] = useState(1); // default 1000 ELO
  /*
    Which colour the student plays. This used to be a `flipped` view-only
    toggle, which is what made "Flip Board" feel broken: the board rotated but
    the student still moved White's pieces and the engine still answered as
    Black. Colour is the real state; the board orientation just follows it.
  */
  const [playerColor, setPlayerColor] = useState("w");
  const flipped = playerColor === "b";
  const [selected, setSelected] = useState(null); // [r, c] of the currently selected square
  const [legalTargets, setLegalTargets] = useState([]); // [[r,c], ...]
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState("Your move. You're playing White.");
  const [engineError, setEngineError] = useState("");
  const [engineReady, setEngineReady] = useState(false);
  const [analysisDismissed, setAnalysisDismissed] = useState(false);
  const [analysisHintOpen, setAnalysisHintOpen] = useState(false);

  const level = ENGINE_LEVELS[levelIdx];

  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    // `engineRef.current !== engine` means this engine was already replaced
    // (StrictMode's double-mount in dev, or a fast remount) — its result is
    // stale and must not touch the live component's state.
    engine
      .init()
      .then(() => {
        if (engineRef.current !== engine) return;
        engine.setStrength(level);
        setEngineReady(true);
      })
      .catch((err) => {
        if (engineRef.current !== engine) return;
        setEngineError(err.message);
      });
    return () => engine.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The analysis hint closes on the next click anywhere, and on Escape.
  // Registered in the capture phase so the toggle button's own handler still
  // runs afterwards and can flip it back open.
  useEffect(() => {
    if (!analysisHintOpen) return undefined;
    const close = () => setAnalysisHintOpen(false);
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [analysisHintOpen]);

  // Re-send the whole strength config whenever the tier changes — these are
  // sticky UCI options, so switching from a UCI_Elo tier down to an
  // approximated one has to actively turn UCI_LimitStrength back off.
  useEffect(() => {
    if (engineRef.current && engineReady) engineRef.current.setStrength(level);
  }, [level, engineReady]);

  function describeGameOver(game) {
    if (game.isCheckmate()) return `Checkmate. ${game.turn() === "w" ? "Black" : "White"} wins.`;
    if (game.isStalemate()) return "Stalemate. It's a draw.";
    if (game.isThreefoldRepetition()) return "Draw by threefold repetition.";
    if (game.isInsufficientMaterial()) return "Draw by insufficient material.";
    if (game.isDraw()) return "Draw.";
    return "Game over.";
  }

  const requestEngineMove = useCallback(async () => {
    const game = gameRef.current;
    if (game.isGameOver()) {
      setStatus(describeGameOver(game));
      return;
    }
    setThinking(true);
    try {
      // Tiers with `uciElo` let Stockfish's own limiter decide, so they always
      // take `best`. The two below the limiter's floor generate several
      // candidate lines and sometimes settle for a worse one — that, plus the
      // shallow depth, is what actually makes them weak.
      const { best, candidates } = await engineRef.current.search(game.fen(), {
        depth: level.depth,
        moveTimeMs: level.moveTimeMs,
      });
      const uci = level.uciElo ? best : pickMoveForLevel(candidates, level) || best;
      const parsed = parseUciMove(uci);
      if (parsed) {
        // tryMove, not game.move: a rejected engine move would otherwise throw
        // into the catch below and be reported as "the engine failed to
        // respond", which is the wrong diagnosis.
        const engineMove = tryMove(game, { from: parsed.from, to: parsed.to, promotion: parsed.promotion || "q" });
        if (engineMove) playSoundForMove(engineMove);
      }
    } catch (err) {
      setEngineError("The engine failed to respond. Try Reset Board.");
    } finally {
      setThinking(false);
      setStatus(game.isGameOver() ? describeGameOver(game) : "Your move.");
      rerender();
    }
  }, [level]);

  function handleSquareClick(r, c, square) {
    if (thinking) return;
    const game = gameRef.current;
    if (game.isGameOver()) return;

    if (!selected) {
      const piece = game.get(square);
      if (piece && piece.color === playerColor) {
        setSelected([r, c]);
        const moves = game.moves({ square, verbose: true });
        setLegalTargets(moves.map((m) => squareToRC(m.to)));
      }
      return;
    }

    const fromSquare = squareName(selected[0], selected[1]);
    if (fromSquare === square) {
      setSelected(null);
      setLegalTargets([]);
      return;
    }

    const isPromotion =
      game.get(fromSquare)?.type === "p" && (square[1] === "8" || square[1] === "1");
    const move = tryMove(game, { from: fromSquare, to: square, promotion: isPromotion ? "q" : undefined });

    setSelected(null);
    setLegalTargets([]);

    if (!move) {
      // Not a legal destination for the selected piece — try selecting a new one instead.
      const piece = game.get(square);
      if (piece && piece.color === playerColor) {
        setSelected([r, c]);
        const moves = game.moves({ square, verbose: true });
        setLegalTargets(moves.map((m) => squareToRC(m.to)));
      }
      return;
    }

    playSoundForMove(move);
    rerender();
    if (game.isGameOver()) {
      setStatus(describeGameOver(game));
      return;
    }
    requestEngineMove();
  }

  function handleUndo() {
    if (thinking) return;
    const game = gameRef.current;
    game.undo(); // engine's reply
    game.undo(); // player's move
    setSelected(null);
    setLegalTargets([]);
    setStatus("Your move.");
    rerender();
  }

  /**
   * Start a fresh game with the student on `color`.
   *
   * Sides can only change between games: swapping mid-game would leave the
   * student owning pieces they never moved, with an engine that has been
   * playing the other half. So switching colour restarts, and when the student
   * takes Black the engine opens as White straight away.
   */
  const startGame = useCallback(
    (color) => {
      gameRef.current = new Chess();
      setPlayerColor(color);
      setSelected(null);
      setLegalTargets([]);
      setAnalysisDismissed(false);
      setStatus(color === "w" ? "Your move. You're playing White." : "You're playing Black. White opens.");
      rerender();
      if (color === "b") pendingOpeningRef.current = true;
    },
    []
  );

  function handleReset() {
    if (thinking) return;
    startGame(playerColor);
  }

  function handleSwitchSides() {
    if (thinking) return;
    startGame(playerColor === "w" ? "b" : "w");
  }

  // Play the engine's opening move after the student takes Black. It runs from
  // an effect rather than inside startGame so the board has already re-rendered
  // from the student's side first — otherwise the first move appears before the
  // flip and looks like a glitch. The ref makes it strictly one move: without
  // it this effect would fire again on every `thinking` transition and the
  // engine would play both colours.
  useEffect(() => {
    if (!pendingOpeningRef.current || !engineReady || thinking) return;
    const game = gameRef.current;
    if (game.isGameOver() || game.turn() === playerColor) return;
    pendingOpeningRef.current = false;
    requestEngineMove();
  }, [engineReady, thinking, playerColor, requestEngineMove]);

  // The analysis panel is keyed on the move list so that starting a new game
  // (or undoing into a different line) discards the previous report instead of
  // showing a review of a game that is no longer on the board.
  const gameOver = gameRef.current.isGameOver();
  const history = gameRef.current.history();

  return (
    <div className="max-w-[640px] mx-auto">
      {/* Board card — opponent bar on top, board in the middle, "You" bar
          below. The opponent is always the top bar regardless of which colour
          the student plays; that is what the orientation already expresses,
          and swapping the bars too (as this used to) put "You" above your
          opponent's pieces. */}
      <div className="rounded-2xl overflow-hidden border-2 border-[#d4af37]/60 shadow-2xl bg-[#1e293b]">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#2d3b53]/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 shrink-0 rounded-full bg-[#0f172a] border border-[#2d3b53] flex items-center justify-center text-lg">
              {playerColor === "w" ? "♞" : "♘"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#e7ecf5] truncate">Engine</p>
              <p className="text-xs font-mono text-[#93a1b8] truncate">
                {thinking ? "Thinking…" : `plays ${playerColor === "w" ? "Black" : "White"}`}
              </p>
            </div>
          </div>

          {/* Difficulty sits on the board itself: it is the setting people
              change most, and it belongs next to the opponent it describes. */}
          <div className="shrink-0">
            <label htmlFor="engine-level" className="sr-only">
              Engine difficulty
            </label>
            <select
              id="engine-level"
              value={levelIdx}
              onChange={(e) => setLevelIdx(Number(e.target.value))}
              className="bg-[#0f172a] border border-[#2d3b53] rounded-lg pl-3 pr-8 py-1.5 text-sm font-mono text-[#e7ecf5] focus:outline-none focus:ring-2 focus:ring-[#d4af37] hover:border-[#d4af37]/50 transition-colors appearance-none bg-no-repeat"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%23d4af37' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                backgroundPosition: "right 0.6rem center",
              }}
            >
              {ENGINE_LEVELS.map((lvl, i) => (
                <option key={lvl.elo} value={i}>
                  {lvl.elo >= 3000 ? `${lvl.elo}+` : lvl.elo} · {lvl.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="relative">
          <Chessboard
            fluid
            bordered={false}
            game={gameRef.current}
            onSquareClick={handleSquareClick}
            selected={selected}
            highlights={legalTargets}
            flipped={flipped}
            locked={!engineReady}
            interactionDisabled={thinking}
          />
          {!engineReady && !engineError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0f172a]/70">
              <p className="font-mono text-sm text-center text-[#f0d98c] px-6">Loading offline engine…</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-t border-[#2d3b53]/70">
          <span className="w-9 h-9 shrink-0 rounded-full bg-[#d4af37] text-[#0f172a] flex items-center justify-center font-display text-base">
            Y
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#e7ecf5]">You</p>
            <p className="text-xs font-mono text-[#93a1b8]">
              playing {playerColor === "w" ? "White" : "Black"}
            </p>
          </div>

          {/* Analysis hint. The review only exists after a game ends, so
              without something here nobody discovers it; a permanent card
              below the board was too loud for a feature you cannot use yet,
              so it is a small control that explains itself on demand. */}
          <div className="relative ml-auto shrink-0">
            <button
              type="button"
              onClick={(e) => {
                // Without this the click bubbles on to the document listener
                // above, which would close the hint in the same tick it opened.
                e.stopPropagation();
                setAnalysisHintOpen((o) => !o);
              }}
              aria-label="About game review"
              aria-expanded={analysisHintOpen}
              title="Game review"
              className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
                analysisHintOpen
                  ? "border-[#d4af37] text-[#d4af37] bg-[#0f172a]"
                  : "border-[#2d3b53] text-[#93a1b8] hover:text-[#e7ecf5] hover:border-[#d4af37]/60"
              }`}
            >
              {/* Magnifier over a chart: "analyse", not "search". */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path
                  d="M8 12.5v-2M10.5 12.5V8M13 12.5v-3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {analysisHintOpen && (
              <div
                role="dialog"
                aria-label="Game review"
                className="absolute right-0 bottom-full mb-2 w-64 sm:w-72 z-20 bg-[#0f172a] border border-[#d4af37]/50 rounded-xl p-4 shadow-2xl text-left"
              >
                <p className="font-display text-sm text-[#e7ecf5]">Finish the game for a full review</p>
                <p className="text-xs text-[#93a1b8] mt-1.5 leading-relaxed">
                  Play it out to checkmate or a draw and we will analyse every move: your accuracy, an
                  estimated rating, and the exact points where the game turned.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="font-mono text-sm text-[#93a1b8] text-center mt-3">{status}</p>

      {/* Everything else lives below the board and simply scrolls with the
          page — the board above never has to shrink or scroll to fit it. */}
      <div className="mt-6 space-y-5">
        {/* Game review appears first once the game ends — it's what you want
            to look at in that moment, not the difficulty picker. */}
        {gameOver && history.length > 0 && !analysisDismissed && (
          <GameAnalysis
            key={history.join(" ")}
            history={history}
            playerColor={playerColor}
            onClose={() => setAnalysisDismissed(true)}
          />
        )}


        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
          <span className="font-mono text-xs text-[#d4af37] tracking-widest uppercase">Controls</span>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <button
              onClick={handleSwitchSides}
              disabled={thinking}
              title="Starts a new game with the colours swapped"
              className="py-2.5 rounded-lg bg-[#0f172a] border border-[#2d3b53] text-[#e7ecf5] text-sm font-semibold hover:border-[#d4af37] transition-colors disabled:opacity-50"
            >
              Play as {playerColor === "w" ? "Black" : "White"}
            </button>
            <button
              onClick={handleUndo}
              disabled={thinking}
              className="py-2.5 rounded-lg bg-[#0f172a] border border-[#2d3b53] text-[#e7ecf5] text-sm font-semibold hover:border-[#d4af37] transition-colors disabled:opacity-50"
            >
              Undo Move
            </button>
            <button
              onClick={handleReset}
              disabled={thinking}
              className="py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] text-sm font-semibold hover:bg-[#f0d98c] transition-colors disabled:opacity-50"
            >
              Reset Board
            </button>
          </div>
        </div>

        {/* Students see this, not developers — the engine is vendored into
            public/stockfish/ and committed, so a failure here means something
            went wrong in the browser, not that a setup step was skipped.
            (This used to tell a parent to run `npm install stockfish`.)
            Developer notes live in src/lib/stockfishEngine.js. */}
        {engineError && (
          <div className="bg-[#1e293b] border border-[#f87171]/50 rounded-2xl p-5">
            <p className="text-sm text-[#f87171]">{engineError}</p>
            <p className="text-sm text-[#93a1b8] mt-2">
              Reloading the page usually fixes this. The engine runs entirely on your
              device, so it can also fail if the browser is very old or low on memory, so
              trying a different browser is worth a shot.
            </p>
            <p className="text-sm text-[#93a1b8] mt-2">
              In the meantime, the{" "}
              <Link to="/puzzles" className="text-[#d4af37] underline underline-offset-4">
                puzzle trainer
              </Link>{" "}
              works without the engine.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
