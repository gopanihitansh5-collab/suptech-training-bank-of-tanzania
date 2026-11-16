# SupTech training PoC — solution architecture

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Client context:** Bank of Tanzania (training prototype only)
**Status:** Day 1 implemented. Days 2 to 5 designed and scaffolded.

> Everything in this repository is synthetic training data. This document describes a
> training-level prototype. It is not a production design, it is not a regulatory
> reporting standard, and it does not represent Bank of Tanzania internal data,
> systems or architecture.

---

## 1. What the PoC has to prove

The five-day programme builds one thing: a **Supervisory Monitoring Dashboard** that
takes supervisory reporting records from institutions, checks them, derives supervisory
indicators from the records that pass, and shows a supervisor the exceptions with an
explanation attached.

The proof is not the dashboard. The proof is the chain:

```text
a submitted record  ->  a trustworthy record  ->  an indicator  ->  an exception  ->  a reason
```

Each link has to be inspectable. If a supervisor cannot answer "why is this
institution flagged, and what did you do with the 14 records you threw away", the
system is a picture, not a supervisory tool.

That is why the Day 1 pipeline produces an audit trail as a first-class output rather
than as logging.

---

## 2. Architecture principles

The reference architecture follows the framing that the financial supervisors' own
technology literature uses: distributed, API-driven, and built around storage that
suits the data rather than around a single monolithic database. See
`docs/research/worldbank-market-conduct-suptech-brief.md` for the sources and the
generations framing.

Three principles shape the design of this PoC:

| Principle | What it means here | How Day 1 applies it |
| --- | --- | --- |
| **Separation of layers** | Ingestion, validation, curation, analytics and presentation are separate and can be replaced independently. | `ingestion.py`, `validation.py` and `db.py` are separate modules with separate responsibilities. |
| **Machine-readable exchange** | Data moves between layers as files, tables and JSON, never as a screen a person has to read and retype. | The pipeline writes eight machine-readable artefacts per run, and `src/db.py` loads them into SQL tables. |
| **Data of record** | The stored, validated record is the thing the dashboard reads. | `suptech.institution_report` is the curated layer. The dashboard never reads the submitted file. |

Two further constraints come from the training context rather than from the literature:

- **The reference data is part of the architecture.** An institution register and a
  reporting calendar are not optional extras. Without them a supervisor cannot tell
  an unknown institution from a known one, or a valid period from an invented one.
- **Reproducibility beats cleverness.** The pipeline produces the same output for the
  same input, every time, with no dependency on the wall clock. That is what makes
  the audit trail worth anything.

---

## 3. The five-layer reference architecture

```text
  L0  SOURCES                L1  INGESTION           L2  VALIDATION
  ─────────────────────      ────────────────────   ─────────────────────────
  institution submissions  →  read as text, no     →  19 declared rules
  (CSV / future API)          repair, stamped         severity BLOCK / WARN
                              with a source row       audit trail per finding

  L3  CURATION               L4  ANALYTICS           L5  PRESENTATION
  ─────────────────────      ────────────────────   ─────────────────────────
  valid + review records    →  KPIs, KRIs,        →  React dashboard,
  + audit trail             thresholds,           exceptions, trends,
  → PostgreSQL              exception rules       live status indicators
```

### L0 — Sources

Two kinds of source, kept at different grains and never merged:

| Source | Grain | Day 1 status |
| --- | --- | --- |
| Institution regulatory returns | One row per institution per reporting period | Synthetic CSV in use |
| World Bank country indicators | One row per country per year per indicator | Separate context exercise only |

Country-level indicators and institution-level submissions are different observations
of different things. Joining them without an explicit analytical model would invent
a relationship that does not exist. `docs/datasets/world-bank-context.md` explains how
the country data is used as context instead.

### L1 — Ingestion

`day-01-data-engineering/src/ingestion.py`.

- Reads every column as text. Nothing is parsed, trimmed, filled or coerced at this
  layer.
- Stamps each row with `source_row_number`, so any finding made later points back to
  a line of the submitted file.
- Refuses to load a file that does not honour the column contract, and says which
  column is missing. A file that does not match the contract is a contract break, not
  a data quality problem to be silently repaired.

### L2 — Validation

`day-01-data-engineering/src/validation.py` and the rule catalog in
`day-01-data-engineering/src/rules.py`.

- Rules are declared data, not code. Each rule has an identifier, a name, a severity,
  a description and the reason a supervisor would give for it.
- `BLOCK` rejects a record. `WARN` keeps the record and queues it for review. The
  two decisions are different and the pipeline keeps them apart.
- Every submitted value is preserved in a `raw_` column on the working copy, so a
  rejection can be explained from the evidence rather than from a summary.
- Every finding is written to an audit trail in long format: one row per rule
  evaluation, with the value that was observed.

The separation of `BLOCK` from `WARN` is the single most important design decision in
Day 1. A pipeline that treats every data problem as a rejection throws away usable
supervisory data. A pipeline that treats every data problem as a warning admits data
it should not trust.

### L3 — Curation

`day-01-data-engineering/src/db.py` and `day-01-data-engineering/src/schema.py`.

The curated layer is the set of records that survived validation, plus the audit
trail that explains what happened to everything else. The target structures are
defined in `docs/architecture/data-model.md` and generated by
`schema.create_schema_sql()`.

Day 1 defines the structures and the loading code. Running the load requires a
PostgreSQL instance, which is introduced on Day 2. The DDL is verified by the test
suite without a live server.

### L4 — Analytics

Designed, not built. Day 2 adds supervisory KPIs, KRIs, thresholds and exception
rules over the curated layer. The two artefacts that make this possible arrive from
Day 1: the curated records, and the audit trail that lets an exception on the
dashboard carry its reason.

### L5 — Presentation

Designed, not built. Days 3 and 4 add the React dashboard, the API and the live
update mechanism.

---

## 4. Day 1 data flow

```text
institution_reports_synthetic.csv   (immutable, 25 rows)
        │
        ├── institutions_registry.csv ──┐
        └── reporting_calendar.csv ────┤   reference data
                                        ▼
                             ┌───────────────────────┐
                             │ 1. load, do not repair│
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │ 2. exact duplicates   │──→ duplicate_records.csv
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │ 3. parse working copy │  raw_* columns preserved
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │ 4. evaluate 19 rules  │──→ data_quality_audit.csv
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │ 5. partition          │──→ valid_records.csv
                             └───────────────────────┘  review_records.csv
                                                │       rejected_records.csv
                                                ▼
                             ┌───────────────────────┐
                             │ 6. report the run     │──→ validation_summary.csv
                             └───────────┬───────────┘  rule_breach_counts.csv
                                         ▼             run_manifest.json
                                  PostgreSQL (Day 2)
```

The full narrative, including the rule catalog and the verified result for the
shipped dataset, is in `docs/architecture/day1-data-flow.md`.

---

## 5. Run artefacts and what each one is for

| Artefact | Purpose | Consumed by |
| --- | --- | --- |
| `valid_records.csv` | Records that passed every rule. | Day 2 indicators, the dashboard. |
| `review_records.csv` | Records admitted but flagged. | Day 2 exception rules, the dashboard. |
| `rejected_records.csv` | Records excluded, with reasons and original values. | The reporting institution, the supervisor. |
| `duplicate_records.csv` | Exact duplicates, with a pointer to the row they repeat. | Audit. |
| `data_quality_audit.csv` | One row per finding, with the observed value. | The dashboard's exception explanations. |
| `validation_summary.csv` | Counts for the run. | Run monitoring. |
| `rule_breach_counts.csv` | How many records each rule caught. | Rule tuning, the data quality dashboard. |
| `run_manifest.json` | Run id, timestamps, SHA-256 of every input, thresholds, versions. | Reproducibility and evidence. |

The manifest is what makes the chain in section 1 defensible. It records the exact
bytes of the file that produced a set of numbers, so the numbers can be reproduced
later.

---

## 6. Data handling and security

- All data in this repository is synthetic. No real institution submission, no real
  balance and no real institution is present.
- Provider credentials and database credentials are read from environment variables
  only. Never commit them, never put them in a shared notebook, and never send them
  from a browser to a backend.
- The notebook contains no credential of any kind. A test in
  `tests/test_notebook_parity.py` enforces this, so the guarantee cannot rot.
- Connect only to a development database that the engagement has explicitly approved.
- The reference and source documents for this programme are public material. The
  World Bank publication and the Regnology insight are cited in
  `docs/research/worldbank-market-conduct-suptech-brief.md`.

---

## 7. What is built and what is not

| Layer | State on the end of Day 1 |
| --- | --- |
| L0 Sources | Synthetic dataset and reference data in place. World Bank context exercise documented. |
| L1 Ingestion | Implemented and tested. |
| L2 Validation | Implemented, 19 rules, audit trail, tested. |
| L3 Curation | Structures defined, DDL generated, loading code written. Live load untested: no PostgreSQL instance on the training machine. |
| L4 Analytics | Designed only. Day 2. |
| L5 Presentation | Designed only. Days 3 and 4. |

The gap at L3 is real and is stated rather than hidden: the DDL is verified by
parsing it with SQLAlchemy's PostgreSQL dialect and by asserting on the objects it
creates, but no live database has been exercised against it yet. That check happens
on Day 2.

---

## 8. Known limitations

1. **The data is synthetic.** It is designed to exercise the rules, not to represent
   the shape of any real regulatory return.
2. **The reference data is small.** Two reference tables and nineteen institutions.
   A real register carries far more attributes and far more history.
3. **Resubmissions cannot be resolved automatically.** The pipeline detects them and
   routes them to a supervisor, because deciding which version is authoritative needs
   evidence the file does not contain, such as a submission timestamp.
4. **The rules are illustrative.** They are plausible supervisory checks. They are
   not an official reporting standard and have not been agreed with any supervisor.
5. **The pipeline is single-file and in-memory.** It is sized for a training dataset.
   The move to a database and to a scheduled, distributed pipeline happens on Day 2
   and beyond, and the architecture says so rather than pretending otherwise.
6. **Country-level context is deliberately not joined** to institution-level
   records.
