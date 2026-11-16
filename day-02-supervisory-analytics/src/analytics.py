"""The Day 2 analytics run: curated records in, indicators and exceptions out.

This module is the Day 2 equivalent of the Day 1 pipeline. It does three
things and nothing else:

1. compute the declared indicators over the curated layer;
2. evaluate the declared thresholds against those indicators;
3. report the run.

It does not decide what a good number is. The thresholds are declared in
``catalogs.py``, so a supervisor can argue with the limits without reading a
line of this file.

The run is reproducible. The same curated layer always produces the same
indicators, the same exceptions and the same links, and the manifest records
the hash of every input that went in.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from catalogs import INDICATORS, THRESHOLDS, severity_rank
from curated import CuratedLayer, load_curated_from_disk
from day2_paths import (
    ANALYTICS_MANIFEST_FILENAME,
    EXCEPTION_LINKS_FILENAME,
    EXCEPTION_SUMMARY_FILENAME,
    EXCEPTIONS_FILENAME,
    INDICATOR_VALUES_FILENAME,
    PROCESSED_DIR,
    REPORTS_DIR,
    SECTOR_SUMMARY_FILENAME,
)
from exceptions import evaluate_thresholds
from indicators import compute_indicators


@dataclass
class AnalyticsResult:
    """Everything the Day 2 analytics run produced."""

    run_id: str
    indicators: pd.DataFrame
    exceptions: pd.DataFrame
    links: pd.DataFrame
    sector_summary: pd.DataFrame
    exception_summary: pd.DataFrame
    manifest: dict[str, Any] = field(default_factory=dict)

    def indicator_value(
        self,
        indicator_id: str,
        reporting_period: str,
        subject_id: str | None = None,
    ) -> float | None:
        """Return one indicator value, or None when it is not there."""
        match = self.indicators.loc[
            (self.indicators["indicator_id"] == indicator_id)
            & (self.indicators["reporting_period"] == reporting_period)
        ]
        if subject_id is not None:
            match = match.loc[match["subject_id"] == subject_id]
        if not len(match):
            return None
        value = match.iloc[0]["indicator_value"]
        if value is None or pd.isna(value):
            return None
        return float(value)

    def exception(self, exception_id: str) -> pd.DataFrame:
        """Return the exception rows with one identifier."""
        return self.exceptions.loc[
            self.exceptions["exception_id"] == exception_id
        ]

    def count(self, name: str) -> int:
        """Return a count from the manifest."""
        return int(self.manifest.get(name, 0))


def run_analytics(curated: CuratedLayer) -> AnalyticsResult:
    """Compute the indicators, evaluate the thresholds and report the run."""
    started_at = datetime.now(timezone.utc)

    indicators = compute_indicators(curated)
    exceptions, links = evaluate_thresholds(indicators, curated)

    sector_summary = _sector_summary(curated, indicators, exceptions)
    exception_summary = _exception_summary(exceptions)

    manifest = {
        "run_id": curated.run_id,
        "started_at_utc": started_at.isoformat(),
        "finished_at_utc": datetime.now(timezone.utc).isoformat(),
        "curated_records": int(len(curated.records)),
        "reporting_periods": len(curated.periods),
        "indicator_values": int(len(indicators)),
        "indicators_evaluated": len(INDICATORS),
        "exceptions": int(len(exceptions)),
        "thresholds_evaluated": len(THRESHOLDS),
        "exception_audit_links": int(len(links)),
        "input_sha256": _input_hashes(curated),
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}",
        "pandas_version": pd.__version__,
    }

    return AnalyticsResult(
        run_id=curated.run_id,
        indicators=indicators,
        exceptions=exceptions,
        links=links,
        sector_summary=sector_summary,
        exception_summary=exception_summary,
        manifest=manifest,
    )


def _input_hashes(curated: CuratedLayer) -> dict[str, str]:
    """Hash every input file the run read."""
    from day1_bridge import day1_ingestion

    hashes: dict[str, str] = {}
    for label, path in sorted(curated.source_files.items()):
        if Path(path).exists():
            hashes[label] = day1_ingestion.sha256_of(path)
    return hashes


def _sector_summary(
    curated: CuratedLayer,
    indicators: pd.DataFrame,
    exceptions: pd.DataFrame,
) -> pd.DataFrame:
    """Build one row per reporting period, for the dashboard summary."""
    rows: list[dict[str, Any]] = []
    for reporting_period in curated.periods:
        period_records = curated.period_records(reporting_period)
        expected = curated.expected_reporters(reporting_period)
        reporting = set(period_records["institution_id"].dropna())
        period_exceptions = exceptions.loc[
            exceptions["reporting_period"] == reporting_period
        ]
        severities = (
            period_exceptions["severity"].value_counts().to_dict()
            if len(period_exceptions)
            else {}
        )
        rows.append(
            {
                "run_id": curated.run_id,
                "reporting_period": reporting_period,
                "institutions_reporting": len(reporting),
                "institutions_expected": len(expected),
                "institutions_missing": len(expected - reporting),
                "sector_total_deposits": _value(
                    indicators, "IND-007", reporting_period
                ),
                "sector_total_loans": _value(indicators, "IND-008", reporting_period),
                "sector_loan_to_deposit_ratio": _value(
                    indicators, "IND-009", reporting_period
                ),
                "sector_deposit_concentration_hhi": _value(
                    indicators, "IND-010", reporting_period
                ),
                "sector_watchlist_exposure_count": _value(
                    indicators, "IND-011", reporting_period
                ),
                "sector_reporting_coverage_ratio": _value(
                    indicators, "IND-012", reporting_period
                ),
                "exceptions": int(len(period_exceptions)),
                "critical_exceptions": int(severities.get("CRITICAL", 0)),
                "high_exceptions": int(severities.get("HIGH", 0)),
                "medium_exceptions": int(severities.get("MEDIUM", 0)),
                "low_exceptions": int(severities.get("LOW", 0)),
            }
        )
    return pd.DataFrame(rows)


def _value(indicators: pd.DataFrame, indicator_id: str, reporting_period: str):
    """Return one indicator value from the indicator table."""
    match = indicators.loc[
        (indicators["indicator_id"] == indicator_id)
        & (indicators["reporting_period"] == reporting_period)
    ]
    if not len(match):
        return None
    value = match.iloc[0]["indicator_value"]
    if value is None or pd.isna(value):
        return None
    return float(value)


def _exception_summary(exceptions: pd.DataFrame) -> pd.DataFrame:
    """Count the exceptions by severity and by threshold."""
    rows: list[dict[str, Any]] = []
    for severity in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
        matching = exceptions.loc[exceptions["severity"] == severity]
        rows.append(
            {
                "severity": severity,
                "severity_rank": severity_rank(severity),
                "exceptions": int(len(matching)),
                "institutions": int(
                    matching["institution_id"].dropna().nunique()
                ),
                "periods": int(matching["reporting_period"].nunique()),
            }
        )
    return pd.DataFrame(rows).drop(columns=["severity_rank"])


def write_outputs(
    result: AnalyticsResult,
    output_dir: Path = PROCESSED_DIR,
    report_dir: Path = REPORTS_DIR,
) -> dict[str, Path]:
    """Write every artefact of the analytics run and return the paths."""
    output_dir = Path(output_dir)
    report_dir = Path(report_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    paths = {
        "indicators": output_dir / INDICATOR_VALUES_FILENAME,
        "exceptions": output_dir / EXCEPTIONS_FILENAME,
        "links": output_dir / EXCEPTION_LINKS_FILENAME,
        "sector_summary": report_dir / SECTOR_SUMMARY_FILENAME,
        "exception_summary": report_dir / EXCEPTION_SUMMARY_FILENAME,
        "manifest": report_dir / ANALYTICS_MANIFEST_FILENAME,
    }

    result.indicators.to_csv(paths["indicators"], index=False)
    result.exceptions.to_csv(paths["exceptions"], index=False)
    result.links.to_csv(paths["links"], index=False)
    result.sector_summary.to_csv(paths["sector_summary"], index=False)
    result.exception_summary.to_csv(paths["exception_summary"], index=False)
    paths["manifest"].write_text(
        json.dumps(result.manifest, indent=2) + "\n", encoding="utf-8"
    )
    return paths


def run_and_write(
    curated: CuratedLayer | None = None,
    output_dir: Path = PROCESSED_DIR,
    report_dir: Path = REPORTS_DIR,
) -> AnalyticsResult:
    """Run the analytics over the Day 1 curated layer and publish the result."""
    layer = curated if curated is not None else load_curated_from_disk()
    result = run_analytics(layer)
    write_outputs(result, output_dir, report_dir)
    return result


if __name__ == "__main__":
    outcome = run_and_write()
    print("SECTOR SUMMARY")
    print(outcome.sector_summary.to_string(index=False))
    print()
    print("EXCEPTIONS")
    print(
        outcome.exceptions[
            [
                "exception_id",
                "reporting_period",
                "subject_id",
                "indicator_id",
                "severity",
                "observed_value_text",
            ]
        ].to_string(index=False)
    )
    print()
    print("EXCEPTION SUMMARY")
    print(outcome.exception_summary.to_string(index=False))
