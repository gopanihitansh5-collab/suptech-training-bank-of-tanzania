"""Threshold evaluation: turning indicators into supervisory exceptions.

An exception is a record of the following shape: *this subject, this
indicator, this value, this limit, this severity*. It is not a copy of the
record it came from and it is not a copy of the audit trail.

The audit trail explains **data quality**: why a record was rejected or why
it was flagged for review. A threshold explains **supervisory risk**: why a
number deserves attention. The two are different things, and the prototype
keeps them apart:

* every exception carries the threshold evidence — the observed value, the
  limit, the severity and the reason a supervisor would give;
* an exception also carries the data quality findings that explain the
  subject it came from, through a link table rather than by copying rows.

The link is declared per threshold, because the answer depends on the grain
of the indicator:

``record``
    The exception is about one institution in one period, so it links to the
    findings of that record.

``period``
    The exception is about the sector in one period, so it links to the
    findings of the curated records of that period.

Where a subject produced no findings at all — a clean record that simply
holds a large share of sector deposits — the exception has no audit links
and says so through its explanation. That is not a gap in the trail, it is
the trail being empty on purpose.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from catalogs import (
    CONTEXT,
    EXPLAINS,
    PERIOD_LINK,
    RECORD_LINK,
    THRESHOLDS,
    THRESHOLDS_BY_ID,
    describe_bounds,
    severity_rank,
)
from curated import CuratedLayer
from indicators import format_value

#: The only status an exception carries in the prototype. Triage workflow is
#: out of scope for Day 2, so nothing is ever closed.
OPEN = "open"

EXCEPTION_COLUMNS: tuple[str, ...] = (
    "exception_id",
    "run_id",
    "threshold_id",
    "threshold_name",
    "indicator_id",
    "indicator_name",
    "grain",
    "reporting_period",
    "subject_id",
    "institution_id",
    "source_row_number",
    "severity",
    "observed_value",
    "observed_value_text",
    "limit_description",
    "message",
    "explanation",
    "status",
    "link_mode",
)

LINK_COLUMNS: tuple[str, ...] = (
    "exception_id",
    "run_id",
    "reporting_period",
    "source_row_number",
    "rule_id",
    "rule_name",
    "severity",
    "observed_value",
    "detail",
    "relation",
    "link_mode",
)


def _is_breach(threshold, value: float) -> bool:
    """Return True when a value falls inside the band of a threshold."""
    if threshold.lower_bound is not None:
        if threshold.lower_inclusive:
            if value < threshold.lower_bound:
                return False
        elif value <= threshold.lower_bound:
            return False
    if threshold.upper_bound is not None:
        if threshold.upper_inclusive:
            if value > threshold.upper_bound:
                return False
        elif value >= threshold.upper_bound:
            return False
    return True


def _source_rows_by_subject(curated: CuratedLayer) -> dict[tuple[str, str], int]:
    """Map an institution and a period to the source row of its record."""
    mapping: dict[tuple[str, str], int] = {}
    for _, record in curated.records.iterrows():
        key = (record["institution_id"], record["reporting_period"])
        mapping.setdefault(key, int(record["source_row_number"]))
    return mapping


def _rows_by_period(curated: CuratedLayer) -> dict[str, list[int]]:
    """Map a reporting period to the source rows of its curated records."""
    mapping: dict[str, list[int]] = {}
    for _, record in curated.records.iterrows():
        mapping.setdefault(record["reporting_period"], []).append(
            int(record["source_row_number"])
        )
    return mapping


def evaluate_thresholds(
    indicators: pd.DataFrame,
    curated: CuratedLayer,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Evaluate every declared threshold against the computed indicators.

    Returns the exception records and the links that attach the data quality
    findings to them.
    """
    exceptions: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []

    source_rows = _source_rows_by_subject(curated)
    rows_by_period = _rows_by_period(curated)

    audit = curated.audit
    audit_by_row: dict[int, list[dict[str, Any]]] = {}
    for _, finding in audit.iterrows():
        audit_by_row.setdefault(int(finding["source_row_number"]), []).append(
            {
                "rule_id": finding["rule_id"],
                "rule_name": finding["rule_name"],
                "severity": finding["severity"],
                "observed_value": finding["observed_value"],
                "detail": finding["detail"],
            }
        )

    for threshold in THRESHOLDS:
        matches = indicators.loc[
            indicators["indicator_id"] == threshold.indicator_id
        ]
        for _, indicator_row in matches.iterrows():
            value = indicator_row["indicator_value"]
            if value is None or pd.isna(value):
                continue
            if not _is_breach(threshold, float(value)):
                continue

            reporting_period = indicator_row["reporting_period"]
            subject_id = indicator_row["subject_id"]
            institution_id = indicator_row["institution_id"]
            if institution_id is None or pd.isna(institution_id):
                institution_id = None
            source_row = None
            if institution_id is not None:
                source_row = source_rows.get((institution_id, reporting_period))

            observed_text = format_value(
                float(value), threshold.indicator_id
            )
            limit_description = describe_bounds(threshold)
            exception_id = (
                f"EXC-{threshold.threshold_id}-{subject_id}-{reporting_period}"
            )

            message = (
                f"{threshold.message}: observed {observed_text} "
                f"({indicator_row['unit']}), limit {limit_description}"
            )

            linked_rows = _linked_source_rows(
                threshold.link_mode, source_row, rows_by_period, reporting_period
            )
            findings = _findings_for(linked_rows, audit_by_row)
            explaining = [
                finding
                for finding in findings
                if finding["rule_id"] in threshold.explaining_rule_ids
            ]

            if explaining:
                evidence = (
                    "Explained by the data quality findings "
                    + "; ".join(
                        f"{finding['rule_id']} {finding['rule_name']} "
                        f"(source row {finding['source_row_number']})"
                        for finding in explaining
                    )
                    + "."
                )
            elif findings:
                evidence = (
                    "The records behind this exception carry the data quality "
                    "findings "
                    + "; ".join(
                        f"{finding['rule_id']} {finding['rule_name']}"
                        for finding in findings
                    )
                    + ", but none of them is the cause of this exception: the "
                    "risk it measures is not a data quality symptom."
                )
            else:
                evidence = (
                    "No data quality finding is attached to this subject: the "
                    "record behind it was admitted to the curated layer "
                    "without a warning."
                )

            exceptions.append(
                {
                    "exception_id": exception_id,
                    "run_id": curated.run_id,
                    "threshold_id": threshold.threshold_id,
                    "threshold_name": threshold.name,
                    "indicator_id": threshold.indicator_id,
                    "indicator_name": indicator_row["indicator_name"],
                    "grain": threshold.grain,
                    "reporting_period": reporting_period,
                    "subject_id": subject_id,
                    "institution_id": institution_id,
                    "source_row_number": source_row,
                    "severity": threshold.severity,
                    "observed_value": float(value),
                    "observed_value_text": observed_text,
                    "limit_description": limit_description,
                    "message": message,
                    "explanation": f"{threshold.rationale} {evidence}",
                    "status": OPEN,
                    "link_mode": threshold.link_mode,
                }
            )

            for finding in findings:
                relation = (
                    EXPLAINS
                    if finding["rule_id"] in threshold.explaining_rule_ids
                    else CONTEXT
                )
                links.append(
                    {
                        "exception_id": exception_id,
                        "run_id": curated.run_id,
                        "reporting_period": reporting_period,
                        "source_row_number": finding["source_row_number"],
                        "rule_id": finding["rule_id"],
                        "rule_name": finding["rule_name"],
                        "severity": finding["severity"],
                        "observed_value": finding["observed_value"],
                        "detail": finding["detail"],
                        "relation": relation,
                        "link_mode": threshold.link_mode,
                    }
                )

    return _exceptions_frame(exceptions), _links_frame(links)


def _linked_source_rows(
    link_mode: str,
    source_row: int | None,
    rows_by_period: dict[str, list[int]],
    reporting_period: str,
) -> list[int]:
    """Return the source rows an exception is linked to."""
    if link_mode == RECORD_LINK and source_row is not None:
        return [source_row]
    if link_mode == PERIOD_LINK:
        return sorted(rows_by_period.get(reporting_period, []))
    return []


def _findings_for(
    source_rows: list[int],
    audit_by_row: dict[int, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Return the findings of the given source rows, with the row attached."""
    findings: list[dict[str, Any]] = []
    for row in sorted(source_rows):
        for finding in audit_by_row.get(row, []):
            attached = dict(finding)
            attached["source_row_number"] = row
            findings.append(attached)
    return findings


def _exceptions_frame(exceptions: list[dict[str, Any]]) -> pd.DataFrame:
    """Build the exception table with a fixed column order and ordering."""
    frame = pd.DataFrame(exceptions, columns=list(EXCEPTION_COLUMNS))
    if len(frame):
        frame["source_row_number"] = frame["source_row_number"].astype("Int64")
        frame["severity_rank"] = frame["severity"].map(severity_rank)
        frame = frame.sort_values(
            ["severity_rank", "reporting_period", "indicator_id", "subject_id"]
        ).reset_index(drop=True)
        frame = frame.drop(columns=["severity_rank"])
    return frame


def _links_frame(links: list[dict[str, Any]]) -> pd.DataFrame:
    """Build the exception to audit link table."""
    frame = pd.DataFrame(links, columns=list(LINK_COLUMNS))
    if len(frame):
        frame = frame.sort_values(
            ["exception_id", "source_row_number", "rule_id"]
        ).reset_index(drop=True)
    return frame


def exceptions_for_record(exceptions: pd.DataFrame, source_row: int) -> pd.DataFrame:
    """Return the exceptions that came from one source row."""
    return exceptions.loc[exceptions["source_row_number"] == source_row]


def threshold_by_id(threshold_id: str):
    """Return one declared threshold."""
    return THRESHOLDS_BY_ID[threshold_id]
