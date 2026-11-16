"""Tests for the Day 1 ingestion, validation and partition pipeline.

These tests are the executable version of the Day 1 contract. A trainer can
run them before a session to prove the environment works, and a participant
can run them to check their own solution.
"""

from __future__ import annotations

import json

import pandas as pd
import pytest

from ingestion import load_csv, load_reference_table, sha256_of
from rules import BLOCK, RULES, RULES_BY_ID, WARN
from schema import (
    CALENDAR_FILE,
    INSTITUTIONS_FILE,
    RAW_FILE,
    create_schema_sql,
)
from validation import Thresholds, run_pipeline, write_outputs

#: The shipped dataset is a teaching fixture. These numbers are the contract.
EXPECTED_RECEIVED = 25
EXPECTED_DUPLICATES = 1
EXPECTED_REJECTED = 17
EXPECTED_REVIEW = 3
EXPECTED_VALID = 4


def _rejection_ids(result, source_row: int) -> set[str]:
    """Return the rule identifiers that rejected one source row."""
    row = result.rejected.loc[result.rejected["source_row_number"] == source_row]
    assert not row.empty, f"source row {source_row} was not rejected"
    ids = set()
    for value in row.iloc[0]["rejection_rule_ids"].split(";"):
        if value.strip():
            ids.add(value.strip())
    return ids


def _warning_ids(result, source_row: int) -> set[str]:
    """Return the rule identifiers that flagged one source row for review."""
    row = result.review.loc[result.review["source_row_number"] == source_row]
    assert not row.empty, f"source row {source_row} was not flagged"
    ids = set()
    for value in row.iloc[0]["warning_rule_ids"].split(";"):
        if value.strip():
            ids.add(value.strip())
    return ids


# ----------------------------------------------------------------------
# Partitioning
# ----------------------------------------------------------------------


def test_partition_accounts_for_every_record(pipeline_result):
    """Received must equal duplicates plus rejected plus review plus valid."""
    total = (
        len(pipeline_result.duplicates)
        + len(pipeline_result.rejected)
        + len(pipeline_result.review)
        + len(pipeline_result.valid)
    )
    assert total == pipeline_result.count("records_received")


def test_shipped_dataset_produces_the_expected_partition(pipeline_result):
    assert pipeline_result.count("records_received") == EXPECTED_RECEIVED
    assert pipeline_result.count("exact_duplicates") == EXPECTED_DUPLICATES
    assert pipeline_result.count("rejected_records") == EXPECTED_REJECTED
    assert pipeline_result.count("review_records") == EXPECTED_REVIEW
    assert pipeline_result.count("valid_records") == EXPECTED_VALID


def test_partitions_do_not_overlap(pipeline_result):
    """No source row may appear in more than one partition."""
    rows = [
        set(frame["source_row_number"])
        for frame in (
            pipeline_result.valid,
            pipeline_result.review,
            pipeline_result.rejected,
            pipeline_result.duplicates,
        )
    ]
    for index, left in enumerate(rows):
        for right in rows[index + 1:]:
            assert not (left & right)


def test_every_rule_in_the_catalog_is_exercised(pipeline_result):
    """The dataset has to keep covering the whole rule catalog."""
    breached = set(pipeline_result.rule_breaches["rule_id"])
    expected = {rule.rule_id for rule in RULES}
    assert breached == expected, f"not exercised: {sorted(expected - breached)}"


# ----------------------------------------------------------------------
# Individual rules
# ----------------------------------------------------------------------


def test_exact_duplicate_is_separated_from_the_working_set(pipeline_result):
    """Source row 4 repeats source row 1 exactly."""
    duplicates = pipeline_result.duplicates
    assert len(duplicates) == 1
    assert int(duplicates.iloc[0]["source_row_number"]) == 4
    assert int(duplicates.iloc[0]["duplicate_of_source_row_number"]) == 1
    assert 1 in set(pipeline_result.valid["source_row_number"])


def test_exact_duplicate_does_not_also_trigger_the_resubmission_rule(
    pipeline_result,
):
    """A row removed as an exact duplicate must not resurface as a resubmission."""
    assert "R013" in set(pipeline_result.audit["rule_id"])
    assert "R014" in set(pipeline_result.audit["rule_id"])
    duplicate_rows = set(pipeline_result.duplicates["source_row_number"])
    resubmission_rows = set(
        pipeline_result.audit.loc[
            pipeline_result.audit["rule_id"] == "R014", "source_row_number"
        ]
    )
    assert not (duplicate_rows & resubmission_rows)


def test_resubmission_is_detected_and_the_first_submission_survives(pipeline_result):
    """Rows 11 and 19 repeat an institution and period with different values."""
    assert _rejection_ids(pipeline_result, 11) == {"R014"}
    assert _rejection_ids(pipeline_result, 19) == {"R014"}
    assert 3 in set(pipeline_result.valid["source_row_number"])
    assert 2 in set(pipeline_result.valid["source_row_number"])


def test_missing_required_field_is_rejected(pipeline_result):
    assert "R001" in _rejection_ids(pipeline_result, 5)
    assert "R001" in _rejection_ids(pipeline_result, 8)


def test_missing_value_is_never_replaced_with_zero(pipeline_result):
    """A blank deposit must stay missing, not become a zero balance."""
    row = pipeline_result.rejected.loc[
        pipeline_result.rejected["source_row_number"] == 5
    ].iloc[0]
    assert pd.isna(row["total_deposits"])
    raw_value = row["raw_total_deposits"]
    assert pd.isna(raw_value) or str(raw_value).strip() == ""


def test_non_numeric_amount_is_rejected_not_zero_filled(pipeline_result):
    ids = _rejection_ids(pipeline_result, 9)
    assert {"R001", "R008"} <= ids
    row = pipeline_result.rejected.loc[
        pipeline_result.rejected["source_row_number"] == 9
    ].iloc[0]
    assert pd.isna(row["total_deposits"])
    assert row["raw_total_deposits"] == "not-reported"


def test_unparseable_date_is_rejected(pipeline_result):
    ids = _rejection_ids(pipeline_result, 6)
    assert {"R001", "R004"} <= ids


def test_negative_amounts_are_rejected(pipeline_result):
    assert "R010" in _rejection_ids(pipeline_result, 7)
    assert "R011" in _rejection_ids(pipeline_result, 10)


def test_unknown_institution_is_rejected(pipeline_result):
    assert "R003" in _rejection_ids(pipeline_result, 14)


def test_malformed_institution_id_is_rejected(pipeline_result):
    ids = _rejection_ids(pipeline_result, 22)
    assert "R002" in ids


def test_reporting_period_must_match_the_reporting_date(pipeline_result):
    assert "R007" in _rejection_ids(pipeline_result, 13)


def test_reporting_date_must_fall_inside_the_period(pipeline_result):
    assert "R005" in _rejection_ids(pipeline_result, 12)


def test_reporting_period_must_exist_in_the_calendar(pipeline_result):
    assert "R015" in _rejection_ids(pipeline_result, 21)


def test_malformed_reporting_period_is_rejected(pipeline_result):
    """A period outside the YYYY-MM shape, and one with an impossible month."""
    assert "R006" in _rejection_ids(pipeline_result, 20)
    assert "R006" in _rejection_ids(pipeline_result, 25)


def test_implausible_magnitude_is_rejected(pipeline_result):
    assert "R012" in _rejection_ids(pipeline_result, 15)


# ----------------------------------------------------------------------
# Severity behaviour
# ----------------------------------------------------------------------


def test_warning_severity_keeps_the_record_out_of_rejection(pipeline_result):
    """A WARN finding admits the record and queues it for review."""
    assert 16 not in set(pipeline_result.rejected["source_row_number"])
    assert 16 in set(pipeline_result.review["source_row_number"])
    assert _warning_ids(pipeline_result, 16) == {"W001"}


def test_warnings_never_remove_a_record(pipeline_result):
    for source_row in (16, 17, 18):
        assert source_row not in set(pipeline_result.rejected["source_row_number"])
        assert source_row in set(pipeline_result.review["source_row_number"])


def test_rule_severities_are_consistent():
    """Every rule declares exactly one of the two severities."""
    for rule in RULES:
        assert rule.severity in (BLOCK, WARN)
        assert rule.rule_id in RULES_BY_ID
        assert rule.description.strip()
        assert rule.rationale.strip()


# ----------------------------------------------------------------------
# Audit trail
# ----------------------------------------------------------------------


def test_every_finding_is_recorded_in_the_audit_trail(pipeline_result):
    audit = pipeline_result.audit
    block_findings = audit.loc[audit["severity"] == BLOCK]
    assert len(block_findings) == pipeline_result.count("block_findings")
    warn_findings = audit.loc[audit["severity"] == WARN]
    assert len(warn_findings) == pipeline_result.count("warn_findings")


def test_every_rejected_record_has_an_audit_entry(pipeline_result):
    audited = set(pipeline_result.audit["source_row_number"])
    for source_row in pipeline_result.rejected["source_row_number"]:
        assert source_row in audited


def test_audit_entries_carry_a_rule_and_an_explanation(pipeline_result):
    assert len(pipeline_result.audit)
    assert pipeline_result.audit["rule_id"].ne("").all()
    assert pipeline_result.audit["detail"].ne("").all()


def test_audit_keeps_the_submitted_period_text(pipeline_result):
    """The audit trail must show the submitted value, not a parsed timestamp."""
    periods = set(pipeline_result.audit["reporting_period"].dropna().unique())
    assert "2026-11" in periods
    assert not any(str(value).startswith("2026-11-01 00:00") for value in periods)


# ----------------------------------------------------------------------
# Reproducibility and provenance
# ----------------------------------------------------------------------


def test_the_pipeline_is_deterministic():
    """Two runs over the same input produce the same records."""
    first = run_pipeline(run_id="fixed-run-id")
    second = run_pipeline(run_id="fixed-run-id")
    pd.testing.assert_frame_equal(first.valid, second.valid)
    pd.testing.assert_frame_equal(first.review, second.review)
    pd.testing.assert_frame_equal(first.rejected, second.rejected)
    pd.testing.assert_frame_equal(first.duplicates, second.duplicates)
    pd.testing.assert_frame_equal(first.audit, second.audit)


def test_the_manifest_records_the_input_hash(pipeline_result):
    manifest = pipeline_result.manifest
    assert manifest["input_file"] == RAW_FILE.name
    assert manifest["input_sha256"] == sha256_of(RAW_FILE)
    assert manifest["run_id"] == pipeline_result.run_id
    assert manifest["records_received"] == EXPECTED_RECEIVED


def test_the_manifest_has_no_wall_clock_dependency():
    """Two runs of the same file must agree on everything but the timestamps."""
    first = run_pipeline(run_id="fixed-run-id").manifest
    second = run_pipeline(run_id="fixed-run-id").manifest
    volatile = {"started_at_utc", "finished_at_utc"}
    assert set(first) == set(second)
    for key in first:
        if key not in volatile:
            assert first[key] == second[key]


def test_thresholds_are_configurable():
    """A stricter ratio band moves a record from review to valid."""
    loose = run_pipeline(thresholds=Thresholds(max_loan_to_deposit_ratio=10.0))
    strict = run_pipeline(thresholds=Thresholds(max_loan_to_deposit_ratio=3.0))
    assert len(loose.review) < len(strict.review)


# ----------------------------------------------------------------------
# Ingestion behaviour
# ----------------------------------------------------------------------


def test_ingestion_refuses_a_file_with_a_missing_column(tmp_path):
    broken = tmp_path / "broken.csv"
    broken.write_text(
        "institution_id,institution_name,total_deposits,total_loans,reporting_period\n"
        "TZ001,Institution Alpha,1,2,2026-11\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="missing required column"):
        load_csv(broken)


def test_ingestion_refuses_a_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_csv(tmp_path / "absent.csv")


def test_ingestion_preserves_the_submitted_values():
    """Values are read as text so the pipeline sees exactly what was sent."""
    frame = load_csv(RAW_FILE)
    assert str(frame["total_deposits"].dtype) == "string"
    non_numeric = frame.loc[frame["total_deposits"] == "not-reported"]
    assert len(non_numeric) == 1
    assert non_numeric.iloc[0]["institution_id"] == "TZ008"


def test_source_row_numbers_point_back_at_the_source_file():
    frame = load_csv(RAW_FILE)
    assert list(frame["source_row_number"]) == list(range(1, len(frame) + 1))
    assert frame["source_file"].nunique() == 1


def test_reference_data_loads():
    institutions = load_reference_table(
        INSTITUTIONS_FILE, ("institution_id", "watchlist_flag", "reporting_frequency")
    )
    calendar = load_reference_table(
        CALENDAR_FILE, ("reporting_period", "period_start", "period_end")
    )
    assert len(institutions) == 19
    assert len(calendar) == 4


# ----------------------------------------------------------------------
# Outputs
# ----------------------------------------------------------------------


def test_write_outputs_creates_every_artefact(tmp_path, pipeline_result):
    paths = write_outputs(
        pipeline_result,
        output_dir=tmp_path / "processed",
        report_dir=tmp_path / "reports",
    )
    for label, path in paths.items():
        assert path.exists(), f"{label} was not written"
        assert path.stat().st_size > 0


def test_the_manifest_on_disk_is_valid_json(tmp_path, pipeline_result):
    paths = write_outputs(
        pipeline_result,
        output_dir=tmp_path / "processed",
        report_dir=tmp_path / "reports",
    )
    payload = json.loads(paths["manifest"].read_text(encoding="utf-8"))
    assert payload["records_received"] == EXPECTED_RECEIVED


def test_rejected_records_keep_the_original_submitted_values(pipeline_result):
    """The raw columns are the evidence for a rejection."""
    rejected = pipeline_result.rejected
    row = rejected.loc[rejected["source_row_number"] == 6].iloc[0]
    assert row["raw_reporting_date"] == "invalid-date"
    assert row["raw_total_deposits"] == "300000000"


# ----------------------------------------------------------------------
# Target data model
# ----------------------------------------------------------------------


def test_the_generated_ddl_contains_the_expected_objects():
    ddl = create_schema_sql()
    for object_name in (
        "suptech.institution",
        "suptech.reporting_period",
        "suptech.institution_report",
        "suptech.data_quality_audit",
    ):
        assert object_name in ddl
    assert "PRIMARY KEY" in ddl
    assert "REFERENCES suptech.institution" in ddl


def test_the_ddl_is_valid_sql():
    """A syntax check without a server, using the SQLite dialect for parsing."""
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable

    ddl = create_schema_sql()
    statements = [
        part
        for part in ddl.split(";")
        if part.strip() and not part.strip().upper().startswith("CREATE SCHEMA")
    ]
    assert statements
    for statement in statements:
        # CREATE TABLE statements are parsed by SQLAlchemy, which raises on
        # invalid syntax. Index and schema statements are skipped.
        if statement.strip().upper().startswith("CREATE TABLE"):
            CreateTable.from_string(statement.strip()).compile(
                dialect=postgresql.dialect()
            )
