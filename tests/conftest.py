"""Shared test configuration for the SupTech prototype."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
DAY1_ROOT = REPO_ROOT / "day-01-data-engineering"
SRC_ROOT = DAY1_ROOT / "src"

# The Day 1 modules are plain scripts rather than a package, so the source
# folder is placed on the import path for the tests.
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture(scope="session")
def pipeline_result():
    """Run the shipped dataset through the pipeline once for the whole test run."""
    from validation import run_pipeline

    return run_pipeline()
