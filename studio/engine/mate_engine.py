#!/usr/bin/env python3
"""
generate_mate_videos.py — EduChess

Batch-renders one narrated .mp4 per checkmate pattern from a dict of PGNs.

Pipeline (all local, all free):
    PGN --python-chess--> board states
        --chess.svg--> SVG frames (move arrow, capture-aware destination
                       highlight, red check/mate square)
        --cairosvg--> PNG
        --Pillow--> branded overlay, title card, outro card, logo watermark
        --edge-tts--> one narration clip per move, plus a spoken intro line
        --ffmpeg--> frame holds sized to their clip, then muxed to {name}.mp4

No moviepy. No engine. No API key. edge-tts does need an internet connection
(it calls Microsoft's public Edge voice endpoint); --no-voice skips it and
produces silent videos with fixed frame holds. ffmpeg is invoked via
subprocess and the key commands are echoed so a bad video can be reproduced.

Usage:
    python generate_mate_videos.py                    # 1080x1080, narrated
    python generate_mate_videos.py --vertical         # 1080x1920 (Reels)
    python generate_mate_videos.py --no-voice         # silent, no network
    python generate_mate_videos.py --only scholars_mate --keep-frames
    python generate_mate_videos.py --dry-run          # build all, skip final mux
    python generate_mate_videos.py --verbose          # echo every ffmpeg call
    python generate_mate_videos.py --list             # validate PGNs and exit
"""

from __future__ import annotations

import argparse
import asyncio
import io
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

# ===========================================================================
# ==  PGN LIBRARY  ==  paste additional patterns here; nothing below needs  ==
# ==                   to change when you scale to 50.                     ==
# ===========================================================================
#
# Format: "pattern_name": "PGN movetext"
#   - pattern_name becomes the output filename ({name}.mp4).
#   - Movetext only is fine; PGN headers are optional and ignored.
#   - Every line is validated on load: illegal moves and non-mating finishes
#     are reported in the final log rather than silently shipped.
#   - Add a matching entry to SPOKEN_NAMES so the narrator says it correctly.

MATE_PATTERNS: dict[str, str] = {
    # The 4-move queen-and-bishop attack on f7. The canonical beginner trap.
    "scholars_mate": "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#",

    # The shortest possible mate in chess: two moves, White self-destructs.
    "fools_mate": "1. f3 e5 2. g4 Qh4#",

    # Blackburne Shilling Gambit finish — the knight mates a king boxed in
    # entirely by its own pieces; Be2 is pinned by the queen on e4.
    "smothered_mate": (
        "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 "
        "5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#"
    ),

    # Morphy — Duke of Brunswick & Count Isouard, Paris Opera, 1858.
    # The textbook back rank mate (17. Rd8#) and the best-known illustration
    # of it. Swap for a shorter line if you want a tighter Reel.
    "back_rank_mate": (
        "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 "
        "6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 "
        "11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 "
        "15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#"
    ),

    # Legal's Mate (Légal — Saint Brie, Paris 1750): the queen sacrifice
    # that mates with three minor pieces.
    "legal_mate": (
        "1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 "
        "5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#"
    ),
}

# How each key is spoken and written on screen. Keys missing here fall back
# to a title-cased version of the identifier, which loses the apostrophe —
# so add an entry per pattern rather than relying on the fallback.
SPOKEN_NAMES: dict[str, str] = {
    "scholars_mate": "Scholar's Mate",
    "fools_mate": "Fool's Mate",
    "smothered_mate": "Smothered Mate",
    "back_rank_mate": "Back Rank Mate",
    "legal_mate": "Legal's Mate",
}

# Optional intro subtitles. Anything not listed gets one generated from the
# move count, e.g. "4-move checkmate pattern".
PATTERN_TAGLINES: dict[str, str] = {
    "back_rank_mate": "The Opera Game, Paris 1858",
}

# ===========================================================================
# ==  END PGN LIBRARY  ==  configuration and rendering logic below         ==
# ===========================================================================

import chess
import chess.pgn
import chess.svg
from PIL import Image, ImageDraw, ImageFont

# --- Brand ----------------------------------------------------------------
BRAND_NAME = "EduChess"
BRAND_HANDLE = ""            # optional; shown on the outro card only if set

LOGO_PATH = Path("educhess_logo.png")              # 878x916 circular badge
LOGO_TRANSPARENT_PATH = Path("logo_transparent.png")  # generated cache
WORDMARK_PATH = Path("educhess_title.png")         # 934x235, already alpha

LOGO_CIRCLE_MARGIN = 4       # px shaved off the radius so no fringe survives
WATERMARK_WIDTH_FRAC = 0.08  # logo width as a fraction of frame width
WATERMARK_OPACITY = 0.80
WORDMARK_WIDTH_FRAC = 0.68   # wordmark width on intro/outro cards

NAVY = (11, 26, 51)
NAVY_DEEP = (7, 17, 34)
GOLD = (212, 175, 55)
GOLD_DIM = (150, 124, 42)
CREAM = (236, 232, 220)
CHECK_RED = (200, 40, 40)

# chess.svg colour overrides. Arrow colours are resolved through these keys,
# which is also how an 8-digit hex gets split into colour + opacity.
BOARD_COLORS = {
    "square light": "#f0d9b5",
    "square dark": "#b58863",
    "square light lastmove": "#f4d774",
    "square dark lastmove": "#d4af37",
    "margin": "#0b1a33",
    "coord": "#d4af37",
    "arrow green": "#1f7a3acc",   # quiet move
    "arrow red": "#c0392bcc",     # capture
}

# Destination-square wash, so a capture reads differently from a quiet move
# at a glance even before the arrow registers.
FILL_QUIET = "#1f7a3a55"
FILL_CAPTURE = "#c0392b66"

# --- Narration ------------------------------------------------------------
VOICE = "en-US-GuyNeural"       # clear, neutral; en-US-AriaNeural for female
DEFAULT_RATE = "+0%"
DEFAULT_PITCH = "+0Hz"
DEFAULT_AUDIO_BUFFER = 0.3      # breathing room after each clip, seconds
TTS_CONCURRENCY = 4
TTS_ATTEMPTS = 3
AUDIO_RATE = "44100"

INTRO_TEMPLATE = "In this module we are going to learn about {name}."

# --- Layout ---------------------------------------------------------------
SQUARE_SIZE = (1080, 1080)
VERTICAL_SIZE = (1080, 1920)

DEFAULT_HOLD = 1.5           # seconds per board frame when silent
DEFAULT_FINAL_HOLD = 3.0     # floor for the checkmate frame
DEFAULT_INTRO_HOLD = 3.0     # title card floor / silent-mode value
DEFAULT_OUTRO_HOLD = 3.0
DEFAULT_FPS = 30

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\seguisb.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


# ---------------------------------------------------------------------------
# SVG -> PNG backend
# ---------------------------------------------------------------------------

_SVG_BACKEND: str | None = None
_SVG_BACKEND_ERROR: str = ""

# cairosvg needs libcairo-2.dll, which ships with the GTK runtime rather than
# with pip. If a known GTK bin dir exists, make it visible before importing.
_WINDOWS_CAIRO_DIRS = [
    r"C:\Program Files\Gtk-Runtime\bin",
    r"C:\Program Files\GTK3-Runtime Win64\bin",
    r"C:\msys64\mingw64\bin",
]


def _bootstrap_cairo_path() -> None:
    if os.name != "nt":
        return
    for directory in _WINDOWS_CAIRO_DIRS:
        if not os.path.isdir(directory):
            continue
        if directory.lower() not in os.environ.get("PATH", "").lower():
            os.environ["PATH"] = directory + os.pathsep + os.environ.get("PATH", "")
        try:
            os.add_dll_directory(directory)
        except (OSError, AttributeError):
            pass


def _init_svg_backend() -> str:
    """Pick an SVG rasteriser once. cairosvg preferred; svglib is a fallback
    for machines where the native cairo DLL isn't installed."""
    global _SVG_BACKEND, _SVG_BACKEND_ERROR
    if _SVG_BACKEND:
        return _SVG_BACKEND

    _bootstrap_cairo_path()
    try:
        import cairosvg  # noqa: F401
        _SVG_BACKEND = "cairosvg"
        return _SVG_BACKEND
    except Exception as exc:  # ImportError, or OSError when libcairo is absent
        _SVG_BACKEND_ERROR = f"cairosvg unavailable: {exc}"

    try:
        from svglib.svglib import svg2rlg  # noqa: F401
        from reportlab.graphics import renderPM  # noqa: F401
        _SVG_BACKEND = "svglib"
        print(f"[warn] {_SVG_BACKEND_ERROR}\n[warn] falling back to svglib/reportlab.")
        return _SVG_BACKEND
    except Exception as exc:
        raise RuntimeError(
            f"No SVG rasteriser available.\n  {_SVG_BACKEND_ERROR}\n  svglib unavailable: {exc}\n"
            "Fix cairosvg (install the GTK3 runtime so libcairo-2.dll is on PATH) "
            "or: pip install svglib reportlab"
        ) from exc


def svg_to_png_bytes(svg: str, size: int) -> bytes:
    backend = _init_svg_backend()

    if backend == "cairosvg":
        import cairosvg
        return cairosvg.svg2png(
            bytestring=svg.encode("utf-8"),
            output_width=size,
            output_height=size,
        )

    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPM

    drawing = svg2rlg(io.BytesIO(svg.encode("utf-8")))
    if drawing is None:
        raise RuntimeError("svglib failed to parse the board SVG")
    scale = size / float(drawing.width)
    drawing.scale(scale, scale)
    drawing.width = size
    drawing.height = size
    buf = io.BytesIO()
    renderPM.drawToFile(drawing, buf, fmt="PNG", bg=0x0B1A33)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Fonts and text helpers
# ---------------------------------------------------------------------------

def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    return right - left, bottom - top


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int, start: int):
    """Largest font size at or below `start` whose text fits `max_width`."""
    size = start
    while size > 16:
        font = load_font(size)
        if text_size(draw, text, font)[0] <= max_width:
            return font
        size -= 4
    return load_font(16)


def text_extent(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    """Width, and the glyph bottom measured from the draw anchor. The bottom
    is not the same as the bbox height: PIL anchors at the ascender, so
    stacking by height alone puts the next element inside the previous text."""
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    return right - left, bottom


def draw_centered(draw: ImageDraw.ImageDraw, text: str, y: int, font,
                  width: int, fill) -> int:
    """Draw text horizontally centered at y; return the y just below it."""
    left, _, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.text(((width - (right - left)) // 2 - left, y), text, font=font, fill=fill)
    return y + bottom


# ---------------------------------------------------------------------------
# Brand assets
# ---------------------------------------------------------------------------

_ASSET_CACHE: dict[str, Image.Image | None] = {}


def prepare_logo(force: bool = False) -> Path | None:
    """The supplied badge is a circle painted onto an opaque off-white square:
    its alpha channel is 255 everywhere, so pasting it raw would stamp a pale
    box onto the board. Build a circular alpha mask once and cache the result.

    The mask is drawn at 4x and downsampled so the circle edge is antialiased
    rather than jagged."""
    if not LOGO_PATH.exists():
        print(f"[warn] {LOGO_PATH} not found — board frames will have no watermark")
        return None

    fresh = (
        LOGO_TRANSPARENT_PATH.exists()
        and LOGO_TRANSPARENT_PATH.stat().st_mtime >= LOGO_PATH.stat().st_mtime
    )
    if fresh and not force:
        return LOGO_TRANSPARENT_PATH

    logo = Image.open(LOGO_PATH).convert("RGBA")
    width, height = logo.size
    radius = min(width, height) / 2 - LOGO_CIRCLE_MARGIN

    scale = 4
    mask = Image.new("L", (width * scale, height * scale), 0)
    ImageDraw.Draw(mask).ellipse(
        [
            (width / 2 - radius) * scale,
            (height / 2 - radius) * scale,
            (width / 2 + radius) * scale,
            (height / 2 + radius) * scale,
        ],
        fill=255,
    )
    mask = mask.resize((width, height), Image.LANCZOS)

    # Intersect with any alpha the source already had, rather than replacing it.
    logo.putalpha(Image.composite(logo.getchannel("A"), Image.new("L", logo.size, 0), mask))
    logo.save(LOGO_TRANSPARENT_PATH, "PNG")
    print(f"[info] logo      built circular mask -> {LOGO_TRANSPARENT_PATH} "
          f"(r={radius:.0f}px)")
    return LOGO_TRANSPARENT_PATH


def load_asset(key: str, path: Path | None) -> Image.Image | None:
    """Load an overlay once. A missing file is a warning, never a crash."""
    if key in _ASSET_CACHE:
        return _ASSET_CACHE[key]
    image: Image.Image | None = None
    if path is None or not path.exists():
        if path is not None:
            print(f"[warn] {path} not found — skipping that overlay")
    else:
        image = Image.open(path).convert("RGBA")
    _ASSET_CACHE[key] = image
    return image


def scaled_to_width(image: Image.Image, target_width: int) -> Image.Image:
    height = max(1, round(target_width * image.height / image.width))
    return image.resize((max(1, target_width), height), Image.LANCZOS)


def with_opacity(image: Image.Image, opacity: float) -> Image.Image:
    if opacity >= 1.0:
        return image
    faded = image.copy()
    faded.putalpha(faded.getchannel("A").point(lambda a: int(a * opacity)))
    return faded


# ---------------------------------------------------------------------------
# SAN -> spoken English
# ---------------------------------------------------------------------------

PIECE_NAMES = {
    chess.PAWN: "Pawn",
    chess.KNIGHT: "Knight",
    chess.BISHOP: "Bishop",
    chess.ROOK: "Rook",
    chess.QUEEN: "Queen",
    chess.KING: "King",
}

RANK_WORDS = {
    "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight",
}


def spoken_square(square: chess.Square) -> str:
    """'f7' -> 'F seven'. Notation shorthand is never handed to the voice:
    the file becomes a capital letter and the rank becomes a word."""
    name = chess.square_name(square)
    return f"{name[0].upper()} {RANK_WORDS[name[1]]}"


def san_disambiguator(san: str) -> str:
    """The file/rank hint SAN inserts when two identical pieces can reach the
    same square, e.g. 'Nbd2' -> 'b'. Empty for pawn moves and castling."""
    core = san.rstrip("+#").split("=")[0]
    if core.startswith("O-O") or not core[:1].isupper():
        return ""
    return core[1:].replace("x", "")[:-2]


@dataclass
class MoveFacts:
    """Everything about a move that narration and highlighting need, pulled
    out of python-chess exactly once."""
    piece: chess.PieceType
    from_square: chess.Square
    to_square: chess.Square
    is_capture: bool
    captured: chess.PieceType | None
    is_en_passant: bool
    castling: str | None            # "kingside" | "queenside" | None
    promotion: chess.PieceType | None
    disambiguated: bool             # SAN itself needed the origin square
    is_check: bool
    is_checkmate: bool


def extract_move_facts(before: chess.Board, move: chess.Move, san: str,
                       after: chess.Board) -> MoveFacts:
    castling = None
    if before.is_castling(move):
        castling = "kingside" if before.is_kingside_castling(move) else "queenside"

    captured: chess.PieceType | None = None
    if before.is_en_passant(move):
        captured = chess.PAWN          # the captured pawn isn't on to_square
    elif before.is_capture(move):
        victim = before.piece_at(move.to_square)
        captured = victim.piece_type if victim else None

    return MoveFacts(
        piece=before.piece_at(move.from_square).piece_type,
        from_square=move.from_square,
        to_square=move.to_square,
        is_capture=before.is_capture(move),
        captured=captured,
        is_en_passant=before.is_en_passant(move),
        castling=castling,
        promotion=move.promotion,
        disambiguated=bool(san_disambiguator(san)),
        is_check=after.is_check(),
        is_checkmate=after.is_checkmate(),
    )


def speech_for(f: MoveFacts) -> str:
    """One move as a spoken sentence, built from the move/piece objects rather
    than by parsing SAN text."""
    if f.castling:
        phrase = f"King castles {f.castling}"
    else:
        name = PIECE_NAMES[f.piece]
        target = spoken_square(f.to_square)

        # Only voice the origin square when SAN itself needed it to be
        # unambiguous — otherwise "Knight to F three" stays short and natural.
        origin = f" from {spoken_square(f.from_square)}" if f.disambiguated else ""

        if f.is_capture:
            phrase = f"{name}{origin} takes {target}"
            if f.is_en_passant:
                phrase += ", en passant"
        else:
            phrase = f"{name}{origin} to {target}"

    if f.promotion:
        phrase += f", promoting to {PIECE_NAMES[f.promotion]}"

    if f.is_checkmate:
        phrase += ", checkmate, game over"
    elif f.is_check:
        phrase += ", check"

    return phrase + "."


def move_to_speech(before: chess.Board, move: chess.Move, san: str,
                   after: chess.Board) -> str:
    return speech_for(extract_move_facts(before, move, san, after))


# ---------------------------------------------------------------------------
# PGN handling
# ---------------------------------------------------------------------------

@dataclass
class Ply:
    """One half-move to be rendered as a frame."""
    board: chess.Board          # position AFTER the move
    move: chess.Move | None     # None for the starting position
    caption: str                # e.g. "4. Qxf7#"
    speech: str = ""            # e.g. "Queen takes F seven, checkmate, game over."
    was_capture: bool = False
    is_final: bool = False


def parse_pgn(name: str, pgn_text: str) -> list[Ply]:
    """Replay a PGN into a list of frames. Raises ValueError on illegal moves."""
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("could not parse PGN")
    if game.errors:
        raise ValueError(f"illegal move in PGN: {game.errors[0]}")

    board = game.board()
    plies: list[Ply] = [Ply(board=board.copy(), move=None, caption="Starting position")]

    moves = list(game.mainline_moves())
    if not moves:
        raise ValueError("PGN contains no moves")

    for move in moves:
        if move not in board.legal_moves:
            raise ValueError(f"illegal move {move.uci()} in position {board.fen()}")
        san = board.san(move)                       # SAN must be taken pre-push
        number = board.fullmove_number
        prefix = f"{number}." if board.turn == chess.WHITE else f"{number}..."
        before = board.copy()
        was_capture = before.is_capture(move)
        board.push(move)
        plies.append(Ply(
            board=board.copy(),
            move=move,
            caption=f"{prefix} {san}",
            speech=move_to_speech(before, move, san, board),
            was_capture=was_capture,
        ))

    plies[-1].is_final = True

    if not board.is_checkmate():
        raise ValueError(
            f"sequence does not end in checkmate (final position: {board.fen()})"
        )
    return plies


def spoken_name(name: str) -> str:
    return SPOKEN_NAMES.get(name, name.replace("_", " ").title())


def intro_line(name: str) -> str:
    return INTRO_TEMPLATE.format(name=spoken_name(name))


def pattern_tagline(name: str, plies: list[Ply]) -> str:
    if name in PATTERN_TAGLINES:
        return PATTERN_TAGLINES[name]
    moves = (len(plies) - 1 + 1) // 2      # half-moves -> full moves
    return f"{moves}-move checkmate pattern"


# ---------------------------------------------------------------------------
# Frame rendering
# ---------------------------------------------------------------------------

def render_board_png(ply: Ply, board_px: int, was_capture: bool = False) -> bytes:
    """chess.svg board with a move arrow, a capture-aware destination wash,
    the last-move highlight, and a red check/mate square. All native
    python-chess features — nothing is drawn by hand."""
    check_square = None
    if ply.board.is_check():
        check_square = ply.board.king(ply.board.turn)

    arrows = []
    fill: dict[chess.Square, str] = {}
    if ply.move is not None:
        arrows = [chess.svg.Arrow(
            ply.move.from_square,
            ply.move.to_square,
            color="red" if was_capture else "green",
        )]
        fill = {ply.move.to_square: FILL_CAPTURE if was_capture else FILL_QUIET}

    svg = chess.svg.board(
        board=ply.board,
        lastmove=ply.move,
        check=check_square,
        arrows=arrows,
        fill=fill,
        size=board_px,
        coordinates=True,
        colors=BOARD_COLORS,
    )
    return svg_to_png_bytes(svg, board_px)


def compose_frame(board_png: bytes, ply: Ply, title: str,
                  canvas: tuple[int, int]) -> Image.Image:
    """Place the board on a navy canvas, draw the branded caption bar, and
    stamp the circular logo watermark into the bottom-right corner."""
    width, height = canvas
    vertical = height > width

    frame = Image.new("RGB", canvas, NAVY)
    draw = ImageDraw.Draw(frame)

    bar_h = 150 if vertical else 120
    title_h = 190 if vertical else 72   # reserved strip so the header text
    pad = 36                            # never collides with board coordinates

    # Board fits the space left between the title strip and the caption bar.
    avail_w = width - 2 * pad
    avail_h = height - title_h - bar_h - 2 * pad
    board_px = max(64, min(avail_w, avail_h))

    board_img = Image.open(io.BytesIO(board_png)).convert("RGBA")
    if board_img.size != (board_px, board_px):
        board_img = board_img.resize((board_px, board_px), Image.LANCZOS)

    bx = (width - board_px) // 2
    by = title_h + pad + (avail_h - board_px) // 2
    frame.paste(board_img, (bx, by), board_img)

    # --- title (vertical layout only) --------------------------------------
    if vertical:
        title_font = load_font(62)
        sub_font = load_font(34)
        tw, th = text_size(draw, title.upper(), title_font)
        draw.text(((width - tw) // 2, 56), title.upper(), font=title_font, fill=GOLD)
        sw, _ = text_size(draw, BRAND_NAME.upper(), sub_font)
        draw.text(((width - sw) // 2, 56 + th + 22), BRAND_NAME.upper(),
                  font=sub_font, fill=GOLD_DIM)

    # --- caption bar -------------------------------------------------------
    bar_top = height - bar_h
    draw.rectangle([0, bar_top, width, height], fill=NAVY_DEEP)
    draw.line([(0, bar_top), (width, bar_top)], fill=GOLD, width=4)

    move_font = load_font(66 if vertical else 60)
    draw.text((pad + 10, bar_top + (bar_h - 66) // 2), ply.caption,
              font=move_font, fill=GOLD)

    # --- logo watermark, bottom-right, inside the caption bar --------------
    watermark_right = width - pad
    logo = load_asset("logo", LOGO_TRANSPARENT_PATH if LOGO_TRANSPARENT_PATH.exists()
                      else None)
    if logo is not None:
        mark = with_opacity(
            scaled_to_width(logo, int(width * WATERMARK_WIDTH_FRAC)),
            WATERMARK_OPACITY,
        )
        mx = width - pad - mark.width
        my = bar_top + (bar_h - mark.height) // 2
        frame.paste(mark, (mx, my), mark)
        watermark_right = mx - 26

    # Status tag sits left of the watermark so the two never collide.
    tag, tag_fill = "", GOLD_DIM
    if ply.board.is_checkmate():
        tag, tag_fill = "CHECKMATE", CHECK_RED
    elif ply.board.is_check():
        tag, tag_fill = "CHECK", GOLD_DIM
    if tag:
        tag_font = load_font(44)
        tw, th = text_size(draw, tag, tag_font)
        draw.text((watermark_right - tw, bar_top + (bar_h - th) // 2 - 4),
                  tag, font=tag_font, fill=tag_fill)

    # Horizontal layout carries the pattern name in the reserved title strip.
    if not vertical:
        brand_font = load_font(34)
        header = f"{BRAND_NAME.upper()}  ·  {title.upper()}"
        bw, bh = text_size(draw, header, brand_font)
        draw.text(((width - bw) // 2, (title_h - bh) // 2), header,
                  font=brand_font, fill=GOLD_DIM)

    return frame


def paste_wordmark(card: Image.Image, y: int, width_frac: float) -> int:
    """Composite the wordmark centered at y. Returns the y below it, or y
    unchanged when the asset is missing."""
    wordmark = load_asset("wordmark", WORDMARK_PATH)
    if wordmark is None:
        return y
    mark = scaled_to_width(wordmark, int(card.width * width_frac))
    card.paste(mark, ((card.width - mark.width) // 2, y), mark)
    return y + mark.height


def make_title_card(name: str, tagline: str, canvas: tuple[int, int]) -> Image.Image:
    """Intro card: wordmark, the spoken intro line, and the pattern name."""
    width, height = canvas
    vertical = height > width
    card = Image.new("RGB", canvas, NAVY)
    draw = ImageDraw.Draw(card)

    title = spoken_name(name)
    lead = "IN THIS MODULE WE ARE GOING TO LEARN ABOUT"

    wordmark = load_asset("wordmark", WORDMARK_PATH)
    wm_h = 0
    if wordmark is not None:
        wm_h = round(width * WORDMARK_WIDTH_FRAC * wordmark.height / wordmark.width)

    lead_font = fit_font(draw, lead, int(width * 0.86), 36 if vertical else 32)
    name_font = fit_font(draw, title.upper(), int(width * 0.86), 108 if vertical else 92)
    tag_font = load_font(46 if vertical else 40)

    lead_h = text_extent(draw, lead, lead_font)[1]
    name_h = text_extent(draw, title.upper(), name_font)[1]
    tag_h = text_extent(draw, tagline, tag_font)[1]

    gap_a, gap_b, gap_c = 96, 44, 30
    block = wm_h + gap_a + lead_h + gap_b + name_h + gap_c + tag_h
    y = max(60, (height - block) // 2)

    if wordmark is not None:
        y = paste_wordmark(card, y, WORDMARK_WIDTH_FRAC)
    else:
        y = draw_centered(draw, BRAND_NAME.upper(), y, load_font(72), width, GOLD)

    y = draw_centered(draw, lead, y + gap_a, lead_font, width, GOLD_DIM)

    # Rule sits in the middle of the gap between the lead-in and the name.
    rule_y = y + gap_b // 2
    inset = width // 8
    draw.line([(inset, rule_y), (width - inset, rule_y)], fill=GOLD_DIM, width=3)

    y = draw_centered(draw, title.upper(), y + gap_b, name_font, width, GOLD)
    draw_centered(draw, tagline, y + gap_c, tag_font, width, CREAM)
    return card


def make_outro_card(board_png: bytes, canvas: tuple[int, int]) -> Image.Image:
    """Outro card: the mate position dimmed back, with a CHECKMATE stamp and
    the wordmark stacked inside one panel so neither fights the pieces."""
    width, height = canvas
    vertical = height > width
    card = Image.new("RGB", canvas, NAVY)
    draw = ImageDraw.Draw(card)

    pad = 36
    board_px = max(64, min(width - 2 * pad, height - 2 * pad))
    board_img = Image.open(io.BytesIO(board_png)).convert("RGBA")
    if board_img.size != (board_px, board_px):
        board_img = board_img.resize((board_px, board_px), Image.LANCZOS)

    # Dim hard: the stamp has to win against a full board behind it.
    board_img = Image.blend(
        board_img, Image.new("RGBA", board_img.size, NAVY + (255,)), 0.62
    )
    by = (height - board_px) // 2
    card.paste(board_img, ((width - board_px) // 2, by), board_img)

    stamp = "CHECKMATE"
    stamp_font = fit_font(draw, stamp, int(board_px * 0.72), 150 if vertical else 128)
    stamp_w, stamp_h = text_size(draw, stamp, stamp_font)

    wordmark = load_asset("wordmark", WORDMARK_PATH)
    wm_w = wm_h = 0
    if wordmark is not None:
        wm_w = int(width * WORDMARK_WIDTH_FRAC)
        wm_h = round(wm_w * wordmark.height / wordmark.width)

    inner_pad, gap = 46, 34
    panel_w = max(stamp_w, wm_w) + 2 * inner_pad
    panel_h = stamp_h + (gap + wm_h if wm_h else 0) + 2 * inner_pad
    px = (width - panel_w) // 2
    py = (height - panel_h) // 2

    draw.rectangle([px, py, px + panel_w, py + panel_h], fill=NAVY_DEEP)
    draw.rectangle([px, py, px + panel_w, py + panel_h], outline=GOLD, width=5)

    # Anchored center-middle so the glyphs sit on the panel's real center
    # rather than on a size estimate that ignores bearing and descenders.
    draw.text((width // 2, py + inner_pad + stamp_h // 2), stamp,
              font=stamp_font, fill=CHECK_RED, anchor="mm")

    if wordmark is not None:
        paste_wordmark(card, py + inner_pad + stamp_h + gap, WORDMARK_WIDTH_FRAC)
    else:
        draw_centered(draw, BRAND_NAME.upper(), py + inner_pad + stamp_h + gap,
                      load_font(64), width, GOLD)

    if BRAND_HANDLE:
        handle_font = load_font(46 if vertical else 40)
        draw_centered(draw, BRAND_HANDLE, py + panel_h + 34, handle_font,
                      width, GOLD_DIM)
    return card


# ---------------------------------------------------------------------------
# ffmpeg
# ---------------------------------------------------------------------------

def show_cmd(cmd: list[str]) -> str:
    """Copy-pasteable rendering of an argv list."""
    if os.name == "nt":
        return subprocess.list2cmdline(cmd)
    import shlex
    return shlex.join(cmd)


def run_ffmpeg(cmd: list[str], echo: bool, what: str, cwd: Path | None = None) -> None:
    """Run one ffmpeg invocation, raising with its stderr on failure."""
    if echo:
        print(f"[ffmpeg] {show_cmd(cmd)}")
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          cwd=str(cwd) if cwd else None)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()[:500]
        raise RuntimeError(f"{what} failed (exit {proc.returncode}): {detail}")


def probe_duration(ffprobe: str, path: Path) -> float:
    proc = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        raise RuntimeError(f"ffprobe could not read a duration from {path.name}")
    return float(proc.stdout.strip())


def find_ffmpeg(explicit: str | None) -> str:
    candidate = explicit or os.environ.get("FFMPEG_BINARY") or "ffmpeg"
    resolved = shutil.which(candidate)
    if resolved:
        return resolved
    if explicit and os.path.exists(explicit):
        return explicit
    raise RuntimeError(
        f"ffmpeg not found (looked for {candidate!r} on PATH).\n"
        "Install it, or pass --ffmpeg C:\\path\\to\\ffmpeg.exe"
    )


def find_ffprobe(ffmpeg: str) -> str:
    """ffprobe ships alongside ffmpeg; prefer the sibling binary so a --ffmpeg
    override doesn't silently probe with a different build."""
    sibling = Path(ffmpeg).with_name("ffprobe" + Path(ffmpeg).suffix)
    if sibling.exists():
        return str(sibling)
    resolved = shutil.which("ffprobe")
    if resolved:
        return resolved
    raise RuntimeError("ffprobe not found next to ffmpeg or on PATH")


def write_concat_list(frame_paths: list[Path], durations: list[float],
                      list_path: Path) -> None:
    """Concat demuxer list. Filenames are written bare and the list lives in the
    same directory as the frames, which sidesteps Windows drive-letter escaping.
    The final entry is repeated because the demuxer ignores the last duration."""
    lines = ["ffconcat version 1.0"]
    for path, dur in zip(frame_paths, durations):
        lines.append(f"file '{path.name}'")
        lines.append(f"duration {dur:.3f}")
    lines.append(f"file '{frame_paths[-1].name}'")
    list_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_narration(ffmpeg: str, clips: list[Path | None], durations: list[float],
                    audio_dir: Path, echo: bool) -> Path:
    """Pad each clip out to exactly its frame's hold time, then concatenate.
    Padding is what keeps narration locked to the frames: clip i always starts
    at the same instant frame i appears, no drift over a 33-move game."""
    segments: list[Path] = []
    for index, (clip, hold) in enumerate(zip(clips, durations)):
        segment = audio_dir / f"seg_{index:04d}.wav"
        if clip is None:
            cmd = [
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                "-f", "lavfi", "-i", f"anullsrc=r={AUDIO_RATE}:cl=stereo",
                "-t", f"{hold:.3f}", "-c:a", "pcm_s16le", str(segment),
            ]
        else:
            cmd = [
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(clip),
                "-af", "apad", "-t", f"{hold:.3f}",
                "-ar", AUDIO_RATE, "-ac", "2", "-c:a", "pcm_s16le", str(segment),
            ]
        run_ffmpeg(cmd, echo, f"padding segment {index}")
        segments.append(segment)

    list_path = audio_dir / "audio.txt"
    list_path.write_text(
        "\n".join(f"file '{s.name}'" for s in segments) + "\n", encoding="utf-8"
    )

    narration = audio_dir / "narration.mp3"
    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(list_path),
        "-c:a", "libmp3lame", "-q:a", "2", str(narration),
    ]
    if not echo:
        print(f"[ffmpeg] {show_cmd(cmd)}")
    run_ffmpeg(cmd, echo, "narration concat", cwd=audio_dir)
    return narration


def build_ffmpeg_cmd(
    ffmpeg: str,
    list_path: Path,
    out_path: Path,
    size: tuple[int, int],
    fps: int,
    total_duration: float,
    narration: Path | None = None,
) -> list[str]:
    width, height = size
    vf = f"fps={fps},scale={width}:{height}:flags=lanczos,format=yuv420p"

    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(list_path),
    ]
    if narration is not None:
        cmd += ["-i", str(narration)]

    cmd += [
        "-vf", vf,
        "-r", str(fps),
        # The concat list repeats its final entry so the outro gets its full
        # hold; -t trims the resulting overhang to the exact intended run.
        "-t", f"{total_duration:.3f}",
    ]
    if narration is not None:
        # Video from the frame list, audio from the narration track. The
        # narration was built to the same total length, so nothing drifts.
        cmd += ["-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k"]

    cmd += [
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(out_path),
    ]
    return cmd


# ---------------------------------------------------------------------------
# edge-tts
# ---------------------------------------------------------------------------

async def _synthesize_all(jobs: list[tuple[str, Path]], voice: str,
                          rate: str, pitch: str) -> None:
    """Fetch every clip for one pattern, a few at a time, with retries.
    edge-tts occasionally returns an empty stream; that counts as a failure."""
    import edge_tts

    semaphore = asyncio.Semaphore(TTS_CONCURRENCY)

    async def one(text: str, path: Path) -> None:
        async with semaphore:
            last_error: Exception | None = None
            for attempt in range(TTS_ATTEMPTS):
                try:
                    await edge_tts.Communicate(
                        text, voice, rate=rate, pitch=pitch
                    ).save(str(path))
                    if path.exists() and path.stat().st_size > 0:
                        return
                    last_error = RuntimeError("edge-tts returned no audio")
                except Exception as exc:
                    last_error = exc
                await asyncio.sleep(1.0 * (attempt + 1))
            raise RuntimeError(f"{text!r}: {last_error}")

    await asyncio.gather(*(one(text, path) for text, path in jobs))


def synthesize_narration(plies: list[Ply], intro_text: str, voice: str,
                         rate: str, pitch: str,
                         audio_dir: Path) -> tuple[Path, list[Path | None]]:
    """intro.mp3 plus one move_XX.mp3 per move. Index 0 of the returned move
    list (the starting position) has no clip."""
    intro_path = audio_dir / "intro.mp3"
    jobs: list[tuple[str, Path]] = [(intro_text, intro_path)]

    clips: list[Path | None] = [None]
    for index, ply in enumerate(plies):
        if index == 0:
            continue
        path = audio_dir / f"move_{index:02d}.mp3"
        jobs.append((ply.speech, path))
        clips.append(path)

    try:
        asyncio.run(_synthesize_all(jobs, voice, rate, pitch))
    except Exception as exc:
        raise RuntimeError(
            f"edge-tts synthesis failed for {exc} "
            "(check your connection, or re-run with --no-voice)"
        ) from exc
    return intro_path, clips


# ---------------------------------------------------------------------------
# Per-pattern driver
# ---------------------------------------------------------------------------

@dataclass
class Result:
    name: str
    ok: bool = False
    dry: bool = False
    narrated: bool = False
    frames: int = 0
    duration: float = 0.0
    output: str = ""
    error: str = ""
    ffmpeg_cmd: str = ""
    elapsed: float = 0.0


def generate_one(
    name: str,
    pgn: str,
    out_dir: Path,
    frames_root: Path,
    canvas: tuple[int, int],
    args: argparse.Namespace,
    ffmpeg: str | None,
    ffprobe: str | None = None,
) -> Result:
    result = Result(name=name)
    started = time.time()
    print(f"\n=== {name} ===")

    try:
        plies = parse_pgn(name, pgn)
    except ValueError as exc:
        result.error = str(exc)
        print(f"[fail] {name}: {exc}")
        return result

    title = spoken_name(name)
    print(f"[info] {len(plies)} board frames ({len(plies) - 1} moves) — {title}")

    frame_dir = frames_root / name
    if frame_dir.exists():
        shutil.rmtree(frame_dir)
    frame_dir.mkdir(parents=True, exist_ok=True)

    # --- narration first: clip lengths decide how long each frame is held ---
    intro_clip: Path | None = None
    move_clips: list[Path | None] = []
    intro_hold = args.intro_hold
    ply_durations: list[float] = []

    if args.no_voice:
        ply_durations = [args.final_hold if p.is_final else args.hold for p in plies]
    else:
        audio_dir = frame_dir / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        try:
            line = intro_line(name)
            print(f"[info] intro     {line!r}")
            print(f"[info] synthesizing {len(plies)} clips with {args.voice} ...")
            intro_clip, move_clips = synthesize_narration(
                plies, line, args.voice, args.rate, args.pitch, audio_dir,
            )
            # The title card is held for as long as its own line takes.
            intro_hold = probe_duration(ffprobe, intro_clip) + args.audio_buffer

            for index, ply in enumerate(plies):
                if move_clips[index] is None:            # starting position
                    ply_durations.append(args.hold)
                    continue
                spoken = probe_duration(ffprobe, move_clips[index])
                hold = spoken + args.audio_buffer
                if ply.is_final:
                    hold = max(args.final_hold, hold)    # 3s floor on the mate
                ply_durations.append(hold)
        except RuntimeError as exc:
            result.error = str(exc)
            print(f"[fail] {name}: {exc}")
            return result

        longest = max(range(1, len(plies)), key=lambda i: ply_durations[i])
        print(f"[info] narration intro {intro_hold:.1f}s, board "
              f"{sum(ply_durations):.1f}s, longest line "
              f"{ply_durations[longest]:.1f}s — {plies[longest].speech}")

    # Render at 2x the on-canvas board size, then downsample — keeps piece
    # edges crisp at 1080p.
    render_px = min(canvas) * 2

    # Full timeline: title card, board sequence, then the checkmate stamp.
    frame_paths: list[Path] = []
    durations: list[float] = [intro_hold]
    frame_clips: list[Path | None] = [intro_clip]

    try:
        intro = make_title_card(name, pattern_tagline(name, plies), canvas)
        path = frame_dir / "f0000.png"
        intro.save(path, "PNG", optimize=False)
        frame_paths.append(path)

        final_board_png = b""
        for index, ply in enumerate(plies):
            board_png = render_board_png(ply, render_px, ply.was_capture)
            frame = compose_frame(board_png, ply, title, canvas)
            path = frame_dir / f"f{index + 1:04d}.png"
            frame.save(path, "PNG", optimize=False)
            frame_paths.append(path)
            durations.append(ply_durations[index])
            frame_clips.append(move_clips[index] if move_clips else None)
            if ply.is_final:
                final_board_png = board_png

        outro = make_outro_card(final_board_png, canvas)
        path = frame_dir / f"f{len(plies) + 1:04d}.png"
        outro.save(path, "PNG", optimize=False)
        frame_paths.append(path)
        durations.append(args.outro_hold)
        frame_clips.append(None)
    except Exception as exc:
        result.error = f"frame rendering failed at frame {len(frame_paths)}: {exc}"
        print(f"[fail] {name}: {result.error}")
        return result

    result.frames = len(frame_paths)
    result.duration = sum(durations)
    print(f"[info] rendered {result.frames} PNGs -> {frame_dir}")

    list_path = frame_dir / "frames.txt"
    write_concat_list(frame_paths, durations, list_path)
    print(f"[info] concat list -> {list_path}")

    out_path = out_dir / f"{name}.mp4"
    result.output = str(out_path)

    if ffmpeg is None:
        result.error = "ffmpeg not resolved"
        return result

    narration: Path | None = None
    if not args.no_voice:
        try:
            narration = build_narration(
                ffmpeg, frame_clips, durations, frame_dir / "audio", args.verbose
            )
            result.narrated = True
            print(f"[info] narration -> {narration}")
        except RuntimeError as exc:
            result.error = str(exc)
            print(f"[fail] {name}: {exc}")
            return result

    cmd = build_ffmpeg_cmd(ffmpeg, list_path, out_path, canvas, args.fps,
                           result.duration, narration)
    result.ffmpeg_cmd = show_cmd(cmd)
    print(f"[ffmpeg] {result.ffmpeg_cmd}")

    if args.dry_run:
        print("[info] --dry-run: skipping ffmpeg")
        result.dry = True
        return result

    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=str(frame_dir))
    if proc.returncode != 0:
        result.error = (proc.stderr or proc.stdout or "ffmpeg failed").strip()[:800]
        print(f"[fail] ffmpeg exit {proc.returncode}\n{result.error}")
        return result

    if proc.stderr.strip():
        print(f"[ffmpeg:stderr] {proc.stderr.strip()[:500]}")

    if not out_path.exists() or out_path.stat().st_size == 0:
        result.error = "ffmpeg reported success but produced no output file"
        print(f"[fail] {result.error}")
        return result

    size_mb = out_path.stat().st_size / 1_048_576
    print(f"[ok] {out_path}  ({size_mb:.2f} MB, ~{result.duration:.1f}s)")
    result.ok = True
    result.elapsed = time.time() - started

    if not args.keep_frames:
        shutil.rmtree(frame_dir, ignore_errors=True)

    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Render one narrated mp4 per checkmate pattern from a PGN dict.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--vertical", action="store_true",
                   help="render 1080x1920 for Reels/Shorts instead of 1080x1080")
    p.add_argument("--output", default=None,
                   help="output directory (default: 'output', or 'output_vertical' "
                        "with --vertical so the two formats never overwrite each other)")
    p.add_argument("--frames-dir", default=None,
                   help="where to write intermediate PNGs (default: a temp dir)")
    p.add_argument("--only", action="append", default=None, metavar="NAME",
                   help="render only this pattern (repeatable)")
    p.add_argument("--hold", type=float, default=DEFAULT_HOLD,
                   help="seconds per board frame when --no-voice is used")
    p.add_argument("--final-hold", type=float, default=DEFAULT_FINAL_HOLD,
                   help="minimum seconds to hold the checkmate frame")
    p.add_argument("--intro-hold", type=float, default=DEFAULT_INTRO_HOLD,
                   help="title card hold when --no-voice is used")
    p.add_argument("--outro-hold", type=float, default=DEFAULT_OUTRO_HOLD,
                   help="seconds to hold the checkmate/CTA card")
    p.add_argument("--fps", type=int, default=DEFAULT_FPS, help="output frame rate")
    p.add_argument("--no-voice", action="store_true",
                   help="skip narration entirely and produce silent videos with "
                        "fixed frame holds (needs no network)")
    p.add_argument("--voice", default=VOICE, help="edge-tts voice")
    p.add_argument("--rate", default=DEFAULT_RATE,
                   help="edge-tts speaking rate, e.g. -10%% or +15%%")
    p.add_argument("--pitch", default=DEFAULT_PITCH,
                   help="edge-tts pitch, e.g. -5Hz or +10Hz")
    p.add_argument("--audio-buffer", type=float, default=DEFAULT_AUDIO_BUFFER,
                   help="pause added after each narration clip, in seconds")
    p.add_argument("--voices", action="store_true",
                   help="list the available en-US edge-tts voices and exit")
    p.add_argument("--rebuild-logo", action="store_true",
                   help="regenerate the circular logo mask even if cached")
    p.add_argument("--verbose", action="store_true",
                   help="echo every ffmpeg invocation, including audio padding")
    p.add_argument("--ffmpeg", default=None, help="path to the ffmpeg binary")
    p.add_argument("--keep-frames", action="store_true",
                   help="keep the intermediate PNGs and concat lists")
    p.add_argument("--dry-run", action="store_true",
                   help="build frames and audio, print commands, skip the final mux")
    p.add_argument("--list", action="store_true",
                   help="validate every PGN in the library and exit")
    return p.parse_args(argv)


def cmd_list() -> int:
    print(f"{len(MATE_PATTERNS)} patterns in the library\n")
    bad = 0
    for name, pgn in MATE_PATTERNS.items():
        try:
            plies = parse_pgn(name, pgn)
            print(f"  ok    {name:<20} {len(plies) - 1:>3} moves  "
                  f"{spoken_name(name):<18} ends {plies[-1].caption}")
            print(f"        intro: {intro_line(name)}")
            print(f"        mate:  {plies[-1].speech}")
        except ValueError as exc:
            bad += 1
            print(f"  FAIL  {name:<20} {exc}")
    print(f"\n{len(MATE_PATTERNS) - bad} valid, {bad} invalid")
    return 1 if bad else 0


def cmd_voices() -> int:
    try:
        import edge_tts
    except ImportError:
        print("[fail] edge-tts is not installed (pip install edge-tts)")
        return 2
    try:
        voices = asyncio.run(edge_tts.list_voices())
    except Exception as exc:
        print(f"[fail] could not reach the edge-tts voice list: {exc}")
        return 2
    print(f"en-US voices (current default: {VOICE})\n")
    for voice in sorted(voices, key=lambda v: v["ShortName"]):
        if voice["Locale"].startswith("en-US"):
            print(f"  {voice['ShortName']:<30} {voice['Gender']:<8} "
                  f"{voice.get('FriendlyName', '')}")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.list:
        return cmd_list()
    if args.voices:
        return cmd_voices()

    patterns = dict(MATE_PATTERNS)
    if args.only:
        missing = [n for n in args.only if n not in patterns]
        if missing:
            print(f"[fail] unknown pattern(s): {', '.join(missing)}")
            print(f"       available: {', '.join(patterns)}")
            return 2
        patterns = {n: patterns[n] for n in args.only}

    canvas = VERTICAL_SIZE if args.vertical else SQUARE_SIZE
    if args.output is None:
        args.output = "output_vertical" if args.vertical else "output"
    out_dir = Path(args.output).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    # Narration needs real binaries even under --dry-run, because clip
    # durations are what set the frame holds.
    ffmpeg: str | None = None
    ffprobe: str | None = None
    try:
        ffmpeg = find_ffmpeg(args.ffmpeg)
        ffprobe = find_ffprobe(ffmpeg)
    except RuntimeError as exc:
        if args.dry_run and args.no_voice:
            print(f"[warn] {exc}")
            ffmpeg, ffprobe = "ffmpeg", "ffprobe"
        else:
            print(f"[fail] {exc}")
            return 2

    if not args.no_voice:
        try:
            import edge_tts  # noqa: F401
        except ImportError:
            print("[fail] edge-tts is not installed. Run `pip install edge-tts`, "
                  "or use --no-voice for silent videos.")
            return 2

    try:
        _init_svg_backend()
    except RuntimeError as exc:
        print(f"[fail] {exc}")
        return 2

    # Brand assets: build the circular logo mask once, warn on anything absent.
    prepare_logo(force=args.rebuild_logo)
    load_asset("logo", LOGO_TRANSPARENT_PATH if LOGO_TRANSPARENT_PATH.exists() else None)
    load_asset("wordmark", WORDMARK_PATH)

    print(f"[info] brand     {BRAND_NAME}")
    print(f"[info] canvas    {canvas[0]}x{canvas[1]}"
          f"{'  (vertical / Reels)' if args.vertical else ''}")
    print(f"[info] svg       {_SVG_BACKEND}")
    print(f"[info] ffmpeg    {ffmpeg}")
    print(f"[info] output    {out_dir}")
    if args.no_voice:
        print("[info] voice     disabled (--no-voice)")
        print(f"[info] timing    {args.hold}s per move, {args.intro_hold}s intro, "
              f"{args.final_hold}s on mate, {args.fps} fps")
    else:
        print(f"[info] voice     {args.voice}, rate={args.rate}, pitch={args.pitch}")
        print(f"[info] timing    clip length + {args.audio_buffer}s per frame, "
              f"min {args.final_hold}s on mate, {args.fps} fps")
    print(f"[info] outro     {args.outro_hold}s")

    temp_dir: tempfile.TemporaryDirectory | None = None
    if args.frames_dir:
        frames_root = Path(args.frames_dir).resolve()
        frames_root.mkdir(parents=True, exist_ok=True)
    elif args.keep_frames or args.dry_run:
        frames_root = out_dir / "_frames"
        frames_root.mkdir(parents=True, exist_ok=True)
    else:
        temp_dir = tempfile.TemporaryDirectory(prefix="mate_frames_")
        frames_root = Path(temp_dir.name)

    results: list[Result] = []
    try:
        for name, pgn in patterns.items():
            results.append(
                generate_one(name, pgn, out_dir, frames_root, canvas, args,
                             ffmpeg, ffprobe)
            )
    finally:
        if temp_dir is not None:
            temp_dir.cleanup()

    # --- log ---------------------------------------------------------------
    ok = [r for r in results if r.ok]
    dry = [r for r in results if r.dry]
    failed = [r for r in results if not r.ok and not r.dry]

    print("\n" + "=" * 72)
    if dry:
        print(f"BUILD LOG (dry run)  —  {len(dry)} prepared, {len(failed)} failed")
    else:
        print(f"BUILD LOG  —  {len(ok)}/{len(results)} succeeded")
    print("=" * 72)
    for r in results:
        if r.ok:
            tag = "voice" if r.narrated else "silent"
            print(f"  OK    {r.name:<20} {r.frames:>3} frames  {r.duration:>5.1f}s  "
                  f"{tag:<6} {r.output}")
        elif r.dry:
            print(f"  DRY   {r.name:<20} {r.frames:>3} frames  {r.duration:>5.1f}s  "
                  "(ffmpeg not run)")
        else:
            print(f"  FAIL  {r.name:<20} {r.error}")

    if failed:
        print("\nTo reproduce a failing ffmpeg run by hand:")
        for r in failed:
            if r.ffmpeg_cmd:
                print(f"  # {r.name}\n  {r.ffmpeg_cmd}")

    print("=" * 72)
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
