# Day 1 data flow

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Status:** Day 1. This is the operational narrative of
`day-01-data-engineering/src/validation.py`.

> All data in this repository is synthetic training data. The rules below are
> illustrative training rules, not official regulatory requirements.

---

## 1. The flow in one line

```text
submitted CSV → load without repair → separate exact duplicates → parse a working
copy → evaluate 19 declared rules → partition into four destinations → report the run
```

The order matters. Duplicates come out before the rules run, because an identical
row is not a data quality problem to be diagnosed rule by rule. And the parse step
never overwrites anything, because a rule that has to judge a value needs the value
as it was submitted.

---

## 2. Step by step

### Step 1 — Load, and refuse to repair

`ingestion.load_csv` reads every column as text. The blank deposit in the dataset
stays blank, the text `not-reported` stays the text `not-reported`, and `invalid-date`
stays the text `invalid-date`. Nothing is parsed, trimmed, filled or coerced.

Each row is stamped with `source_row_number`, its 1-based line in the submitted
file. Every finding made later points back to that number.

A file that does not honour the column contract stops the run with an error naming
the missing column. That is a different kind of problem from a record with a bad
value, and it is treated differently on purpose.

### Step 2 — Separate exact duplicates

A row identical to a row already seen, across all six value columns, is removed
before any rule runs and written to `duplicate_records.csv` with a pointer to the
row it repeats.

This happens first so that a repeated identical row can never also be reported as a
resubmission. It is the cleanest distinction in the whole pipeline:

| | Exact duplicate | Resubmission |
| --- | --- | --- |
| Same values | Yes | No |
| Same institution and period | Yes | Yes |
| Rule | `R013` | `R014` |
| Needs judgement | No | Yes |
| Who decides | The pipeline | A supervisor |

### Step 3 — Parse a working copy

The working copy gets parsed columns. The submitted values stay available in
`raw_` columns, so:

- `total_deposits` becomes a number, while `raw_total_deposits` still shows what
  was received.
- `reporting_date` becomes a date, while `raw_reporting_date` still shows
  `invalid-date` on the row that carried it.

A rejection is therefore always explainable from the evidence rather than from a
summary statistic.

### Step 4 — Evaluate the rule catalog

Nineteen rules are declared in `day-01-data-engineering/src/rules.py`, each with an
identifier, a name, a severity, a description and the reason a supervisor would
give for it. Two severities:

- **`BLOCK`** — the record cannot be trusted. It is rejected, kept with its reasons,
  and stays in the audit trail.
- **`WARN`** — the record is plausible but worth a look. It is admitted to the
  curated dataset and queued for supervisory review.

| Rule | Name | Severity |
| --- | --- | --- |
| `R001` | `missing_required_field` | BLOCK |
| `R002` | `invalid_institution_id_format` | BLOCK |
| `R003` | `unknown_institution` | BLOCK |
| `R004` | `unparseable_reporting_date` | BLOCK |
| `R005` | `reporting_date_outside_period` | BLOCK |
| `R006` | `invalid_reporting_period_format` | BLOCK |
| `R007` | `reporting_period_date_mismatch` | BLOCK |
| `R008` | `non_numeric_total_deposits` | BLOCK |
| `R009` | `non_numeric_total_loans` | BLOCK |
| `R010` | `negative_total_deposits` | BLOCK |
| `R011` | `negative_total_loans` | BLOCK |
| `R012` | `implausible_magnitude` | BLOCK |
| `R013` | `exact_duplicate_record` | BLOCK |
| `R014` | `duplicate_submission_key` | BLOCK |
| `R015` | `unknown_reporting_period` | BLOCK |
| `W001` | `loan_to_deposit_ratio_out_of_band` | WARN |
| `W002` | `zero_total_deposits` | WARN |
| `W003` | `institution_on_watchlist` | WARN |
| `W004` | `reporting_frequency_granularity_mismatch` | WARN |

The full catalog, including the reasoning behind each rule, is in
`day-01-data-engineering/datasets/reference/validation_rule_catalog.csv` and is
generated from the same source the pipeline uses.

#### Three rule behaviours worth explaining

**A submitted value that cannot be read produces two findings.** Row 9 carries the
text `not-reported` in `total_deposits`. That is a missing value wearing a disguise,
so the pipeline records `R001` (the required field is missing after parsing) and
`R008` (the value could not be read as a number). The audit trail keeps the original
text.

**A period that matches the shape is not automatically valid.** `R006` checks the
`YYYY-MM` pattern *and* that the value actually parses. `2026-13` matches the
pattern but month 13 does not exist, so it fails `R006` as well as `R001`. A regex
alone is not a validation.

**Two rules deliberately overlap.** `R005` and `R007` are two statements of the same
fact checked two ways. `R005` is anchored to the reporting calendar window;
`R007` compares the two months directly. A record can trip both, and that is not a
bug — it is the calendar and the record disagreeing with each other.

### Step 5 — Partition

| Destination | Condition | Output |
| --- | --- | --- |
| `valid` | No `BLOCK` and no `WARN` finding. | `valid_records.csv` |
| `review` | No `BLOCK` finding, at least one `WARN` finding. | `review_records.csv` |
| `rejected` | At least one `BLOCK` finding. | `rejected_records.csv` |
| `duplicate` | Removed in step 2. | `duplicate_records.csv` |

Rejected records keep their original submitted values in `raw_` columns alongside the
reason they were rejected. Review records keep the warnings that flagged them.

### Step 6 — Report the run

| Artefact | Contents |
| --- | --- |
| `data_quality_audit.csv` | One row per finding: run id, source row, rule, severity, outcome, observed value, detail. |
| `validation_summary.csv` | Records received, duplicates, rejected, review, valid, findings by severity, acceptance rate. |
| `rule_breach_counts.csv` | How many records each rule caught. |
| `run_manifest.json` | Run id, timestamps, SHA-256 of the input and both reference files, thresholds, rule count, Python and pandas versions. |

The manifest is what makes the run reproducible. It records the exact bytes of the
files that produced a set of numbers.

---

## 3. The verified result for the shipped dataset

The shipped dataset has 25 records. Running the pipeline produces:

| Metric | Value |
| --- | --- |
| Records received | 25 |
| Exact duplicates | 1 |
| Rejected | 17 |
| Flagged for review | 3 |
| Valid | 4 |
| Acceptance rate | 0.16 |
| `BLOCK` findings | 27 |
| `WARN` findings | 4 |
| Rules evaluated | 19 |
| Rules breached | 19 |

The row-level breakdown is in `day-01-data-engineering/reports/data_quality_audit.csv`,
one row per finding, and the per-rule totals are in
`day-01-data-engineering/reports/rule_breach_counts.csv`.

The acceptance rate of 0.16 is not a quality score for the data. It is the share of
the file that would reach the curated layer, and it is deliberately low because the
dataset exists to exercise the rules.

---

## 4. Day 2 consumes

`valid_records.csv` and `review_records.csv` are the inputs for the supervisory
indicators. `data_quality_audit.csv` is what makes an exception on the dashboard
explainable.

The rule that carries forward is the one from the architecture document: **the
curated layer is the contract.** Later layers read it and never reach back into the
submitted file.
