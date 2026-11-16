"""The Day 2 input: the Day 1 curated layer, read as a contract.

Day 2 reads what Day 1 published:

* ``valid_records.csv`` and ``review_records.csv`` — the curated layer;
* ``data_quality_audit.csv`` — the findings that explain those records;
* ``institutions_registry.csv`` and ``reporting_calendar.csv`` — reference
  data, which is part of the architecture and not an optional extra.

The submitted file is never read here. A rejected record is not in the
curated layer and is not an input to a supervisory indicator. It is not
missing data: it is data that failed its contract, and the audit trail is
where it lives.

The loader is strict about the shape of the input and loose about its
content, in the same way the Day 1 loader is. A missing column is a contract
break and stops the run. A value that cannot be read is left missing rather
than repaired, and the indicator that depends on it comes out as null.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from day2_paths import (
    DAY1_PROCESSED_DIR,
    DAY1_REFERENCE_DIR,
    DAY1_REPORTS_DIR,
)

#: The columns the curated layer must carry. ``validation_status`` is always
#: ``valid`` or ``review``; a rejected record never reaches this layer.
CURATED_COLUMNS: tuple[str, ...] = (
    "source_row_number",
    "institution_id",
    "institution_name",
    "reporting_date",
    "total_deposits",
    "total_loans",
    "reporting_period",
    "validation_status",
)

#: The columns the audit trail must carry.
AUDIT_COLUMNS: tuple[str, ...] = (
    "run_id",
    "source_row_number",
    "institution_id",
    "reporting_period",
    "rule_id",
    "rule_name",
    "severity",
    "outcome",
    "observed_value",
    "detail",
)

#: The columns the institution register must carry.
REGISTRY_COLUMNS: tuple[str, ...] = (
    "institution_id",
    "institution_name",
    "institution_type",
    "licence_status",
    "region",
    "reporting_frequency",
    "watchlist_flag",
)

#: The columns the reporting calendar must carry.
CALENDAR_COLUMNS: tuple[str, ...] = (
    "reporting_period",
    "period_start",
    "period_end",
    "submission_due_date",
    "status",
)

#: The month a quarterly filer reports in.
QUARTER_END_MONTHS = (3, 6, 9, 12)


@dataclass
class CuratedLayer:
    """The Day 1 curated layer, ready for supervisory analytics."""

    records: pd.DataFrame
    audit: pd.DataFrame
    registry: pd.DataFrame
    calendar: pd.DataFrame
    run_id: str
    source_files: dict[str, Path] = field(default_factory=dict)

    @property
    def periods(self) -> list[str]:
        """The reporting periods present in the curated layer."""
        return sorted(set(self.records["reporting_period"].dropna()))

    @property
    def watchlist_ids(self) -> set[str]:
        """The institutions on the enhanced monitoring list."""
        flags = self.registry["watchlist_flag"].astype("string").str.strip().str.lower()
        return set(self.registry.loc[flags.eq("true"), "institution_id"])

    @property
    def reporting_institutions(self) -> set[str]:
        """The institutions that reached the curated layer."""
        return set(self.records["institution_id"].dropna())

    def expected_reporters(self, reporting_period: str) -> set[str]:
        """Return the institutions expected to file for one reporting period."""
        return expected_reporters(self.registry, reporting_period)

    def period_records(self, reporting_period: str) -> pd.DataFrame:
        """Return the curated records of one reporting period."""
        return self.records.loc[
            self.records["reporting_period"] == reporting_period
        ]


def expected_reporters(registry: pd.DataFrame, reporting_period: str) -> set[str]:
    """Return the institutions expected to file for one reporting period.

    A monthly filer reports every month. A quarterly filer reports at the
    end of a quarter, so it is expected in March, June, September and
    December only. The register carries the cadence, which is why the
    register is part of the architecture.
    """
    month = _period_month(reporting_period)
    frequency = (
        registry["reporting_frequency"].astype("string").str.strip().str.lower()
    )
    monthly = set(registry.loc[frequency.eq("monthly"), "institution_id"])
    quarterly = set(registry.loc[frequency.eq("quarterly"), "institution_id"])
    if month in QUARTER_END_MONTHS:
        return monthly | quarterly
    return monthly


def _period_month(reporting_period: str) -> int | None:
    """Return the month number of a YYYY-MM period, or None if it is unusable."""
    try:
        year, month = str(reporting_period).split("-")
        return int(month)
    except (AttributeError, ValueError):
        return None


def check_columns(frame: pd.DataFrame, required: tuple[str, ...], label: str) -> None:
    """Raise a clear error when an input does not honour the contract."""
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError(
            f"{label} is missing required column(s): {', '.join(missing)}. "
            f"Expected columns: {', '.join(required)}. "
            f"Found: {', '.join(frame.columns)}."
        )


def load_curated_layer(
    records: pd.DataFrame,
    audit: pd.DataFrame,
    registry: pd.DataFrame,
    calendar: pd.DataFrame,
    run_id: str,
) -> CuratedLayer:
    """Validate the four inputs and return them as one curated layer."""
    check_columns(records, CURATED_COLUMNS, "the curated records")
    check_columns(audit, AUDIT_COLUMNS, "the audit trail")
    check_columns(registry, REGISTRY_COLUMNS, "the institution register")
    check_columns(calendar, CALENDAR_COLUMNS, "the reporting calendar")

    curated_records = records.copy()
    curated_records["source_row_number"] = curated_records[
        "source_row_number"
    ].astype("int64")
    curated_records["institution_id"] = curated_records["institution_id"].astype(
        "string"
    )
    curated_records["institution_name"] = curated_records["institution_name"].astype(
        "string"
    )
    curated_records["reporting_period"] = curated_records["reporting_period"].astype(
        "string"
    )
    curated_records["reporting_date"] = curated_records["reporting_date"].astype(
        "string"
    )
    curated_records["total_deposits"] = pd.to_numeric(
        curated_records["total_deposits"], errors="coerce"
    )
    curated_records["total_loans"] = pd.to_numeric(
        curated_records["total_loans"], errors="coerce"
    )
    curated_records["validation_status"] = curated_records[
        "validation_status"
    ].astype("string")

    curated_audit = audit.copy()
    curated_audit["source_row_number"] = curated_audit["source_row_number"].astype(
        "int64"
    )
    curated_audit["rule_id"] = curated_audit["rule_id"].astype("string")
    curated_audit["rule_name"] = curated_audit["rule_name"].astype("string")
    curated_audit["severity"] = curated_audit["severity"].astype("string")

    curated_registry = registry.copy()
    curated_registry["institution_id"] = curated_registry["institution_id"].astype(
        "string"
    )
    curated_registry["reporting_frequency"] = curated_registry[
        "reporting_frequency"
    ].astype("string")
    curated_registry["watchlist_flag"] = curated_registry["watchlist_flag"].astype(
        "string"
    )

    curated_calendar = calendar.copy()
    curated_calendar["reporting_period"] = curated_calendar[
        "reporting_period"
    ].astype("string")
    curated_calendar["status"] = curated_calendar["status"].astype("string")

    return CuratedLayer(
        records=curated_records,
        audit=curated_audit,
        registry=curated_registry,
        calendar=curated_calendar,
        run_id=run_id,
    )


def _read_csv(path: Path) -> pd.DataFrame:
    """Read a Day 1 artefact as text, without repairing anything."""
    if not path.exists():
        raise FileNotFoundError(
            f"Day 1 artefact not found: {path}. Run the Day 1 pipeline first: "
            "python day-01-data-engineering/src/validation.py"
        )
    frame = pd.read_csv(path, dtype="string", keep_default_na=True)
    frame.columns = [str(column).strip().lower() for column in frame.columns]
    return frame


def load_curated_from_disk(
    processed_dir: str | Path = DAY1_PROCESSED_DIR,
    reports_dir: str | Path = DAY1_REPORTS_DIR,
    reference_dir: str | Path = DAY1_REFERENCE_DIR,
) -> CuratedLayer:
    """Read the published Day 1 artefacts and return the curated layer."""
    processed_dir = Path(processed_dir)
    reports_dir = Path(reports_dir)
    reference_dir = Path(reference_dir)

    valid = _read_csv(processed_dir / "valid_records.csv")
    review = _read_csv(processed_dir / "review_records.csv")
    records = pd.concat([valid, review], ignore_index=True)

    audit = _read_csv(reports_dir / "data_quality_audit.csv")
    registry = _read_csv(reference_dir / "institutions_registry.csv")
    calendar = _read_csv(reference_dir / "reporting_calendar.csv")

    run_id = _run_id_from_manifest(reports_dir / "run_manifest.json")

    layer = load_curated_layer(records, audit, registry, calendar, run_id)
    layer.source_files = {
        "valid_records": processed_dir / "valid_records.csv",
        "review_records": processed_dir / "review_records.csv",
        "data_quality_audit": reports_dir / "data_quality_audit.csv",
        "institutions_registry": reference_dir / "institutions_registry.csv",
        "reporting_calendar": reference_dir / "reporting_calendar.csv",
    }
    return layer


def _run_id_from_manifest(manifest_path: Path) -> str:
    """Read the run identifier out of the Day 1 run manifest."""
    if not manifest_path.exists():
        return ""
    try:
        payload: dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return ""
    return str(payload.get("run_id", ""))


def run_day1_and_load(
    processed_dir: str | Path = DAY1_PROCESSED_DIR,
    reports_dir: str | Path = DAY1_REPORTS_DIR,
) -> CuratedLayer:
    """Run the Day 1 pipeline, publish its artefacts and read them back.

    This is the path the API and the notebook use when the Day 1 artefacts
    are not on disk yet. Day 2 never re-implements Day 1: it runs the Day 1
    pipeline and then reads what the pipeline published.
    """
    from day1_bridge import day1_validation

    result = day1_validation.run_pipeline()
    day1_validation.write_outputs(result, Path(processed_dir), Path(reports_dir))
    return load_curated_from_disk(processed_dir, reports_dir)
