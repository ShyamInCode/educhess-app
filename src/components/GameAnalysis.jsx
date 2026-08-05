import React, { useCallback, useEffect, useRef, useState } from "react";
import { StockfishEngine } from "../lib/stockfishEngine";
import { analyseGame, MOVE_CLASSES, ANALYSIS_DEPTH } from "../lib/gameAnalysis";

/**
 * Post-game report for a finished practice game.
 *
 * Runs on its own StockfishEngine rather than borrowing the one that played
 * the game: analysis must run at full strength, and the playing engine is
 * deliberately handicapped to the chosen tier. Sharing it would mean either
 * analysing at 500-Elo strength or corrupting the opponent's settings.
 */
export default function GameAnalysis({ history, playerColor = "w", onClose }) {
  const [state, setState] = useState("idle"); // idle | running | done | error
  const [progress, setProgress] = useState({ done: 0, total: history.length });
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const engineRef = useRef(null);
  const abortRef = useRef(null);

  // Tear the engine down on unmount — a full-strength analysis engine left
  // running is a whole CPU core doing nothing useful.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  const run = useCallback(async () => {
    setState("running");
    setError("");
    setProgress({ done: 0, total: history.length });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (!engineRef.current) {
        engineRef.current = new StockfishEngine();
        await engineRef.current.init();
      }
      const result = await analyseGame(history, engineRef.current, {
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (controller.signal.aborted) return;
      setReport(result);
      setState("done");
    } catch (err) {
      if (err?.name === "AbortError") return;
      setError(err?.message || "Analysis failed. Please try again.");
      setState("error");
    }
  }, [history]);

  if (!history.length) return null;

  if (state === "idle") {
    return (
      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
        <span className="font-mono text-xs text-[#d4af37] tracking-widest uppercase">Game Review</span>
        <h3 className="font-display text-lg mt-2 mb-2 text-[#e7ecf5]">Analyse this game</h3>
        <p className="text-sm text-[#93a1b8] mb-4">
          Every move is checked against the engine at depth {ANALYSIS_DEPTH} to show your accuracy and
          where the game turned. It runs on your device, so it takes a few seconds.
        </p>
        <button
          type="button"
          onClick={run}
          className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
        >
          Analyse game
        </button>
      </div>
    );
  }

  if (state === "running") {
    const pct = Math.round((progress.done / Math.max(1, progress.total)) * 100);
    return (
      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
        <span className="font-mono text-xs text-[#d4af37] tracking-widest uppercase">Game Review</span>
        <h3 className="font-display text-lg mt-2 mb-4 text-[#e7ecf5]">Analysing…</h3>
        <div
          className="h-2 w-full rounded-full bg-[#0f172a] overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-label="Analysis progress"
        >
          <div className="h-full bg-[#34d399] transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm font-mono text-[#93a1b8] mt-3">
          Move {progress.done} of {progress.total}
        </p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bg-[#1e293b] border border-[#f87171]/50 rounded-2xl p-6">
        <p className="text-sm text-[#f87171]">{error}</p>
        <button
          type="button"
          onClick={run}
          className="mt-4 px-5 py-2.5 rounded-lg border border-[#2d3b53] text-[#e7ecf5] font-semibold text-sm hover:border-[#d4af37]/60 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const you = playerColor === "w" ? report.white : report.black;
  const opponent = playerColor === "w" ? report.black : report.white;

  return (
    <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className="font-mono text-xs text-[#d4af37] tracking-widest uppercase">Game Review</span>
          <h3 className="font-display text-lg mt-2 text-[#e7ecf5]">How you played</h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-mono text-[#93a1b8] hover:text-[#e7ecf5]"
          >
            Close
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <SideCard title="You" summary={you} highlight />
        <SideCard title="Engine" summary={opponent} />
      </div>

      <div>
        <h4 className="font-mono text-xs text-[#93a1b8] uppercase tracking-widest mb-3">Your move quality</h4>
        <ul className="space-y-1.5">
          {Object.entries(MOVE_CLASSES).map(([key, meta]) => (
            <li key={key} className="flex items-center gap-3 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color }} />
              <span className="text-[#e7ecf5] flex-1">{meta.label}</span>
              <span className="font-mono text-[#93a1b8]">{you.counts?.[key] ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>

      {you.worst?.length > 0 && (
        <div>
          <h4 className="font-mono text-xs text-[#93a1b8] uppercase tracking-widest mb-3">
            Where the game turned
          </h4>
          <ul className="space-y-2">
            {you.worst
              // Only moves that actually cost something, and never one the
              // engine itself would have played.
              .filter((m) => m.centipawnLoss >= 20 && m.classification !== "best")
              .map((m) => (
                <li key={m.ply} className="bg-[#0f172a] border border-[#2d3b53] rounded-lg px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[#e7ecf5]">
                      {m.moveNumber}
                      {m.color === "w" ? "." : "…"} {m.san}
                    </span>
                    <span
                      className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{ color: MOVE_CLASSES[m.classification].color }}
                    >
                      {MOVE_CLASSES[m.classification].label}
                    </span>
                  </div>
                  {m.engineBest && (
                    <p className="text-[#93a1b8] mt-1 font-mono text-xs">
                      Engine preferred {m.engineBest} · cost {(m.centipawnLoss / 100).toFixed(1)} pawns
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-[#93a1b8] leading-relaxed border-t border-[#2d3b53] pt-4">
        Accuracy uses the same published formula as the big chess sites, measured at depth{" "}
        {ANALYSIS_DEPTH}. The estimated rating is a rough guide from one game only. Real ratings come
        from results against rated opponents over many games, and a single blunder skews this a lot.
      </p>
    </div>
  );
}

function SideCard({ title, summary, highlight }) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        highlight ? "border-[#d4af37]/50 bg-[#0f172a]" : "border-[#2d3b53] bg-[#0f172a]/60"
      }`}
    >
      <p className="font-mono text-xs text-[#93a1b8] uppercase tracking-widest">{title}</p>
      <p className="font-display text-3xl text-[#e7ecf5] mt-2">
        {summary.accuracy != null ? `${summary.accuracy}%` : "Not rated"}
      </p>
      <p className="text-xs text-[#93a1b8]">accuracy</p>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-[#93a1b8]">Est. rating</dt>
          <dd className="font-mono text-[#e7ecf5]">{summary.estimatedRating ?? "too short"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[#93a1b8]">Avg. loss</dt>
          <dd className="font-mono text-[#e7ecf5]">
            {summary.avgCentipawnLoss != null ? `${summary.avgCentipawnLoss}cp` : "Not rated"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[#93a1b8]">Moves</dt>
          <dd className="font-mono text-[#e7ecf5]">{summary.moveCount}</dd>
        </div>
      </dl>
    </div>
  );
}
