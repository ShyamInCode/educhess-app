/* ============================================================
   Offline Stockfish integration
   ------------------------------------------------------------
   Runs entirely in a Web Worker, no network calls — this is what
   lets Practice mode work fully offline.

   Setup (one-time, not handled by npm install alone):
     1. `npm install stockfish` — this pulls stockfish.js's asm.js/wasm
        build into node_modules/stockfish.
     2. Copy the engine build into the public/ folder so it can be
        loaded as a plain Worker script (bundlers generally can't
        wrap Stockfish's own worker/wasm loading conventions):
          cp node_modules/stockfish/src/stockfish-nnue-16-single.js public/stockfish/stockfish.js
          cp node_modules/stockfish/src/stockfish-nnue-16-single.wasm public/stockfish/ 2>/dev/null || true
        (Exact filenames vary by package version — check
        node_modules/stockfish/src/ and update STOCKFISH_WORKER_PATH
        below if it upgraded to a different file name.)

   Everything below talks to that worker using the plain UCI
   text protocol (`position fen ...`, `go depth N`, `bestmove ...`).
   ============================================================ */

const STOCKFISH_WORKER_PATH = "/stockfish/stockfish.js";

export class StockfishEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this._bestMoveResolvers = [];
  }

  init() {
    if (this.worker) return Promise.resolve();
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(STOCKFISH_WORKER_PATH);
      } catch (err) {
        reject(new Error("Could not start the Stockfish worker — see stockfishEngine.js setup notes."));
        return;
      }
      this.worker.onmessage = (e) => this._onMessage(typeof e.data === "string" ? e.data : "");
      this.worker.onerror = (err) => {
        // eslint-disable-next-line no-console
        console.error("[Stockfish worker error]", err);
      };
      this.send("uci");
      this.send("isready");
      this.ready = true;
      resolve();
    });
  }

  send(cmd) {
    this.worker && this.worker.postMessage(cmd);
  }

  _onMessage(line) {
    if (line.startsWith("bestmove")) {
      const [, uciMove] = line.split(" ");
      const resolver = this._bestMoveResolvers.shift();
      if (resolver) resolver(uciMove === "(none)" ? null : uciMove);
    }
  }

  setSkillLevel(skill) {
    this.send(`setoption name Skill Level value ${skill}`);
  }

  /**
   * Ask the engine for its move from the given FEN.
   * Resolves with a UCI move string like "e2e4" or "e7e8q" (promotion),
   * or null if the engine reports no legal move (checkmate/stalemate).
   */
  getBestMove(fen, { depth = 8, moveTimeMs } = {}) {
    return new Promise((resolve) => {
      this._bestMoveResolvers.push(resolve);
      this.send("position fen " + fen);
      this.send(moveTimeMs ? `go movetime ${moveTimeMs}` : `go depth ${depth}`);
    });
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

/** Splits a UCI move like "e7e8q" into { from, to, promotion }. */
export function parseUciMove(uci) {
  if (!uci) return null;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}
