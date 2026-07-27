import React from "react";

/* ---------- Floating background pieces ---------- */
export function FloatingPieces() {
  const items = [
    { g: "♞", left: "6%", delay: "0s", dur: "22s", size: 60 },
    { g: "♜", left: "16%", delay: "3s", dur: "26s", size: 46 },
    { g: "♛", left: "27%", delay: "1.5s", dur: "30s", size: 74 },
    { g: "♝", left: "39%", delay: "6s", dur: "24s", size: 42 },
    { g: "♟", left: "50%", delay: "2s", dur: "20s", size: 36 },
    { g: "♚", left: "61%", delay: "8s", dur: "32s", size: 70 },
    { g: "♞", left: "72%", delay: "4.5s", dur: "23s", size: 48 },
    { g: "♜", left: "83%", delay: "0.8s", dur: "28s", size: 44 },
    { g: "♛", left: "92%", delay: "5.5s", dur: "25s", size: 56 },
    { g: "♝", left: "48%", delay: "10s", dur: "27s", size: 32 },
  ];
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
      {items.map((it, i) => (
        <span
          key={i}
          className="drift-piece"
          style={{ left: it.left, animationDelay: it.delay, animationDuration: it.dur, fontSize: it.size }}
        >
          {it.g}
        </span>
      ))}
    </div>
  );
}

/* ---------- Coordinate rail (signature framing element) ---------- */
export function CoordRail() {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
  return (
    <>
      <div className="hidden md:flex fixed top-0 left-0 right-0 justify-around px-10 pt-1 z-40 pointer-events-none">
        {files.map((f) => (
          <span key={f} className="font-mono text-[10px] tracking-widest text-[#d4af37]/40">{f}</span>
        ))}
      </div>
      <div className="hidden md:flex fixed top-0 bottom-0 left-1 flex-col justify-around py-10 z-40 pointer-events-none">
        {ranks.map((r) => (
          <span key={r} className="font-mono text-[10px] tracking-widest text-[#d4af37]/40">{r}</span>
        ))}
      </div>
    </>
  );
}
