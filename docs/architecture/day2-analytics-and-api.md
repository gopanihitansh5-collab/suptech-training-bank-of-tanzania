# Day 2 analytics and API

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Status:** Day 2. This is the operational narrative of
`day-02-supervisory-analytics/`.

> All data in this repository is synthetic training data. The indicators and
> the thresholds below are illustrative prototype values. They are not official
> supervisory limits and they have not been agreed with any supervisor.

---

## 1. The flow in one line

```text
curated records + register + calendar → indicators → threshold breaches →
exceptions → read model → authenticated API
```

Day 1 ended with a rule: **the curated layer is the contract**. Later layers
read it and never reach back into the submitted file. Day 2 is the first
layer that lives on the other side of that rule, and it is where a submission
stops being a submission and starts being a supervisory fact.

The chain the architecture describes is now complete up to the dashboard:

```text
a submitted record  ->  a trustworthy record  ->  an indicator  ->  an exception  ->  a reason
```

---

## 2. Step by step

### Step 1 — Read the curated layer

`day-02-supervisory-analytics/src/curated.py` reads what Day 1 published:

| Input | Contents |
| --- | --- |
| `valid_records.csv` | The records that passed every rule. |
| `review_records.csv` | The records that were admitted with a warning. |
| `data_quality_audit.csv` | The findings that explain those records. |
| `institutions_registry.csv` | The supervised institutions and their cadence. |
| `reporting_calendar.csv` | The reporting periods. |

Two things are absent on purpose. The submitted file is not read, and the
rejected records are not read. A rejected record is not missing data, it is
data that failed its contract, and it lives in the audit trail.

The loader is strict about the shape of its input and loose about its
content, in the same way the Day 1 loader is. A missing column stops the
run. A value that cannot be read stays missing, and the indicator that
depends on it comes out as null.

The register is not an optional extra. It carries the reporting cadence,
which is what makes it possible to know **who was supposed to report** and
therefore who did not.

### Step 2 — Compute the indicators

`day-02-supervisory-analytics/src/indicators.py`.

Twelve indicators are declared in `src/catalogs.py` and exported to
`day-02-supervisory-analytics/datasets/reference/indicator_catalog.csv`.

| Id | Indicator | Grain | Unit | Formula |
| --- | --- | --- | --- | --- |
| `IND-001` | `total_deposits` | institution | TZS | The submitted deposits of the record. |
| `IND-002` | `total_loans` | institution | TZS | The submitted loans of the record. |
| `IND-003` | `loan_to_deposit_ratio` | institution | ratio | `total_loans / total_deposits`. |
| `IND-004` | `sector_deposit_share` | institution | percent | `total_deposits / sector_total_deposits * 100`. |
| `IND-005` | `deposit_growth_period_on_period` | institution | percent | The change in deposits against the previous period in the curated layer. |
| `IND-006` | `loan_growth_period_on_period` | institution | percent | The change in loans against the previous period in the curated layer. |
| `IND-007` | `sector_total_deposits` | sector | TZS | The sum of the deposits of the period. |
| `IND-008` | `sector_total_loans` | sector | TZS | The sum of the loans of the period. |
| `IND-009` | `sector_loan_to_deposit_ratio` | sector | ratio | `sector_total_loans / sector_total_deposits`. |
| `IND-010` | `sector_deposit_concentration_hhi` | sector | index | The sum of the squared deposit shares, scaled to 10000. |
| `IND-011` | `sector_watchlist_exposure_count` | sector | count | The curated records of institutions on the watchlist. |
| `IND-012` | `sector_reporting_coverage_ratio` | sector | percent | Reporting institutions over expected reporters. |

Three decisions are worth defending.

**Money is decimal, not float.** Day 1 declared `numeric(18,2)` because a
binary floating point value cannot represent most decimal fractions exactly.
The same reasoning applies to a sum of submitted amounts: the arithmetic is
done with `decimal.Decimal` and only converted to a float when the value is
written out, where the declared number of decimals is applied.

**An indicator that cannot be computed is null.** The loan-to-deposit ratio
of an institution that reports zero deposits is undefined. It is not
infinite and it is not zero. The growth rate of an institution with no
earlier period in the curated layer is undefined for the same reason. A null
is honest; a zero is a claim that was never supported.

**The previous period is the previous period that exists.** Growth is
computed against the last period in the curated layer for that institution,
not against an imagined month. The gap is named in the calculation basis of
the indicator value.

Every indicator row carries a `calculation_basis`: a sentence saying which
records and which inputs produced it. That is what makes a number on the
dashboard inspectable instead of merely visible.

### Step 3 — Evaluate the thresholds

`day-02-supervisory-analytics/src/exceptions.py`.

Ten thresholds are declared in `src/catalogs.py` and exported to
`day-02-supervisory-analytics/datasets/reference/threshold_catalog.csv`.

| Id | Threshold | Indicator | Severity | Band | Link |
| --- | --- | --- | --- | --- | --- |
| `THR-001` | `ldr_elevated` | `IND-003` | HIGH | above 0.9, at or below 1.5 | record |
| `THR-002` | `ldr_critical` | `IND-003` | CRITICAL | above 1.5 | record |
| `THR-003` | `zero_deposits` | `IND-001` | CRITICAL | at or below 0 | record |
| `THR-004` | `deposit_share_concentration` | `IND-004` | HIGH | above 25 | record |
| `THR-005` | `deposit_growth_collapse` | `IND-005` | HIGH | below -20 | record |
| `THR-006` | `loan_growth_spike` | `IND-006` | MEDIUM | above 50 | record |
| `THR-007` | `sector_loan_to_deposit_above` | `IND-009` | HIGH | above 1.0 | period |
| `THR-008` | `sector_deposit_concentration_elevated` | `IND-010` | MEDIUM | above 2000 | period |
| `THR-009` | `sector_watchlist_exposure` | `IND-011` | HIGH | above 0 | period |
| `THR-010` | `sector_reporting_coverage_low` | `IND-012` | MEDIUM | below 80 | period |

Four decisions are worth defending.

**The Day 2 severities are not the Day 1 severities.** Day 1 asked *can this
record be trusted* and answered `BLOCK` or `WARN`. Day 2 asks *does this
number deserve a supervisor's attention* and answers `CRITICAL`, `HIGH`,
`MEDIUM` or `LOW`. A flawless record can raise a critical exception, and a
flawed record can raise no exception at all.

**The bands of one indicator do not overlap.** A loan-to-deposit ratio
raises one exception, not two: `THR-001` covers the elevated band and
`THR-002` the critical one. The dashboard shows one row per institution per
indicator, not a pile of overlapping alarms.

**A threshold is data.** Adding a supervisory limit is a change to a table,
not a change to the pipeline. The catalog is exported, diffed and argued
about in a spreadsheet.

**The catalog is a prototype, not a standard.** Every limit in it is
illustrative. It has not been agreed with any supervisor and it is not an
official reporting threshold.

### Step 4 — Build the exceptions

An exception is a record of the following shape: *this subject, this
indicator, this value, this limit, this severity*. It is not a copy of the
record it came from.

Its identifier is built from the threshold, the subject and the period:

```text
EXC-THR-002-TZ013-2026-11
```

so the same exception has the same identifier in every run, and two runs of
the same data do not collide.

Every exception carries:

- the observed value, both as a number and as a formatted string;
- the limit, described in words (`above 1.5`);
- the severity and the message;
- the rationale: why a supervisor would care about this limit;
- the subject it belongs to, and the source row it came from;
- the data quality findings that explain it.

### Step 5 — Link the exceptions to the audit trail

The audit trail explains **data quality**: why a record was rejected or why
it was flagged for review. A threshold explains **supervisory risk**. The two
are different things, and the prototype keeps them apart.

`suptech.exception_audit_link` joins the two. Each link carries a
`relation`:

| Relation | Meaning |
| --- | --- |
| `explains` | The finding is the cause of the exception. `TZ013`'s ratio exception is explained by `W001`. |
| `context` | The record behind the exception carries an unrelated finding. The sector concentration exception sits in a period that also holds a watchlist warning. |

The link is declared per threshold, because the answer depends on the grain
of the indicator:

| Link mode | The exception links to |
| --- | --- |
| `record` | The findings of that one record. |
| `period` | The findings of the curated records of that period. |

Where a subject produced no findings at all, the exception has no audit
links and says so in its explanation:

> No data quality finding is attached to this subject: the record behind it
> was admitted to the curated layer without a warning.

`TZ002` holds 35.5% of the sector's reported deposits. That is a real
concentration risk, and its record was perfectly clean. Borrowing an
unrelated finding to explain it would be worse than saying nothing.

The link table has a foreign key into the Day 1 audit trail, so an exception
can never point at a finding that does not exist. To make that possible, Day
2 adds a unique index on `(run_id, source_row_number, rule_id)`.

### Step 6 — Serve the read model

`day-02-supervisory-analytics/src/repository.py` and
`day-02-supervisory-analytics/src/api.py`.

The API never reads the submitted file and never recomputes an indicator. It
serves the read model, which is computed from the curated layer.

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| `GET` | `/health` | public | The service status. |
| `GET` | `/api/v1/meta` | public, read-only | The indicator catalog and the threshold catalog. |
| `GET` | `/api/v1/institutions` | public, read-only | The register, with the exception counts of each institution. |
| `GET` | `/api/v1/institutions/{id}` | public, read-only | One institution, its indicators and its exceptions. |
| `GET` | `/api/v1/indicators` | public, read-only | Indicator values, filtered by institution, period, indicator or grain. |
| `GET` | `/api/v1/exceptions` | public, read-only | Exceptions, filtered by institution, period, severity, indicator or threshold. |
| `GET` | `/api/v1/exceptions/{id}` | public, read-only | One exception with the audit entries that explain it. |
| `GET` | `/api/v1/summary` | public, read-only | The sector summary of one period, or of every period. |

This prototype has no login or token. It is public because it contains only
synthetic training data and supports read-only requests. Never use it with
real supervisory information.

### Step 7 — Load the database

`day-02-supervisory-analytics/src/ddl.py` and `src/loader.py`.

Day 2 adds three tables to the Day 1 schema:

| Table | One row means |
| --- | --- |
| `suptech.supervisory_indicator` | One indicator, for one subject, in one period. |
| `suptech.supervisory_exception` | One threshold breach. |
| `suptech.exception_audit_link` | One finding, attached to one exception. |

The load creates the schema, replaces the reference data, loads the curated
records and the audit trail with the Day 1 helpers, and then loads the
indicators, the exceptions and the links. The connection string comes from
the `DATABASE_URL` environment variable and from nowhere else.

Every Day 2 key carries the run identifier, so the database holds every run
side by side and two runs of the same data never collide. The exception
identifier is a natural key, so the key is `(run_id, exception_id)` rather
than the identifier alone.

The constraints are part of the contract, not decoration:

- the curated table still refuses a `validation_status` of `rejected`;
- the exception table refuses a severity outside the declared set;
- the link table refuses a finding that does not exist in the audit trail;
- the link table refuses an exception that does not exist.

The API serves one run at a time. The `run_id` query parameter selects it
explicitly; without it, the most recent run is served.

---

## 3. The verified result for the shipped dataset

The Day 1 curated layer holds seven records for the period 2026-11: four
valid records and three flagged for review.

| Indicator | Value |
| --- | --- |
| Reporting institutions | 7 |
| Expected reporters | 18 |
| Reporting coverage | 38.8889% |
| Sector deposits | 2,110,000,000 TZS |
| Sector loans | 1,580,000,000 TZS |
| Sector loan-to-deposit ratio | 0.7488 |
| Sector deposit concentration | 2,434.5814 |
| Watchlist exposure | 1 curated record |
| Indicator values computed | 48 |

Six exceptions are raised:

| Exception | Subject | Indicator | Severity | Observed |
| --- | --- | --- | --- | --- |
| `EXC-THR-003-TZ014-2026-11` | TZ014 | `IND-001` | CRITICAL | 0.00 deposits |
| `EXC-THR-002-TZ013-2026-11` | TZ013 | `IND-003` | CRITICAL | 9.0000 ratio |
| `EXC-THR-004-TZ002-2026-11` | TZ002 | `IND-004` | HIGH | 35.5450% of sector deposits |
| `EXC-THR-009-SECTOR-2026-11` | Sector | `IND-011` | HIGH | 1 watchlist record |
| `EXC-THR-008-SECTOR-2026-11` | Sector | `IND-010` | MEDIUM | 2,434.5814 index |
| `EXC-THR-010-SECTOR-2026-11` | Sector | `IND-012` | MEDIUM | 38.8889% coverage |

Three of them are explained by a data quality finding and three are not.
`TZ013` and `TZ014` were flagged by Day 1 and their exceptions say so. The
concentration, coverage and watchlist exceptions stand on their own
threshold evidence.

The coverage of 38.8889% is not a failure of the pipeline. The shipped
dataset is deliberately small and deliberately broken: eighteen of the
nineteen registered institutions never submitted anything, and the seven that
did include three that were flagged. The number is the truth about the data
that was supplied.

---

## 4. How to run it

```bash
# 1. Produce the Day 1 artefacts.
python day-01-data-engineering/src/validation.py

# 2. Compute the indicators and the exceptions.
python day-02-supervisory-analytics/src/analytics.py

# 3. Export the catalogs, so they can be reviewed and diffed.
python day-02-supervisory-analytics/src/catalogs.py

# 4. Serve the API.
uvicorn serve:app_factory --factory --app-dir day-02-supervisory-analytics/src
```

On Windows PowerShell:

```powershell
uvicorn serve:app_factory --factory --app-dir day-02-supervisory-analytics/src
```

A request:

```bash
curl http://127.0.0.1:8000/api/v1/exceptions
```

---

## 5. What Day 2 deliberately does not do

- **No write operations.** The API is read only. Triage workflow, an
  acknowledgement state and a supervisory action trail are out of scope.
- **No multi-period history.** The shipped dataset has one curated period,
  so the growth indicators are null by construction. The engine computes them
  when the history exists, and the test suite proves it with a two-period
  fixture.
- **No production identity.** One shared token, no users, no roles, no
  expiry. Labelled as such in the code, in this document and in the API
  responses.
- **No country-level context.** The World Bank indicators stay a separate
  exercise at a different grain. They are not joined to the institution
  level data here either.
- **No live database exercise.** The DDL is verified by parsing it and by
  asserting on the objects it creates, and the live load is verified by a
  test that runs when `DATABASE_URL` points at an approved development
  database. No such instance was available on the training machine, so that
  check has not been run. It is stated here rather than hidden.
- **No standardised thresholds.** Every limit in the catalog is illustrative.
