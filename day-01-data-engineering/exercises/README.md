# Day 1 participant exercise

The full workbook is in [`participant_workbook.md`](participant_workbook.md). Work
through it in `../notebooks/day1_pipeline.ipynb`.

Using `../datasets/raw/institution_reports_synthetic.csv`:

1. Load the CSV and inspect its shape, columns, data types and sample rows.
2. Count missing values in each column.
3. Identify exact duplicate rows.
4. Convert deposit and loan fields to numeric values without silently replacing invalid values.
5. Parse reporting dates and identify invalid dates.
6. Apply required-field and non-negative-value rules.
7. Separate valid records, rejected records and exact duplicates.
8. Add a `rejection_reason` field to rejected records.
9. Export outputs and produce a validation summary.

The reference implementation separates four destinations, not three: valid, flagged
for review, rejected and duplicate. A record that breaks a warning rule stays in the
curated dataset and is queued for a supervisor.

**Extension:** Add a rule that checks whether `reporting_period` agrees with the month
of `reporting_date`. Explain how you would handle legitimate resubmissions versus
exact duplicate submissions.
