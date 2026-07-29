/* ============================================================
   Move / capture sounds
   ------------------------------------------------------------
   Regular moves play the real chess-piece "click" sample the
   academy provided (public/sounds/move.mp3). Captures play a
   distinct, synthesized (Web Audio API) heavier thud — no capture
   sample was sourced from the internet without explicit sign-off
   on a specific file, so this is a placeholder until a real one is
   provided; swap public/sounds/capture.mp3 in and wire it up the
   same way `move.mp3` is used below if/when you have one.
   ============================================================ */

let ctx = null;
function getAudioCtx() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) ctx = new AudioCtx();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

const moveAudio = typeof Audio !== "undefined" ? new Audio("/sounds/move.mp3") : null;

export function playMoveSound() {
  try {
    if (!moveAudio) return;
    // Cloning lets rapid consecutive moves (e.g. engine replies) overlap
    // cleanly instead of cutting the previous play-through off.
    const node = moveAudio.cloneNode();
    node.volume = 0.6;
    node.play().catch(() => {});
  } catch {
    // Audio is a nice-to-have — never let it break a move.
  }
}

export function playCaptureSound() {
  try {
    const c = getAudioCtx();
    if (!c) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.17);
  } catch {
    // Audio is a nice-to-have — never let it break a move.
  }
}

export function playSoundForMove(move) {
  if (move && move.captured) playCaptureSound();
  else playMoveSound();
}
