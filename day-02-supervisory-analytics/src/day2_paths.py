"""File locations for the Day 2 workspace.

Day 1 keeps its paths in `day-01-data-engineering/src/schema.py`. Day 2 keeps
its own here, and points back at the Day 1 folders it consumes.
"""

from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BASE_DIR.parent

DAY2_ROOT = BASE_DIR
DATASETS_DIR = BASE_DIR / "datasets"
REFERENCE_DIR = DATASETS_DIR / "reference"
PROCESSED_DIR = DATASETS_DIR / "processed"
REPORTS_DIR = BASE_DIR / "reports"
NOTEBOOKS_DIR = BASE_DIR / "notebooks"

DAY1_ROOT = REPO_ROOT / "day-01-data-engineering"
DAY1_SRC_DIR = DAY1_ROOT / "src"
DAY1_RAW_DIR = DAY1_ROOT / "datasets" / "raw"
DAY1_PROCESSED_DIR = DAY1_ROOT / "datasets" / "processed"
DAY1_REPORTS_DIR = DAY1_ROOT / "reports"
DAY1_REFERENCE_DIR = DAY1_ROOT / "datasets" / "reference"

INDICATOR_CATALOG_FILENAME = "indicator_catalog.csv"
THRESHOLD_CATALOG_FILENAME = "threshold_catalog.csv"

INDICATOR_VALUES_FILENAME = "indicator_values.csv"
EXCEPTIONS_FILENAME = "exceptions.csv"
EXCEPTION_LINKS_FILENAME = "exception_audit_links.csv"

SECTOR_SUMMARY_FILENAME = "sector_summary.csv"
EXCEPTION_SUMMARY_FILENAME = "exception_summary.csv"
ANALYTICS_MANIFEST_FILENAME = "analytics_manifest.json"
