import React from "react";
import StockfishPractice from "../components/StockfishPractice";

export default function PracticePage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-10 lg:px-12 py-6 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Offline Engine Play</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Practice</h1>
      <StockfishPractice />
    </div>
  );
}
