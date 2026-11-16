"""Tests for the Day 2 indicators, thresholds and exceptions.

These tests are the executable version of the Day 2 contract. The expected
numbers are hand computed from the shipped dataset and written down here,
so that a change in the analytics code has to argue with a human number
rather than with itself.

The curated layer that Day 2 receives holds seven records for the period
2026-11:

    source row  institution  deposits        loans          status
    1           TZ001        500,000,000     350,000,000    valid
    2           TZ002        750,000,000     600,000,000    valid
    3           TZ003        420,000,000     280,000,000    valid
    16          TZ013         10,000,000      90,000,000    review
    17          TZ014                  0               0    review
    18          TZ015        250,000,000     150,000,000    review
    24          TZ007        180,000,000     110,000,000    valid
"""

from __future__ import annotations

import pandas as pd
import pytest

from analytics import run_analytics, write_outputs
from catalogs import (
    CRITICAL,
    HIGH,
    INDICATORS,
    INDICATORS_BY_ID,
    INSTITUTION_GRAIN,
    MEDIUM,
    SECTOR_GRAIN,
    THRESHOLDS,
    THRESHOLDS_BY_ID,
    threshold_catalog,
)

#: The curated layer of the shipped dataset.
EXPECTED_CURATED_RECORDS = 7
EXPECTED_PERIOD = "2026-11"
EXPECTED_REPORTING_INSTITUTIONS = {
    "TZ001", "TZ002", "TZ003", "TZ007", "TZ013", "TZ014", "TZ015",
}

#: Sector totals, computed by hand from the seven curated records.
EXPECTED_SECTOR_DEPOSITS = 2_110_000_000
EXPECTED_SECTOR_LOANS = 1_580_000_000
EXPECTED_SECTOR_RATIO = 0.7488

#: The exceptions the shipped dataset raises, and their severities.
EXPECTED_EXCEPTIONS = {
    "EXC-THR-003-TZ014-2026-11": CRITICAL,
    "EXC-THR-002-TZ013-2026-11": CRITICAL,
    "EXC-THR-004-TZ002-2026-11": HIGH,
    "EXC-THR-009-SECTOR-2026-11": HIGH,
    "EXC-THR-008-SECTOR-2026-11": MEDIUM,
    "EXC-THR-010-SECTOR-2026-11": MEDIUM,
}


def _value(result, indicator_id: str, subject_id: str | None = None):
    """Return one indicator value from the analytics result."""
    return result.indicator_value(indicator_id, EXPECTED_PERIOD, subject_id)


def _exceptions_for(result, indicator_id: str):
    """Return the exceptions raised on one indicator."""
    return result.exceptions.loc[result.exceptions["indicator_id"] == indicator_id]


def _build_layer(records, registry_rows, calendar_rows, audit_rows=()):
    """Build a curated layer from plain dictionaries, for a small fixture."""
    from curated import load_curated_layer

    registry = pd.DataFrame(registry_rows)
    calendar = pd.DataFrame(calendar_rows)
    records_frame = pd.DataFrame(records)
    audit = pd.DataFrame(
        list(audit_rows),
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
    return load_curated_layer(
        records_frame, audit, registry, calendar, "fixture-run"
    )


# ----------------------------------------------------------------------
# The curated layer
# ----------------------------------------------------------------------


def test_the_curated_layer_holds_the_expected_records(curated_layer):
    assert len(curated_layer.records) == EXPECTED_CURATED_RECORDS
    assert curated_layer.reporting_institutions == EXPECTED_REPORTING_INSTITUTIONS
    assert curated_layer.periods == [EXPECTED_PERIOD]


def test_the_curated_layer_refuses_a_missing_column():
    from curated import load_curated_layer

    with pytest.raises(ValueError, match="missing required column"):
        load_curated_layer(
            pd.DataFrame([{"institution_id": "TZ001"}]),
            pd.DataFrame(),
            pd.DataFrame(),
            pd.DataFrame(),
            "run",
        )


def test_the_curated_layer_reads_the_published_day1_artefacts(
    curated_layer_from_disk,
):
    """Day 2 consumes what Day 1 published, not an in-memory shortcut."""
    assert len(curated_layer_from_disk.records) == EXPECTED_CURATED_RECORDS
    assert curated_layer_from_disk.run_id


def test_expected_reporters_follow_the_register_cadence(curated_layer):
    """A monthly filer reports every month, a quarterly filer every quarter."""
    expected = curated_layer.expected_reporters("2026-11")
    assert len(expected) == 18
    assert "TZ015" not in expected
    assert "TZ001" in expected


# ----------------------------------------------------------------------
# The catalogs
# ----------------------------------------------------------------------


def test_the_indicator_catalog_is_well_formed():
    identifiers = [indicator.indicator_id for indicator in INDICATORS]
    assert len(identifiers) == len(set(identifiers))
    for indicator in INDICATORS:
        assert indicator.grain in (INSTITUTION_GRAIN, SECTOR_GRAIN)
        assert indicator.unit.strip()
        assert indicator.formula.strip()
        assert indicator.description.strip()
        assert indicator.decimals >= 0


def test_the_threshold_catalog_is_well_formed():
    identifiers = [threshold.threshold_id for threshold in THRESHOLDS]
    assert len(identifiers) == len(set(identifiers))
    for threshold in THRESHOLDS:
        indicator = INDICATORS_BY_ID[threshold.indicator_id]
        assert threshold.grain == indicator.grain
        assert threshold.severity in (CRITICAL, HIGH, MEDIUM, "LOW")
        assert threshold.lower_bound is not None or threshold.upper_bound is not None
        assert threshold.message.strip()
        assert threshold.rationale.strip()


def test_every_threshold_names_the_day1_rules_that_explain_it():
    """A threshold that claims a rule has to point at a rule that exists."""
    from day1_bridge import day1_rules

    known = {rule.rule_id for rule in day1_rules.RULES}
    for threshold in THRESHOLDS:
        for rule_id in threshold.explaining_rule_ids:
            assert rule_id in known, f"{threshold.threshold_id} names {rule_id}"


def test_the_threshold_catalog_is_exported_as_plain_data():
    catalog = threshold_catalog()
    assert len(catalog) == len(THRESHOLDS)
    assert catalog[0]["threshold_id"]
    assert catalog[0]["limit_description"]


def test_the_exported_catalogs_match_the_declared_ones(repo_root):
    """A stale export is a wrong catalog. The committed files have to match."""
    from catalogs import indicator_catalog_frame, threshold_catalog_frame

    reference = repo_root / "day-02-supervisory-analytics" / "datasets" / "reference"
    exported_indicators = pd.read_csv(reference / "indicator_catalog.csv")
    exported_thresholds = pd.read_csv(reference / "threshold_catalog.csv")

    assert list(exported_indicators["indicator_id"]) == list(
        indicator_catalog_frame()["indicator_id"]
    )
    assert list(exported_thresholds["threshold_id"]) == list(
        threshold_catalog_frame()["threshold_id"]
    )
    assert len(exported_indicators) == len(INDICATORS)
    assert len(exported_thresholds) == len(THRESHOLDS)


# ----------------------------------------------------------------------
# Indicators
# ----------------------------------------------------------------------


def test_every_indicator_in_the_catalog_is_computed(analytics_result):
    computed = set(analytics_result.indicators["indicator_id"])
    assert computed == {indicator.indicator_id for indicator in INDICATORS}


def test_the_loan_to_deposit_ratio_matches_hand_computed_values(analytics_result):
    assert _value(analytics_result, "IND-003", "TZ001") == 0.7
    assert _value(analytics_result, "IND-003", "TZ002") == 0.8
    assert _value(analytics_result, "IND-003", "TZ003") == 0.6667
    assert _value(analytics_result, "IND-003", "TZ007") == 0.6111
    assert _value(analytics_result, "IND-003", "TZ015") == 0.6
    assert _value(analytics_result, "IND-003", "TZ013") == 9.0


def test_the_ratio_of_an_institution_with_zero_deposits_is_null_not_infinite(
    analytics_result,
):
    """A ratio with a zero denominator is undefined. It is not zero either."""
    assert _value(analytics_result, "IND-003", "TZ014") is None
    assert _value(analytics_result, "IND-004", "TZ014") == 0.0


def test_the_sector_totals_match_hand_computed_values(analytics_result):
    assert _value(analytics_result, "IND-007") == EXPECTED_SECTOR_DEPOSITS
    assert _value(analytics_result, "IND-008") == EXPECTED_SECTOR_LOANS


def test_the_sector_ratio_matches_hand_computed_values(analytics_result):
    assert _value(analytics_result, "IND-009") == EXPECTED_SECTOR_RATIO


def test_the_deposit_share_matches_hand_computed_values(analytics_result):
    assert _value(analytics_result, "IND-004", "TZ002") == 35.545
    assert _value(analytics_result, "IND-004", "TZ001") == 23.6967
    assert _value(analytics_result, "IND-004", "TZ013") == 0.4739


def test_the_concentration_index_matches_an_independent_calculation(
    analytics_result, curated_layer
):
    """The index is recomputed here from the raw curated amounts."""
    records = curated_layer.records
    total = float(records["total_deposits"].sum())
    shares = [float(value) / total for value in records["total_deposits"]]
    expected = round(sum(share * share for share in shares) * 10000, 4)
    assert _value(analytics_result, "IND-010") == expected


def test_the_watchlist_exposure_counts_the_watchlist_institution(
    analytics_result,
):
    assert _value(analytics_result, "IND-011") == 1.0


def test_the_reporting_coverage_uses_the_register_cadence(analytics_result):
    assert _value(analytics_result, "IND-012") == 38.8889


def test_growth_indicators_are_null_without_an_earlier_period(analytics_result):
    """No history means no growth rate. It does not mean zero growth."""
    assert _value(analytics_result, "IND-005", "TZ001") is None
    assert _value(analytics_result, "IND-006", "TZ001") is None


def test_growth_indicators_are_computed_when_history_exists():
    """Two periods for one institution produce a growth rate."""
    records = [
        {
            "source_row_number": 1,
            "institution_id": "TZ001",
            "institution_name": "Institution Alpha",
            "reporting_date": "2026-10-31",
            "total_deposits": 1000,
            "total_loans": 500,
            "reporting_period": "2026-10",
            "validation_status": "valid",
        },
        {
            "source_row_number": 2,
            "institution_id": "TZ001",
            "institution_name": "Institution Alpha",
            "reporting_date": "2026-11-30",
            "total_deposits": 800,
            "total_loans": 500,
            "reporting_period": "2026-11",
            "validation_status": "valid",
        },
    ]
    registry = [
        {
            "institution_id": "TZ001",
            "institution_name": "Institution Alpha",
            "institution_type": "Commercial Bank",
            "licence_status": "Active",
            "region": "Dar es Salaam",
            "reporting_frequency": "Monthly",
            "watchlist_flag": "false",
        }
    ]
    calendar = [
        {
            "reporting_period": "2026-10",
            "period_start": "2026-10-01",
            "period_end": "2026-10-31",
            "submission_due_date": "2026-11-15",
            "status": "Closed",
        },
        {
            "reporting_period": "2026-11",
            "period_start": "2026-11-01",
            "period_end": "2026-11-30",
            "submission_due_date": "2026-12-15",
            "status": "Open",
        },
    ]
    layer = _build_layer(records, registry, calendar)
    result = run_analytics(layer)

    assert result.indicator_value("IND-005", "2026-11", "TZ001") == -20.0
    assert result.indicator_value("IND-006", "2026-11", "TZ001") == 0.0
    assert result.indicator_value("IND-005", "2026-10", "TZ001") is None


def test_the_growth_collapse_threshold_fires_on_history():
    """A fall of more than 20% raises the growth threshold."""
    records = [
        {
            "source_row_number": 1,
            "institution_id": "TZ001",
            "institution_name": "Institution Alpha",
            "reporting_date": "2026-10-31",
            "total_deposits": 1000,
            "total_loans": 500,
            "reporting_period": "2026-10",
            "validation_status": "valid",
        },
        {
            "source_row_number": 2,
            "institution_id": "TZ001",
            "institution_name": "Institution Alpha",
            "reporting_date": "2026-11-30",
            "total_deposits": 700,
            "total_loans": 500,
            "reporting_period": "2026-11",
            "validation_status": "valid",
        },
    ]
    registry = [
        {
            "institution_id": "TZ001",
            "institution_name": "Institution Alpha",
            "institution_type": "Commercial Bank",
            "licence_status": "Active",
            "region": "Dar es Salaam",
            "reporting_frequency": "Monthly",
            "watchlist_flag": "false",
        }
    ]
    calendar = [
        {
            "reporting_period": period,
            "period_start": f"{period}-01",
            "period_end": f"{period}-28",
            "submission_due_date": "2026-12-15",
            "status": "Open",
        }
        for period in ("2026-10", "2026-11")
    ]
    result = run_analytics(_build_layer(records, registry, calendar))

    assert result.indicator_value("IND-005", "2026-11", "TZ001") == -30.0
    exceptions = _exceptions_for(result, "IND-005")
    assert len(exceptions) == 1
    assert exceptions.iloc[0]["threshold_id"] == "THR-005"
    assert exceptions.iloc[0]["severity"] == HIGH


# ----------------------------------------------------------------------
# Exceptions
# ----------------------------------------------------------------------


def test_the_exceptions_match_hand_computed_expectations(analytics_result):
    raised = dict(
        zip(
            analytics_result.exceptions["exception_id"],
            analytics_result.exceptions["severity"],
        )
    )
    assert raised == EXPECTED_EXCEPTIONS


def test_an_exception_carries_the_threshold_evidence(analytics_result):
    row = analytics_result.exception("EXC-THR-002-TZ013-2026-11").iloc[0]
    assert row["observed_value"] == 9.0
    assert row["observed_value_text"] == "9.0000"
    assert row["limit_description"] == "above 1.5"
    assert row["severity"] == CRITICAL
    assert "critically high" in row["message"]
    assert row["explanation"].strip()


def test_every_exception_resolves_to_a_subject(analytics_result):
    exceptions = analytics_result.exceptions
    for _, row in exceptions.iterrows():
        if row["grain"] == INSTITUTION_GRAIN:
            assert row["institution_id"]
            assert row["source_row_number"]
        else:
            assert row["subject_id"] == "SECTOR"
            assert pd.isna(row["institution_id"])


def test_the_exception_identifiers_are_stable(analytics_result):
    """The same exception has the same identifier in every run."""
    identifiers = set(analytics_result.exceptions["exception_id"])
    assert identifiers == set(EXPECTED_EXCEPTIONS)
    for identifier in identifiers:
        parts = identifier.split("-")
        assert parts[0] == "EXC"
        assert f"{parts[1]}-{parts[2]}" in THRESHOLDS_BY_ID


def test_the_sector_thresholds_do_not_fire_on_a_healthy_sector(analytics_result):
    """Sector loans are below sector deposits, so THR-007 stays quiet."""
    assert len(_exceptions_for(analytics_result, "IND-009")) == 0


# ----------------------------------------------------------------------
# The link to the audit trail
# ----------------------------------------------------------------------


def test_every_audit_link_points_at_a_real_finding(
    analytics_result, curated_layer
):
    """The join test between the exception table and the audit table."""
    findings = {
        (int(row["source_row_number"]), row["rule_id"])
        for _, row in curated_layer.audit.iterrows()
    }
    links = analytics_result.links
    assert len(links)
    for _, row in links.iterrows():
        key = (int(row["source_row_number"]), row["rule_id"])
        assert key in findings, f"link points at a finding that does not exist: {key}"


def test_an_exception_from_a_flagged_record_carries_its_finding(
    analytics_result,
):
    """TZ013 was flagged for a ratio out of band, and the exception says so."""
    links = analytics_result.links.loc[
        analytics_result.links["exception_id"] == "EXC-THR-002-TZ013-2026-11"
    ]
    assert len(links) == 1
    link = links.iloc[0]
    assert link["rule_id"] == "W001"
    assert int(link["source_row_number"]) == 16
    assert link["relation"] == "explains"


def test_a_clean_record_raises_an_exception_without_a_finding(analytics_result):
    """TZ002 held a quarter of the sector's deposits with a clean record."""
    links = analytics_result.links.loc[
        analytics_result.links["exception_id"] == "EXC-THR-004-TZ002-2026-11"
    ]
    assert len(links) == 0
    row = analytics_result.exception("EXC-THR-004-TZ002-2026-11").iloc[0]
    assert "No data quality finding" in row["explanation"]


def test_a_sector_exception_links_to_the_findings_of_its_period(analytics_result):
    """The watchlist exposure exception is explained by the watchlist finding."""
    links = analytics_result.links.loc[
        analytics_result.links["exception_id"] == "EXC-THR-009-SECTOR-2026-11"
    ]
    explaining = links.loc[links["relation"] == "explains"]
    assert len(explaining) == 1
    assert explaining.iloc[0]["rule_id"] == "W003"
    assert int(explaining.iloc[0]["source_row_number"]) == 18


def test_a_link_never_points_at_a_rejected_record(analytics_result, curated_layer):
    """Only curated records can carry an exception."""
    curated_rows = set(int(row) for row in curated_layer.records["source_row_number"])
    for _, row in analytics_result.links.iterrows():
        assert int(row["source_row_number"]) in curated_rows


# ----------------------------------------------------------------------
# Reproducibility and provenance
# ----------------------------------------------------------------------


def test_the_analytics_run_is_deterministic(curated_layer):
    first = run_analytics(curated_layer)
    second = run_analytics(curated_layer)
    pd.testing.assert_frame_equal(first.indicators, second.indicators)
    pd.testing.assert_frame_equal(first.exceptions, second.exceptions)
    pd.testing.assert_frame_equal(first.links, second.links)
    pd.testing.assert_frame_equal(first.sector_summary, second.sector_summary)


def test_the_manifest_records_the_run(curated_layer_from_disk):
    result = run_analytics(curated_layer_from_disk)
    manifest = result.manifest
    assert manifest["run_id"] == curated_layer_from_disk.run_id
    assert manifest["curated_records"] == EXPECTED_CURATED_RECORDS
    assert manifest["exceptions"] == len(EXPECTED_EXCEPTIONS)
    assert manifest["indicators_evaluated"] == len(INDICATORS)
    assert manifest["thresholds_evaluated"] == len(THRESHOLDS)
    assert manifest["input_sha256"]
    assert "valid_records" in manifest["input_sha256"]


def test_the_summary_counts_the_exceptions_by_severity(analytics_result):
    summary = analytics_result.exception_summary
    counts = dict(zip(summary["severity"], summary["exceptions"]))
    assert counts[CRITICAL] == 2
    assert counts[HIGH] == 2
    assert counts[MEDIUM] == 2


def test_the_sector_summary_reports_the_coverage_gap(analytics_result):
    summary = analytics_result.sector_summary.iloc[0]
    assert summary["institutions_reporting"] == 7
    assert summary["institutions_expected"] == 18
    assert summary["institutions_missing"] == 12
    assert summary["exceptions"] == len(EXPECTED_EXCEPTIONS)


def test_write_outputs_creates_every_artefact(tmp_path, analytics_result):
    paths = write_outputs(
        analytics_result,
        output_dir=tmp_path / "processed",
        report_dir=tmp_path / "reports",
    )
    for label, path in paths.items():
        assert path.exists(), f"{label} was not written"
        assert path.stat().st_size > 0
