"""Loading and raw-data preservation for the Day 1 SupTech pipeline.

The loader is deliberately strict about the shape of the file and deliberately
loose about the content: bad values are carried into the pipeline untouched so
that the validation rules, not the loader, decide what is rejected and why.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pandas as pd

from schema import RAW_VALUE_COLUMNS

#: Columns that must be present in the source file. A missing column is a
#: contract break and stops the run, because no rule can be evaluated against
#: a field that does not exist.
REQUIRED_RAW_COLUMNS: tuple[str, ...] = RAW_VALUE_COLUMNS

#: Columns that must never be inferred into existence. If one of these is
#: absent the file is rejected rather than partially loaded.
IDENTIFIER_COLUMN = "institution_id"


def sha256_of(path: str | Path) -> str:
    """Return the SHA-256 digest of a file, used in the run manifest."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def check_columns(frame: pd.DataFrame, required: tuple[str, ...], path: Path) -> None:
    """Raise a clear error when the source file does not honour the contract."""
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError(
            f"{path} is missing required column(s): {', '.join(missing)}. "
            f"Expected columns: {', '.join(required)}. "
            f"Found: {', '.join(frame.columns)}."
        )


def load_csv(file_path: str | Path) -> pd.DataFrame:
    """Load the source CSV without repairing any value.

    Every column is read as text so that the pipeline sees exactly what was
    submitted. Nothing is parsed, trimmed, filled or coerced here. A
    ``source_row_number`` column is added so that every downstream finding can
    be traced back to a line of the source file.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    frame = pd.read_csv(
        path,
        dtype="string",
        keep_default_na=True,
        na_values=["", "NA", "N/A", "null", "NULL", "None"],
    )
    check_columns(frame, REQUIRED_RAW_COLUMNS, path)

    frame.columns = frame.columns.str.strip().str.lower()
    frame.insert(0, "source_row_number", range(1, len(frame) + 1))
    frame.insert(1, "source_file", path.name)
    return frame


def load_reference_table(file_path: str | Path, required: tuple[str, ...]) -> pd.DataFrame:
    """Load a reference table used to validate submitted records."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Reference data not found: {path}")

    frame = pd.read_csv(path, dtype="string", keep_default_na=True)
    frame.columns = frame.columns.str.strip().str.lower()
    check_columns(frame, required, path)
    return frame


def describe(frame: pd.DataFrame) -> str:
    """Return a short human-readable description of a loaded frame."""
    return (
        f"{len(frame)} records, {len(frame.columns)} columns: "
        f"{', '.join(frame.columns)}"
    )


if __name__ == "__main__":
    from schema import RAW_FILE

    loaded = load_csv(RAW_FILE)
    print(describe(loaded))
    print()
    print(loaded.head())
