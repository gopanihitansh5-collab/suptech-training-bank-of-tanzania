"""Build the curated data and frontend assets for Vercel."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DASHBOARD = ROOT / "day-03-react-realtime" / "dashboard"


def run(*command: str, cwd: Path = ROOT) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def main() -> None:
    run(sys.executable, str(ROOT / "day-01-data-engineering" / "src" / "validation.py"))
    run(
        sys.executable,
        str(ROOT / "day-02-supervisory-analytics" / "src" / "analytics.py"),
    )
    npm = "npm.cmd" if os.name == "nt" else "npm"
    run(npm, "ci", cwd=DASHBOARD)
    run(npm, "run", "build", cwd=DASHBOARD)


if __name__ == "__main__":
    main()
