"""Tests for the Day 2 API.

The API is the door between the analytics layer and the dashboard, so the
tests are about two things: that it serves the right numbers, and that it
does not serve them to anyone who does not present the token.

The API is built in the tests with an in-memory read model and a known
token, so the suite runs on a machine with no database and no environment
variable set.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api import create_app
from repository import InMemoryRepository

#: The token the tests configure. It is a test value, not a credential.
TEST_TOKEN = "training-token-for-the-test-suite"

EXPECTED_EXCEPTIONS = 6
EXPECTED_INDICATORS = 48
EXPECTED_INSTITUTIONS = 19


@pytest.fixture(scope="module")
def client(analytics_result, curated_layer):
    """Build the API over the in-memory read model."""
    repository = InMemoryRepository(analytics_result, curated_layer.registry)
    app = create_app(repository=repository, token=TEST_TOKEN)
    return TestClient(app)


@pytest.fixture(scope="module")
def headers():
    """The authorization header a protected endpoint needs."""
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


# ----------------------------------------------------------------------
# Authentication
# ----------------------------------------------------------------------


def test_the_health_endpoint_is_public(client):
    """A health check that needs a credential cannot report that the service is up."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["training_only"] is True


def test_a_protected_endpoint_rejects_a_missing_token(client):
    response = client.get("/api/v1/exceptions")
    assert response.status_code == 401
    assert response.headers.get("WWW-Authenticate") == "Bearer"


def test_a_protected_endpoint_rejects_an_invalid_token(client):
    response = client.get(
        "/api/v1/exceptions", headers={"Authorization": "Bearer wrong-token"}
    )
    assert response.status_code == 401


def test_a_protected_endpoint_rejects_a_malformed_header(client):
    response = client.get("/api/v1/exceptions", headers={"Authorization": TEST_TOKEN})
    assert response.status_code == 401


def test_a_protected_endpoint_accepts_the_configured_token(client, headers):
    response = client.get("/api/v1/exceptions", headers=headers)
    assert response.status_code == 200


def test_the_api_refuses_to_start_without_a_token(monkeypatch):
    """There is no default token. A missing one is a startup failure."""
    from auth import API_TOKEN_ENV

    monkeypatch.delenv(API_TOKEN_ENV, raising=False)
    with pytest.raises(RuntimeError, match=API_TOKEN_ENV):
        create_app(repository=object())


def test_the_token_is_never_echoed_by_the_api(client, headers):
    """The configured token must never appear in a response."""
    for path in ("/health", "/api/v1/exceptions", "/api/v1/summary"):
        response = client.get(path, headers=headers)
        assert TEST_TOKEN not in response.text


def test_the_token_is_never_echoed_in_a_failure(client):
    response = client.get(
        "/api/v1/exceptions", headers={"Authorization": f"Bearer {TEST_TOKEN}-x"}
    )
    assert TEST_TOKEN not in response.text


# ----------------------------------------------------------------------
# The read model
# ----------------------------------------------------------------------


def test_the_api_serves_the_expected_exceptions(client, headers):
    response = client.get("/api/v1/exceptions", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == EXPECTED_EXCEPTIONS
    assert {item["exception_id"] for item in payload["exceptions"]} == {
        "EXC-THR-002-TZ013-2026-11",
        "EXC-THR-003-TZ014-2026-11",
        "EXC-THR-004-TZ002-2026-11",
        "EXC-THR-008-SECTOR-2026-11",
        "EXC-THR-009-SECTOR-2026-11",
        "EXC-THR-010-SECTOR-2026-11",
    }


def test_the_exceptions_endpoint_filters_by_severity(client, headers):
    response = client.get(
        "/api/v1/exceptions", params={"severity": "CRITICAL"}, headers=headers
    )
    payload = response.json()
    assert payload["count"] == 2
    assert {item["severity"] for item in payload["exceptions"]} == {"CRITICAL"}


def test_the_exceptions_endpoint_filters_by_institution(client, headers):
    response = client.get(
        "/api/v1/exceptions", params={"institution_id": "TZ013"}, headers=headers
    )
    payload = response.json()
    assert payload["count"] == 1
    assert payload["exceptions"][0]["institution_id"] == "TZ013"


def test_the_exception_detail_carries_the_audit_entries(client, headers):
    """An exception is never served without the evidence behind it."""
    response = client.get(
        "/api/v1/exceptions/EXC-THR-002-TZ013-2026-11", headers=headers
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["severity"] == "CRITICAL"
    assert payload["observed_value"] == 9.0
    assert payload["limit_description"] == "above 1.5"
    assert payload["explanation"]
    entries = payload["audit_entries"]
    assert len(entries) == 1
    assert entries[0]["rule_id"] == "W001"
    assert entries[0]["relation"] == "explains"


def test_an_unknown_exception_is_not_found(client, headers):
    response = client.get("/api/v1/exceptions/EXC-NOTHING", headers=headers)
    assert response.status_code == 404


def test_the_indicators_endpoint_returns_the_computed_values(client, headers):
    response = client.get("/api/v1/indicators", headers=headers)
    payload = response.json()
    assert payload["count"] == EXPECTED_INDICATORS


def test_the_indicators_endpoint_filters_by_institution(client, headers):
    response = client.get(
        "/api/v1/indicators",
        params={"institution_id": "TZ001"},
        headers=headers,
    )
    payload = response.json()
    assert payload["count"] == 6
    assert {item["indicator_id"] for item in payload["indicators"]} == {
        "IND-001",
        "IND-002",
        "IND-003",
        "IND-004",
        "IND-005",
        "IND-006",
    }


def test_the_indicators_endpoint_filters_by_grain(client, headers):
    response = client.get(
        "/api/v1/indicators", params={"grain": "sector"}, headers=headers
    )
    payload = response.json()
    assert payload["count"] == 6
    assert {item["subject_id"] for item in payload["indicators"]} == {"SECTOR"}


def test_the_api_serves_only_the_curated_layer(client, headers):
    """A rejected submission must not appear anywhere in the read model."""
    response = client.get("/api/v1/indicators", headers=headers)
    institutions = {item["institution_id"] for item in response.json()["indicators"]}
    institutions.discard(None)
    assert institutions == {"TZ001", "TZ002", "TZ003", "TZ007", "TZ013", "TZ014", "TZ015"}
    assert "TZ999" not in institutions
    assert "TZ004" not in institutions


def test_the_institutions_endpoint_serves_the_register(client, headers):
    response = client.get("/api/v1/institutions", headers=headers)
    payload = response.json()
    assert payload["count"] == EXPECTED_INSTITUTIONS
    alpha = [
        item for item in payload["institutions"]
        if item["institution_id"] == "TZ002"
    ][0]
    assert alpha["exceptions"] == 1


def test_an_unknown_institution_is_not_found(client, headers):
    response = client.get("/api/v1/institutions/TZ999", headers=headers)
    assert response.status_code == 404


def test_the_institution_detail_carries_its_indicators(client, headers):
    response = client.get("/api/v1/institutions/TZ013", headers=headers)
    payload = response.json()
    assert payload["institution_id"] == "TZ013"
    assert len(payload["indicators"]) == 6
    assert len(payload["exceptions"]) == 1


def test_the_summary_endpoint_returns_the_sector_numbers(client, headers):
    response = client.get(
        "/api/v1/summary", params={"reporting_period": "2026-11"}, headers=headers
    )
    payload = response.json()
    assert payload["sector_total_deposits"] == 2_110_000_000
    assert payload["sector_total_loans"] == 1_580_000_000
    assert payload["sector_loan_to_deposit_ratio"] == 0.7488
    assert payload["sector_reporting_coverage_ratio"] == 38.8889
    assert payload["exceptions"] == EXPECTED_EXCEPTIONS


def test_the_meta_endpoint_serves_the_catalogs(client, headers):
    response = client.get("/api/v1/meta", headers=headers)
    payload = response.json()
    assert payload["indicator_count"] == 12
    assert payload["threshold_count"] == 10
    assert payload["indicators"][0]["indicator_id"] == "IND-001"
    assert payload["thresholds"][0]["threshold_id"] == "THR-001"


def test_the_openapi_document_is_served(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/v1/exceptions" in paths
    assert "/api/v1/indicators" in paths


def test_the_api_never_reads_the_submitted_file(client, headers):
    """The API serves the read model. It does not touch the raw dataset."""
    response = client.get("/api/v1/exceptions", headers=headers)
    assert "source_file" not in response.text
    for item in response.json()["exceptions"]:
        assert "raw_" not in item
