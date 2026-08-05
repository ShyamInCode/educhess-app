"""
Import the Lichess puzzle database into Supabase Postgres.

Source: https://database.lichess.org/#puzzles  (lichess_db_puzzle.csv.zst)
Licence: CC0 / public domain. Crediting Lichess is courteous, not required.

Why import instead of calling the Lichess API per puzzle: no rate limits, no
per-puzzle latency, and a Lichess outage doesn't take our Puzzles page down.

Sizing: the full file is ~5M puzzles. Supabase's free tier is 500 MB, so this
filters by quality (plays/popularity) and caps the row count by default. 150k
puzzles is far more than the academy will ever exhaust.

Usage
-----
    # 1. download + decompress (needs `zstd`)
    curl -LO https://database.lichess.org/lichess_db_puzzle.csv.zst
    zstd -d lichess_db_puzzle.csv.zst

    # 2. set DATABASE_URL to the Supabase connection string
    #    (Dashboard → Project Settings → Database → Connection string → URI)
    export DATABASE_URL='postgresql://...'

    # 3. run
    python import_lichess_puzzles.py lichess_db_puzzle.csv --limit 150000

Requires psycopg (`pip install "psycopg[binary]"`), which is not in the API's
requirements.txt because this is a one-off operational script, not a runtime
dependency.
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import sys

try:
    import psycopg
except ImportError:  # pragma: no cover
    sys.exit("psycopg is required:  pip install 'psycopg[binary]'")

# Themes we surface as puzzle categories in the UI. A puzzle is kept if it has
# at least one of these. Lichess ships ~60 themes; these are the ones that make
# sense for a coaching academy. Add more freely — the schema is just text[].
KEEP_THEMES = {
    "mateIn1", "mateIn2", "mateIn3",
    "fork", "pin", "skewer",
    "hangingPiece", "discoveredAttack", "doubleCheck",
    "deflection", "sacrifice", "backRankMate", "smotheredMate",
}

COLUMNS = (
    "puzzle_id", "fen", "moves", "rating", "rating_dev",
    "popularity", "nb_plays", "themes", "game_url", "opening_tags",
)


def pg_array(values: list[str]) -> str:
    """Render a Python list as a Postgres array literal for COPY text format."""
    if not values:
        return "{}"
    escaped = [v.replace("\\", "\\\\").replace('"', '\\"') for v in values]
    return "{" + ",".join(f'"{v}"' for v in escaped) + "}"


def copy_escape(value: str) -> str:
    """Escape a field for COPY ... FROM STDIN (text format)."""
    return (
        value.replace("\\", "\\\\")
        .replace("\t", "\\t")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )


# Category a puzzle is filed under in the UI. First match wins, so mate
# puzzles are never miscategorised as generic tactics.
CATEGORY_PRIORITY = (
    "mateIn1", "mateIn2", "mateIn3",
    "smotheredMate", "backRankMate",
    "fork", "pin", "skewer",
    "discoveredAttack", "doubleCheck", "deflection", "sacrifice", "hangingPiece",
)


def category_of(themes: set[str]) -> str | None:
    for t in CATEGORY_PRIORITY:
        if t in themes:
            return t
    return None


def band_of(rating: int) -> str:
    if rating < 1300:
        return "easy"
    if rating <= 1800:
        return "medium"
    return "hard"


def open_puzzle_csv(path: str):
    """
    Open the Lichess CSV, decompressing .zst transparently.

    Saves needing a `zstd` binary (absent on most Windows installs) or a
    12 GB decompressed file on disk. Python 3.14 ships zstd in the stdlib;
    older versions fall back to the `zstandard` package.
    """
    if not path.endswith(".zst"):
        return open(path, newline="", encoding="utf-8")

    try:
        from compression import zstd  # Python 3.14+

        return io.TextIOWrapper(zstd.ZstdFile(path, "rb"), encoding="utf-8", newline="")
    except ImportError:
        pass

    try:
        import zstandard
    except ImportError:
        sys.exit(
            "Reading .zst needs Python 3.14+ (stdlib) or:  pip install zstandard\n"
            "Alternatively decompress first with the `zstd` CLI and pass the .csv."
        )

    reader = zstandard.ZstdDecompressor().stream_reader(open(path, "rb"))
    return io.TextIOWrapper(reader, encoding="utf-8", newline="")


def rows_from_csv(path: str, limit: int, min_plays: int, min_popularity: int):
    """
    Balanced sample across (category × difficulty band).

    At small import sizes this matters: the CSV is not ordered by theme, and
    rarer categories (mateIn3, smotheredMate) would be crowded out by common
    ones if we simply took the first N matching rows. Per-bucket quotas keep
    every category/difficulty the UI offers actually populated.
    """
    buckets = len(CATEGORY_PRIORITY) * 3
    per_bucket = max(1, limit // buckets)
    counts: dict[tuple[str, str], int] = {}
    kept = 0

    with open_puzzle_csv(path) as fh:
        for row in csv.DictReader(fh):
            if kept >= limit:
                return
            try:
                rating = int(row["Rating"])
                nb_plays = int(row["NbPlays"])
                popularity = int(row["Popularity"])
            except (KeyError, ValueError):
                continue

            # Quality filter — the tail of the dataset is noisy and rarely played.
            if nb_plays < min_plays or popularity < min_popularity:
                continue

            themes = [t for t in row["Themes"].split() if t]
            theme_set = set(themes)
            if not (KEEP_THEMES & theme_set):
                continue

            category = category_of(theme_set)
            if category is None:
                continue
            key = (category, band_of(rating))
            if counts.get(key, 0) >= per_bucket:
                continue

            moves = [m for m in row["Moves"].split() if m]
            # Need at least the opponent's move plus one student move.
            if len(moves) < 2:
                continue

            counts[key] = counts.get(key, 0) + 1
            kept += 1
            yield (
                row["PuzzleId"],
                row["FEN"],
                pg_array(moves),
                str(rating),
                row.get("RatingDeviation") or "\\N",
                str(popularity),
                str(nb_plays),
                pg_array(themes),
                row.get("GameUrl") or "\\N",
                pg_array([t for t in (row.get("OpeningTags") or "").split() if t]),
            )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv_path",
                    help="lichess_db_puzzle.csv or .csv.zst (decompressed on the fly)")
    ap.add_argument("--limit", type=int, default=20_000,
                    help="max puzzles to import (default 20000, ~12 MB with "
                         "indexes). Deliberately small: on Supabase's free tier "
                         "the DB is 500 MB, and 20k balanced puzzles is far more "
                         "than students will exhaust. Raise it later if needed.")
    ap.add_argument("--min-plays", type=int, default=200,
                    help="skip rarely-played puzzles (default 200)")
    ap.add_argument("--min-popularity", type=int, default=80,
                    help="skip poorly-rated puzzles, max 100 (default 80)")
    ap.add_argument("--batch", type=int, default=10_000)
    args = ap.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL is not set (Supabase → Settings → Database → URI)")
    if not os.path.exists(args.csv_path):
        sys.exit(f"No such file: {args.csv_path}")

    total = 0
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            # Stage into a temp table so a re-run is idempotent: existing
            # puzzle_ids are skipped rather than erroring out mid-import.
            cur.execute(
                "create temp table _stage (like public.lichess_puzzles "
                "including defaults) on commit drop"
            )

            buf = io.StringIO()
            batch = 0

            def flush() -> None:
                nonlocal buf, batch, total
                if not batch:
                    return
                buf.seek(0)
                with cur.copy(
                    f"copy _stage ({', '.join(COLUMNS)}) from stdin"
                ) as cp:
                    cp.write(buf.read())
                total += batch
                print(f"  staged {total:,}", flush=True)
                buf = io.StringIO()
                batch = 0

            for row in rows_from_csv(
                args.csv_path, args.limit, args.min_plays, args.min_popularity
            ):
                buf.write("\t".join(copy_escape(f) for f in row) + "\n")
                batch += 1
                if batch >= args.batch:
                    flush()
            flush()

            cur.execute(
                f"insert into public.lichess_puzzles ({', '.join(COLUMNS)}) "
                f"select {', '.join(COLUMNS)} from _stage "
                "on conflict (puzzle_id) do nothing"
            )
            inserted = cur.rowcount
            conn.commit()

    print(f"\nStaged {total:,} rows, inserted {inserted:,} new puzzles.")
    print("Verify:  select count(*), min(rating), max(rating) from lichess_puzzles;")


if __name__ == "__main__":
    main()
