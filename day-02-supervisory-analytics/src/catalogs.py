"""The Day 2 supervisory catalogs: indicators and thresholds.

Both catalogs are data, not code, for the same reason the Day 1 rule catalog
is data: a supervisor has to be able to read them, argue about them and
export them without reading the pipeline.

The distinction between the two catalogs matters:

``Indicator``
    A measure that is computed over the curated layer. It says what the
    numbers are. An indicator carries no judgement: a loan-to-deposit ratio
    of 1.4 is a number, and only a threshold decides whether it is a
    problem.

``Threshold``
    A declared limit on one indicator, with the severity of a breach and
    the reason a supervisor would give for caring. It says when a number
    becomes an exception.

The severities here are **not** the Day 1 severities. Day 1 asks *can this
record be trusted* and answers ``BLOCK`` or ``WARN``. Day 2 asks *does this
number deserve a supervisor's attention* and answers ``CRITICAL``,
``HIGH``, ``MEDIUM`` or ``LOW``. A record can be flawless and still raise a
critical exception, and a record can be perfectly clean of supervisory risk
and still have been rejected for a broken date.

All values in this repository are synthetic training data and the thresholds
below are illustrative prototype values. They are not official supervisory
limits and they have not been agreed with any supervisor.
"""

from __future__ import annotations

from dataclasses import dataclass

INSTITUTION_GRAIN = "institution"
SECTOR_GRAIN = "sector"

CRITICAL = "CRITICAL"
HIGH = "HIGH"
MEDIUM = "MEDIUM"
LOW = "LOW"

#: Severities from most to least urgent. Used for ordering everywhere.
SEVERITY_ORDER: tuple[str, ...] = (CRITICAL, HIGH, MEDIUM, LOW)

#: How an exception is connected to the data quality audit trail.
RECORD_LINK = "record"
PERIOD_LINK = "period"

#: How a linked audit finding relates to the exception it is attached to.
EXPLAINS = "explains"
CONTEXT = "context"

#: How an indicator behaves when it is ranked. A level has no direction:
#: a bigger balance is not better and a smaller one is not worse.
HIGHER_IS_WORSE = "higher_is_worse"
LOWER_IS_WORSE = "lower_is_worse"
NEUTRAL = "neutral"


@dataclass(frozen=True)
class Indicator:
    """One declared supervisory indicator."""

    indicator_id: str
    name: str
    grain: str
    unit: str
    decimals: int
    direction: str
    description: str
    formula: str


@dataclass(frozen=True)
class Threshold:
    """One declared limit on one indicator.

    A threshold is a band. ``lower_bound`` and ``upper_bound`` describe the
    edges of the band and the two ``*_inclusive`` flags say whether the edge
    itself is a breach. ``None`` means the band is open on that side.

    The bands of one indicator do not overlap, so an indicator raises at
    most one exception for one subject.

    ``explaining_rule_ids`` names the Day 1 rules whose findings explain a
    breach of this threshold. A threshold that carries no rule explains
    nothing through the audit trail, because the risk it measures is not a
    symptom of a data quality problem: a perfectly clean institution can
    still hold a quarter of the sector's deposits.
    """

    threshold_id: str
    name: str
    indicator_id: str
    grain: str
    severity: str
    lower_bound: float | None
    upper_bound: float | None
    lower_inclusive: bool
    upper_inclusive: bool
    message: str
    rationale: str
    link_mode: str
    explaining_rule_ids: tuple[str, ...] = ()


INDICATORS: tuple[Indicator, ...] = (
    Indicator(
        "IND-001", "total_deposits", INSTITUTION_GRAIN, "TZS", 2, NEUTRAL,
        "Total customer deposits reported by the institution for the period.",
        "total_deposits of the curated record",
    ),
    Indicator(
        "IND-002", "total_loans", INSTITUTION_GRAIN, "TZS", 2, NEUTRAL,
        "Total loans and advances reported by the institution for the period.",
        "total_loans of the curated record",
    ),
    Indicator(
        "IND-003", "loan_to_deposit_ratio", INSTITUTION_GRAIN, "ratio", 4,
        HIGHER_IS_WORSE,
        "Loans as a share of deposits. The core intermediation indicator.",
        "total_loans / total_deposits",
    ),
    Indicator(
        "IND-004", "sector_deposit_share", INSTITUTION_GRAIN, "percent", 4,
        HIGHER_IS_WORSE,
        "The institution's share of all deposits reported for the period.",
        "total_deposits / sector_total_deposits * 100",
    ),
    Indicator(
        "IND-005", "deposit_growth_period_on_period", INSTITUTION_GRAIN,
        "percent", 4, LOWER_IS_WORSE,
        "Change in deposits against the institution's previous period.",
        "(total_deposits - previous_period_total_deposits) "
        "/ previous_period_total_deposits * 100",
    ),
    Indicator(
        "IND-006", "loan_growth_period_on_period", INSTITUTION_GRAIN,
        "percent", 4, HIGHER_IS_WORSE,
        "Change in loans against the institution's previous period.",
        "(total_loans - previous_period_total_loans) "
        "/ previous_period_total_loans * 100",
    ),
    Indicator(
        "IND-007", "sector_total_deposits", SECTOR_GRAIN, "TZS", 2, NEUTRAL,
        "Total deposits reported across the supervised sector for the period.",
        "sum(total_deposits) over the curated records of the period",
    ),
    Indicator(
        "IND-008", "sector_total_loans", SECTOR_GRAIN, "TZS", 2, NEUTRAL,
        "Total loans reported across the supervised sector for the period.",
        "sum(total_loans) over the curated records of the period",
    ),
    Indicator(
        "IND-009", "sector_loan_to_deposit_ratio", SECTOR_GRAIN, "ratio", 4,
        HIGHER_IS_WORSE,
        "Sector loans as a share of sector deposits.",
        "sector_total_loans / sector_total_deposits",
    ),
    Indicator(
        "IND-010", "sector_deposit_concentration_hhi", SECTOR_GRAIN, "index",
        4, HIGHER_IS_WORSE,
        "Herfindahl-Hirschman concentration index of sector deposits.",
        "sum((institution_deposit_share / 100) ** 2) * 10000",
    ),
    Indicator(
        "IND-011", "sector_watchlist_exposure_count", SECTOR_GRAIN, "count",
        0, NEUTRAL,
        "Curated records in the period that came from an institution on the "
        "enhanced monitoring list.",
        "count of curated records whose institution has watchlist_flag true",
    ),
    Indicator(
        "IND-012", "sector_reporting_coverage_ratio", SECTOR_GRAIN, "percent",
        4, LOWER_IS_WORSE,
        "Share of the institutions expected to report for the period that "
        "reached the curated layer.",
        "distinct reporting institutions / expected reporters * 100",
    ),
)

THRESHOLDS: tuple[Threshold, ...] = (
    Threshold(
        "THR-001", "ldr_elevated", "IND-003", INSTITUTION_GRAIN, HIGH,
        0.9, 1.5, False, True,
        "Loan-to-deposit ratio is elevated",
        "A ratio between 0.9 and 1.5 means most of the deposits are lent out. "
        "It is unusual for this sector and a supervisor should ask why.",
        RECORD_LINK,
        ("W001",),
    ),
    Threshold(
        "THR-002", "ldr_critical", "IND-003", INSTITUTION_GRAIN, CRITICAL,
        1.5, None, False, False,
        "Loan-to-deposit ratio is critically high",
        "A ratio above 1.5 means the institution has lent out more than it "
        "holds in deposits. The funding position is the priority.",
        RECORD_LINK,
        ("W001",),
    ),
    Threshold(
        "THR-003", "zero_deposits", "IND-001", INSTITUTION_GRAIN, CRITICAL,
        None, 0.0, False, True,
        "Institution reported zero deposits",
        "An institution that reports no deposits either stopped operating or "
        "submitted an incomplete return. Either way it cannot be supervised "
        "from this record.",
        RECORD_LINK,
        ("W002",),
    ),
    Threshold(
        "THR-004", "deposit_share_concentration", "IND-004", INSTITUTION_GRAIN,
        HIGH, 25.0, None, False, False,
        "Institution holds a large share of sector deposits",
        "A single institution holding more than a quarter of reported sector "
        "deposits is a concentration risk for the sector as a whole.",
        RECORD_LINK,
    ),
    Threshold(
        "THR-005", "deposit_growth_collapse", "IND-005", INSTITUTION_GRAIN,
        HIGH, None, -20.0, False, False,
        "Deposits fell sharply against the previous period",
        "A fall of more than 20% in deposits against the previous period is "
        "a run signal. It needs a supervisor before the next filing.",
        RECORD_LINK,
    ),
    Threshold(
        "THR-006", "loan_growth_spike", "IND-006", INSTITUTION_GRAIN, MEDIUM,
        50.0, None, False, False,
        "Loans grew by more than 50% against the previous period",
        "Fast loan growth changes the risk profile of a book. It is worth a "
        "look even when the level is normal.",
        RECORD_LINK,
    ),
    Threshold(
        "THR-007", "sector_loan_to_deposit_above", "IND-009", SECTOR_GRAIN,
        HIGH, 1.0, None, False, False,
        "Sector loans exceed sector deposits",
        "When the whole sector lends more than it holds, the sector depends "
        "on wholesale or interbank funding to keep running.",
        PERIOD_LINK,
        ("W001",),
    ),
    Threshold(
        "THR-008", "sector_deposit_concentration_elevated", "IND-010",
        SECTOR_GRAIN, MEDIUM, 2000.0, None, False, False,
        "Sector deposit market is moderately concentrated",
        "An index above 2000 is the conventional entry point for a "
        "moderately concentrated market. A supervisor should know how "
        "concentrated the sector it supervises is.",
        PERIOD_LINK,
    ),
    Threshold(
        "THR-009", "sector_watchlist_exposure", "IND-011", SECTOR_GRAIN, HIGH,
        0.0, None, False, False,
        "Curated records include watchlist institutions",
        "An institution under enhanced monitoring that has filed a curated "
        "record belongs on the supervisor's desk, whatever its numbers look "
        "like.",
        PERIOD_LINK,
        ("W003",),
    ),
    Threshold(
        "THR-010", "sector_reporting_coverage_low", "IND-012", SECTOR_GRAIN,
        MEDIUM, None, 80.0, False, False,
        "Fewer than 80% of expected institutions reported",
        "Low coverage means the sector picture is incomplete. Any sector "
        "number computed on it is incomplete too.",
        PERIOD_LINK,
    ),
)

INDICATORS_BY_ID: dict[str, Indicator] = {
    indicator.indicator_id: indicator for indicator in INDICATORS
}
INDICATORS_BY_NAME: dict[str, Indicator] = {
    indicator.name: indicator for indicator in INDICATORS
}
THRESHOLDS_BY_ID: dict[str, Threshold] = {
    threshold.threshold_id: threshold for threshold in THRESHOLDS
}
THRESHOLDS_BY_NAME: dict[str, Threshold] = {
    threshold.name: threshold for threshold in THRESHOLDS
}

THRESHOLDS_BY_INDICATOR: dict[str, list[Threshold]] = {}
for _threshold in THRESHOLDS:
    THRESHOLDS_BY_INDICATOR.setdefault(
        _threshold.indicator_id, []
    ).append(_threshold)


def severity_rank(severity: str) -> int:
    """Return the ordering rank of a severity, most urgent first."""
    return SEVERITY_ORDER.index(severity)


def describe_bounds(threshold: Threshold) -> str:
    """Describe a threshold band in words, for the exception message."""
    lower = threshold.lower_bound
    upper = threshold.upper_bound
    if lower is None and upper is None:
        return "any value"
    if lower is None:
        edge = "at or below" if threshold.upper_inclusive else "below"
        return f"{edge} {_format_bound(upper)}"
    if upper is None:
        edge = "at or above" if threshold.lower_inclusive else "above"
        return f"{edge} {_format_bound(lower)}"
    lower_edge = "at or above" if threshold.lower_inclusive else "above"
    upper_edge = "at or below" if threshold.upper_inclusive else "below"
    return (
        f"{lower_edge} {_format_bound(lower)} and "
        f"{upper_edge} {_format_bound(upper)}"
    )


def _format_bound(value: float | None) -> str:
    """Format a bound for display."""
    if value is None:
        return "-"
    if value == int(value):
        return str(int(value))
    return str(value)


def indicator_catalog_frame():
    """Return the indicator catalog as a pandas frame."""
    import pandas as pd

    return pd.DataFrame(
        [
            {
                "indicator_id": indicator.indicator_id,
                "indicator_name": indicator.name,
                "grain": indicator.grain,
                "unit": indicator.unit,
                "decimals": indicator.decimals,
                "direction": indicator.direction,
                "description": indicator.description,
                "formula": indicator.formula,
            }
            for indicator in INDICATORS
        ]
    )


def threshold_catalog_frame():
    """Return the threshold catalog as a pandas frame."""
    import pandas as pd

    return pd.DataFrame(
        [
            {
                "threshold_id": threshold.threshold_id,
                "threshold_name": threshold.name,
                "indicator_id": threshold.indicator_id,
                "grain": threshold.grain,
                "severity": threshold.severity,
                "lower_bound": threshold.lower_bound,
                "upper_bound": threshold.upper_bound,
                "lower_inclusive": threshold.lower_inclusive,
                "upper_inclusive": threshold.upper_inclusive,
                "limit_description": describe_bounds(threshold),
                "message": threshold.message,
                "rationale": threshold.rationale,
                "link_mode": threshold.link_mode,
                "explaining_rule_ids": "; ".join(threshold.explaining_rule_ids),
            }
            for threshold in THRESHOLDS
        ]
    )


def indicator_catalog() -> list[dict[str, object]]:
    """Return the indicator catalog as plain dictionaries."""
    return [
        {
            "indicator_id": indicator.indicator_id,
            "indicator_name": indicator.name,
            "grain": indicator.grain,
            "unit": indicator.unit,
            "decimals": indicator.decimals,
            "direction": indicator.direction,
            "description": indicator.description,
            "formula": indicator.formula,
        }
        for indicator in INDICATORS
    ]


def threshold_catalog() -> list[dict[str, object]]:
    """Return the threshold catalog as plain dictionaries."""
    return [
        {
            "threshold_id": threshold.threshold_id,
            "threshold_name": threshold.name,
            "indicator_id": threshold.indicator_id,
            "grain": threshold.grain,
            "severity": threshold.severity,
            "lower_bound": threshold.lower_bound,
            "upper_bound": threshold.upper_bound,
            "limit_description": describe_bounds(threshold),
            "message": threshold.message,
            "rationale": threshold.rationale,
            "link_mode": threshold.link_mode,
            "explaining_rule_ids": list(threshold.explaining_rule_ids),
        }
        for threshold in THRESHOLDS
    ]


def export_catalogs(reference_dir=None) -> dict[str, object]:
    """Write both catalogs to the reference folder so they can be diffed."""
    from pathlib import Path

    from day2_paths import REFERENCE_DIR

    reference_dir = Path(reference_dir or REFERENCE_DIR)
    reference_dir.mkdir(parents=True, exist_ok=True)
    indicator_path = reference_dir / "indicator_catalog.csv"
    threshold_path = reference_dir / "threshold_catalog.csv"
    indicator_catalog_frame().to_csv(indicator_path, index=False)
    threshold_catalog_frame().to_csv(threshold_path, index=False)
    return {
        "indicators": indicator_path,
        "thresholds": threshold_path,
    }


if __name__ == "__main__":
    written = export_catalogs()
    for label, path in written.items():
        print(f"{label}: {path}")
