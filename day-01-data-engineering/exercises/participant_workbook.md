# Day 1 Participant Workbook: Ingestion and Validation

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems (training prototype, Bank of Tanzania context)
**Day 1 focus:** SupTech fundamentals, data architecture, ingestion and validation.
**Trainer:** NavsaTech.

All institution names, identifiers, reporting values and records in this workspace are synthetic training data. The validation rules used here are illustrative training rules. They are not official Bank of Tanzania regulatory reporting requirements and must not be presented as such.

---

## Before you start

You need Python 3.11 or later and pandas 2.2 or later. The repository pins `pandas>=2.2,<4` and has been run successfully on pandas 3.0.5. Jupyter is included.

**Locally (VS Code).** Create a virtual environment, install dependencies, then open `day-01-data-engineering/notebooks/day1_pipeline.ipynb` and run the cells from the top.

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**On Google Colab.** Open `https://colab.research.google.com/`, choose **File → Open notebook → GitHub**, and select `day-01-data-engineering/notebooks/day1_pipeline.ipynb`. The setup cell finds the repository root; if it cannot, set `SUPTECH_ROOT` or use the upload cell. Colab sessions are temporary, so save what you need to keep.

**Run the reference pipeline and the tests** from the repository root:

```bash
python day-01-data-engineering/src/validation.py
python -m pytest
```

The suite contains 46 tests and all of them must pass. Outputs land in `day-01-data-engineering/datasets/processed/` and `day-01-data-engineering/reports/`.

**Confirm your environment works:**

```python
import sys
import pandas as pd

print("Python:", sys.version)
print("Pandas:", pd.__version__)
```

**Files you will work with:**

| Path | What it is |
| --- | --- |
| `day-01-data-engineering/datasets/raw/institution_reports_synthetic.csv` | 25 submitted reports, 6 columns |
| `day-01-data-engineering/datasets/reference/institutions_registry.csv` | 19 supervised institutions |
| `day-01-data-engineering/datasets/reference/reporting_calendar.csv` | 4 periods: 2026-09 Closed, 2026-10 Closed, 2026-11 Open, 2026-12 Scheduled |
| `day-01-data-engineering/datasets/reference/validation_rule_catalog.csv` | The 19 declared rules |
| `day-01-data-engineering/notebooks/day1_pipeline.ipynb` | The guided notebook |
| `day-01-data-engineering/src/validation.py` | The reusable implementation |

---

## The task

You are the data engineer on the supervisory reporting team. Every reporting month, institutions file a return with their balances and reporting period. For every row that arrives you must decide three things: what can be trusted and promoted into the curated dataset, what is plausible but needs a supervisor's attention, and what has to go back to the institution.

You may not repair a missing value, silently drop a row, or decide which of two conflicting submissions is authoritative. You may apply a declared set of rules, record every finding, and leave judgement calls to a supervisor. By the end of the afternoon your pipeline must explain any rejection from the evidence in the source file.

---

## Exercise 1: Inspect the raw file

**Goal.** Load the submissions without changing anything.

**Steps.** Read the CSV with every column forced to text. The reference loader uses `dtype="string"` and a fixed `na_values` list, so a value such as `not-reported` stays a string and never becomes a missing value or a zero. Add a `source_row_number` column so every finding traces back to a line of the source file.

```python
import pandas as pd

RAW = "day-01-data-engineering/datasets/raw/institution_reports_synthetic.csv"

raw = pd.read_csv(
    RAW,
    dtype="string",
    keep_default_na=True,
    na_values=["", "NA", "N/A", "null", "NULL", "None"],
)
raw.insert(0, "source_row_number", range(1, len(raw) + 1))

print(raw.shape)
print(raw.dtypes)
print(raw.head(10).to_string(index=False))
```

**Record.** The shape, the data type of every column, and the names of the six submitted columns.

**Check.** `raw.shape` is 25 rows by 7 columns including the `source_row_number` you added. Every submitted column has data type `string`; only `source_row_number` is an integer. The loader repaired nothing.

---

## Exercise 2: Find the missing values and the duplicates

**Goal.** Separate two kinds of repeat: a row that says exactly the same thing twice, and a second submission for the same institution and period with different numbers.

**Steps.**

```python
VALUE_COLUMNS = [
    "institution_id", "institution_name", "reporting_date",
    "total_deposits", "total_loans", "reporting_period",
]

print("Missing values by column:")
print(raw.isna().sum())

exact_duplicates = raw.duplicated(subset=VALUE_COLUMNS, keep="first")
print("Exact duplicate rows:", raw.loc[exact_duplicates, "source_row_number"].tolist())

resubmission_key = ["institution_id", "reporting_period"]
key_duplicates = raw.duplicated(subset=resubmission_key, keep="first")
print("Repeated institution and period keys:",
      raw.loc[key_duplicates, "source_row_number"].tolist())
```

**Record.** The missing count for each column, the row number of the exact duplicate, and how many rows share an institution and reporting period.

**Check.** Exactly one row is an exact duplicate. The key-based check finds more rows than the exact-duplicate check, for two different reasons: the repeated identical row shares its key with the row it repeats, and a resubmission shares its key while carrying different values. The text `not-reported` is still a string, not a blank and not a zero.

This is why the pipeline separates exact duplicates *before* the resubmission rule runs. If it did not, row 4 would be reported both as a duplicate and as a resubmission.

---

## Exercise 3: Read the reference data

**Goal.** Load the two reference tables and understand what they let you check.

**Steps.**

```python
INSTITUTIONS = "day-01-data-engineering/datasets/reference/institutions_registry.csv"
CALENDAR = "day-01-data-engineering/datasets/reference/reporting_calendar.csv"

institutions = pd.read_csv(INSTITUTIONS, dtype="string")
calendar = pd.read_csv(CALENDAR, dtype="string")

print(institutions.shape)
print(calendar.to_string(index=False))
print(institutions["reporting_frequency"].value_counts())

flags = institutions.set_index("institution_id")
watchlist = flags.index[flags["watchlist_flag"].str.lower() == "true"].tolist()
quarterly = flags.index[flags["reporting_frequency"].str.lower() == "quarterly"].tolist()
print("Watchlist:", watchlist)
print("Quarterly filers:", quarterly)
```

**Record.** How many institutions are supervised, how many reporting periods exist, which institutions are on the watchlist, and which report quarterly.

**Check.** 19 institutions and 4 reporting periods. Look every `institution_id` up against the register and every `reporting_period` against the calendar. A well formed period that is not on the calendar is still a defect.

---

## Exercise 4: Read the rule catalog

**Goal.** Understand the rules before you apply them.

**Steps.**

```python
CATALOG = "day-01-data-engineering/datasets/reference/validation_rule_catalog.csv"
catalog = pd.read_csv(CATALOG, dtype="string")

print(catalog[["rule_id", "rule_name", "severity"]].to_string(index=False))
print(catalog["severity"].value_counts())
print(catalog.loc[catalog["rule_id"] == "R007", ["description", "rationale"]].to_string(index=False))
```

**Record.** The number of rules, how many are `BLOCK` and how many are `WARN`, and the reason a supervisor would care about three rules of your choice.

**Check.** 19 rules in total: 15 `BLOCK` and 4 `WARN`. A `BLOCK` finding removes a record from the curated dataset. A `WARN` finding never removes a record; it keeps the record and queues it for supervisory review. The catalog is data, not code, so you can filter and export it.

---

## Exercise 5: Write two rules of your own

**Goal.** Add two rules to the catalog and prove each one fires.

**Steps.**

1. Add two entries to your catalog: rule id, name, severity, description and a plain-language reason a supervisor would care. Suggested: `R016` loans exceeding deposits by more than a factor of ten (`WARN`); `R017` submitted institution name differing from the registered name (`BLOCK`).
2. Implement each as a boolean mask over the working copy and register it as a finding with the observed value and a readable detail, as the reference implementation does.
3. Build a one-row test frame with a deliberately bad value, run your mask on it, and show that it fires.

**Record.** For each rule: id, name, severity, your reason, and the row that demonstrates it.

**Check.** Each new rule fires on your test row, and neither changes the counts of valid, review or rejected records. If a rule does change them, you must name the records it moved and say why. A change in the curated dataset must always trace to a named rule.

---

## Exercise 6: Separate the four destinations

**Goal.** Partition every submitted row into exactly one of four places.

**Steps.** Collect the blocking rule names and the warning rule names separately for each row. A row with any blocking finding is rejected. A row with no blocking finding but at least one warning finding is kept and queued for review. A row with neither is valid. Exact duplicates are separated first, so a repeated identical row is never reported as a resubmission.

```python
BLOCK_RULES = set(catalog.loc[catalog["severity"] == "BLOCK", "rule_name"])
WARN_RULES = set(catalog.loc[catalog["severity"] == "WARN", "rule_name"])

# Build `reasons` first: one list of rule names per submitted row.
# Then split it into the blocking findings and the warning findings.
blocking = [names for names in reasons if BLOCK_RULES.intersection(names)]
warning = [names for names in reasons if WARN_RULES.intersection(names)]
```

**Record.** The number of records in each of the four destinations, and the source row numbers in each.

**Check.** The four counts add up to 25. Every record carrying only warnings is in the review output and still present in the curated dataset; no record with only warnings appears in the rejected output. Every rejected record carries a non-empty reason.

---

## Exercise 7: Produce the audit trail

**Goal.** Write one row per finding, in long format, so any decision can be defended later.

**Steps.** Append one finding row per rule that fires: run id, source row number, institution, reporting period, rule id, rule name, severity, outcome, observed value and a readable detail. Keep the submitted values in `raw_` columns on your working copy so a rejection can be explained from the evidence.

**Record.** The total number of audit rows, how many are `BLOCK` and how many are `WARN`, and the three rules with the highest counts.

**Check.** The number of audit rows equals the `BLOCK` findings plus the `WARN` findings. The audit is longer than the rejected set, because one record can fail more than one rule. A rejected row still carries its submitted values in the `raw_` columns.

---

## Exercise 8: Export the outputs

**Goal.** Write the four curated files, the reports and the run manifest.

**Steps.** Write the four record sets to `day-01-data-engineering/datasets/processed/`: `valid_records.csv`, `review_records.csv`, `rejected_records.csv`, `duplicate_records.csv`. Write the reports to `day-01-data-engineering/reports/`: `data_quality_audit.csv` (one row per finding), `validation_summary.csv`, `rule_breach_counts.csv`, `run_manifest.json`. The manifest records the run id, timestamps, the SHA-256 of the input and both reference files, the thresholds, the rule catalog size and the pandas version.

```python
import hashlib
import json
from datetime import datetime, timezone

def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()

manifest = {
    "run_id": run_id,
    "started_at_utc": datetime.now(timezone.utc).isoformat(),
    "input_file": Path(RAW).name,
    "input_sha256": sha256_of(RAW),
    "thresholds": {"max_total_deposits": 1.0e14,
                   "max_total_loans": 1.0e14,
                   "max_loan_to_deposit_ratio": 3.0},
    "rule_catalog_size": 19,
    "pandas_version": pd.__version__,
}
```

**Record.** The eight artefact paths you wrote and the manifest keys you populated.

**Check.** Running the pipeline twice gives the same counts and decisions, because no rule depends on the wall clock. The manifest's `input_sha256` proves which file produced which output.

---

## Discussion questions

There is no single code answer. Write your answer in the discussion cell and bring it to the plenary.

1. An exact duplicate and a resubmission look similar in a file. What is the difference in meaning, and why must the pipeline decide which one it is before the resubmission rule runs?
2. Why must a missing value never be turned into zero, even when the arithmetic seems to tolerate it?
3. If you have to send a resubmission back to an institution, what evidence do you need before you can say which of the two values is authoritative?
4. If this pipeline ran every month over every institution, what would have to change about the rules, the reference data and the audit trail for it to remain explainable?

---

## Self-check

Run this at the end of the session, using the `raw`, `valid`, `review`, `rejected`, `duplicates` and `audit` frames you built. These are the same assertions the notebook runs.

```python
checks = []

def check(label, condition, detail=""):
    checks.append((label, bool(condition), detail))
    print(f"{'PASS' if condition else 'FAIL'}  {label}  {detail}")

check("every received record is accounted for",
      len(duplicates) + len(rejected) + len(review) + len(valid) == len(raw),
      f"{len(raw)} received")

check("duplicates were separated",
      len(duplicates) == 1, f"{len(duplicates)} exact duplicates")

check("rejected records carry a reason",
      rejected["rejection_reason"].ne("").all())

check("review records carry a warning",
      review["warnings"].ne("").all())

check("rejected records keep their submitted values",
      "raw_total_deposits" in rejected.columns
      and rejected.loc[rejected["source_row_number"] == 6, "raw_reporting_date"].iloc[0]
      == "invalid-date")

check("every finding is in the audit trail",
      len(audit) == int((audit["severity"] == "BLOCK").sum())
      + int((audit["severity"] == "WARN").sum()))

check("no record was lost on the way",
      len(valid) + len(review) + len(rejected) + len(duplicates) == len(raw))

failed = [label for label, passed, _ in checks if not passed]
print("Still to fix:", failed) if failed else print("All Day 1 checks passed.")
```

Then compare your summary with the shipped run:

```python
print(pd.read_csv("day-01-data-engineering/reports/validation_summary.csv"))
```

The shipped run received 25 records, separated 1 exact duplicate, rejected 17, queued 3 for review and accepted 4, an acceptance rate of 0.16, from 27 blocking and 4 warning findings across 19 evaluated rules with all 19 breached. If your added rules changed the partition your numbers will differ; that is acceptable provided you can name the rule that moved each record and explain why.

---

## What to hand in at the end of Day 1

- [ ] The raw frame loaded and inspected, with no repair applied.
- [ ] The reference tables loaded and explained: 19 institutions, 4 reporting periods.
- [ ] The rule catalog read, with the `BLOCK` and `WARN` counts recorded.
- [ ] Your two new rules, with the reason a supervisor would care and the row that demonstrates each one.
- [ ] The four destinations separated, with the record count and row numbers for each.
- [ ] The rejection reasons and review warnings, one string per record.
- [ ] The audit trail, one row per finding.
- [ ] The eight exported artefacts, including the run manifest.
- [ ] The self-check output, all checks passing.
- [ ] Your written answers to the four discussion questions.
