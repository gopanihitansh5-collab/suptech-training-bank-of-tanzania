# NavsaTech — Bank of Tanzania SupTech prototype

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Client context:** Bank of Tanzania (prototype only)
**Duration:** Five days
**Day 1 focus:** SupTech fundamentals, data architecture, ingestion and validation.

> All institution names, identifiers, reporting values and records in this repository
> are synthetic. This is not an official Bank of Tanzania system and it contains no
> real institution submissions. The rule catalog is illustrative material, not a
> regulatory reporting standard.

---

## Day 1 scope

A documented solution architecture and a working initial data ingestion and
preparation pipeline:

- a declared rule catalog with nineteen checks at two severities;
- records partitioned into valid, review, rejected and duplicate destinations;
- an audit trail that explains every finding from the evidence;
- a defined analytical data model and target relational structures;
- a reference notebook and a reusable implementation that are checked against each
  other by the test suite.

---

## Repository map

```text
suptech-training-bank-of-tanzania/
├── day-01-data-engineering/
│   ├── datasets/
│   │   ├── raw/institution_reports_synthetic.csv     25 synthetic submissions
│   │   └── reference/
│   │       ├── institutions_registry.csv              19 supervised institutions
│   │       ├── reporting_calendar.csv                 4 reporting periods
│   │       └── validation_rule_catalog.csv            the 19 rules, generated
│   ├── notebooks/
│   │   ├── day1_pipeline.ipynb                        the Day 1 reference notebook
│   │   └── world_bank_context.ipynb                   external context notebook
│   ├── src/
│   │   ├── ingestion.py                               load without repairing
│   │   ├── rules.py                                   the declared rule catalog
│   │   ├── validation.py                              the pipeline
│   │   ├── schema.py                                  the data model and the DDL
│   │   └── db.py                                      optional PostgreSQL load
│   └── reports/                                       generated, not committed
├── docs/
│   ├── architecture/
│   │   ├── solution-architecture.md                   the reference architecture
│   │   ├── data-model.md                              grains, tables, DDL
│   │   ├── day1-data-flow.md                          the Day 1 flow and rules
│   │   └── poc-scope-and-acceptance-criteria.md       scope and measurable criteria
│   ├── datasets/world-bank-context.md                 country-level context, kept separate
│   └── research/worldbank-market-conduct-suptech-brief.md   source-grounded theory brief
├── tests/
│   ├── conftest.py
│   ├── test_day1_pipeline.py                          40 tests on the pipeline
│   └── test_notebook_parity.py                        6 tests on notebook versus pipeline
├── requirements.txt
├── pytest.ini
└── .gitignore
```

Days 2 to 5 add `day-02-supervisory-analytics/`, `day-03-react-realtime/`,
`day-04-integration/` and `day-05-testing/`. They are not created yet. The scope
and the acceptance criteria for the whole programme are in
`docs/architecture/poc-scope-and-acceptance-criteria.md`.

---

## Quick start in VS Code

1. Install Python 3.11+ and Git.
2. Clone this repository or open the extracted folder.
3. Create and activate a virtual environment:

   **Windows PowerShell**

   ```powershell
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   ```

   **macOS/Linux**

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

4. Install the dependencies:

   ```bash
   pip install -r requirements.txt
   ```

5. Check the environment and the pipeline in one command:

   ```bash
   python -m pytest
   ```

6. Run the Day 1 pipeline:

   ```bash
   python day-01-data-engineering/src/validation.py
   ```

### What the pipeline writes

| Artefact | Contents |
| --- | --- |
| `day-01-data-engineering/datasets/processed/valid_records.csv` | Records that passed every rule. |
| `day-01-data-engineering/datasets/processed/review_records.csv` | Records admitted but flagged for a supervisor. |
| `day-01-data-engineering/datasets/processed/rejected_records.csv` | Records excluded, with their reasons and their original values. |
| `day-01-data-engineering/datasets/processed/duplicate_records.csv` | Exact duplicates, with a pointer to the row they repeat. |
| `day-01-data-engineering/reports/data_quality_audit.csv` | One row per finding. |
| `day-01-data-engineering/reports/validation_summary.csv` | Counts for the run. |
| `day-01-data-engineering/reports/rule_breach_counts.csv` | How many records each rule caught. |
| `day-01-data-engineering/reports/run_manifest.json` | Run id, timestamps, input hashes, thresholds, versions. |

The `processed/` and `reports/` folders are generated output and are not committed.

### The expected result

The shipped dataset has 25 records. The pipeline produces 1 exact duplicate, 17
rejected records, 3 records flagged for review and 4 valid records, from 27 blocking
and 4 warning findings across all 19 rules.

That acceptance rate of 0.16 is not a data quality score. The dataset exists to
exercise every rule in the catalog, and the row-level breakdown is in
`day-01-data-engineering/reports/data_quality_audit.csv`.

---

## The Day 1 notebooks

### `day1_pipeline.ipynb` — the reference notebook

Run it in Colab or in a local Jupyter environment. It finds the data automatically
when it is run from a clone of the repository, and it prompts for an upload when
it is not.

```bash
pip install jupyterlab
jupyter lab
```

The notebook is a readable reference implementation. The production version lives
in `day-01-data-engineering/src/validation.py`. The two are deliberately separate,
and `tests/test_notebook_parity.py` executes the notebook's cells and checks that
both sides agree on every record, every reason and every finding.

### `world_bank_context.ipynb` — external context

Retrieves published country-level indicators from the World Bank API. It is
deliberately separate: country-level indicators and institution-level submissions
are observations at different grains and are never joined. See
`docs/datasets/world-bank-context.md`.

This notebook calls a live external service. If the environment has no internet
access, save one response in advance.

---

## The rule catalog

Nineteen rules are declared in `day-01-data-engineering/src/rules.py` and exported to
`day-01-data-engineering/datasets/reference/validation_rule_catalog.csv`.

| Severity | Meaning | Effect |
| --- | --- | --- |
| `BLOCK` | The record cannot be trusted. | Rejected, kept with its reasons, stays in the audit trail. |
| `WARN` | The record is plausible but worth a look. | Kept in the curated dataset, queued for supervisory review. |

That distinction is the central design decision of Day 1. A pipeline that treats
every problem as a rejection throws away usable supervisory data. A pipeline that
treats every problem as a warning admits data it should not trust.

The rules are data rather than code, so the catalog can be printed, filtered,
exported and argued about without touching the pipeline.

---

## Environment decisions

| Component | Choice | Purpose |
| --- | --- | --- |
| Repository | GitHub | One central repository, published for collaboration. |
| IDE | VS Code | Application development. |
| Notebook | Google Colab | Exploration and demonstrations. |
| Language | Python 3.11+ | Data processing. |
| Data manipulation | Pandas | Ingestion and validation. |
| Database | PostgreSQL | Relational storage, introduced on Day 2. |
| Dataset | Synthetic plus World Bank | Prototype data. |
| Version control | Git | Change tracking. |

Colab is the exploration environment. VS Code is where the reusable
application is developed. PostgreSQL is introduced through the local or cloud
development environment; connect to it only when an approved and secure connection
is available.

---

## PostgreSQL

The target relational structures are defined in
`day-01-data-engineering/src/schema.py` and generated by
`schema.create_schema_sql()`. The DDL is verified by the test suite without a live
server, so it can be reviewed on any machine.

Loading the curated layer is Day 2 work and needs a PostgreSQL instance:

```bash
export DATABASE_URL="postgresql+psycopg://user:password@localhost:5432/suptech"
```

Read the connection string from the environment only. Never put a password or a
connection string in this repository or in a shared notebook, and never send
credentials from a browser to a backend.

---

## Dataset design

The synthetic dataset deliberately exercises every rule in the catalog:

- one exact duplicate row, and two resubmissions that are not duplicates;
- missing values, including an identifier that is empty;
- a non-numeric financial value, which is a missing value wearing a disguise;
- an unparseable date and two malformed reporting periods, one of which matches
  the `YYYY-MM` shape but names a month that does not exist;
- a reporting date outside the period window and a reporting period that
  disagrees with its own date;
- an unknown institution and a malformed identifier;
- negative amounts and an amount above the plausibility ceiling;
- three warnings: an implausible loan to deposit ratio, a zero balance and a
  watchlist institution that files on a different cadence.

The design principle is the same one the pipeline applies: **the raw input stays
untouched, and every submitted value is preserved so that a rejection can be
explained from the evidence.** A missing financial amount is never replaced with
zero.

---

## World Bank public context

Use the World Bank API for published country-level financial-sector indicators, as
a separate context exercise:

- API root: https://api.worldbank.org/v2/
- API documentation: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
- Financial Development data collection: https://data.worldbank.org/collections/findata

Country-level indicators are not institution-level supervisory submissions. Keep
the data levels distinct in the code and in the data model.

---

## Scope note

This repository is a prototype. It is not production-ready software, it is
not a regulatory reporting standard, and it does not represent Bank of Tanzania
internal data or systems. Confirm the machine policy, the approved
cloud environment, the software versions and the data-handling restrictions before
use.
