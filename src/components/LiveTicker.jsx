import React from "react";
import { TICKER_EVENTS } from "../data/mockData";

export default function LiveTicker() {
  const loop = [...TICKER_EVENTS, ...TICKER_EVENTS];
  return (
    <div className="relative z-20 border-b border-[#2d3b53] bg-[#0f172a]/80 overflow-hidden py-1.5 shrink-0">
      <div className="flex whitespace-nowrap ticker-track">
        {loop.map((e, i) => (
          <span key={i} className="mx-6 text-xs font-mono text-[#93a1b8] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] inline-block" />
            {e}
          </span>
        ))}
      </div>
    </div>
  );
}
