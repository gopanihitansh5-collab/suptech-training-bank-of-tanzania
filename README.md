# NavsaTech — Bank of Tanzania SupTech prototype

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Client context:** Bank of Tanzania (prototype only)
**Duration:** Five days
**Day 1 focus:** SupTech fundamentals, data architecture, ingestion and validation.
**Day 2 focus:** Supervisory analytics, exception rules, the PostgreSQL load and the API.
**Day 3 focus:** The live update mechanism and the React dashboard.

> All institution names, identifiers, reporting values and records in this repository
> are synthetic. This is not an official Bank of Tanzania system and it contains no
> real institution submissions. The rule catalog and the threshold catalog are
> illustrative material, not a regulatory reporting standard.

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

## Day 2 scope

Supervisory indicators, exception rules and the read model the dashboard will
consume:

- twelve declared supervisory indicators computed over the curated layer;
- ten declared thresholds with severities, bands and reasons;
- exception records that carry the observed value, the limit and the reason;
- a foreign-keyed link between an exception and the audit findings behind it;
- the Day 2 relational structures and a loader for the curated layer;
- an authenticated REST API over the read model, with no default token;
- a reference notebook and a reusable implementation, checked against each
  other by the test suite.

The full narrative is in `docs/architecture/day2-analytics-and-api.md`.

---

## Day 3 scope

A live update mechanism and a responsive dashboard over the Day 2 API:

- a Server-Sent Events endpoint that is protected like every other endpoint;
- an event broker with a bounded history that replays exactly what a
  reconnecting client missed;
- a watcher that turns a new pipeline run into an event;
- a React dashboard with the live status, the sector indicators, the
  exceptions, the register, the filters and two drill-downs;
- the token typed at runtime, held in memory, and never in a URL.

The dashboard reads the Day 2 API and nothing else: no fixture, no hard-coded
number and no fallback data. The full narrative is in
`docs/architecture/day3-live-dashboard.md`.

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
├── day-02-supervisory-analytics/
│   ├── datasets/
│   │   ├── reference/
│   │   │   ├── indicator_catalog.csv                  the 12 indicators, generated
│   │   │   └── threshold_catalog.csv                  the 10 thresholds, generated
│   │   └── processed/                                 generated, not committed
│   ├── notebooks/
│   │   └── day2_analytics.ipynb                      the Day 2 reference notebook
│   ├── src/
│   │   ├── analytics.py                               the analytics run
│   │   ├── api.py                                     the REST API
│   │   ├── auth.py                                    the training token scheme
│   │   ├── catalogs.py                                the indicator and threshold catalogs
│   │   ├── curated.py                                 the Day 1 curated layer
│   │   ├── ddl.py                                     the Day 2 structures
│   │   ├── exceptions.py                              threshold evaluation
│   │   ├── indicators.py                              the indicator computation
│   │   ├── loader.py                                  the PostgreSQL load
│   │   ├── repository.py                              the read model
│   │   └── serve.py                                   the ASGI entry point
│   └── reports/                                       generated, not committed
├── day-03-react-realtime/
│   ├── backend/
│   │   ├── app.py                                   the API plus the live endpoint
│   │   ├── events.py                                the event broker
│   │   └── watcher.py                               the run watcher
│   └── dashboard/
│       ├── package.json
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx                              the shell and the drill-downs
│           ├── api.ts                               the one client for the API
│           ├── live.ts                              the stream reader
│           ├── components/                          the panels
│           ├── hooks/                               the read model and the connection
│           └── __tests__/                           27 frontend tests
├── docs/
│   ├── architecture/
│   │   ├── solution-architecture.md                   the reference architecture
│   │   ├── data-model.md                              grains, tables, DDL
│   │   ├── day1-data-flow.md                          the Day 1 flow and rules
│   │   ├── day2-analytics-and-api.md                  the Day 2 flow and API
│   │   ├── day3-live-dashboard.md                     the Day 3 live update and the dashboard
│   │   └── poc-scope-and-acceptance-criteria.md       scope and measurable criteria
│   ├── datasets/world-bank-context.md                 country-level context, kept separate
│   └── research/worldbank-market-conduct-suptech-brief.md   source-grounded theory brief
├── tests/
│   ├── conftest.py
│   ├── test_day1_pipeline.py                          40 tests on the pipeline
│   ├── test_notebook_parity.py                        6 tests on notebook versus pipeline
│   ├── test_day2_analytics.py                         36 tests on the analytics
│   ├── test_day2_api.py                               24 tests on the API
│   ├── test_day2_database.py                          12 tests on the structures and the load
│   ├── test_day2_notebook_parity.py                    7 tests on notebook versus engine
│   ├── test_day3_live.py                              21 tests on the live update
│   └── test_day3_dashboard.py                          9 tests on the dashboard contract
├── requirements.txt
├── pytest.ini
└── .gitignore
```

Days 4 and 5 add `day-04-integration/` and `day-05-testing/`. They are not
created yet. The scope and the acceptance criteria for the whole programme are
in `docs/architecture/poc-scope-and-acceptance-criteria.md`.

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

7. Run the Day 2 analytics over the curated layer:

   ```bash
   python day-02-supervisory-analytics/src/analytics.py
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

### What the Day 2 analytics writes

| Artefact | Contents |
| --- | --- |
| `day-02-supervisory-analytics/datasets/processed/indicator_values.csv` | One row per indicator, per subject, per period. |
| `day-02-supervisory-analytics/datasets/processed/exceptions.csv` | One row per threshold breach, with its evidence. |
| `day-02-supervisory-analytics/datasets/processed/exception_audit_links.csv` | The link between an exception and the audit findings behind it. |
| `day-02-supervisory-analytics/reports/sector_summary.csv` | One row per reporting period, for the dashboard summary. |
| `day-02-supervisory-analytics/reports/exception_summary.csv` | Counts by severity. |
| `day-02-supervisory-analytics/reports/analytics_manifest.json` | Run id, timestamps, input hashes, counts, versions. |

### The expected result

The shipped dataset has 25 records. The pipeline produces 1 exact duplicate, 17
rejected records, 3 records flagged for review and 4 valid records, from 27 blocking
and 4 warning findings across all 19 rules.

That acceptance rate of 0.16 is not a data quality score. The dataset exists to
exercise every rule in the catalog, and the row-level breakdown is in
`day-01-data-engineering/reports/data_quality_audit.csv`.

### The expected result of Day 2

The seven curated records produce 48 indicator values and 6 exceptions: two
critical, two high and two medium. The sector holds 2,110,000,000 TZS in deposits
and 1,580,000,000 TZS in loans, a loan-to-deposit ratio of 0.7488 and a deposit
concentration index of 2,434.5814. The breakdown is in
`day-02-supervisory-analytics/reports/sector_summary.csv`.

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

## The Day 2 notebook

### `day2_analytics.ipynb` — the reference notebook

It reads the Day 1 curated layer, declares the indicator catalog and the threshold
catalog, computes the indicators, evaluates the thresholds and writes the outputs.
If the Day 1 artefacts are not on disk it runs the Day 1 pipeline first and reads
what the pipeline published.

The readable implementation lives in the notebook. The reusable one lives in
`day-02-supervisory-analytics/src/`. The two are deliberately separate, and
`tests/test_day2_notebook_parity.py` executes the notebook's cells and checks that
both sides agree on every indicator value and every exception.

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

## The indicator and threshold catalogs

Twelve indicators and ten thresholds are declared in
`day-02-supervisory-analytics/src/catalogs.py` and exported to
`day-02-supervisory-analytics/datasets/reference/indicator_catalog.csv` and
`day-02-supervisory-analytics/datasets/reference/threshold_catalog.csv`.

An indicator is a measure. A threshold is a declared limit on one indicator, with
the severity of a breach and the reason a supervisor would give for caring.

The Day 2 severities are not the Day 1 severities. Day 1 asked whether a record
can be trusted and answered `BLOCK` or `WARN`. Day 2 asks whether a number
deserves attention and answers `CRITICAL`, `HIGH`, `MEDIUM` or `LOW`. A flawless
record can raise a critical exception, and a flagged record can raise none.

Both catalogs are data rather than code, so a supervisory limit is a change to a
table and not a change to the pipeline.

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
| API | FastAPI with Uvicorn | The read model the dashboard consumes. |
| Dataset | Synthetic plus World Bank | Prototype data. |
| Version control | Git | Change tracking. |

Colab is the exploration environment. VS Code is where the reusable
application is developed. PostgreSQL is introduced through the local or cloud
development environment; connect to it only when an approved and secure connection
is available.

---

## PostgreSQL

The target relational structures are defined in
`day-01-data-engineering/src/schema.py` and `day-02-supervisory-analytics/src/ddl.py`,
and generated by `schema.create_schema_sql()` and `ddl.create_schema_sql()`. The DDL
is verified by the test suite without a live server, so it can be reviewed on any
machine.

Loading the curated layer, the audit trail, the indicator values, the exceptions and
the links needs a PostgreSQL instance:

```bash
export DATABASE_URL="postgresql+psycopg://user:password@localhost:5432/suptech"
```

Read the connection string from the environment only. Never put a password or a
connection string in this repository or in a shared notebook, and never send
credentials from a browser to a backend.

---

## The API

The Day 2 API serves the read model: the supervisory indicators, the exceptions and
the reason behind every exception.

```bash
export SUPTECH_API_TOKEN="<a value you choose>"
uvicorn serve:app --app-dir day-02-supervisory-analytics/src
```

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/health` | public |
| `GET` | `/api/v1/meta` | token |
| `GET` | `/api/v1/institutions` | token |
| `GET` | `/api/v1/institutions/{institution_id}` | token |
| `GET` | `/api/v1/indicators` | token |
| `GET` | `/api/v1/exceptions` | token |
| `GET` | `/api/v1/exceptions/{exception_id}` | token |
| `GET` | `/api/v1/summary` | token |

There is no default token. If `SUPTECH_API_TOKEN` is missing the API refuses to
start, because a hard-coded default is a hard-coded credential. The token scheme
is a training scheme: one shared token, no users, no roles, no expiry and no record
of who looked at what. It is not an identity provider.

---

## The dashboard

Day 3 adds a live update mechanism and a React dashboard over the same API.

```bash
# The API, with the live endpoint.
export SUPTECH_API_TOKEN="<a value you choose>"
uvicorn app:app_factory --factory --app-dir day-03-react-realtime/backend

# The dashboard.
cd day-03-react-realtime/dashboard
npm install
npm run dev
```

Open http://127.0.0.1:5173 and type the token in. Run the pipeline again and the
dashboard reloads itself.

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/api/v1/events` | token |

The stream is Server-Sent Events. The token travels in the header, never in a
URL, and a client that reconnects is replayed exactly the events it missed.

The frontend has its own tests:

```bash
cd day-03-react-realtime/dashboard
npm test
npm run build
```

### Deploy on Vercel

The repository root is the Vercel project root. Vercel builds the curated
synthetic dataset and the React dashboard, serves the dashboard from the CDN,
and runs the FastAPI read model as a Python function. The project is configured
for `suptech-monitor.vercel.app`.

The deployment uses `requirements-vercel.txt` for runtime dependencies;
`requirements.txt` remains the full local training and notebook environment.

Set `SUPTECH_API_TOKEN` as a Production environment variable in the Vercel
project settings before deploying. Use a strong, unique value and enter the
same value in the dashboard unlock screen. Do not put the token in source
control, a browser URL, or a frontend build-time variable.

```powershell
vercel link --project suptech-monitor
vercel env add SUPTECH_API_TOKEN --environment production
vercel deploy --prod
```

The API and dashboard share the same origin. The deployment remains a training
prototype: the dataset is synthetic, the threshold catalog is illustrative,
and the in-memory live event broker is not a distributed production event
service.

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
