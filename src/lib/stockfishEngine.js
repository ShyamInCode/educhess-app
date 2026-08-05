/* ============================================================
   Offline Stockfish integration
   ------------------------------------------------------------
   Runs entirely in a Web Worker, no network calls — this is what
   lets Practice mode work fully offline.

   The engine build is VENDORED into `public/stockfish/` and committed —
   it is not an npm dependency. Bundlers can't wrap Stockfish's own
   worker/wasm loading conventions, so it has to be served as a plain
   static Worker script, which means it must live in `public/` either way.
   The `stockfish` npm package was therefore ~88 MB of node_modules that
   nothing imported, and has been removed from package.json.

   To upgrade the engine (rare):
     1. Download a build from https://github.com/official-stockfish/Stockfish
        or `npm pack stockfish` in a scratch directory.
     2. Copy the single-threaded NNUE build in:
          cp <build>/stockfish-nnue-16-single.js   public/stockfish/stockfish.js
          cp <build>/stockfish-nnue-16-single.wasm public/stockfish/
     3. If the filenames differ, update STOCKFISH_WORKER_PATH below.
     4. Verify on /practice: the board must unlock (that now waits for a real
        `readyok`) and the engine must reply to 1.e4.

   Everything below talks to that worker using the plain UCI
   text protocol (`position fen ...`, `go depth N`, `bestmove ...`).
   ============================================================ */

const STOCKFISH_WORKER_PATH = "/stockfish/stockfish.js";

/** How long to wait for `readyok` before declaring the engine unusable. */
const INIT_TIMEOUT_MS = 15000;
/** How long to wait for a `bestmove` reply before giving up on a search. */
const MOVE_TIMEOUT_MS = 20000;

export class StockfishEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this._initPromise = null;
    // Pending getBestMove() calls, in the order their `go` commands were sent.
    // Each entry: { resolve, reject, timer, settled }.
    this._pending = [];
    this._onReady = null;
    this._initTimer = null;
    this._destroyed = false;
  }

  /**
   * Boot the worker and wait for the engine to actually answer `isready`.
   *
   * This used to resolve the moment the worker object was constructed, so a
   * worker that failed to load its wasm looked "ready" and every later search
   * hung silently. Now the promise only settles on `readyok`, or rejects on a
   * worker error or timeout — which gives the UI something to catch.
   */
  init() {
    if (this._initPromise) return this._initPromise;

    this._initPromise = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(this._initTimer);
        this._initTimer = null;
        this._onReady = null;
        // A destroyed engine settles nothing: its consumer has moved on, and
        // rejecting here would surface a stale error on whatever replaced it.
        if (this._destroyed) return;
        if (err) {
          this._initPromise = null; // allow a retry
          reject(err);
        } else {
          this.ready = true;
          resolve();
        }
      };

      this._initTimer = setTimeout(
        () => finish(new Error("Stockfish didn't respond in time, so practice mode is unavailable.")),
        INIT_TIMEOUT_MS
      );

      try {
        this.worker = new Worker(STOCKFISH_WORKER_PATH);
      } catch (err) {
        finish(new Error("Could not start the Stockfish worker. See stockfishEngine.js setup notes."));
        return;
      }

      this._onReady = () => finish(null);

      this.worker.onmessage = (e) => this._onMessage(typeof e.data === "string" ? e.data : "");
      this.worker.onerror = (err) => {
        console.error("[Stockfish worker error]", err);
        const wrapped = new Error("The chess engine crashed. Reload the page to try again.");
        this.ready = false;
        finish(wrapped);
        this._failPending(wrapped);
      };

      this.send("uci");
      this.send("isready");
    });

    return this._initPromise;
  }

  send(cmd) {
    this.worker && this.worker.postMessage(cmd);
  }

  _onMessage(line) {
    if (line.startsWith("readyok")) {
      if (this._onReady) this._onReady();
      return;
    }

    // `info` lines carry the evaluation and, with MultiPV > 1, the ranked
    // alternative moves. Both the strength limiter (which picks a deliberately
    // sub-optimal candidate) and post-game analysis (which needs the score)
    // are built on these. Attribute them to the search currently running,
    // i.e. the oldest queued entry.
    if (line.startsWith("info ") && line.includes(" pv ")) {
      const entry = this._pending[0];
      if (!entry || entry.settled) return;
      const info = parseInfoLine(line);
      if (info) entry.lines.set(info.multipv, info);
      return;
    }

    if (line.startsWith("bestmove")) {
      const [, uciMove] = line.split(" ");
      // Shift exactly one entry per `bestmove` so the queue stays aligned with
      // the `go` commands even when an earlier search already timed out — that
      // entry is still here, just marked settled, and its reply is discarded.
      const entry = this._pending.shift();
      if (!entry || entry.settled) return;
      entry.settled = true;
      clearTimeout(entry.timer);
      // Ranked best-first. Stockfish emits multipv 1..N; only the deepest
      // report for each index is kept because later lines overwrite earlier.
      const ranked = [...entry.lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
      entry.resolve({
        best: uciMove === "(none)" ? null : uciMove,
        candidates: ranked,
        score: ranked[0] ? { cp: ranked[0].cp, mate: ranked[0].mate } : null,
      });
    }
  }

  /** Reject every in-flight search — used when the worker dies or is torn down. */
  _failPending(err) {
    const pending = this._pending;
    this._pending = [];
    pending.forEach((entry) => {
      if (entry.settled) return;
      entry.settled = true;
      clearTimeout(entry.timer);
      entry.reject(err);
    });
  }

  /**
   * Configure playing strength for a level from ENGINE_LEVELS.
   *
   * This is the part that was broken. The old code only ever sent
   * `Skill Level`, and never enabled `UCI_LimitStrength` — so Stockfish's
   * actual calibrated Elo limiter stayed OFF and even the "500" tier played
   * near-full strength at depth 5. Skill Level alone barely weakens a modern
   * engine.
   *
   * Two regimes, because `UCI_Elo` on this build bottoms out at 1320:
   *
   *   elo >= 1320  Stockfish's own limiter. Genuinely calibrated — this is
   *                the accurate path, and `Skill Level` is ignored while it
   *                is on, so we leave it at max.
   *
   *   elo <  1320  Below the limiter's floor. Weakened by hand instead:
   *                Skill Level 0, a shallow search, and MultiPV so the caller
   *                can deliberately choose a worse candidate (see
   *                `pickMoveForLevel`). Approximate by nature — flagged as
   *                such in the UI rather than pretending otherwise.
   */
  setStrength(level) {
    if (!level) return;
    if (level.uciElo) {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${level.uciElo}`);
      this.send("setoption name Skill Level value 20");
      this.send("setoption name MultiPV value 1");
    } else {
      this.send("setoption name UCI_LimitStrength value false");
      this.send(`setoption name Skill Level value ${level.skill ?? 0}`);
      this.send(`setoption name MultiPV value ${level.multiPv ?? 1}`);
    }
  }

  /**
   * Run one search and resolve with { best, candidates, score }.
   *
   * `candidates` is ranked best-first, one entry per MultiPV line, each
   * `{ multipv, move, cp, mate, depth }`. `score` is the principal line's
   * evaluation from the side-to-move's point of view.
   *
   * Rejects if the engine doesn't answer — callers must handle it, otherwise
   * the board sits on "Thinking…" forever.
   */
  search(fen, { depth = 8, moveTimeMs, timeoutMs } = {}) {
    if (!this.worker) {
      return Promise.reject(new Error("The chess engine isn't running. Reload the page to try again."));
    }
    // Always allow more wall-clock than the engine was asked to spend.
    const limit = timeoutMs ?? Math.max(MOVE_TIMEOUT_MS, (moveTimeMs || 0) + 5000);

    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, settled: false, timer: null, lines: new Map() };
      entry.timer = setTimeout(() => {
        if (entry.settled) return;
        entry.settled = true;
        // Left in the queue on purpose (see _onMessage) so a late reply
        // doesn't get handed to the *next* caller.
        this.send("stop");
        reject(new Error("The engine took too long to move."));
      }, limit);

      this._pending.push(entry);
      this.send("position fen " + fen);
      this.send(moveTimeMs ? `go movetime ${moveTimeMs}` : `go depth ${depth}`);
    });
  }

  /**
   * Ask the engine for its move from the given FEN.
   * Resolves with a UCI move string like "e2e4" or "e7e8q" (promotion),
   * or null if the engine reports no legal move (checkmate/stalemate).
   */
  async getBestMove(fen, opts = {}) {
    const { best } = await this.search(fen, opts);
    return best;
  }

  /**
   * Evaluate a position without playing it — used by post-game analysis.
   * Returns the score from the side-to-move's perspective plus the move the
   * engine would have chosen, so a played move can be compared against it.
   */
  async evaluate(fen, { depth = 12, timeoutMs } = {}) {
    const { score, best } = await this.search(fen, { depth, timeoutMs });
    return { cp: score?.cp ?? null, mate: score?.mate ?? null, best };
  }

  destroy() {
    this._destroyed = true;
    // Without this, an engine torn down before it finished booting still fires
    // its init timeout minutes later and reports "engine unavailable" on the
    // component that replaced it — which is exactly what React StrictMode's
    // mount/unmount/remount cycle produces in development.
    clearTimeout(this._initTimer);
    this._initTimer = null;
    this._failPending(new Error("The chess engine was shut down."));
    this._onReady = null;
    this._initPromise = null;
    this.ready = false;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

/**
 * Parse a UCI `info` line into { multipv, move, cp, mate, depth }.
 *
 * Example:
 *   info depth 12 seldepth 15 multipv 2 score cp -34 ... pv e2e4 e7e5 ...
 *
 * `cp` and `mate` are from the side-to-move's point of view, which is what
 * both callers want: the strength limiter ranks candidates for the mover, and
 * analysis measures how much the mover gave away.
 */
export function parseInfoLine(line) {
  const pv = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
  if (!pv) return null;
  const mate = line.match(/ score mate (-?\d+)/);
  const cp = line.match(/ score cp (-?\d+)/);
  return {
    multipv: Number(line.match(/ multipv (\d+)/)?.[1] ?? 1),
    depth: Number(line.match(/ depth (\d+)/)?.[1] ?? 0),
    move: pv[1],
    cp: cp ? Number(cp[1]) : null,
    mate: mate ? Number(mate[1]) : null,
  };
}

/**
 * Choose which candidate the engine actually plays, for levels below the
 * `UCI_Elo` floor.
 *
 * Picking a uniformly random *legal* move would look broken rather than weak —
 * beginners don't hang their queen for no reason on move 3. Choosing among the
 * engine's own top-N lines keeps every move plausible while still being
 * measurably worse, and `mistakeChance` sets how often it settles for one.
 *
 * Levels driven by UCI_Elo never reach here; they get `candidates[0]`.
 */
export function pickMoveForLevel(candidates, level, random = Math.random) {
  if (!candidates?.length) return null;
  const chance = level?.mistakeChance ?? 0;
  if (candidates.length === 1 || random() >= chance) return candidates[0].move;
  // Uniform over the non-best lines. With MultiPV 3-4 that is a modest,
  // human-looking error rather than a catastrophe.
  const idx = 1 + Math.floor(random() * (candidates.length - 1));
  return candidates[Math.min(idx, candidates.length - 1)].move;
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
