"""The Day 2 relational structures.

Day 1 defined the reference layer, the curated layer and the audit trail.
Day 2 adds three things on top of them:

``suptech.supervisory_indicator``
    One row per indicator, per subject, per reporting period. Long format,
    for the same reason the audit trail is long format: the indicator
    catalog grows, and a new indicator should be a new row rather than a
    schema migration.

``suptech.supervisory_exception``
    One row per threshold breach. It carries the threshold evidence — the
    observed value, the limit, the severity and the reason — and it points
    at the subject it came from.

``suptech.exception_audit_link``
    The link between an exception and the data quality findings that explain
    it. The link is a foreign key into the Day 1 audit trail, so an
    exception can never point at a finding that does not exist.

Three decisions in the DDL are worth defending.

**The link table carries a relation.** A finding can *explain* an exception,
or it can be *context*: the record behind a sector level exception happens
to carry an unrelated warning. Both are worth showing, and they are not the
same thing.

**The audit trail gets a unique index.** The link table references
``(run_id, source_row_number, rule_id)``, so those three columns have to be
unique. The index is created in the Day 2 DDL rather than in the Day 1 one,
because the Day 1 pipeline never needed it and the Day 1 structures are
left as they were.

**The run identifier is part of every key.** The exception identifier is a
natural key built from the threshold, the subject and the period, so the
same exception has the same identifier in every run. That means the primary
key cannot be the identifier alone: two runs of the same data would collide.
The key is ``(run_id, exception_id)``, exactly as the Day 1 curated table
uses ``(run_id, source_row_number)``.

The DDL is plain text, so it can be reviewed without a live database and
asserted on in the test suite.
"""

from __future__ import annotations

from day1_bridge import TARGET_SCHEMA

#: The objects Day 2 adds to the Day 1 schema.
DAY2_OBJECTS: tuple[str, ...] = (
    "suptech.supervisory_indicator",
    "suptech.supervisory_exception",
    "suptech.exception_audit_link",
)


def create_day2_schema_sql() -> str:
    """Return the DDL for the objects Day 2 adds."""
    return f"""
-- The audit trail needs a unique key before an exception can reference it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_finding
    ON {TARGET_SCHEMA}.data_quality_audit (run_id, source_row_number, rule_id);

-- Analytics layer: one row per indicator, per subject, per period.
CREATE TABLE IF NOT EXISTS {TARGET_SCHEMA}.supervisory_indicator (
    run_id             uuid NOT NULL,
    indicator_id       text NOT NULL,
    indicator_name     text NOT NULL,
    grain              text NOT NULL CHECK (grain IN ('institution', 'sector')),
    reporting_period   text NOT NULL,
    subject_id         text NOT NULL,
    institution_id     text,
    indicator_value    numeric(18, 4),
    unit               text NOT NULL,
    decimals           integer NOT NULL,
    direction          text NOT NULL,
    calculation_basis  text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, indicator_id, reporting_period, subject_id)
);

-- Analytics layer: one row per threshold breach.
CREATE TABLE IF NOT EXISTS {TARGET_SCHEMA}.supervisory_exception (
    run_id              uuid NOT NULL,
    exception_id        text NOT NULL,
    threshold_id        text NOT NULL,
    threshold_name      text NOT NULL,
    indicator_id        text NOT NULL,
    indicator_name      text NOT NULL,
    grain               text NOT NULL CHECK (grain IN ('institution', 'sector')),
    reporting_period    text NOT NULL,
    subject_id          text NOT NULL,
    institution_id      text,
    source_row_number   integer,
    severity            text NOT NULL
                         CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    observed_value      numeric(18, 4) NOT NULL,
    observed_value_text text NOT NULL,
    limit_description   text NOT NULL,
    message             text NOT NULL,
    explanation         text NOT NULL,
    status              text NOT NULL CHECK (status IN ('open')),
    link_mode           text NOT NULL CHECK (link_mode IN ('record', 'period')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, exception_id)
);

-- The link between an exception and the findings that explain it.
CREATE TABLE IF NOT EXISTS {TARGET_SCHEMA}.exception_audit_link (
    run_id             uuid NOT NULL,
    exception_id       text NOT NULL,
    reporting_period   text NOT NULL,
    source_row_number  integer NOT NULL,
    rule_id            text NOT NULL,
    rule_name          text NOT NULL,
    severity           text NOT NULL,
    observed_value     text,
    detail             text,
    relation           text NOT NULL CHECK (relation IN ('explains', 'context')),
    link_mode          text NOT NULL,
    PRIMARY KEY (run_id, exception_id, source_row_number, rule_id),
    FOREIGN KEY (run_id, exception_id)
        REFERENCES {TARGET_SCHEMA}.supervisory_exception (run_id, exception_id),
    FOREIGN KEY (run_id, source_row_number, rule_id)
        REFERENCES {TARGET_SCHEMA}.data_quality_audit
            (run_id, source_row_number, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_indicator_subject
    ON {TARGET_SCHEMA}.supervisory_indicator (indicator_id, reporting_period);

CREATE INDEX IF NOT EXISTS idx_exception_period
    ON {TARGET_SCHEMA}.supervisory_exception (reporting_period, severity);

CREATE INDEX IF NOT EXISTS idx_exception_institution
    ON {TARGET_SCHEMA}.supervisory_exception (institution_id);

CREATE INDEX IF NOT EXISTS idx_exception_link
    ON {TARGET_SCHEMA}.exception_audit_link (run_id, source_row_number, rule_id);
""".strip()


def create_schema_sql() -> str:
    """Return the full DDL: the Day 1 structures and the Day 2 ones."""
    from day1_bridge import day1_schema

    return day1_schema.create_schema_sql() + "\n\n" + create_day2_schema_sql() + "\n"
