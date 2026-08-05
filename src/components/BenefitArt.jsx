import React from "react";

/*
  Illustrations for the "What the game builds" slider.

  Drawn inline as SVG rather than shipped as image files on purpose: they stay
  crisp at any size, cost nothing to download, need no `public/` assets to keep
  in sync, and inherit the site palette instead of fighting it. They also work
  with the app's offline story, which raster assets on a CDN would not.

  Each is decorative; the meaning is carried by the heading next to it, so they
  are aria-hidden and never announced.
*/

const GOLD = "#d4af37";
const EMERALD = "#34d399";
const DIM = "#93a1b8";

function Frame({ children }) {
  return (
    <svg viewBox="0 0 120 120" className="w-full h-full" aria-hidden="true" focusable="false">
      <circle cx="60" cy="60" r="52" fill="#0f172a" stroke="#2d3b53" strokeWidth="1.5" />
      {children}
    </svg>
  );
}

/** Memory: a lattice with three squares already "remembered". */
function Memory() {
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const lit = (r === 0 && c === 1) || (r === 2 && c === 0) || (r === 3 && c === 3);
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={38 + c * 12}
          y={38 + r * 12}
          width="10"
          height="10"
          rx="2"
          fill={lit ? GOLD : "none"}
          stroke={lit ? GOLD : DIM}
          strokeWidth="1.2"
          opacity={lit ? 1 : 0.5}
        />
      );
    }
  }
  return <Frame>{cells}</Frame>;
}

/** Concentration: everything narrowing to one point. */
function Concentration() {
  return (
    <Frame>
      <circle cx="60" cy="60" r="26" fill="none" stroke={DIM} strokeWidth="1.4" opacity="0.5" />
      <circle cx="60" cy="60" r="17" fill="none" stroke={DIM} strokeWidth="1.4" opacity="0.7" />
      <circle cx="60" cy="60" r="8" fill="none" stroke={GOLD} strokeWidth="2" />
      <circle cx="60" cy="60" r="3" fill={GOLD} />
      <path d="M60 22v10M60 88v10M22 60h10M88 60h10" stroke={EMERALD} strokeWidth="2" strokeLinecap="round" />
    </Frame>
  );
}

/** Planning ahead: a route mapped out before the first step. */
function Planning() {
  return (
    <Frame>
      <path
        d="M34 82 L52 66 L46 48 L70 40 L86 52"
        fill="none"
        stroke={GOLD}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="5 5"
      />
      <circle cx="34" cy="82" r="5" fill={EMERALD} />
      <circle cx="52" cy="66" r="3.5" fill="none" stroke={DIM} strokeWidth="1.5" />
      <circle cx="46" cy="48" r="3.5" fill="none" stroke={DIM} strokeWidth="1.5" />
      <circle cx="70" cy="40" r="3.5" fill="none" stroke={DIM} strokeWidth="1.5" />
      <path d="M86 52v-16M86 36h12l-4 5 4 5H86" fill="none" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" />
    </Frame>
  );
}

/** Decisions under pressure: the clock is running. */
function Pressure() {
  return (
    <Frame>
      <circle cx="60" cy="62" r="26" fill="none" stroke={DIM} strokeWidth="1.6" />
      <path d="M60 62V44" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M60 62l13 9" stroke={EMERALD} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M50 30h20" stroke={DIM} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M60 30v6" stroke={DIM} strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M86 40a30 30 0 0 1 4 14"
        fill="none"
        stroke={GOLD}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
    </Frame>
  );
}

/** Learning from mistakes: go round again, and it becomes a tick. */
function Mistakes() {
  return (
    <Frame>
      <path
        d="M84 60a24 24 0 1 1-7-17"
        fill="none"
        stroke={DIM}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M79 30v14h-14" fill="none" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M48 61l8 8 17-19"
        fill="none"
        stroke={EMERALD}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Quiet confidence: earned, one step at a time. */
function Confidence() {
  return (
    <Frame>
      <rect x="32" y="72" width="16" height="16" rx="2" fill="none" stroke={DIM} strokeWidth="1.8" />
      <rect x="52" y="60" width="16" height="28" rx="2" fill="none" stroke={DIM} strokeWidth="1.8" />
      <rect x="72" y="46" width="16" height="42" rx="2" fill={GOLD} opacity="0.18" stroke={GOLD} strokeWidth="1.8" />
      <path
        d="M74 36l3 5 3-6 3 6 3-5v6H74z"
        fill={GOLD}
        stroke={GOLD}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M30 40l6 4 6-9" fill="none" stroke={EMERALD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

const ART = {
  memory: Memory,
  concentration: Concentration,
  planning: Planning,
  pressure: Pressure,
  mistakes: Mistakes,
  confidence: Confidence,
};

export default function BenefitArt({ name }) {
  const Art = ART[name] || Memory;
  return <Art />;
}
