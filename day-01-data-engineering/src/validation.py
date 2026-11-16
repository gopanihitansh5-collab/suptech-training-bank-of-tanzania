"""Day 1 SupTech pipeline: ingest, validate and partition supervisory reports.

What this module teaches, in code:

* **The raw input is immutable.** Every coercion is applied to a working copy
  and the original submitted strings are preserved in ``raw_*`` columns, so a
  rejected record can always be explained from the evidence.
* **Validation is rule driven.** Every rule lives in :mod:`rules` with an
  identifier, a severity and a reason. Every finding is written to an audit
  trail, one row per rule evaluation.
* **Rejecting and flagging are different decisions.** A ``BLOCK`` finding
  removes a record from the curated dataset. A ``WARN`` finding keeps the
  record and queues it for supervisory review.
* **Nothing depends on the wall clock.** The same input file always produces
  the same output, which is what makes a pipeline auditable.

This is training material. The rules are illustrative and are not official
regulatory reporting requirements.
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd

from ingestion import load_csv, load_reference_table, sha256_of
from rules import BLOCK, RULES, RULES_BY_ID, RULES_BY_NAME, WARN
from schema import (
    CALENDAR_COLUMNS,
    CALENDAR_FILE,
    INSTITUTION_COLUMNS,
    INSTITUTIONS_FILE,
    PROCESSED_DIR,
    RAW_FILE,
    RAW_VALUE_COLUMNS,
    REPORTS_DIR,
)

BASE = Path(__file__).resolve().parents[1]

CURATED_COLUMNS: tuple[str, ...] = RAW_VALUE_COLUMNS
CURATED_OUTPUT_COLUMNS: tuple[str, ...] = (
    "source_row_number",
    *CURATED_COLUMNS,
    "validation_status",
)
RAW_PRESERVATION_COLUMNS: tuple[str, ...] = tuple(
    f"raw_{column}" for column in RAW_VALUE_COLUMNS
)

INSTITUTION_ID_PATTERN = r"TZ\d{3}"
REPORTING_PERIOD_PATTERN = r"\d{4}-\d{2}"
QUARTER_END_MONTHS = (3, 6, 9, 12)

#: Columns whose value has to survive parsing for the record to be usable.
PARSED_COLUMNS = ("total_deposits", "total_loans", "reporting_date", "reporting_period")


@dataclass(frozen=True)
class Thresholds:
    """Tunable thresholds, kept in one place so the workshop can discuss them."""

    max_total_deposits: float = 1.0e14
    max_total_loans: float = 1.0e14
    max_loan_to_deposit_ratio: float = 3.0


DEFAULT_THRESHOLDS = Thresholds()


@dataclass
class PipelineResult:
    """Everything the pipeline produced, for inspection and for the tests."""

    run_id: str
    valid: pd.DataFrame
    review: pd.DataFrame
    rejected: pd.DataFrame
    duplicates: pd.DataFrame
    audit: pd.DataFrame
    summary: pd.DataFrame
    rule_breaches: pd.DataFrame
    manifest: dict[str, Any] = field(default_factory=dict)

    def count(self, name: str) -> int:
        matches = self.summary.loc[self.summary["metric"] == name, "value"]
        return int(matches.iloc[0])


def _clean_scalar(value: Any) -> Any:
    """Return None for missing values so they serialise as empty, not 'NaN'."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _format_amount(series: pd.Series) -> pd.Series:
    """Present whole amounts as integers and leave fractional amounts as is."""
    if series.dropna().mod(1).eq(0).all():
        return series.round(0).astype("Int64")
    return series.round(2)


def _parse_dates(series: pd.Series) -> pd.Series:
    """Parse ISO 8601 dates, returning NaT for anything unparseable."""
    try:
        return pd.to_datetime(series, format="ISO8601", errors="coerce")
    except (TypeError, ValueError):
        return pd.to_datetime(series, errors="coerce")


def _parse_periods(series: pd.Series) -> pd.Series:
    """Parse YYYY-MM reporting periods, returning NaT for anything invalid."""
    return pd.to_datetime(series, format="%Y-%m", errors="coerce")


def _is_blank(series: pd.Series) -> pd.Series:
    """True where a column is missing or contains only whitespace."""
    return series.isna() | series.fillna("").str.strip().eq("")


def _is_present(series: pd.Series) -> pd.Series:
    """True where a column holds something other than missing or whitespace."""
    return ~_is_blank(series)


def run_pipeline(
    input_path: str | Path = RAW_FILE,
    institutions_path: str | Path = INSTITUTIONS_FILE,
    calendar_path: str | Path = CALENDAR_FILE,
    thresholds: Thresholds = DEFAULT_THRESHOLDS,
    run_id: str | None = None,
) -> PipelineResult:
    """Run the full Day 1 pipeline and return every artefact it produced."""
    input_path = Path(input_path)
    institutions_path = Path(institutions_path)
    calendar_path = Path(calendar_path)

    started_at = datetime.now(timezone.utc)
    run_id = run_id or str(uuid4())

    raw = load_csv(input_path)
    institutions = load_reference_table(
        institutions_path,
        tuple(column.name for column in INSTITUTION_COLUMNS),
    )
    calendar = load_reference_table(
        calendar_path,
        tuple(column.name for column in CALENDAR_COLUMNS),
    )
    records_received = len(raw)

    registry = institutions.set_index("institution_id")
    known_institutions = set(registry.index)
    watchlist = {
        identifier
        for identifier, flag in registry["watchlist_flag"].items()
        if str(flag).strip().lower() == "true"
    }
    quarterly_institutions = {
        identifier
        for identifier, frequency in registry["reporting_frequency"].items()
        if str(frequency).strip().lower() == "quarterly"
    }

    periods = calendar.set_index("reporting_period")
    period_start = pd.to_datetime(periods["period_start"], errors="coerce")
    period_end = pd.to_datetime(periods["period_end"], errors="coerce")

    audit_rows: list[dict[str, Any]] = []

    # ------------------------------------------------------------------
    # Step 1: separate exact duplicates before any other rule runs.
    # ------------------------------------------------------------------
    duplicate_mask = raw.duplicated(subset=list(RAW_VALUE_COLUMNS), keep="first")
    first_row_of_group = raw.groupby(
        list(RAW_VALUE_COLUMNS), dropna=False
    )["source_row_number"].transform("min")

    duplicates = raw.loc[duplicate_mask].copy()
    duplicates["duplicate_of_source_row_number"] = first_row_of_group[duplicate_mask]
    duplicates["validation_status"] = "duplicate"

    for position, row in duplicates.iterrows():
        audit_rows.append(
            {
                "run_id": run_id,
                "source_row_number": int(row["source_row_number"]),
                "institution_id": _clean_scalar(row["institution_id"]),
                "reporting_period": _clean_scalar(row["reporting_period"]),
                "rule_id": "R013",
                "rule_name": RULES_BY_ID["R013"].name,
                "severity": BLOCK,
                "outcome": "rejected",
                "observed_value": _clean_scalar(row["institution_id"]),
                "detail": (
                    "exact duplicate of source row "
                    f"{int(first_row_of_group[position])}"
                ),
            }
        )

    working = raw.loc[~duplicate_mask].reset_index(drop=True)

    # Preserve every submitted value before anything is parsed.
    for column in RAW_VALUE_COLUMNS:
        working[f"raw_{column}"] = working[column]

    reasons: list[list[str]] = [[] for _ in range(len(working))]

    def record(
        rule_id: str,
        mask: pd.Series,
        detail: str,
        observed: pd.Series | None = None,
    ) -> None:
        """Register a rule finding for every row the mask selects."""
        rule = RULES_BY_ID[rule_id]
        hits = mask.fillna(False).astype(bool)
        for position in working.index[hits]:
            reasons[position].append(rule.name)
            audit_rows.append(
                {
                    "run_id": run_id,
                    "source_row_number": int(working.at[position, "source_row_number"]),
                    "institution_id": _clean_scalar(
                        working.at[position, "raw_institution_id"]
                    ),
                    "reporting_period": _clean_scalar(
                        working.at[position, "raw_reporting_period"]
                    ),
                    "rule_id": rule.rule_id,
                    "rule_name": rule.name,
                    "severity": rule.severity,
                    "outcome": "rejected" if rule.is_blocking else "review",
                    "observed_value": (
                        _clean_scalar(observed.at[position])
                        if observed is not None
                        else None
                    ),
                    "detail": detail,
                }
            )

    # ------------------------------------------------------------------
    # Step 2: parse the working copy. Nothing is repaired in place.
    # ------------------------------------------------------------------
    parsed_date = _parse_dates(working["reporting_date"])
    parsed_period = _parse_periods(working["reporting_period"])
    numeric_deposits = pd.to_numeric(working["total_deposits"], errors="coerce")
    numeric_loans = pd.to_numeric(working["total_loans"], errors="coerce")

    working["reporting_date"] = parsed_date
    working["reporting_period"] = parsed_period
    working["total_deposits"] = numeric_deposits
    working["total_loans"] = numeric_loans

    # ------------------------------------------------------------------
    # Step 3: required fields. A value that was submitted but cannot be
    # read is also missing, and both facts are recorded.
    # ------------------------------------------------------------------
    for column in RAW_VALUE_COLUMNS:
        blank = _is_blank(working[f"raw_{column}"])
        if column in PARSED_COLUMNS:
            blank = blank | working[column].isna()
        record(
            "R001",
            blank,
            f"{column} is missing, blank or unreadable after parsing",
            observed=working[f"raw_{column}"],
        )

    # ------------------------------------------------------------------
    # Step 4: identifier checks.
    # ------------------------------------------------------------------
    id_present = _is_present(working["raw_institution_id"])
    id_format_ok = working["raw_institution_id"].str.fullmatch(
        INSTITUTION_ID_PATTERN, na=False
    )
    record(
        "R002",
        id_present & ~id_format_ok,
        f"institution_id does not match {INSTITUTION_ID_PATTERN}",
        observed=working["raw_institution_id"],
    )
    record(
        "R003",
        id_present & ~working["raw_institution_id"].isin(known_institutions),
        "institution_id is not in the supervised institution register",
        observed=working["raw_institution_id"],
    )

    # ------------------------------------------------------------------
    # Step 5: dates, periods and the calendar.
    # ------------------------------------------------------------------
    date_present = _is_present(working["raw_reporting_date"])
    date_parsed = parsed_date.notna()
    record(
        "R004",
        date_present & ~date_parsed,
        "reporting_date is not a valid ISO 8601 calendar date",
        observed=working["raw_reporting_date"],
    )

    period_present = _is_present(working["raw_reporting_period"])
    # The pattern check alone is not enough: "2026-13" matches \d{4}-\d{2} but
    # is not a month. A period only counts as well formed if it also parses.
    period_format_ok = working["raw_reporting_period"].str.fullmatch(
        REPORTING_PERIOD_PATTERN, na=False
    ) & parsed_period.notna()
    record(
        "R006",
        period_present & ~period_format_ok,
        f"reporting_period does not match {REPORTING_PERIOD_PATTERN}",
        observed=working["raw_reporting_period"],
    )

    period_known = (
        period_present
        & period_format_ok
        & working["raw_reporting_period"].isin(periods.index)
    )
    record(
        "R015",
        period_present & period_format_ok & ~period_known,
        "reporting_period is not present in the reporting calendar",
        observed=working["raw_reporting_period"],
    )

    start = working["raw_reporting_period"].map(period_start)
    end = working["raw_reporting_period"].map(period_end)
    outside_period = (
        date_parsed & period_known & ((parsed_date < start) | (parsed_date > end))
    )
    record(
        "R005",
        outside_period,
        "reporting_date falls outside the window of the stated reporting period",
        observed=working["raw_reporting_date"],
    )

    month_mismatch = (
        date_parsed
        & parsed_period.notna()
        & (
            (parsed_date.dt.year != parsed_period.dt.year)
            | (parsed_date.dt.month != parsed_period.dt.month)
        )
    )
    record(
        "R007",
        month_mismatch,
        "reporting_period does not agree with the month of reporting_date",
        observed=working["raw_reporting_period"],
    )

    # ------------------------------------------------------------------
    # Step 6: financial amounts.
    # ------------------------------------------------------------------
    deposits_present = _is_present(working["raw_total_deposits"])
    loans_present = _is_present(working["raw_total_loans"])
    record(
        "R008",
        deposits_present & numeric_deposits.isna(),
        "total_deposits was supplied but cannot be read as a number",
        observed=working["raw_total_deposits"],
    )
    record(
        "R009",
        loans_present & numeric_loans.isna(),
        "total_loans was supplied but cannot be read as a number",
        observed=working["raw_total_loans"],
    )
    record(
        "R010",
        numeric_deposits.lt(0),
        "total_deposits is negative",
        observed=working["raw_total_deposits"],
    )
    record(
        "R011",
        numeric_loans.lt(0),
        "total_loans is negative",
        observed=working["raw_total_loans"],
    )
    implausible = numeric_deposits.gt(thresholds.max_total_deposits) | numeric_loans.gt(
        thresholds.max_total_loans
    )
    record(
        "R012",
        implausible,
        "a financial amount exceeds the configured plausibility ceiling",
        observed=working["raw_total_deposits"],
    )

    # ------------------------------------------------------------------
    # Step 7: resubmissions. A second row for the same institution and
    # period is not an error, but a supervisor has to say which one wins.
    # ------------------------------------------------------------------
    key_columns = ["raw_institution_id", "raw_reporting_period"]
    key_complete = working["raw_institution_id"].notna() & working[
        "raw_reporting_period"
    ].notna()
    key_view = working.loc[key_complete]
    key_duplicates = key_view.duplicated(subset=key_columns, keep="first")
    resubmission_mask = pd.Series(False, index=working.index)
    resubmission_mask.loc[key_view.index[key_duplicates]] = True
    record(
        "R014",
        resubmission_mask,
        "another record was received for the same institution and reporting period",
        observed=working["raw_institution_id"],
    )

    # ------------------------------------------------------------------
    # Step 8: supervisory warnings. Valid records, but worth a look.
    # ------------------------------------------------------------------
    ratio = numeric_loans / numeric_deposits.where(numeric_deposits.ne(0))
    out_of_band = ratio.notna() & ratio.gt(thresholds.max_loan_to_deposit_ratio)
    record(
        "W001",
        out_of_band,
        "loan to deposit ratio is above the expected band "
        f"({thresholds.max_loan_to_deposit_ratio})",
        observed=ratio.round(4),
    )
    record(
        "W002",
        numeric_deposits.eq(0),
        "total_deposits is zero",
        observed=working["raw_total_deposits"],
    )
    record(
        "W003",
        working["raw_institution_id"].isin(watchlist),
        "the reporting institution is on the enhanced monitoring list",
        observed=working["raw_institution_id"],
    )
    period_month = parsed_period.dt.month
    record(
        "W004",
        working["raw_institution_id"].isin(quarterly_institutions)
        & period_month.notna()
        & ~period_month.isin(QUARTER_END_MONTHS),
        "the reporting period is finer than the institution's quarterly cadence",
        observed=working["raw_reporting_period"],
    )

    # ------------------------------------------------------------------
    # Step 9: partition the records.
    # ------------------------------------------------------------------
    blocking_names = {rule.name for rule in RULES if rule.severity == BLOCK}
    warning_names = {rule.name for rule in RULES if rule.severity == WARN}

    blocking_findings = [
        [item for item in items if item in blocking_names] for items in reasons
    ]
    warning_findings = [
        [item for item in items if item in warning_names] for items in reasons
    ]

    working["rejection_reason"] = ["; ".join(items) for items in blocking_findings]
    working["rejection_rule_ids"] = [
        "; ".join(RULES_BY_NAME[item].rule_id for item in items)
        for items in blocking_findings
    ]
    working["warnings"] = ["; ".join(items) for items in warning_findings]
    working["warning_rule_ids"] = [
        "; ".join(RULES_BY_NAME[item].rule_id for item in items)
        for items in warning_findings
    ]

    is_rejected = working["rejection_reason"].ne("")
    is_review = ~is_rejected & working["warnings"].ne("")
    is_valid = ~is_rejected & ~is_review

    working["validation_status"] = "valid"
    working.loc[is_review, "validation_status"] = "review"
    working.loc[is_rejected, "validation_status"] = "rejected"

    valid = working.loc[is_valid].copy()
    review = working.loc[is_review].copy()
    rejected = working.loc[is_rejected].copy()

    def finish(frame: pd.DataFrame, extra: tuple[str, ...] = ()) -> pd.DataFrame:
        """Apply the output column order and the presentation formats."""
        out = frame.copy()
        out["total_deposits"] = _format_amount(out["total_deposits"])
        out["total_loans"] = _format_amount(out["total_loans"])
        out["reporting_date"] = out["reporting_date"].dt.strftime("%Y-%m-%d")
        out["reporting_period"] = out["reporting_period"].dt.strftime("%Y-%m")
        columns = list(CURATED_OUTPUT_COLUMNS) + list(extra)
        for column in columns:
            if column not in out.columns:
                out[column] = None
        return out[columns]

    valid_out = finish(valid)
    review_out = finish(review, extra=("warnings", "warning_rule_ids"))
    rejected_out = finish(
        rejected,
        extra=("rejection_reason", "rejection_rule_ids", *RAW_PRESERVATION_COLUMNS),
    )
    duplicate_out = duplicates[
        ["source_row_number", *RAW_VALUE_COLUMNS, "duplicate_of_source_row_number"]
    ].copy()

    audit = pd.DataFrame(
        audit_rows,
        columns=[
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
        ],
    )

    # ------------------------------------------------------------------
    # Step 10: reporting.
    # ------------------------------------------------------------------
    rule_breaches = (
        audit.groupby(["rule_id", "rule_name", "severity"], as_index=False)
        .size()
        .rename(columns={"size": "records_breached"})
        .sort_values(["severity", "rule_id"])
        .reset_index(drop=True)
    )

    summary_rows = [
        ("records_received", records_received),
        ("exact_duplicates", len(duplicates)),
        ("rejected_records", len(rejected)),
        ("review_records", len(review)),
        ("valid_records", len(valid)),
        (
            "block_findings",
            int((audit["severity"] == BLOCK).sum()) if len(audit) else 0,
        ),
        (
            "warn_findings",
            int((audit["severity"] == WARN).sum()) if len(audit) else 0,
        ),
        (
            "acceptance_rate",
            round(len(valid) / records_received, 4) if records_received else 0.0,
        ),
        ("rules_evaluated", len(RULES)),
        (
            "rules_breached",
            int(rule_breaches["rule_id"].nunique()) if len(rule_breaches) else 0,
        ),
    ]
    # Keep each metric as the type it was measured as, rather than letting
    # pandas widen a mixed column to float.
    summary = pd.DataFrame(
        {
            "metric": [metric for metric, _ in summary_rows],
            "value": pd.Series([value for _, value in summary_rows], dtype=object),
        }
    )

    manifest = {
        "run_id": run_id,
        "started_at_utc": started_at.isoformat(),
        "finished_at_utc": datetime.now(timezone.utc).isoformat(),
        "input_file": input_path.name,
        "input_sha256": sha256_of(input_path),
        "institutions_reference_sha256": sha256_of(institutions_path),
        "calendar_reference_sha256": sha256_of(calendar_path),
        "records_received": records_received,
        "records_valid": len(valid),
        "records_review": len(review),
        "records_rejected": len(rejected),
        "records_duplicate": len(duplicates),
        "thresholds": asdict(thresholds),
        "rule_catalog_size": len(RULES),
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}",
        "pandas_version": pd.__version__,
    }

    return PipelineResult(
        run_id=run_id,
        valid=valid_out,
        review=review_out,
        rejected=rejected_out,
        duplicates=duplicate_out,
        audit=audit,
        summary=summary,
        rule_breaches=rule_breaches,
        manifest=manifest,
    )


def write_outputs(
    result: PipelineResult,
    output_dir: Path = PROCESSED_DIR,
    report_dir: Path = REPORTS_DIR,
) -> dict[str, Path]:
    """Write every artefact of a run to disk and return the paths written."""
    output_dir = Path(output_dir)
    report_dir = Path(report_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    paths = {
        "valid": output_dir / "valid_records.csv",
        "review": output_dir / "review_records.csv",
        "rejected": output_dir / "rejected_records.csv",
        "duplicates": output_dir / "duplicate_records.csv",
        "audit": report_dir / "data_quality_audit.csv",
        "summary": report_dir / "validation_summary.csv",
        "rule_breaches": report_dir / "rule_breach_counts.csv",
        "manifest": report_dir / "run_manifest.json",
    }

    result.valid.to_csv(paths["valid"], index=False)
    result.review.to_csv(paths["review"], index=False)
    result.rejected.to_csv(paths["rejected"], index=False)
    result.duplicates.to_csv(paths["duplicates"], index=False)
    result.audit.to_csv(paths["audit"], index=False)
    result.summary.to_csv(paths["summary"], index=False)
    result.rule_breaches.to_csv(paths["rule_breaches"], index=False)
    paths["manifest"].write_text(
        json.dumps(result.manifest, indent=2) + "\n", encoding="utf-8"
    )
    return paths


if __name__ == "__main__":
    outcome = run_pipeline()
    written = write_outputs(outcome)
    print("PIPELINE SUMMARY")
    print(outcome.summary.to_string(index=False))
    print()
    print("RULE BREACHES")
    print(outcome.rule_breaches.to_string(index=False))
    print()
    print("REJECTED RECORDS")
    print(
        outcome.rejected[
            ["source_row_number", "institution_id", "rejection_reason"]
        ].to_string(index=False)
    )
    print()
    print("RECORDS FLAGGED FOR REVIEW")
    print(
        outcome.review[
            ["source_row_number", "institution_id", "warnings"]
        ].to_string(index=False)
    )
    print()
    for label, path in written.items():
        print(f"{label}: {path}")
