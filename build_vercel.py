"""Build the curated data and analytics artifacts for the FastAPI service."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(*command: str, cwd: Path = ROOT) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def main() -> None:
    run(sys.executable, str(ROOT / "day-01-data-engineering" / "src" / "validation.py"))
    run(
        sys.executable,
        str(ROOT / "day-02-supervisory-analytics" / "src" / "analytics.py"),
    )


if __name__ == "__main__":
    main()
