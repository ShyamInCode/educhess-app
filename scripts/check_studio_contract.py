#!/usr/bin/env python3
"""
check_studio_contract.py — make sure the browser and the worker agree.

The Video Studio has one genuinely risky seam. `src/components/admin/AdminStudio.jsx`
builds a job spec in JavaScript, using `src/lib/chessNarration.js` to read
moves; `studio/engine/spec_render.py` renders that spec in Python, using
python-chess to read the same moves. Two chess libraries, two languages, one
data structure passed between them through a JSONB column.

Nothing in the type system connects those. This does: it builds specs exactly
the way the panel builds them — module templates, library topics, and pasted
movetext — and then plans every one of them exactly the way the worker will.
A disagreement here is a job that queues happily in the browser and fails four
minutes later on the academy PC.

Run:  python scripts/check_studio_contract.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "studio" / "engine"))

try:
    import spec_render as sr
except ImportError as exc:
    sys.exit(f"could not import the render engine: {exc}\n"
             f"install it with:  pip install -r studio/requirements.txt")

# Movetext a person might actually paste, including the things that usually
# break a naive parser: a comment, a result token, a non-standard start, and a
# promotion with check.
PASTED = [
    ("opera-game",
     "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 "
     "7. Qb3 Qe7 {Black defends} 8. Nc3 c6 1-0", None),
    ("rook-endgame", "Ra8+ Kg7 Ra7+ Kg8", "6k1/8/8/8/8/8/8/R5K1 w - - 0 1"),
    ("promotion", "a8=Q+ Kg7", "7k/P7/8/8/8/8/8/K7 w - - 0 1"),
    ("castling", "O-O O-O-O", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"),
    ("en-passant", "1. e4 d5 2. e5 f5 3. exf6", None),
]

JS = """
const lib = await import(process.argv[1]);
const { framesFromMoves } = await import(process.argv[2]);
const pasted = JSON.parse(process.argv[3]);
const out = [];

// AdminStudio's draftFromTemplate()
for (const t of lib.MODULE_TEMPLATES) {
  out.push({ label: `module:${t.id}`, spec: { version: 1,
    title: t.title, tagline: t.tagline || '', introSpeech: t.introSpeech || '',
    outroSpeech: t.outroSpeech || '', outroStamp: t.outroStamp || '',
    segments: JSON.parse(JSON.stringify(t.segments)) } });
}

// AdminStudio's loadTopic()
for (const t of lib.TOPIC_INDEX) {
  let segments;
  if (t.moves) {
    const p = framesFromMoves(t.moves);
    if (p.error) { out.push({ label: `topic:${t.id}`, jsError: p.error }); continue; }
    segments = [{ heading: '', headingSpeech: '', startFen: null, frames: p.frames }];
  } else {
    segments = [{ heading: t.name, headingSpeech: `${t.name}.`,
                  startFen: t.startFen || null,
                  frames: JSON.parse(JSON.stringify(t.frames || [])) }];
  }
  out.push({ label: `topic:${t.id}`, spec: { version: 1, title: t.name,
    tagline: t.tagline || '', introSpeech: 'In this lesson.',
    outroSpeech: t.idea || '', outroStamp: '', segments } });
}

// AdminStudio's loadMoves()
for (const [name, moves, fen] of pasted) {
  const p = framesFromMoves(moves, fen);
  if (p.error) { out.push({ label: `moves:${name}`, jsError: p.error }); continue; }
  out.push({ label: `moves:${name}`, spec: { version: 1, title: name, tagline: '',
    introSpeech: 'Watch this line.', outroSpeech: '',
    outroStamp: p.isCheckmate ? 'CHECKMATE' : '',
    segments: [{ heading: '', headingSpeech: '', startFen: fen, frames: p.frames }] } });
}

process.stdout.write(JSON.stringify(out));
"""


def main() -> int:
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", JS,
         (ROOT / "src" / "data" / "studioLibrary.js").as_uri(),
         (ROOT / "src" / "lib" / "chessNarration.js").as_uri(),
         json.dumps(PASTED)],
        capture_output=True, text=True, cwd=ROOT,
    )
    if proc.returncode != 0:
        print(proc.stderr.strip()[:1500])
        return 2

    cases = json.loads(proc.stdout)
    failures: list[str] = []
    frames = 0

    for case in cases:
        if case.get("jsError"):
            failures.append(f"{case['label']}: the browser refused it — {case['jsError']}")
            continue
        try:
            frames += len(sr.plan(case["spec"]))
        except sr.SpecError as exc:
            failures.append(f"{case['label']}: the worker refused it — {exc}")
        except Exception as exc:
            failures.append(f"{case['label']}: {type(exc).__name__}: {exc}")

    print(f"{len(cases)} specs built the way the admin panel builds them, "
          f"{frames} frames planned the way the worker plans them")

    if failures:
        print(f"\n{len(failures)} disagreement(s):\n")
        for failure in failures:
            print(f"  ✗ {failure}")
        return 1

    print("the browser and the worker agree on every one")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
