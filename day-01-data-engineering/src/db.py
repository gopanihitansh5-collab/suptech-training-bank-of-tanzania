"""Optional PostgreSQL loading for the validated Day 1 output.

Day 1 teaches the data model. This module makes that model executable, so
that Day 2 starts from a database rather than from a CSV.

Nothing here touches a database unless a connection string is supplied
through the ``DATABASE_URL`` environment variable. The generated DDL is
verified by the test suite without a live server, so the structure can be
reviewed on any machine.

Never put a password or a connection string in this repository or in a shared
notebook. Use an environment variable that only exists on the training
machine.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Iterable

from schema import create_schema_sql

DATABASE_URL_ENV = "DATABASE_URL"


def database_url(required: bool = True) -> str:
    """Return the connection string from the environment."""
    url = os.environ.get(DATABASE_URL_ENV, "").strip()
    if not url:
        if required:
            raise RuntimeError(
                f"{DATABASE_URL_ENV} is not set. Point it at the approved "
                "training database, for example "
                "postgresql+psycopg://user:password@localhost:5432/suptech."
            )
        return ""
    return url


def create_engine(url: str | None = None):
    """Create a SQLAlchemy engine for the training database."""
    from sqlalchemy import create_engine as sqlalchemy_create_engine

    return sqlalchemy_create_engine(url or database_url(), pool_pre_ping=True)


def create_schema(engine) -> None:
    """Create the suptech schema and its tables."""
    from sqlalchemy import text

    with engine.begin() as connection:
        connection.execute(text(create_schema_sql()))


def _rows(frame, columns: Iterable[str]) -> list[dict[str, Any]]:
    """Convert a pandas frame into plain dictionaries for insertion."""
    wanted = list(columns)
    records = []
    for _, row in frame.iterrows():
        record = {}
        for column in wanted:
            value = row[column]
            if value is None:
                record[column] = None
                continue
            try:
                if value != value:  # NaN check that works for pandas NA
                    record[column] = None
                    continue
            except (TypeError, ValueError):
                pass
            record[column] = value
        records.append(record)
    return records


def load_reference_data(engine, institutions, calendar) -> dict[str, int]:
    """Load the reference tables. They are replaced, not appended to."""
    from sqlalchemy import text

    with engine.begin() as connection:
        connection.execute(
            text("DELETE FROM suptech.reporting_period")
        )
        connection.execute(text("DELETE FROM suptech.institution"))
        connection.execute(
            text(
                """
                INSERT INTO suptech.reporting_period
                    (reporting_period, period_start, period_end,
                     submission_due_date, status)
                VALUES (:reporting_period, :period_start, :period_end,
                        :submission_due_date, :status)
                """
            ),
            _rows(
                calendar,
                [
                    "reporting_period",
                    "period_start",
                    "period_end",
                    "submission_due_date",
                    "status",
                ],
            ),
        )
        connection.execute(
            text(
                """
                INSERT INTO suptech.institution
                    (institution_id, institution_name, institution_type,
                     licence_status, region, reporting_frequency, watchlist_flag)
                VALUES (:institution_id, :institution_name, :institution_type,
                        :licence_status, :region, :reporting_frequency,
                        :watchlist_flag)
                """
            ),
            _rows(
                institutions,
                [
                    "institution_id",
                    "institution_name",
                    "institution_type",
                    "licence_status",
                    "region",
                    "reporting_frequency",
                    "watchlist_flag",
                ],
            ),
        )
    return {
        "institutions": int(len(institutions)),
        "reporting_periods": int(len(calendar)),
    }


def load_curated_records(engine, curated: Any, run_id: str) -> int:
    """Load the curated records of one run into the institution_report table."""
    from sqlalchemy import text

    payload = _rows(
        curated,
        [
            "source_row_number",
            "institution_id",
            "institution_name",
            "reporting_date",
            "reporting_period",
            "total_deposits",
            "total_loans",
            "validation_status",
        ],
    )
    for record in payload:
        record["run_id"] = run_id

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO suptech.institution_report
                    (run_id, source_row_number, institution_id, institution_name,
                     reporting_date, reporting_period, total_deposits,
                     total_loans, validation_status)
                VALUES (:run_id, :source_row_number, :institution_id,
                        :institution_name, :reporting_date, :reporting_period,
                        :total_deposits, :total_loans, :validation_status)
                """
            ),
            payload,
        )
    return len(payload)


def load_audit_rows(engine, audit: Any, run_id: str) -> int:
    """Load the audit trail of one run into the data_quality_audit table."""
    from sqlalchemy import text

    payload = _rows(
        audit,
        [
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
    for record in payload:
        record["run_id"] = run_id

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO suptech.data_quality_audit
                    (run_id, source_row_number, institution_id, reporting_period,
                     rule_id, rule_name, severity, outcome, observed_value, detail)
                VALUES (:run_id, :source_row_number, :institution_id,
                        :reporting_period, :rule_id, :rule_name, :severity,
                        :outcome, :observed_value, :detail)
                """
            ),
            payload,
        )
    return len(payload)


def load_run(engine, result: Any, institutions, calendar) -> dict[str, int]:
    """Load one complete pipeline run into the database."""
    create_schema(engine)
    counts = load_reference_data(engine, institutions, calendar)
    curated = _concat_curated(result)
    counts["curated_records"] = load_curated_records(
        engine, curated, result.run_id
    )
    counts["audit_rows"] = load_audit_rows(engine, result.audit, result.run_id)
    return counts


def _concat_curated(result: Any):
    """Combine the valid and review partitions for loading."""
    import pandas as pd

    frames = [frame for frame in (result.valid, result.review) if len(frame)]
    if not frames:
        return pd.DataFrame(
            columns=[
                "source_row_number",
                "institution_id",
                "institution_name",
                "reporting_date",
                "reporting_period",
                "total_deposits",
                "total_loans",
                "validation_status",
            ]
        )
    return pd.concat(frames, ignore_index=True)
