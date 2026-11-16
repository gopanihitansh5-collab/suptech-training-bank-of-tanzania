"""The read model the API serves.

The API never reads the submitted file and never recomputes an indicator. It
reads the Day 2 read model, which is either the published artefacts or the
tables in PostgreSQL.

Two repositories implement the same contract:

``InMemoryRepository``
    Serves the result of an analytics run that is already in memory. It is
    what the API uses when the training machine has no database, and it is
    what the API tests use.

``PostgresRepository``
    Serves the tables in PostgreSQL. It is used when ``DATABASE_URL`` points
    at an approved development database.

The contract is deliberately small. Everything the dashboard needs is here,
and everything the dashboard does not need is not: there is no write
operation, because triage workflow is out of scope for the prototype.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from catalogs import indicator_catalog, threshold_catalog
from curated import expected_reporters
from indicators import SECTOR_SUBJECT


def _is_missing(value: Any) -> bool:
    """Return True for a missing value, whatever its type."""
    if value is None:
        return True
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def _plain(value: Any) -> Any:
    """Convert a numpy or pandas value into a plain Python value."""
    if hasattr(value, "item") and not isinstance(value, (str, bytes)):
        try:
            return value.item()
        except (AttributeError, ValueError):
            return value
    return value


def to_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    """Convert a pandas frame into JSON-safe dictionaries."""
    records: list[dict[str, Any]] = []
    for _, row in frame.iterrows():
        record: dict[str, Any] = {}
        for column in frame.columns:
            value = row[column]
            record[column] = None if _is_missing(value) else _plain(value)
        records.append(record)
    return records


class InMemoryRepository:
    """Serve the read model from an analytics run held in memory."""

    def __init__(self, result, registry: pd.DataFrame) -> None:
        self.result = result
        self.registry = registry

    @property
    def run_id(self) -> str | None:
        """The identifier of the run this read model was computed from."""
        return getattr(self.result, "run_id", None)

    def indicators(
        self,
        institution_id: str | None = None,
        reporting_period: str | None = None,
        indicator_id: str | None = None,
        grain: str | None = None,
        run_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return the indicator values that match the filters."""
        frame = self.result.indicators
        if institution_id is not None:
            frame = frame.loc[frame["institution_id"] == institution_id]
        if reporting_period is not None:
            frame = frame.loc[frame["reporting_period"] == reporting_period]
        if indicator_id is not None:
            frame = frame.loc[frame["indicator_id"] == indicator_id]
        if grain is not None:
            frame = frame.loc[frame["grain"] == grain]
        if run_id is not None:
            frame = frame.loc[frame["run_id"] == run_id]
        return to_records(frame)

    def exceptions(
        self,
        institution_id: str | None = None,
        reporting_period: str | None = None,
        severity: str | None = None,
        indicator_id: str | None = None,
        threshold_id: str | None = None,
        run_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return the exceptions that match the filters."""
        frame = self.result.exceptions
        if institution_id is not None:
            frame = frame.loc[frame["institution_id"] == institution_id]
        if reporting_period is not None:
            frame = frame.loc[frame["reporting_period"] == reporting_period]
        if severity is not None:
            frame = frame.loc[frame["severity"] == severity]
        if indicator_id is not None:
            frame = frame.loc[frame["indicator_id"] == indicator_id]
        if threshold_id is not None:
            frame = frame.loc[frame["threshold_id"] == threshold_id]
        if run_id is not None:
            frame = frame.loc[frame["run_id"] == run_id]
        return to_records(frame)

    def exception_detail(
        self, exception_id: str, run_id: str | None = None
    ) -> dict[str, Any] | None:
        """Return one exception with the audit entries that explain it."""
        matching = self.result.exceptions.loc[
            self.result.exceptions["exception_id"] == exception_id
        ]
        if run_id is not None:
            matching = matching.loc[matching["run_id"] == run_id]
        if not len(matching):
            return None
        detail = to_records(matching)[0]
        links = self.result.links.loc[
            self.result.links["exception_id"] == exception_id
        ]
        if run_id is not None:
            links = links.loc[links["run_id"] == run_id]
        detail["audit_entries"] = to_records(links)
        return detail

    def institutions(self) -> list[dict[str, Any]]:
        """Return the supervised institution register with its exception counts."""
        records = to_records(self.registry)
        exceptions = to_records(self.result.exceptions)
        for record in records:
            institution_id = record.get("institution_id")
            owned = [
                exception
                for exception in exceptions
                if exception.get("institution_id") == institution_id
            ]
            record["exceptions"] = len(owned)
            record["critical_exceptions"] = sum(
                1 for exception in owned if exception.get("severity") == "CRITICAL"
            )
        return records

    def institution(self, institution_id: str) -> dict[str, Any] | None:
        """Return one institution with its indicators and exceptions."""
        matching = [
            record
            for record in self.institutions()
            if record.get("institution_id") == institution_id
        ]
        if not matching:
            return None
        detail = matching[0]
        detail["indicators"] = self.indicators(
            institution_id=institution_id
        )
        detail["exceptions"] = self.exceptions(institution_id=institution_id)
        return detail

    def summary(self, reporting_period: str | None = None) -> dict[str, Any]:
        """Return the sector summary of one period, or of every period."""
        frame = self.result.sector_summary
        if reporting_period is not None:
            frame = frame.loc[frame["reporting_period"] == reporting_period]
        periods = to_records(frame)
        if reporting_period is not None:
            return periods[0] if periods else {}
        return {
            "run_id": self.result.run_id,
            "periods": periods,
            "exceptions_by_severity": to_records(self.result.exception_summary),
        }

    def catalogs(self) -> dict[str, Any]:
        """Return the indicator catalog and the threshold catalog."""
        return {
            "indicators": indicator_catalog(),
            "thresholds": threshold_catalog(),
        }


class PostgresRepository:
    """Serve the read model from the tables in PostgreSQL.

    The database holds every run, so the repository serves one run at a
    time: the most recent one, unless a run is named explicitly. Every
    payload carries its run identifier, so a consumer can always tell which
    run it is looking at.
    """

    def __init__(self, engine, run_id: str | None = None) -> None:
        self.engine = engine
        self._requested_run_id = run_id

    def _query(self, sql: str, parameters: dict[str, Any] | None = None):
        from sqlalchemy import text

        with self.engine.connect() as connection:
            rows = connection.execute(text(sql), parameters or {}).mappings()
            return [dict(row) for row in rows]

    @property
    def run_id(self) -> str | None:
        """The identifier of the run this repository serves."""
        if self._requested_run_id:
            return self._requested_run_id
        rows = self._query(
            "SELECT run_id FROM suptech.supervisory_indicator "
            "GROUP BY run_id ORDER BY max(created_at) DESC LIMIT 1"
        )
        return rows[0]["run_id"] if rows else None

    def indicators(
        self,
        institution_id: str | None = None,
        reporting_period: str | None = None,
        indicator_id: str | None = None,
        grain: str | None = None,
        run_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return the indicator values that match the filters."""
        conditions, parameters = _filters(
            institution_id=institution_id,
            reporting_period=reporting_period,
            indicator_id=indicator_id,
            grain=grain,
            run_id=run_id or self.run_id,
        )
        where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        return self._query(
            "SELECT run_id, indicator_id, indicator_name, grain, "
            "reporting_period, subject_id, institution_id, indicator_value, "
            "unit, decimals, direction, calculation_basis "
            "FROM suptech.supervisory_indicator"
            f"{where} ORDER BY reporting_period, indicator_id, subject_id",
            parameters,
        )

    def exceptions(
        self,
        institution_id: str | None = None,
        reporting_period: str | None = None,
        severity: str | None = None,
        indicator_id: str | None = None,
        threshold_id: str | None = None,
        run_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return the exceptions that match the filters."""
        conditions, parameters = _filters(
            institution_id=institution_id,
            reporting_period=reporting_period,
            indicator_id=indicator_id,
            severity=severity,
            threshold_id=threshold_id,
            run_id=run_id or self.run_id,
        )
        where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        return self._query(
            "SELECT exception_id, run_id, threshold_id, threshold_name, "
            "indicator_id, indicator_name, grain, reporting_period, "
            "subject_id, institution_id, source_row_number, severity, "
            "observed_value, observed_value_text, limit_description, message, "
            "explanation, status, link_mode "
            "FROM suptech.supervisory_exception"
            f"{where} ORDER BY severity, reporting_period, indicator_id, "
            "subject_id",
            parameters,
        )

    def exception_detail(
        self, exception_id: str, run_id: str | None = None
    ) -> dict[str, Any] | None:
        """Return one exception with the audit entries that explain it."""
        matching = self._query(
            "SELECT exception_id, run_id, threshold_id, threshold_name, "
            "indicator_id, indicator_name, grain, reporting_period, "
            "subject_id, institution_id, source_row_number, severity, "
            "observed_value, observed_value_text, limit_description, message, "
            "explanation, status, link_mode "
            "FROM suptech.supervisory_exception "
            "WHERE exception_id = :id AND run_id = :run_id",
            {"id": exception_id, "run_id": run_id or self.run_id},
        )
        if not matching:
            return None
        detail = matching[0]
        detail["audit_entries"] = self._query(
            "SELECT exception_id, run_id, reporting_period, source_row_number, "
            "rule_id, rule_name, severity, observed_value, detail, relation, "
            "link_mode FROM suptech.exception_audit_link "
            "WHERE exception_id = :id AND run_id = :run_id "
            "ORDER BY source_row_number, rule_id",
            {"id": exception_id, "run_id": run_id or self.run_id},
        )
        return detail

    def institutions(self) -> list[dict[str, Any]]:
        """Return the supervised institution register with its exception counts."""
        return self._query(
            "SELECT i.institution_id, i.institution_name, i.institution_type, "
            "i.licence_status, i.region, i.reporting_frequency, "
            "i.watchlist_flag, "
            "count(e.exception_id) AS exceptions, "
            "count(e.exception_id) FILTER (WHERE e.severity = 'CRITICAL') "
            "AS critical_exceptions "
            "FROM suptech.institution i "
            "LEFT JOIN suptech.supervisory_exception e "
            "ON e.institution_id = i.institution_id "
            "GROUP BY i.institution_id, i.institution_name, i.institution_type, "
            "i.licence_status, i.region, i.reporting_frequency, "
            "i.watchlist_flag ORDER BY i.institution_id"
        )

    def institution(self, institution_id: str) -> dict[str, Any] | None:
        """Return one institution with its indicators and exceptions."""
        matching = [
            record
            for record in self.institutions()
            if record.get("institution_id") == institution_id
        ]
        if not matching:
            return None
        detail = matching[0]
        detail["indicators"] = self.indicators(institution_id=institution_id)
        detail["exceptions"] = self.exceptions(institution_id=institution_id)
        return detail

    def summary(self, reporting_period: str | None = None) -> dict[str, Any]:
        """Return the sector summary of one period, or of every period."""
        parameters: dict[str, Any] = {"run_id": self.run_id}
        conditions = ["run_id = :run_id"]
        if reporting_period is not None:
            conditions.append("reporting_period = :period")
            parameters["period"] = reporting_period
        where = f" WHERE {' AND '.join(conditions)}"
        periods = self._query(
            "SELECT reporting_period, "
            "count(DISTINCT institution_id) FILTER "
            "(WHERE grain = 'institution') AS institutions_reporting, "
            "max(indicator_value) FILTER (WHERE indicator_id = 'IND-007') "
            "AS sector_total_deposits, "
            "max(indicator_value) FILTER (WHERE indicator_id = 'IND-008') "
            "AS sector_total_loans, "
            "max(indicator_value) FILTER (WHERE indicator_id = 'IND-009') "
            "AS sector_loan_to_deposit_ratio, "
            "max(indicator_value) FILTER (WHERE indicator_id = 'IND-010') "
            "AS sector_deposit_concentration_hhi, "
            "max(indicator_value) FILTER (WHERE indicator_id = 'IND-011') "
            "AS sector_watchlist_exposure_count, "
            "max(indicator_value) FILTER (WHERE indicator_id = 'IND-012') "
            "AS sector_reporting_coverage_ratio "
            "FROM suptech.supervisory_indicator"
            f"{where} GROUP BY reporting_period ORDER BY reporting_period",
            parameters,
        )
        for period in periods:
            expected = len(
                expected_reporters(self._registry(), period["reporting_period"])
            )
            reporting = int(period.get("institutions_reporting") or 0)
            period["institutions_expected"] = expected
            period["institutions_missing"] = max(expected - reporting, 0)
        if reporting_period is not None:
            return periods[0] if periods else {}
        return {"run_id": self.run_id, "periods": periods}

    def _registry(self) -> pd.DataFrame:
        """Return the institution register as a frame."""
        rows = self._query(
            "SELECT institution_id, reporting_frequency FROM suptech.institution"
        )
        return pd.DataFrame(rows)

    def catalogs(self) -> dict[str, Any]:
        """Return the indicator catalog and the threshold catalog."""
        return {
            "indicators": indicator_catalog(),
            "thresholds": threshold_catalog(),
        }


def _filters(**filters: str | None) -> tuple[list[str], dict[str, Any]]:
    """Build the WHERE clauses and the parameters of a filtered read."""
    conditions: list[str] = []
    parameters: dict[str, Any] = {}
    for column, value in filters.items():
        if value is None:
            continue
        conditions.append(f"{column} = :{column}")
        parameters[column] = value
    return conditions, parameters


def build_repository(result, registry: pd.DataFrame, database_url: str | None = None):
    """Return the repository the API should serve from.

    A database is used when one is configured and reachable. Otherwise the
    read model is served from the analytics result in memory, so that the
    API can be demonstrated on a machine with no PostgreSQL instance.
    """
    if database_url:
        from loader import create_engine

        return PostgresRepository(create_engine(database_url))
    return InMemoryRepository(result, registry)


def sector_subject() -> str:
    """Return the subject identifier used for sector level rows."""
    return SECTOR_SUBJECT
