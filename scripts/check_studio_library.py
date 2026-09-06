#!/usr/bin/env python3
"""
check_studio_library.py — replay every line in src/data/studioLibrary.js.

The studio's whole promise is that a lesson rendered from the library is
chess that actually happened. Nothing here is generated, so nothing here is
checked by a model — it is checked by python-chess, which is the only opinion
that counts.

What it verifies, per entry:

  * startFen parses, and is a legal position
  * every `san` is legal in the position it is played from
  * every `moves` string replays to the end
  * a mate pattern really does end in checkmate
  * every square in `sq` and every arrow in `ar` is a real square name

Run:  python scripts/check_studio_library.py
Exit: 0 if clean, 1 with a report if not. Wire it into CI, or run it after
      editing the library — a wrong knight square ships silently otherwise.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

try:
    import chess
    import chess.pgn
except ImportError:
    sys.exit("python-chess is required:  pip install chess")

ROOT = Path(__file__).resolve().parent.parent
LIBRARY = ROOT / "src" / "data" / "studioLibrary.js"

SQUARES = {chess.square_name(s) for s in chess.SQUARES}


def dump_library() -> dict:
    """Import the ES module with node and hand it back as JSON.

    Parsing the JS by hand was the other option. It is the option that
    silently disagrees with the bundler the first time someone uses a
    template literal, so: let node read it, since node is what ships it.
    """
    script = (
        "import(process.argv[1]).then(m => {"
        "  const out = {"
        "    modules: m.MODULE_TEMPLATES,"
        "    openings: m.OPENINGS,"
        "    tactics: m.TACTICS,"
        "    pieces: m.PIECE_LESSONS,"
        "    mates: m.MATE_PATTERNS,"
        "  };"
        "  process.stdout.write(JSON.stringify(out));"
        "}).catch(e => { console.error(e.message); process.exit(2); });"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script, LIBRARY.as_uri()],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        sys.exit(f"could not load {LIBRARY.name}: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.checked = 0

    def fail(self, where: str, message: str) -> None:
        self.errors.append(f"{where}: {message}")


def check_squares(report: Report, where: str, frame: dict) -> None:
    for square in frame.get("sq") or []:
        if square not in SQUARES:
            report.fail(where, f"{square!r} is not a square")
    for arrow in frame.get("ar") or []:
        if not isinstance(arrow, list) or len(arrow) < 2:
            report.fail(where, f"arrow {arrow!r} needs a from and a to")
            continue
        for square in arrow[:2]:
            if square not in SQUARES:
                report.fail(where, f"arrow square {square!r} is not a square")


def board_from(report: Report, where: str, fen: str | None) -> chess.Board | None:
    if not fen:
        return chess.Board()
    try:
        board = chess.Board(fen)
    except ValueError as exc:
        report.fail(where, f"bad FEN: {exc}")
        return None
    if not board.is_valid():
        report.fail(where, f"illegal position: {board.status()!r}")
        return None
    return board


def check_frames(report: Report, where: str, fen: str | None, frames: list[dict]) -> None:
    board = board_from(report, where, fen)
    if board is None:
        return
    for index, frame in enumerate(frames):
        spot = f"{where} frame {index}"
        check_squares(report, spot, frame)

        san = frame.get("san")
        if san:
            try:
                board.push_san(san)
                report.checked += 1
            except (ValueError, AssertionError) as exc:
                report.fail(spot, f"illegal move {san!r} — {exc}")
                return

        if not frame.get("say") and not frame.get("hold"):
            report.fail(spot, "has neither narration nor a hold time")


def check_moves(report: Report, where: str, moves: str, must_mate: bool = False) -> None:
    """Replay a SAN movetext string, the way the studio and the worker will."""
    board = chess.Board()
    # Strip move numbers and result tokens; python-chess's PGN reader wants a
    # game, and this is deliberately just a line.
    tokens = re.sub(r"\d+\.(\.\.)?", " ", moves)
    tokens = re.sub(r"(1-0|0-1|1/2-1/2|\*)", " ", tokens)
    played = 0
    for token in tokens.split():
        try:
            board.push_san(token)
            played += 1
        except (ValueError, AssertionError) as exc:
            report.fail(where, f"illegal move {token!r} after {played} plies — {exc}")
            return
    if played == 0:
        report.fail(where, "no moves")
        return
    if must_mate and not board.is_checkmate():
        report.fail(where, f"does not end in checkmate (ends {board.fen()})")
    report.checked += played


def main() -> int:
    data = dump_library()
    report = Report()

    for module in data["modules"]:
        for index, segment in enumerate(module["segments"]):
            where = f"module {module['id']} / segment {index} {segment.get('heading','')!r}"
            check_frames(report, where, segment.get("startFen"), segment.get("frames") or [])

    for entry in data["pieces"] + data["tactics"]:
        where = f"topic {entry['id']}"
        check_frames(report, where, entry.get("startFen"), entry.get("frames") or [])

    for entry in data["openings"]:
        check_moves(report, f"opening {entry['id']}", entry["moves"])

    for entry in data["mates"]:
        check_moves(report, f"mate {entry['id']}", entry["moves"], must_mate=True)

    print(f"checked {report.checked} moves across "
          f"{len(data['modules'])} modules and "
          f"{len(data['pieces']) + len(data['tactics']) + len(data['openings']) + len(data['mates'])} topics")

    if report.errors:
        print(f"\n{len(report.errors)} problem(s):\n")
        for error in report.errors:
            print(f"  ✗ {error}")
        return 1

    print("all lines legal")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
