"""Loading the Day 2 layers into PostgreSQL.

Day 1 defined the structures and wrote the loading code. Day 2 exercises
it: the curated layer, the audit trail, the indicator values, the exceptions
and the links are loaded into one database, and the constraints stay
intact.

The load is a load, not a migration. It replaces the reference data, appends
the run's records, and refuses to run without a connection string. Nothing
here invents a default database, a default user or a default password:

    export DATABASE_URL="postgresql+psycopg://user:password@localhost:5432/suptech"

Never put a password or a connection string in this repository or in a
shared notebook. Read the connection string from the environment only.
"""

from __future__ import annotations

from typing import Any

from ddl import create_schema_sql
from day1_bridge import day1_db

#: The columns of the indicator table.
INDICATOR_COLUMNS: tuple[str, ...] = (
    "run_id",
    "indicator_id",
    "indicator_name",
    "grain",
    "reporting_period",
    "subject_id",
    "institution_id",
    "indicator_value",
    "unit",
    "decimals",
    "direction",
    "calculation_basis",
)

#: The columns of the exception table.
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

#: The columns of the exception to audit link table.
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


def create_engine(url: str | None = None):
    """Create a SQLAlchemy engine for the training database."""
    return day1_db.create_engine(url)


def create_schema(engine) -> None:
    """Create the full schema, Day 1 objects and Day 2 objects."""
    from sqlalchemy import text

    with engine.begin() as connection:
        connection.execute(text(create_schema_sql()))


def load_indicator_values(engine, indicators: Any) -> int:
    """Load the computed indicator values of one run."""
    from sqlalchemy import text

    payload = day1_db._rows(indicators, INDICATOR_COLUMNS)
    if not payload:
        return 0
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO suptech.supervisory_indicator
                    (run_id, indicator_id, indicator_name, grain,
                     reporting_period, subject_id, institution_id,
                     indicator_value, unit, decimals, direction,
                     calculation_basis)
                VALUES (:run_id, :indicator_id, :indicator_name, :grain,
                        :reporting_period, :subject_id, :institution_id,
                        :indicator_value, :unit, :decimals, :direction,
                        :calculation_basis)
                """
            ),
            payload,
        )
    return len(payload)


def load_exceptions(engine, exceptions: Any) -> int:
    """Load the exceptions of one run."""
    from sqlalchemy import text

    payload = day1_db._rows(exceptions, EXCEPTION_COLUMNS)
    if not payload:
        return 0
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO suptech.supervisory_exception
                    (exception_id, run_id, threshold_id, threshold_name,
                     indicator_id, indicator_name, grain, reporting_period,
                     subject_id, institution_id, source_row_number, severity,
                     observed_value, observed_value_text, limit_description,
                     message, explanation, status, link_mode)
                VALUES (:exception_id, :run_id, :threshold_id, :threshold_name,
                        :indicator_id, :indicator_name, :grain,
                        :reporting_period, :subject_id, :institution_id,
                        :source_row_number, :severity, :observed_value,
                        :observed_value_text, :limit_description, :message,
                        :explanation, :status, :link_mode)
                """
            ),
            payload,
        )
    return len(payload)


def load_exception_links(engine, links: Any) -> int:
    """Load the links between the exceptions and the audit trail."""
    from sqlalchemy import text

    payload = day1_db._rows(links, LINK_COLUMNS)
    if not payload:
        return 0
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO suptech.exception_audit_link
                    (exception_id, run_id, reporting_period, source_row_number,
                     rule_id, rule_name, severity, observed_value, detail,
                     relation, link_mode)
                VALUES (:exception_id, :run_id, :reporting_period,
                        :source_row_number, :rule_id, :rule_name, :severity,
                        :observed_value, :detail, :relation, :link_mode)
                """
            ),
            payload,
        )
    return len(payload)


def load_day2(
    engine,
    curated,
    result,
) -> dict[str, int]:
    """Load one complete Day 2 run into the database.

    The Day 1 structures are created first, then the reference data, the
    curated records and the audit trail are loaded with the Day 1 helpers,
    and then the Day 2 layers are loaded on top of them.
    """
    run_id = result.run_id
    if not run_id:
        raise RuntimeError(
            "The analytics result carries no run identifier. Run the Day 1 "
            "pipeline and read its manifest so that the Day 2 rows can be "
            "traced back to the run that produced them."
        )

    create_schema(engine)
    counts = day1_db.load_reference_data(
        engine, curated.registry, curated.calendar
    )
    counts["curated_records"] = day1_db.load_curated_records(
        engine, curated.records, run_id
    )
    counts["audit_rows"] = day1_db.load_audit_rows(
        engine, curated.audit, run_id
    )
    counts["indicator_values"] = load_indicator_values(
        engine, result.indicators
    )
    counts["exceptions"] = load_exceptions(engine, result.exceptions)
    counts["exception_audit_links"] = load_exception_links(engine, result.links)
    return counts


def count_rows(engine, table: str) -> int:
    """Count the rows of a table in the suptech schema."""
    from sqlalchemy import text

    with engine.connect() as connection:
        return int(
            connection.execute(
                text(f"SELECT count(*) FROM suptech.{table}")
            ).scalar_one()
        )
