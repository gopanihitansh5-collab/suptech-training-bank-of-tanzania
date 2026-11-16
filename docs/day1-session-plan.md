# Day 1 session plan

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Client context:** Bank of Tanzania (training prototype only)
**Outcome for the day:** a documented solution architecture and a working initial
data ingestion and preparation pipeline.

This is the trainer's run sheet. It maps the published Day 1 agenda onto the assets in
this repository, so the session can be delivered without improvising.

> All data in this repository is synthetic training data.

---

## 1. Before the session

| Task | Command or action | Time |
| --- | --- | --- |
| Confirm the environment works | `python -m pytest` | 5 min |
| Run the pipeline once and keep the output | `python day-01-data-engineering/src/validation.py` | 5 min |
| Rehearse the notebook end to end | Open `day-01-data-engineering/notebooks/day1_pipeline.ipynb` and run all cells | 15 min |
| Check the reference data is present | `day-01-data-engineering/datasets/reference/` holds four files | 2 min |
| Decide the participant copy | Remove `day-01-data-engineering/solutions/` for a participant-only copy | 2 min |

The notebook and the reusable implementation are checked against each other by
`tests/test_notebook_parity.py`. If that test fails, the notebook is not ready to be
taught from.

---

## 2. Morning — theory (about three and a half hours)

### 2.1 Introduction and SupTech fundamentals — 45 min

| Segment | Content | Material |
| --- | --- | --- |
| What SupTech is | Technology used by a supervisor to do the supervisory job better, as distinct from RegTech, which is the same technology used by a regulated firm to meet its own obligations. | `docs/research/worldbank-market-conduct-suptech-brief.md`, sections 1 to 4 |
| Generations | The four-generation framing: the first two have limited automation and disconnected data silos, the third and fourth automate end to end and consolidate into a single data lake. Where a training prototype actually sits. | Same brief, section 3; `docs/architecture/solution-architecture.md`, section 2 |
| Supervisory use cases | Concrete cases: automated data collection, machine-readable and executable regulation, complaint analysis, sentiment and behaviour monitoring, remote supervision of non-bank institutions. | Same brief, section 6 |
| What to be careful about | Data quality in regulatory reporting, model risk, over-reliance on automation, human review, privacy. | Same brief, section 8 |

The point to land: a SupTech system is not a dashboard. It is a chain from a
submitted record to a defensible decision, and the quality of that chain is decided
in the data layer.

### 2.2 Data-driven regulatory monitoring — 30 min

- What a supervisor can decide with data that they cannot decide without it:
  detect, investigate, intervene, report.
- Why evidence matters. A flag without a reason is not actionable, and an action
  without evidence is not defensible.
- Set up the thread that the whole day hangs on: every rejection needs a reason
  that a supervisor can read, and that reason has to survive three years.

### 2.3 Data sources, structures and formats — 30 min

- Two grains, and why they must stay apart: institution-level submissions versus
  country-level indicators.
- The submitted file as the raw layer: immutable, text, with a contract.
- The reference tables: the institution register and the reporting calendar. Why a
  number only becomes a fact with reference data attached.
- Read `docs/architecture/data-model.md`, sections 1 to 3, against the actual CSV
  files open on screen.

### 2.4 Reference architecture — 45 min

- Walk `docs/architecture/solution-architecture.md` end to end.
- The five layers: sources, ingestion, validation, curation, analytics and
  presentation. Which are built on Day 1 and which are not.
- The three principles: separation of layers, machine-readable exchange, data of
  record.
- What "the curated layer is the contract" means and why Day 2 does not reach back
  into the submitted file.

### 2.5 PoC scope and acceptance criteria — 30 min

- Walk `docs/architecture/poc-scope-and-acceptance-criteria.md`.
- The in-scope list and the out-of-scope list. The out-of-scope list is the more
  useful one: it is the difference between a prototype and a production system.
- The acceptance criteria for Day 1 and how each one is verified. Point out that
  every one has a named test behind it.

**Morning closing question, to the room:** "Every one of these criteria is checked
by a test. Which of them do you think is hardest to satisfy on real data?"

---

## 3. Afternoon — practical (about three and a half hours)

### 3.1 Reference implementation walkthrough — 40 min

Open `day-01-data-engineering/notebooks/day1_pipeline.ipynb` and work through it
cell by cell.

| Notebook section | Time | What the trainer is demonstrating |
| --- | --- | --- |
| 0. Setup | 5 min | How the notebook finds the data, in Colab and locally. |
| 1. Ingest and inspect | 10 min | The loader repairs nothing. The blank deposit stays blank. |
| 2. Reference data | 5 min | The register and the calendar. |
| 3. The rule catalog | 5 min | Rules as data. `BLOCK` versus `WARN`. |
| 4. Reference implementation | 15 min | Read the rules in order. Stop at the partition. |

The two behaviours to slow down for:

1. **A submitted value that cannot be read produces two findings.** Row 9 carries
   `not-reported`. It is both a missing required field and a non-numeric amount, and
   the audit trail keeps the original text.
2. **A period that matches the shape is not valid.** `2026-13` matches `\d{4}-\d{2}`
   and still fails, because month 13 does not exist. A regex is not a validation.

### 3.2 Participant exercise — 90 min

The participant works through `day-01-data-engineering/exercises/participant_workbook.md`.
The trainer circulates.

| Exercise | Time | Checkpoint |
| --- | --- | --- |
| 1. Inspect the raw file | 10 min | The participant can state what arrived and what is missing. |
| 2. Missing values and duplicates | 10 min | One exact duplicate found. |
| 3. Read the reference data | 10 min | Can explain why the register changes the answer for row 14. |
| 4. Read the rule catalog | 10 min | Can state what `BLOCK` and `WARN` mean and why both are needed. |
| 5. Write two rules of their own | 25 min | New rules added to the catalog, and the counts are explained. |
| 6. Separate the four destinations | 10 min | 25 records fully accounted for. |
| 7. Produce the audit trail | 10 min | Every rejected record has an audit row. |
| 8. Export the outputs | 5 min | All eight artefacts written. |

The checkpoint at exercise 5 matters most. When a participant's own rule changes
the counts, the counts are not wrong. The participant has to explain the change, and
that is the skill.

### 3.3 Move the logic into the reusable module — 25 min

- The relationship between the notebook and `day-01-data-engineering/src/`:
  the notebook is written to be read, the module is written to be reused and
  tested, and the parity test keeps them honest.
- Walk `src/rules.py`, `src/ingestion.py`, `src/validation.py`, `src/schema.py`.
- Run `python -m pytest` and read a couple of the test names aloud, so the
  participants see that the contract is executable.

### 3.4 Data model and storage structures — 25 min

- Walk `docs/architecture/data-model.md` against the generated DDL.
- Why `numeric(18,2)` and never a float.
- Why the audit table is in long format, and what the alternative costs when the
  twentieth rule arrives.
- Why `run_id` is part of the primary key.
- Show `src/schema.py::create_schema_sql()` and note that it is verified by the
  tests without a live database.

### 3.5 Close and hand over to Day 2 — 20 min

- Run the notebook's self-check cell. Every line passes.
- The eight artefacts and what Day 2 will do with each of them.
- The open question for the room: **the pipeline detects a resubmission but cannot
  resolve one.** What evidence would the platform need to receive so that it could?

---

## 4. Materials checklist

| Item | Path | Audience |
| --- | --- | --- |
| Day 1 notebook | `day-01-data-engineering/notebooks/day1_pipeline.ipynb` | Participant and trainer |
| Participant workbook | `day-01-data-engineering/exercises/participant_workbook.md` | Participant |
| Trainer answer key | `day-01-data-engineering/solutions/day1_answer_key.md` | Trainer only |
| Reusable pipeline | `day-01-data-engineering/src/` | Both |
| Synthetic dataset | `day-01-data-engineering/datasets/raw/` | Both |
| Reference data | `day-01-data-engineering/datasets/reference/` | Both |
| Solution architecture | `docs/architecture/solution-architecture.md` | Both |
| Data model | `docs/architecture/data-model.md` | Both |
| PoC scope and acceptance criteria | `docs/architecture/poc-scope-and-acceptance-criteria.md` | Both |
| Data flow | `docs/architecture/day1-data-flow.md` | Both |
| Theory brief | `docs/research/worldbank-market-conduct-suptech-brief.md` | Trainer, and participants as reading |

---

## 5. Known risks in this session

| Risk | Mitigation |
| --- | --- |
| The participant spends the afternoon fighting the environment instead of learning the pipeline. | Run `python -m pytest` before the session starts. The environment check is one command. |
| The acceptance rate of 0.16 is read as "the data is bad". | Explain the dataset's purpose before the participant sees the numbers. It exists to exercise the rules. |
| The participant treats `WARN` as `BLOCK`. | Make them find rows 16, 17 and 18 in the dataset and argue about whether they should be in the curated layer. |
| The participant assumes the World Bank indicators can be joined to the submissions. | Keep the context exercise separate and ask what the join would mean. The answer is usually "nothing coherent". |
| The trainer is asked whether these rules are the real rules. | They are not. Say so plainly, and say what it would take to agree them with a supervisor. |
