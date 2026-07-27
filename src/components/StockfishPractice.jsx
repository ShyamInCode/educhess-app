import React, { useEffect, useRef, useState, useCallback } from "react";
import { Chess } from "chess.js";
import Chessboard, { squareName } from "./Chessboard";
import { ENGINE_LEVELS } from "../data/mockData";
import { StockfishEngine, parseUciMove } from "../lib/stockfishEngine";

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
  const [, setTick] = useState(0); // forces a re-render when the mutable game/engine state changes
  const rerender = () => setTick((t) => t + 1);

  const [levelIdx, setLevelIdx] = useState(1); // default 1000 ELO
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState(null); // [r, c] of the currently selected square
  const [legalTargets, setLegalTargets] = useState([]); // [[r,c], ...]
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState("Your move — you're playing White.");
  const [engineError, setEngineError] = useState("");
  const [engineReady, setEngineReady] = useState(false);

  const level = ENGINE_LEVELS[levelIdx];

  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    engine
      .init()
      .then(() => {
        engine.setSkillLevel(level.skill);
        setEngineReady(true);
      })
      .catch((err) => setEngineError(err.message));
    return () => engine.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (engineRef.current && engineReady) engineRef.current.setSkillLevel(level.skill);
  }, [level.skill, engineReady]);

  function describeGameOver(game) {
    if (game.isCheckmate()) return `Checkmate — ${game.turn() === "w" ? "Black" : "White"} wins.`;
    if (game.isStalemate()) return "Stalemate — it's a draw.";
    if (game.isThreefoldRepetition()) return "Draw by threefold repetition.";
    if (game.isInsufficientMaterial()) return "Draw — insufficient material.";
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
      const uci = await engineRef.current.getBestMove(game.fen(), {
        depth: level.depth,
        moveTimeMs: level.moveTimeMs,
      });
      const parsed = parseUciMove(uci);
      if (parsed) {
        game.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion || "q" });
      }
    } catch (err) {
      setEngineError("The engine failed to respond — try Reset Board.");
    } finally {
      setThinking(false);
      setStatus(game.isGameOver() ? describeGameOver(game) : "Your move.");
      rerender();
    }
  }, [level.depth, level.moveTimeMs]);

  function handleSquareClick(r, c, square) {
    if (thinking) return;
    const game = gameRef.current;
    if (game.isGameOver()) return;

    if (!selected) {
      const piece = game.get(square);
      if (piece && piece.color === "w") {
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
    const move = game.move({ from: fromSquare, to: square, promotion: isPromotion ? "q" : undefined });

    setSelected(null);
    setLegalTargets([]);

    if (!move) {
      // Not a legal destination for the selected piece — try selecting a new one instead.
      const piece = game.get(square);
      if (piece && piece.color === "w") {
        setSelected([r, c]);
        const moves = game.moves({ square, verbose: true });
        setLegalTargets(moves.map((m) => squareToRC(m.to)));
      }
      return;
    }

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

  function handleReset() {
    if (thinking) return;
    gameRef.current = new Chess();
    setSelected(null);
    setLegalTargets([]);
    setStatus("Your move — you're playing White.");
    rerender();
  }

  return (
    <div className="max-w-[640px] mx-auto">
      {/* Board card — opponent bar on top, board in the middle, "You" bar
          below. This mirrors the familiar chess.com layout and keeps the
          board itself big, centered, and free of side content. */}
      <div className="rounded-2xl overflow-hidden border-2 border-[#d4af37]/60 shadow-2xl bg-[#1e293b]">
        {(flipped ? youBar : opponentBar)(level, thinking)}
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
        {(flipped ? opponentBar : youBar)(level, thinking)}
      </div>
      <p className="font-mono text-sm text-[#93a1b8] text-center mt-3">{status}</p>

      {/* Everything else lives below the board and simply scrolls with the
          page — the board above never has to shrink or scroll to fit it. */}
      <div className="mt-6 space-y-5">
        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
          <span className="font-mono text-xs text-[#d4af37] tracking-widest uppercase">Engine Difficulty</span>
          <h3 className="font-display text-lg mt-2 mb-4 text-[#e7ecf5]">Choose your opponent's rating</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ENGINE_LEVELS.map((lvl, i) => (
              <button
                key={lvl.elo}
                onClick={() => setLevelIdx(i)}
                className={`px-3 py-2 rounded-lg text-sm font-mono border transition-colors ${
                  i === levelIdx
                    ? "border-[#d4af37] bg-[#0f172a] text-[#d4af37]"
                    : "border-[#2d3b53] text-[#93a1b8] hover:border-[#d4af37]/50 hover:text-[#e7ecf5]"
                }`}
              >
                {lvl.elo >= 3000 ? `${lvl.elo}+` : lvl.elo} · {lvl.name}
              </button>
            ))}
          </div>
          <p className="text-sm text-[#93a1b8] mt-3">{level.label} · depth {level.depth}</p>
        </div>

        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
          <span className="font-mono text-xs text-[#d4af37] tracking-widest uppercase">Controls</span>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <button
              onClick={() => setFlipped((f) => !f)}
              className="py-2.5 rounded-lg bg-[#0f172a] border border-[#2d3b53] text-[#e7ecf5] text-sm font-semibold hover:border-[#d4af37] transition-colors"
            >
              Flip Board
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

        {engineError && (
          <div className="bg-[#1e293b] border border-[#f87171]/50 rounded-2xl p-5">
            <p className="text-sm text-[#f87171] font-mono">{engineError}</p>
            <p className="text-sm text-[#93a1b8] mt-2">
              Run <code className="text-[#d4af37]">npm install stockfish</code>, then copy the engine build into{" "}
              <code className="text-[#d4af37]">public/stockfish/stockfish.js</code> — see comments in{" "}
              <code className="text-[#d4af37]">src/lib/stockfishEngine.js</code> for exact filenames.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Bar shown above/below the board naming who's playing that side — the
// engine's current rating + tier name, or "You".
function opponentBar(level, thinking) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#2d3b53]/70">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-9 h-9 shrink-0 rounded-full bg-[#0f172a] border border-[#2d3b53] flex items-center justify-center text-lg">♞</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#e7ecf5] truncate">
            Engine · {level.elo >= 3000 ? `${level.elo}+` : level.elo}
          </p>
          <p className="text-xs font-mono text-[#93a1b8] truncate">{level.name}</p>
        </div>
      </div>
      {thinking && <span className="shrink-0 text-xs font-mono text-[#f0d98c] animate-pulse">Thinking…</span>}
    </div>
  );
}

function youBar() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 border-t border-[#2d3b53]/70">
      <span className="w-9 h-9 shrink-0 rounded-full bg-[#d4af37] text-[#0f172a] flex items-center justify-center font-display text-base">Y</span>
      <p className="text-sm font-semibold text-[#e7ecf5]">You</p>
    </div>
  );
}
