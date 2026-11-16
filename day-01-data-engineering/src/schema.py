"""Data model definitions for the Day 1 SupTech pipeline.

This module is the single source of truth for:

* the raw file schema and the curated (cleared) table schema;
* the reference tables the pipeline validates against;
* the target PostgreSQL structures that Day 2 loads into.

The DDL is kept as plain SQL text so it can be reviewed in a workshop and
verified in tests without a live database.

All identifiers, names and values used in this repository are synthetic
training data.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "datasets" / "raw"
REFERENCE_DIR = BASE_DIR / "datasets" / "reference"
PROCESSED_DIR = BASE_DIR / "datasets" / "processed"
REPORTS_DIR = BASE_DIR / "reports"

RAW_FILENAME = "institution_reports_synthetic.csv"
INSTITUTIONS_FILENAME = "institutions_registry.csv"
CALENDAR_FILENAME = "reporting_calendar.csv"

RAW_FILE = RAW_DIR / RAW_FILENAME
INSTITUTIONS_FILE = REFERENCE_DIR / INSTITUTIONS_FILENAME
CALENDAR_FILE = REFERENCE_DIR / CALENDAR_FILENAME

TARGET_SCHEMA = "suptech"


@dataclass(frozen=True)
class ColumnSpec:
    """One column of a data contract."""

    name: str
    logical_type: str
    sql_type: str
    required: bool
    description: str


#: Columns that carry the submitted values. Duplicate detection compares these
#: columns only, so that pipeline bookkeeping columns never affect the result.
RAW_VALUE_COLUMNS: tuple[str, ...] = (
    "institution_id",
    "institution_name",
    "reporting_date",
    "total_deposits",
    "total_loans",
    "reporting_period",
)

RAW_COLUMNS: tuple[ColumnSpec, ...] = (
    ColumnSpec(
        "institution_id", "identifier", "text", True,
        "Supervisory identifier of the reporting institution.",
    ),
    ColumnSpec(
        "institution_name", "text", "text", True,
        "Institution name as submitted by the reporting institution.",
    ),
    ColumnSpec(
        "reporting_date", "date", "date", True,
        "Date the submission relates to, ISO 8601 (YYYY-MM-DD).",
    ),
    ColumnSpec(
        "total_deposits", "decimal", "numeric(18,2)", True,
        "Total customer deposits held at the reporting date.",
    ),
    ColumnSpec(
        "total_loans", "decimal", "numeric(18,2)", True,
        "Total loans and advances outstanding at the reporting date.",
    ),
    ColumnSpec(
        "reporting_period", "period", "text", True,
        "Reporting period the submission belongs to (YYYY-MM).",
    ),
)

#: Columns added by the pipeline to the curated layer.
CURATED_COLUMNS: tuple[ColumnSpec, ...] = (
    ColumnSpec("source_row_number", "integer", "integer", True,
               "1-based row number of the record in the source file."),
    ColumnSpec("run_id", "uuid", "uuid", True,
               "Identifier of the pipeline run that produced the record."),
    ColumnSpec("validation_status", "enum", "text", True,
               "valid | review | rejected."),
    ColumnSpec("warnings", "text[]", "text", False,
               "Names of WARN-severity rules the record breached."),
)

INSTITUTION_COLUMNS: tuple[ColumnSpec, ...] = (
    ColumnSpec("institution_id", "identifier", "text", True,
               "Primary key of the supervised institution."),
    ColumnSpec("institution_name", "text", "text", True,
               "Official registered name."),
    ColumnSpec("institution_type", "text", "text", False,
               "Licence category, for example Commercial Bank."),
    ColumnSpec("licence_status", "text", "text", False,
               "Licence status recorded in the supervisory register."),
    ColumnSpec("region", "text", "text", False,
               "Region the institution is headquartered in."),
    ColumnSpec("reporting_frequency", "text", "text", False,
               "Expected reporting cadence: Monthly or Quarterly."),
    ColumnSpec("watchlist_flag", "boolean", "boolean", False,
               "Institution is subject to enhanced supervisory monitoring."),
)

CALENDAR_COLUMNS: tuple[ColumnSpec, ...] = (
    ColumnSpec("reporting_period", "period", "text", True,
               "Primary key of the reporting period (YYYY-MM)."),
    ColumnSpec("period_start", "date", "date", True,
               "First day of the reporting period."),
    ColumnSpec("period_end", "date", "date", True,
               "Last day of the reporting period."),
    ColumnSpec("submission_due_date", "date", "date", True,
               "Date the submission was due."),
    ColumnSpec("status", "text", "text", True,
               "Open, Closed or Scheduled."),
)


def raw_column_names() -> list[str]:
    return [column.name for column in RAW_COLUMNS]


def curated_column_names() -> list[str]:
    return [column.name for column in RAW_COLUMNS] + [
        column.name for column in CURATED_COLUMNS
    ]


def create_schema_sql() -> str:
    """Return the DDL for the Day 1 target relational structures.

    The DDL is plain text so it can be reviewed line by line in the workshop
    and asserted on in tests without provisioning a database.
    """
    return f"""
CREATE SCHEMA IF NOT EXISTS {TARGET_SCHEMA};

-- Reference: the supervised institution register.
CREATE TABLE IF NOT EXISTS {TARGET_SCHEMA}.institution (
    institution_id      text PRIMARY KEY,
    institution_name    text NOT NULL,
    institution_type    text,
    licence_status      text,
    region              text,
    reporting_frequency text,
    watchlist_flag      boolean NOT NULL DEFAULT false
);

-- Reference: the reporting calendar, one row per reporting period.
CREATE TABLE IF NOT EXISTS {TARGET_SCHEMA}.reporting_period (
    reporting_period   text PRIMARY KEY,
    period_start       date NOT NULL,
    period_end         date NOT NULL,
    submission_due_date date NOT NULL,
    status             text NOT NULL
);

-- Curated layer: reports that passed every BLOCK severity rule.
CREATE TABLE IF NOT EXISTS {TARGET_SCHEMA}.institution_report (
    run_id            uuid NOT NULL,
    source_row_number integer NOT NULL,
    institution_id    text NOT NULL
                      REFERENCES {TARGET_SCHEMA}.institution (institution_id),
    institution_name  text NOT NULL,
    reporting_date    date NOT NULL,
    reporting_period  text NOT NULL
                      REFERENCES {TARGET_SCHEMA}.reporting_period (reporting_period),
    total_deposits    numeric(18, 2) NOT NULL,
    total_loans       numeric(18, 2) NOT NULL,
    validation_status text NOT NULL
                      CHECK (validation_status IN ('valid', 'review')),
    warnings          text,
    PRIMARY KEY (run_id, source_row_number)
);

-- Audit layer: one row per rule evaluation that produced a finding.
CREATE TABLE IF NOT EXISTS {TARGET_SCHEMA}.data_quality_audit (
    run_id            uuid NOT NULL,
    source_row_number integer NOT NULL,
    institution_id    text,
    reporting_period  text,
    rule_id           text NOT NULL,
    rule_name         text NOT NULL,
    severity          text NOT NULL CHECK (severity IN ('BLOCK', 'WARN')),
    outcome           text NOT NULL,
    observed_value    text,
    detail            text,
    evaluated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_institution
    ON {TARGET_SCHEMA}.institution_report (institution_id, reporting_period);

CREATE INDEX IF NOT EXISTS idx_audit_rule
    ON {TARGET_SCHEMA}.data_quality_audit (rule_id, severity);
""".strip()
