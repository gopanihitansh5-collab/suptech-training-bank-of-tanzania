"""Supervisory indicators computed over the Day 1 curated layer.

This module turns the curated records into the numbers a supervisor looks
at. It is the middle of the chain the architecture describes:

```text
a submitted record  ->  a trustworthy record  ->  an indicator  ->  an exception
```

Three decisions are worth defending.

**Money is handled as decimal, not as float.** Day 1 declared ``numeric(18,2)``
because a binary floating point value cannot represent most decimal fractions
exactly. The same reasoning applies here: sector totals are sums of submitted
amounts, and a sum of near-exact values drifts. The arithmetic is done with
``decimal.Decimal`` and only converted to a float when the value is written
out, which is where the declared number of decimals is applied.

**An indicator that cannot be computed is null, not zero.** The loan-to-deposit
ratio of an institution that reports zero deposits is undefined, not infinite
and not zero. The same is true of a growth rate for an institution with no
earlier period in the curated layer. A null is honest; a zero is a claim
that was never supported.

**The grain of every indicator is declared.** An indicator is computed for one
institution in one period, or for the whole sector in one period. The grain
is part of the catalog, so a consumer never has to guess whether a number is an
institution's figure or the sector's.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

import pandas as pd

from catalogs import INDICATORS_BY_ID, INSTITUTION_GRAIN, SECTOR_GRAIN
from curated import CuratedLayer

#: The subject identifier used for a sector level row.
SECTOR_SUBJECT = "SECTOR"


def _decimal(value: Any) -> Decimal | None:
    """Return a Decimal for a numeric value, or None when it is missing."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _ratio(numerator: Decimal | None, denominator: Decimal | None) -> Decimal | None:
    """Divide two decimals, refusing to divide by zero or by nothing."""
    if numerator is None or denominator is None:
        return None
    if denominator == 0:
        return None
    return numerator / denominator


def _percentage(part: Decimal | None, whole: Decimal | None) -> Decimal | None:
    """Return part as a percentage of whole, or None when that is impossible."""
    if part is None or whole is None:
        return None
    if whole == 0:
        return None
    return part / whole * Decimal(100)


def _round(value: Decimal | float | None, decimals: int) -> float | None:
    """Round a value to the declared number of decimals, keeping nulls null."""
    if value is None:
        return None
    return float(round(float(value), decimals))


def _previous_periods(records: pd.DataFrame) -> dict[tuple[str, str], str]:
    """Map every (institution, period) to the institution's previous period.

    "Previous" means the previous period present in the curated layer for
    that institution, ordered by period. A gap in the curated layer is a
    gap, and the growth rate is then computed against the last period that
    actually exists rather than against an invented one.
    """
    previous: dict[tuple[str, str], str] = {}
    for institution_id, group in records.groupby("institution_id", dropna=True):
        periods = sorted(set(group["reporting_period"].dropna()))
        for index in range(1, len(periods)):
            previous[(institution_id, periods[index])] = periods[index - 1]
    return previous


def compute_indicators(curated: CuratedLayer) -> pd.DataFrame:
    """Compute every declared indicator over the curated layer.

    The result is in long format: one row per indicator, per subject, per
    reporting period. That is the format the API reads, the loader writes
    and the exception rules evaluate.
    """
    records = curated.records
    rows: list[dict[str, Any]] = []

    deposits = [
        _decimal(value) for value in records["total_deposits"].tolist()
    ]
    loans = [_decimal(value) for value in records["total_loans"].tolist()]
    working = records.copy()
    working["deposits"] = deposits
    working["loans"] = loans

    previous_periods = _previous_periods(working)

    for reporting_period in curated.periods:
        period = working.loc[working["reporting_period"] == reporting_period]
        if not len(period):
            continue

        sector_deposits = _sum(period["deposits"])
        sector_loans = _sum(period["loans"])

        for _, record in period.iterrows():
            institution_id = record["institution_id"]
            source_row = int(record["source_row_number"])
            institution_deposits = record["deposits"]
            institution_loans = record["loans"]
            basis = f"curated record source row {source_row}"

            rows.append(
                _row(
                    curated.run_id, "IND-001", reporting_period, institution_id,
                    institution_deposits,
                    f"{basis}, total_deposits as submitted",
                )
            )
            rows.append(
                _row(
                    curated.run_id, "IND-002", reporting_period, institution_id,
                    institution_loans,
                    f"{basis}, total_loans as submitted",
                )
            )
            rows.append(
                _row(
                    curated.run_id, "IND-003", reporting_period, institution_id,
                    _ratio(institution_loans, institution_deposits),
                    f"{basis}, total_loans / total_deposits",
                )
            )
            rows.append(
                _row(
                    curated.run_id, "IND-004", reporting_period, institution_id,
                    _percentage(institution_deposits, sector_deposits),
                    f"{basis}, institution deposits / sector deposits for "
                    f"{reporting_period}",
                )
            )

            previous_period = previous_periods.get((institution_id, reporting_period))
            if previous_period is None:
                growth_basis = (
                    "no earlier period for this institution in the curated layer"
                )
                deposit_growth = None
                loan_growth = None
            else:
                earlier = working.loc[
                    (working["institution_id"] == institution_id)
                    & (working["reporting_period"] == previous_period)
                ]
                if not len(earlier):
                    deposit_growth = None
                    loan_growth = None
                    growth_basis = (
                        f"period {previous_period} is not in the curated layer"
                    )
                else:
                    earlier_row = earlier.iloc[0]
                    deposit_growth = _percentage(
                        institution_deposits - earlier_row["deposits"],
                        earlier_row["deposits"],
                    )
                    loan_growth = _percentage(
                        institution_loans - earlier_row["loans"],
                        earlier_row["loans"],
                    )
                    growth_basis = f"against period {previous_period} in the curated layer"

            rows.append(
                _row(
                    curated.run_id, "IND-005", reporting_period, institution_id,
                    deposit_growth,
                    f"{basis}, deposit change {growth_basis}",
                )
            )
            rows.append(
                _row(
                    curated.run_id, "IND-006", reporting_period, institution_id,
                    loan_growth,
                    f"{basis}, loan change {growth_basis}",
                )
            )

        expected = curated.expected_reporters(reporting_period)
        reporting = set(period["institution_id"].dropna())

        rows.append(
            _row(
                curated.run_id, "IND-007", reporting_period, None,
                sector_deposits,
                f"sum of total_deposits over {len(period)} curated records for "
                f"{reporting_period}",
            )
        )
        rows.append(
            _row(
                curated.run_id, "IND-008", reporting_period, None,
                sector_loans,
                f"sum of total_loans over {len(period)} curated records for "
                f"{reporting_period}",
            )
        )
        rows.append(
            _row(
                curated.run_id, "IND-009", reporting_period, None,
                _ratio(sector_loans, sector_deposits),
                f"sector total_loans / sector total_deposits for {reporting_period}",
            )
        )
        rows.append(
            _row(
                curated.run_id, "IND-010", reporting_period, None,
                _concentration(period, sector_deposits),
                f"sum of squared deposit shares over {len(period)} curated "
                f"records for {reporting_period}, scaled to 10000",
            )
        )
        rows.append(
            _row(
                curated.run_id, "IND-011", reporting_period, None,
                Decimal(len(period.loc[period["institution_id"].isin(curated.watchlist_ids)])),
                "curated records whose institution has watchlist_flag true",
            )
        )
        rows.append(
            _row(
                curated.run_id, "IND-012", reporting_period, None,
                _percentage(Decimal(len(reporting)), Decimal(len(expected))),
                f"{len(reporting)} of {len(expected)} expected reporters filed a "
                f"curated record for {reporting_period}",
            )
        )

    return _to_frame(rows)


def _sum(values) -> Decimal:
    """Sum a column of decimals, treating missing values as absent."""
    total = Decimal(0)
    for value in values:
        if value is not None:
            total += value
    return total


def _concentration(period: pd.DataFrame, sector_deposits: Decimal) -> Decimal | None:
    """Return the Herfindahl-Hirschman index of the period's deposit shares."""
    if sector_deposits is None or sector_deposits == 0:
        return None
    total = Decimal(0)
    for value in period["deposits"]:
        if value is None:
            continue
        share = value / sector_deposits
        total += share * share
    return total * Decimal(10000)


def _row(
    run_id: str,
    indicator_id: str,
    reporting_period: str,
    institution_id: str | None,
    value: Decimal | None,
    basis: str,
) -> dict[str, Any]:
    """Build one row of the indicator table."""
    indicator = INDICATORS_BY_ID[indicator_id]
    is_institution = institution_id is not None
    grain = INSTITUTION_GRAIN if is_institution else SECTOR_GRAIN
    subject = institution_id if is_institution else SECTOR_SUBJECT
    return {
        "run_id": run_id,
        "indicator_id": indicator_id,
        "indicator_name": indicator.name,
        "grain": grain,
        "reporting_period": reporting_period,
        "subject_id": subject,
        "institution_id": institution_id,
        "indicator_value": _round(value, indicator.decimals),
        "unit": indicator.unit,
        "decimals": indicator.decimals,
        "direction": indicator.direction,
        "calculation_basis": basis,
    }


def _to_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    """Build the indicator table with a fixed column order."""
    columns = (
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
    frame = pd.DataFrame(rows, columns=list(columns))
    if len(frame):
        frame = frame.sort_values(
            ["reporting_period", "indicator_id", "subject_id"]
        ).reset_index(drop=True)
    return frame


def indicator_value(
    indicators: pd.DataFrame,
    indicator_id: str,
    reporting_period: str,
    subject_id: str | None = None,
) -> float | None:
    """Return one indicator value, or None when it is not there."""
    match = indicators.loc[
        (indicators["indicator_id"] == indicator_id)
        & (indicators["reporting_period"] == reporting_period)
    ]
    if subject_id is not None:
        match = match.loc[match["subject_id"] == subject_id]
    if not len(match):
        return None
    value = match.iloc[0]["indicator_value"]
    if value is None or pd.isna(value):
        return None
    return float(value)


def format_value(value: float | None, indicator_id: str) -> str:
    """Format an indicator value for display, using its declared decimals."""
    if value is None:
        return ""
    indicator = INDICATORS_BY_ID.get(indicator_id)
    decimals = indicator.decimals if indicator else 2
    return f"{float(value):,.{decimals}f}"
