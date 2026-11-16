"""Shared test configuration for the SupTech prototype."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
DAY1_ROOT = REPO_ROOT / "day-01-data-engineering"
SRC_ROOT = DAY1_ROOT / "src"
DAY2_ROOT = REPO_ROOT / "day-02-supervisory-analytics"
DAY2_SRC_ROOT = DAY2_ROOT / "src"

# The Day 1 modules are plain scripts rather than a package, so the source
# folder is placed on the import path for the tests.
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

# The Day 2 modules follow the same convention and use their own module
# names, so both folders can live on the import path at the same time.
if str(DAY2_SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(DAY2_SRC_ROOT))


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture(scope="session")
def pipeline_result():
    """Run the shipped dataset through the pipeline once for the whole test run."""
    from validation import run_pipeline

    return run_pipeline()


@pytest.fixture(scope="session")
def curated_layer(pipeline_result):
    """Build the Day 1 curated layer in memory, the way Day 2 consumes it."""
    import pandas as pd

    from curated import load_curated_layer
    from day1_bridge import day1_ingestion
    from schema import CALENDAR_COLUMNS, CALENDAR_FILE
    from schema import INSTITUTION_COLUMNS, INSTITUTIONS_FILE

    registry = day1_ingestion.load_reference_table(
        INSTITUTIONS_FILE,
        tuple(column.name for column in INSTITUTION_COLUMNS),
    )
    calendar = day1_ingestion.load_reference_table(
        CALENDAR_FILE,
        tuple(column.name for column in CALENDAR_COLUMNS),
    )
    records = pd.concat(
        [pipeline_result.valid, pipeline_result.review], ignore_index=True
    )
    return load_curated_layer(
        records,
        pipeline_result.audit,
        registry,
        calendar,
        pipeline_result.run_id,
    )


@pytest.fixture(scope="session")
def curated_layer_from_disk(tmp_path_factory, pipeline_result):
    """Publish the Day 1 artefacts and read them back the way Day 2 does."""
    from validation import write_outputs

    from curated import load_curated_from_disk

    processed = tmp_path_factory.mktemp("day1-processed")
    reports = tmp_path_factory.mktemp("day1-reports")
    write_outputs(pipeline_result, processed, reports)
    return load_curated_from_disk(
        processed,
        reports,
        REPO_ROOT / "day-01-data-engineering" / "datasets" / "reference",
    )


@pytest.fixture(scope="session")
def analytics_result(curated_layer):
    """Run the Day 2 analytics over the curated layer, once for the test run."""
    from analytics import run_analytics

    return run_analytics(curated_layer)
