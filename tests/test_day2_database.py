"""Tests for the Day 2 relational structures and the PostgreSQL load.

Two kinds of test live here.

The first kind needs no database: it checks that the DDL declares the
objects, the constraints and the foreign keys that Day 2 depends on, and
that it parses as valid PostgreSQL. This is the check that can run on any
machine.

The second kind exercises a live PostgreSQL instance. It is skipped unless
``DATABASE_URL`` points at one, because the training machine may not have
PostgreSQL installed. It creates the schema, loads one run and then tries
to break the constraints. **It replaces the reference data**, so it belongs
on a development database and nowhere else.

    export DATABASE_URL="postgresql+psycopg://user:password@localhost:5432/suptech"
    python -m pytest tests/test_day2_database.py
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy.exc import IntegrityError

from ddl import DAY2_OBJECTS, create_day2_schema_sql, create_schema_sql

DATABASE_URL_ENV = "DATABASE_URL"


def _statements(ddl: str) -> list[str]:
    """Split a DDL script into its statements."""
    return [
        part.strip()
        for part in ddl.split(";")
        if part.strip() and not part.strip().upper().startswith("CREATE SCHEMA")
    ]


def _database_url() -> str:
    """Return the configured database URL, or an empty string."""
    return os.environ.get(DATABASE_URL_ENV, "").strip()


# ----------------------------------------------------------------------
# The declared structures
# ----------------------------------------------------------------------


def test_the_day2_ddl_contains_the_expected_objects():
    ddl = create_day2_schema_sql()
    for object_name in DAY2_OBJECTS:
        assert object_name in ddl


def test_the_full_schema_keeps_the_day1_objects():
    """Day 2 extends the structures. It does not replace them."""
    ddl = create_schema_sql()
    for object_name in (
        "suptech.institution",
        "suptech.reporting_period",
        "suptech.institution_report",
        "suptech.data_quality_audit",
        *DAY2_OBJECTS,
    ):
        assert object_name in ddl


def test_the_curated_table_still_refuses_a_rejected_record():
    """A rejected record must not be able to reach the curated table."""
    ddl = create_schema_sql()
    assert "CHECK (validation_status IN ('valid', 'review'))" in ddl


def test_the_exception_table_declares_its_severities():
    ddl = create_day2_schema_sql()
    assert "CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'))" in ddl
    assert "CHECK (status IN ('open'))" in ddl


def test_the_audit_trail_gets_a_unique_key_for_the_link():
    """The link table references a finding, so a finding has to be unique."""
    ddl = create_day2_schema_sql()
    assert "CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_finding" in ddl
    assert "FOREIGN KEY (run_id, source_row_number, rule_id)" in ddl
    assert "REFERENCES suptech.data_quality_audit" in ddl
    assert "(run_id, source_row_number, rule_id)" in ddl


def test_the_run_identifier_is_part_of_every_key():
    """Two runs of the same data must not collide."""
    ddl = create_day2_schema_sql()
    assert "PRIMARY KEY (run_id, exception_id)" in ddl
    assert (
        "PRIMARY KEY (run_id, indicator_id, reporting_period, subject_id)" in ddl
    )
    assert (
        "PRIMARY KEY (run_id, exception_id, source_row_number, rule_id)" in ddl
    )
    assert (
        "FOREIGN KEY (run_id, exception_id)" in ddl
    )


def test_the_day2_ddl_is_valid_postgresql():
    """A syntax check without a server."""
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable

    statements = _statements(create_schema_sql())
    assert statements
    for statement in statements:
        if statement.upper().startswith("CREATE TABLE"):
            CreateTable.from_string(statement).compile(
                dialect=postgresql.dialect()
            )


# ----------------------------------------------------------------------
# The live load
# ----------------------------------------------------------------------


@pytest.fixture(scope="module")
def engine():
    """An engine for the approved development database, when there is one."""
    url = _database_url()
    if not url:
        pytest.skip(
            f"{DATABASE_URL_ENV} is not set. The live load check needs an "
            "approved development database."
        )
    from loader import create_engine

    return create_engine(url)


@pytest.fixture(scope="module")
def loaded(engine, curated_layer, analytics_result):
    """Load one complete run into the database."""
    from loader import load_day2

    return load_day2(engine, curated_layer, analytics_result)


def test_the_load_writes_every_layer(loaded):
    assert loaded["curated_records"] == 7
    assert loaded["audit_rows"] == 4
    assert loaded["indicator_values"] == 48
    assert loaded["exceptions"] == 6
    assert loaded["exception_audit_links"] == 14


def test_the_loaded_rows_match_the_artefacts(engine, analytics_result):
    from loader import count_rows

    assert count_rows(engine, "supervisory_indicator") == len(
        analytics_result.indicators
    )
    assert count_rows(engine, "supervisory_exception") == len(
        analytics_result.exceptions
    )
    assert count_rows(engine, "exception_audit_link") == len(analytics_result.links)


def test_the_curated_table_still_refuses_a_rejected_record_live(engine):
    """The constraint has to hold in the database, not only in the DDL text."""
    from sqlalchemy import text

    with engine.begin() as connection:
        with pytest.raises(IntegrityError):
            connection.execute(
                text(
                    """
                    INSERT INTO suptech.institution_report
                        (run_id, source_row_number, institution_id,
                         institution_name, reporting_date, reporting_period,
                         total_deposits, total_loans, validation_status)
                    VALUES ('00000000-0000-0000-0000-000000000000', 999,
                            'TZ001', 'Institution Alpha', '2026-11-01',
                            '2026-11', 1, 1, 'rejected')
                    """
                )
            )


def test_a_link_cannot_point_at_a_finding_that_does_not_exist(engine):
    """The foreign key holds."""
    from sqlalchemy import text

    with engine.begin() as connection:
        with pytest.raises(IntegrityError):
            connection.execute(
                text(
                    """
                    INSERT INTO suptech.exception_audit_link
                        (exception_id, run_id, reporting_period,
                         source_row_number, rule_id, rule_name, severity,
                         observed_value, detail, relation, link_mode)
                    VALUES ('EXC-THR-002-TZ013-2026-11',
                            '00000000-0000-0000-0000-000000000000',
                            '2026-11', 16, 'R001', 'missing_required_field',
                            'BLOCK', 'x', 'y', 'explains', 'record')
                    """
                )
            )


def test_the_exception_severity_is_constrained(engine):
    """A severity outside the declared set is refused."""
    from sqlalchemy import text

    with engine.begin() as connection:
        with pytest.raises(IntegrityError):
            connection.execute(
                text(
                    """
                    INSERT INTO suptech.supervisory_exception
                        (exception_id, run_id, threshold_id, threshold_name,
                         indicator_id, indicator_name, grain, reporting_period,
                         subject_id, severity, observed_value,
                         observed_value_text, limit_description, message,
                         explanation, status, link_mode)
                    VALUES ('EXC-BAD-SEVERITY',
                            '00000000-0000-0000-0000-000000000000',
                            'THR-001', 'ldr_elevated', 'IND-003',
                            'loan_to_deposit_ratio', 'institution', '2026-11',
                            'TZ001', 'URGENT', 1.0, '1.0000', 'above 1',
                            'm', 'e', 'open', 'record')
                    """
                )
            )
