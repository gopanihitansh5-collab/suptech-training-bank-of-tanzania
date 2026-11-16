# Day 1 Answer Key: Ingestion and Validation

**Trainer only.** This file is the marking key for the Day 1 practical. It must not be distributed with a participant-only copy of the repository; `solutions/README.md` says the same: keep this folder private.

Reminder for the trainer: all institution data is synthetic training data, and the rules are illustrative training rules, not official Bank of Tanzania requirements.

---

## Verified expected result

| Metric | Value |
| --- | --- |
| records_received | 25 |
| exact_duplicates | 1 |
| rejected_records | 17 |
| review_records | 3 |
| valid_records | 4 |
| acceptance_rate | 0.16 |
| block_findings | 27 |
| warn_findings | 4 |
| rules_evaluated | 19 |
| rules_breached | 19 |

The four destinations partition every received record: 1 duplicate plus 17 rejected plus 3 review plus 4 valid equals 25, and all 19 rules fire.

---

## Source row to findings to destination

`source_row_number` is the 1-based data row in the source CSV, header excluded.

| Source row | Rules fired | Destination | What the row contains |
| --- | --- | --- | --- |
| 1 | none | valid | Clean submission, TZ001. |
| 2 | none | valid | Clean submission, TZ002. |
| 3 | none | valid | Clean submission, TZ003, first row of its key. |
| 4 | R013 | duplicates | Exact repeat of row 1, identical values. |
| 5 | R001 | rejected | `total_deposits` empty. |
| 6 | R001, R004 | rejected | `reporting_date` is the text `invalid-date`. |
| 7 | R010 | rejected | `total_deposits` is `-100000`. |
| 8 | R001 | rejected | `institution_id` empty. |
| 9 | R001, R008 | rejected | `total_deposits` is the text `not-reported`. |
| 10 | R011 | rejected | `total_loans` is `-2500000`. |
| 11 | R014 | rejected | TZ003 and 2026-11 again with different values: a resubmission. |
| 12 | R005, R007 | rejected | Date 2026-10-31 with period 2026-11. |
| 13 | R005, R007 | rejected | Date 2026-11-01 with period 2026-10. |
| 14 | R003 | rejected | `institution_id` TZ999 is not in the register. |
| 15 | R012 | rejected | `total_deposits` 999999999999999999, above the 1e14 ceiling. |
| 16 | W001 | review | Deposits 10000000, loans 90000000, ratio 9.0 against a band of 3.0. |
| 17 | W002 | review | `total_deposits` and `total_loans` are both 0. |
| 18 | W003, W004 | review | TZ015 is on the watchlist and reports monthly as a quarterly filer. |
| 19 | R014 | rejected | TZ002 and 2026-11 again with different values: a resubmission. |
| 20 | R001, R006 | rejected | `reporting_period` is `2026-13`, a shape match but not a month. |
| 21 | R007, R015 | rejected | `reporting_period` is `2025-01`, off the calendar, and disagrees with the date. |
| 22 | R002, R003 | rejected | `institution_id` is `TZ`, malformed and not in the register. |
| 23 | R001, R009 | rejected | `total_loans` is the text `not-reported`. |
| 24 | none | valid | Clean submission, TZ007. |
| 25 | R001, R006 | rejected | `reporting_period` is `Nov-2026`, not a YYYY-MM period. |

Breach counts: R001 on 7 rows, R007 on 3, R003, R005, R006 and R014 on 2 each, the other BLOCK rules and W001 to W004 on 1 each, giving 27 blocking and 4 warning findings.

R005 and R007 overlap on purpose: two statements of the same fact, checked two ways. R005 anchors the date to the calendar window of the period, R007 compares the two months directly. Rows 12 and 13 carry both.

---

## Why each rule exists

- **R001**: the report cannot be attributed to an institution or placed in time.
- **R002**: a malformed identifier is a submission error, not a new institution.
- **R003**: an unrecognised institution cannot be supervised or aggregated.
- **R004**: an unparseable date silently becomes a missing date.
- **R005**: a date outside its own period cannot be reconciled with it.
- **R006**: the period is the aggregation key, so it must be well formed.
- **R007**: disagreeing months count the record twice or in the wrong period.
- **R008**: `not-reported` is a missing value in disguise; zero understates deposits.
- **R009**: the same reasoning applied to loans and advances.
- **R010**: a negative deposit balance signals a sign or extraction error.
- **R011**: the same reasoning applied to a negative loan balance.
- **R012**: magnitude ceilings catch amounts in the wrong unit.
- **R013**: exact duplicates inflate totals and need no judgement.
- **R014**: two values for one institution and period cannot both be aggregated.
- **R015**: a period off the calendar has no window, due date or status.
- **W001**: an implausible ratio is not proof of a bad submission.
- **W002**: a zero balance is legal but unusual, and often means "not supplied".
- **W003**: the report is valid, but should be seen beside the watchlist status.
- **W004**: a quarterly filer reporting monthly is a template error or an early submission.

---

## Questions participants will ask

**An exact duplicate and a resubmission both look like two rows for one institution and period.** An exact duplicate is identical, carries no new information and inflates totals if counted twice. A resubmission carries different values, so the file alone cannot say which is authoritative. Duplicates are therefore separated first, so a repeated identical row is never reported as a resubmission.

**Why not turn a missing value into zero?** Zero is a claim: that the institution reported a nil balance. That is a different fact from "the institution did not report". Coercing `not-reported` to zero understates sector deposits and hides a filing failure behind a plausible number.

**What evidence confirms a resubmission?** A version number, a submission timestamp and an explicit amendment flag, plus the reason for the amendment. Without them a supervisor must confirm which values were submitted last, and the pipeline should keep both versions, mark the record unresolved, and hold it out of the curated dataset until the answer arrives.

**What changes at scale?** Rules parameterised by period and institution, thresholds in configuration, and reference data as a versioned time series so a rule evaluates against the register as it stood then. The audit trail must carry the rule version and the reference snapshot behind each decision. Monthly runs also need incremental processing, partition tests per period, and monitoring that alerts when a breach rate shifts.

---

## Common mistakes

1. **Coercing a blank or `not-reported` to zero.** Use `pd.to_numeric(..., errors="coerce")` and keep the result as `NaN`.
2. **Dropping rows silently with `dropna()`.** Every record must land in one of the four destinations with a reason.
3. **Treating an exact duplicate as a resubmission.** Separate duplicates first, or the resubmission count is inflated.
4. **Treating a WARN as a rejection.** Rows 16, 17 and 18 must stay in the curated dataset, flagged.
5. **Regex-only period validation.** `2026-13` matches the shape but is not a month, so the value must also parse.
6. **Mixing country-level and institution-level data.** Country indicators are context, never joined onto institution rows.
7. **Hard-coding a wall-clock rule.** The same file then gives different results on different days.

---

## Where to look if it goes wrong

| Symptom | Where to look |
| --- | --- |
| A record that should have been rejected was not | The rule catalog in `day-01-data-engineering/src/rules.py`: the rule may be missing or the severity wrong. |
| Wrong row counts | `run_pipeline` in `day-01-data-engineering/src/validation.py`, the partition step and the `record` helper. |
| The notebook and the pipeline disagree | Run `python -m pytest tests/test_notebook_parity.py`; it compares partitions, reasons, warnings and findings. |
| A rejected record lost its submitted values | The `raw_` preservation step in `run_pipeline` and `RAW_PRESERVATION_COLUMNS` in `day-01-data-engineering/src/validation.py`. |
| The source file will not load | `load_csv` in `day-01-data-engineering/src/ingestion.py`, which raises when a required column is missing. |
| A threshold looks wrong | `Thresholds` in `day-01-data-engineering/src/validation.py`; the ceilings and ratio band live there. |
| The reference data looks stale | `day-01-data-engineering/datasets/reference/`, compared with the SHA-256 values in `run_manifest.json`. |
