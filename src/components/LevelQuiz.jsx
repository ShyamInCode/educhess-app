import React, { useState } from "react";
import Chessboard from "./Chessboard";

export default function LevelQuiz({ label = "Live Evaluation" }) {
  const [board] = useState(() => {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    b[4][4] = { t: "Q", w: false }; // black queen
    b[6][3] = { t: "N", w: true }; // white knight
    return b;
  });
  const [feedback, setFeedback] = useState(null);
  const correctSquare = [4, 4];

  function handleQuizClick(r, c) {
    setFeedback(r === correctSquare[0] && c === correctSquare[1] ? "correct" : "wrong");
  }

  return (
    <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
      <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">{label}</span>
      <h3 className="font-display text-lg sm:text-xl mt-2 mb-3 text-[#e7ecf5]">Where can the knight fork the queen?</h3>
      <p className="text-sm text-[#93a1b8] mb-4">Select the square the white knight should move to.</p>
      <div className="flex justify-center">
        <Chessboard board={board} onSquareClick={handleQuizClick} size="small" />
      </div>
      {feedback === "correct" && (
        <p className="text-[#34d399] text-sm mt-4 text-center font-mono">Correct — that's the forking square. +5 points.</p>
      )}
      {feedback === "wrong" && (
        <p className="text-[#f87171] text-sm mt-4 text-center font-mono">Not the square — think about knight-move geometry, try again.</p>
      )}
    </div>
  );
}
