# Day 1 data model

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Status:** Day 1. The model is defined here and generated from
`day-01-data-engineering/src/schema.py`. The structures are exercised by the test
suite; the live database load is introduced on Day 2 and extended by
`day-02-supervisory-analytics/src/ddl.py`.

> All data in this repository is synthetic training data. The structures below are a
> training model, not an agreed reporting standard.

---

## 1. Grains

A data model is decided first by the grain of each table: what exactly one row
means. Getting this wrong is the most expensive mistake in a supervisory system,
because it silently produces plausible numbers that mean nothing.

| Table | One row means | Grain |
| --- | --- | --- |
| `suptech.institution_report` | One institution, one reporting period, one run. | Institution x period x run |
| `suptech.data_quality_audit` | One rule evaluation against one record. | Record x rule x run |
| `suptech.institution` | One supervised institution. | Institution |
| `suptech.reporting_period` | One reporting period. | Reporting period |

The grain of `institution_report` is the reason the primary key is
`(run_id, source_row_number)` and not `institution_id`. The same institution reports
once per period and the pipeline is expected to run again over the same period, so
neither the institution nor the period identifies a row on its own.

**The country-level World Bank indicators are not in this model.** They are one row
per country per year per indicator, a different grain entirely, and they are used as
a separate context exercise. They are deliberately not joined to
`institution_report`. See `docs/datasets/world-bank-context.md`.

---

## 2. Raw layer

The submitted file is immutable. Its contract is declared in
`day-01-data-engineering/src/schema.py` as `RAW_COLUMNS`.

| Column | Logical type | PostgreSQL type | Required | Meaning |
| --- | --- | --- | --- | --- |
| `institution_id` | identifier | `text` | yes | Supervisory identifier of the reporting institution. |
| `institution_name` | text | `text` | yes | Name as submitted. |
| `reporting_date` | date | `date` | yes | Date the submission relates to, ISO 8601. |
| `total_deposits` | decimal | `numeric(18,2)` | yes | Total customer deposits at the reporting date. |
| `total_loans` | decimal | `numeric(18,2)` | yes | Total loans and advances outstanding. |
| `reporting_period` | period | `text` | yes | Reporting period covered, `YYYY-MM`. |

Two conventions that matter:

- **`numeric(18,2)`, never a float.** Money in a supervisory system is an exact
  decimal. A binary floating point value cannot represent most decimal fractions
  exactly, and an aggregation of near-exact values drifts. The pipeline reads
  amounts as text and hands them to the database as decimals.
- **Amounts are whole Tanzanian shillings in this dataset.** The curated layer
  preserves the decimals anyway, because a later change to the reporting unit must
  not require a schema change.

---

## 3. Reference layer

### `suptech.institution`

The supervised institution register.

| Column | PostgreSQL type | Meaning |
| --- | --- | --- |
| `institution_id` | `text PRIMARY KEY` | The issued identifier. |
| `institution_name` | `text NOT NULL` | Official registered name. |
| `institution_type` | `text` | Licence category, for example `Commercial Bank`. |
| `licence_status` | `text` | Licence status in the register, for example `Active`, `Under Review`. |
| `region` | `text` | Region the institution is headquartered in. |
| `reporting_frequency` | `text` | Expected cadence, `Monthly` or `Quarterly`. |
| `watchlist_flag` | `boolean NOT NULL DEFAULT false` | Enhanced supervisory monitoring. |

`institution_id` is the primary key, and the identifiers follow the pattern
`TZ\d{3}`. The pipeline checks both the pattern and the membership of the register,
because they catch different mistakes: a malformed identifier is a submission
error, an unknown identifier is either a typo or an institution the supervisor does
not know.

`reporting_frequency` is what makes rule `W004` possible. A quarterly filer that
submits a monthly period has either used the wrong template or submitted early, and
a supervisor should see it.

### `suptech.reporting_period`

The reporting calendar.

| Column | PostgreSQL type | Meaning |
| --- | --- | --- |
| `reporting_period` | `text PRIMARY KEY` | The period, `YYYY-MM`. |
| `period_start` | `date NOT NULL` | First day of the period. |
| `period_end` | `date NOT NULL` | Last day of the period. |
| `submission_due_date` | `date NOT NULL` | Date the submission was due. |
| `status` | `text NOT NULL` | `Open`, `Closed` or `Scheduled`. |

The calendar is what turns `2026-11` from a string into a period with a window and
a deadline. Rule `R005` uses `period_start` and `period_end`; rule `R015` uses the
calendar's membership.

`submission_due_date` is carried for Day 2. A late-submission rule cannot be
evaluated on Day 1 without introducing a wall-clock dependency, and a pipeline that
produces different results on different days is a pipeline whose audit trail means
nothing.

---

## 4. Curated layer

### `suptech.institution_report`

```sql
CREATE TABLE suptech.institution_report (
    run_id            uuid NOT NULL,
    source_row_number integer NOT NULL,
    institution_id    text NOT NULL REFERENCES suptech.institution (institution_id),
    institution_name  text NOT NULL,
    reporting_date    date NOT NULL,
    reporting_period  text NOT NULL REFERENCES suptech.reporting_period (reporting_period),
    total_deposits    numeric(18, 2) NOT NULL,
    total_loans       numeric(18, 2) NOT NULL,
    validation_status text NOT NULL CHECK (validation_status IN ('valid', 'review')),
    warnings          text,
    PRIMARY KEY (run_id, source_row_number)
);
```

Four decisions are worth defending:

1. **`run_id` is part of the primary key.** A pipeline that runs twice over the
   same period must not overwrite the first run, and a dashboard must be able to
   show which run it is looking at.
2. **`source_row_number` is kept.** It is the line of the submitted file the record
   came from. A supervisor asking "what exactly did you receive?" gets a line
   number, not a promise.
3. **`validation_status` has a constraint.** Only `valid` and `review` may be
   stored. A rejected record is not a curated record, and it must not be able to
   reach this table by accident. Rejected records live in the audit trail and in
   the rejection output.
4. **`warnings` is free text.** It holds the names of the `WARN` rules the record
   breached. Day 2 turns those into exception records.

### `suptech.data_quality_audit`

```sql
CREATE TABLE suptech.data_quality_audit (
    run_id            uuid NOT NULL,
    source_row_number integer NOT NULL,
    institution_id    text,
    reporting_period  text,
    rule_id           text NOT NULL,
    rule_name         text NOT NULL,
    severity          text NOT NULL CHECK (severity IN ('BLOCK', 'WARN')),
    outcome           text NOT NULL,
    observed_value    text,
    detail            text,
    evaluated_at      timestamptz NOT NULL DEFAULT now()
);
```

This table is long format on purpose: one row per finding rather than one row per
record with a column per rule. The reason is that the rule catalog grows. With a
column per rule, every new rule is a schema migration. With one row per finding,
a new rule is a new row and the dashboard can group by `rule_id` without any
change to the schema.

`observed_value` holds the value as it was seen, so the audit trail carries the
evidence and not only the verdict.

---

## 5. From the submitted file to the curated table

| Raw file column | Curated column | Transformation | Rule that can stop it |
| --- | --- | --- | --- |
| `institution_id` | `institution_id` | Trimmed and checked against `TZ\d{3}` and the register. | `R002`, `R003` |
| `institution_name` | `institution_name` | Taken as submitted. | `R001` |
| `reporting_date` | `reporting_date` | Parsed as ISO 8601, checked against the period window. | `R001`, `R004`, `R005` |
| `total_deposits` | `total_deposits` | Cast to `numeric(18,2)`, checked non-negative and below the ceiling. | `R001`, `R008`, `R010`, `R012` |
| `total_loans` | `total_loans` | Cast to `numeric(18,2)`, checked non-negative and below the ceiling. | `R001`, `R009`, `R011`, `R012` |
| `reporting_period` | `reporting_period` | Parsed as `YYYY-MM`, checked against the calendar and against the date. | `R001`, `R006`, `R007`, `R015` |
| — | `run_id` | The identifier of the run that produced the record. | — |
| — | `source_row_number` | The line in the submitted file. | — |
| — | `validation_status` | `valid` or `review`. | — |
| — | `warnings` | The names of the `WARN` rules breached. | `W001` to `W004` |
| — | *(audit table)* | One row per finding. | All 19 rules |

---

## 6. What Day 2 added

Day 2 extends the model above without changing it. The rule still holds: the
curated layer is the contract, and the later layers consume it without
reaching back into the raw file.

### `suptech.supervisory_indicator`

```sql
CREATE TABLE suptech.supervisory_indicator (
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
```

One row means one indicator, for one subject, in one reporting period. The
table is in long format for the same reason the audit trail is: the
indicator catalog grows, and a new indicator has to be a new row rather than
a schema migration.

`subject_id` carries the identifier the indicator is about: the
`institution_id` for an institution grain, and the literal `SECTOR` for a
sector grain. The grain is declared, so a consumer never has to guess
whether a number is an institution's figure or the sector's.

`calculation_basis` says which records and which inputs produced the value.
That is what makes a number on the dashboard inspectable.

### `suptech.supervisory_exception`

```sql
CREATE TABLE suptech.supervisory_exception (
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
```

One row means one threshold breach. The identifier is a natural key built
from the threshold, the subject and the period, so the same exception has
the same identifier in every run. The primary key is therefore
`(run_id, exception_id)`, not the identifier alone: two runs of the same
data must not collide. This is the same decision the Day 1 curated table
makes with `(run_id, source_row_number)`.

`status` has one value, `open`, because triage workflow is out of scope for
the prototype. It is declared so that the Day 3 and Day 4 work does not need
a migration.

### `suptech.exception_audit_link`

```sql
CREATE TABLE suptech.exception_audit_link (
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
        REFERENCES suptech.supervisory_exception (run_id, exception_id),
    FOREIGN KEY (run_id, source_row_number, rule_id)
        REFERENCES suptech.data_quality_audit (run_id, source_row_number, rule_id)
);
```

One row means one finding attached to one exception. This is the join that
the data model document promised: an exception is a join, not a copy.

The foreign key into the audit trail is what makes the link trustworthy: an
exception cannot point at a finding that does not exist. For the reference
to resolve, Day 2 adds a unique index on the audit trail:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_finding
    ON suptech.data_quality_audit (run_id, source_row_number, rule_id);
```

`relation` separates the finding that *explains* the exception from the
finding that is merely *context* for it. A sector exception is about the
whole period, so it links to the findings of the period, and only some of
them explain it.

### The API read model

The API reads the indicator and exception tables and never the submitted
file. Its endpoints, its public read-only access and the verified numbers for the
shipped dataset are in `docs/architecture/day2-analytics-and-api.md`.
