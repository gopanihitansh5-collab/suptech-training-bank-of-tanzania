# Day 2 — Supervisory analytics and the API

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Client context:** Bank of Tanzania (prototype only)

Day 1 turned a file of submissions into a curated dataset. Day 2 turns that
curated dataset into supervisory indicators, then into exceptions, and then
into the read model the dashboard will consume.

> All institution names, identifiers, reporting values and records in this
> repository are synthetic. The indicators and the thresholds are illustrative
> prototype values, not a regulatory reporting standard.

---

## What this day delivers

| Capability | Where |
| --- | --- |
| Twelve declared supervisory indicators over the curated layer. | `src/catalogs.py`, `src/indicators.py` |
| Ten declared thresholds with severities and bands. | `src/catalogs.py`, `src/exceptions.py` |
| Exception records that carry their evidence. | `src/exceptions.py` |
| The link between an exception and the data quality findings behind it. | `src/exceptions.py`, `src/ddl.py` |
| The Day 2 relational structures and the PostgreSQL load. | `src/ddl.py`, `src/loader.py` |
| A read model and a public, read-only REST API for synthetic data. | `src/repository.py`, `src/api.py` |
| A readable reference notebook. | `notebooks/day2_analytics.ipynb` |
| The tests that hold all of it to the contract. | `tests/test_day2_*.py` |

---

## Repository map

```text
day-02-supervisory-analytics/
├── datasets/
│   ├── reference/
│   │   ├── indicator_catalog.csv                     the 12 indicators, generated
│   │   └── threshold_catalog.csv                     the 10 thresholds, generated
│   ├── processed/                                    generated, not committed
│   │   ├── indicator_values.csv                      one row per indicator value
│   │   ├── exceptions.csv                            one row per exception
│   │   └── exception_audit_links.csv                 the link to the audit trail
│   └── ...
├── notebooks/
│   └── day2_analytics.ipynb                         the Day 2 reference notebook
├── reports/                                          generated, not committed
│   ├── sector_summary.csv                            one row per reporting period
│   ├── exception_summary.csv                         counts by severity
│   └── analytics_manifest.json                       run id, hashes, counts
└── src/
    ├── analytics.py                                  the analytics run
    ├── api.py                                        the REST API
    ├── catalogs.py                                   the indicator and threshold catalogs
    ├── curated.py                                    the Day 1 curated layer
    ├── ddl.py                                        the Day 2 structures
    ├── day1_bridge.py                                access to the Day 1 modules
    ├── day2_paths.py                                 the file locations
    ├── exceptions.py                                 threshold evaluation
    ├── indicators.py                                 the indicator computation
    ├── loader.py                                     the PostgreSQL load
    ├── repository.py                                 the read model
    └── serve.py                                      the ASGI entry point
```

---

## Quick start

```bash
# 1. Install the dependencies.
pip install -r requirements.txt

# 2. Produce the Day 1 artefacts.
python day-01-data-engineering/src/validation.py

# 3. Compute the indicators and the exceptions.
python day-02-supervisory-analytics/src/analytics.py

# 4. Export the catalogs.
python day-02-supervisory-analytics/src/catalogs.py

# 5. Check the whole environment in one command.
python -m pytest
```

### The API

```bash
uvicorn serve:app_factory --factory --app-dir day-02-supervisory-analytics/src
```

Windows PowerShell:

```powershell
uvicorn serve:app_factory --factory --app-dir day-02-supervisory-analytics/src
```

Then:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/v1/exceptions
```

The API serves the tables in PostgreSQL when `DATABASE_URL` points at an
approved development database. Without it, the same read model is served
from memory, so the API can be demonstrated on a machine with no database.

---

## The two catalogs

Both are data, not code, and both are exported so they can be reviewed and
diffed.

`day-02-supervisory-analytics/datasets/reference/indicator_catalog.csv`
holds the twelve indicators: an identifier, a name, the grain, the unit, the
number of decimals, the direction, the description and the formula.

`day-02-supervisory-analytics/datasets/reference/threshold_catalog.csv`
holds the ten thresholds: an identifier, a name, the indicator it applies
to, the severity, the band, the link mode and the Day 1 rules whose
findings explain a breach.

Adding a supervisory limit is a change to a table. The pipeline does not
change.

---

## The verified result

Seven curated records, 48 indicator values, six exceptions:

| Exception | Subject | Severity |
| --- | --- | --- |
| `EXC-THR-003-TZ014-2026-11` | TZ014 reported zero deposits | CRITICAL |
| `EXC-THR-002-TZ013-2026-11` | TZ013 lends nine times its deposits | CRITICAL |
| `EXC-THR-004-TZ002-2026-11` | TZ002 holds 35.5% of sector deposits | HIGH |
| `EXC-THR-009-SECTOR-2026-11` | A watchlist institution filed a curated record | HIGH |
| `EXC-THR-008-SECTOR-2026-11` | The sector deposit market is concentrated | MEDIUM |
| `EXC-THR-010-SECTOR-2026-11` | Only 38.9% of expected institutions reported | MEDIUM |

The full narrative is in `docs/architecture/day2-analytics-and-api.md`.

---

## The notebook

`notebooks/day2_analytics.ipynb` is the readable reference implementation of
the Day 2 analytics. Run it in Colab or in a local Jupyter environment.

The reusable implementation lives in `src/`. The two are written separately
on purpose, and `tests/test_day2_notebook_parity.py` executes the notebook
cells and checks that both sides agree on every indicator value and every
exception.

The notebook needs the Day 1 artefacts. If they are not there, it runs the
Day 1 pipeline itself and reads what the pipeline published.

---

## Prototype access note

- The API has no login or token and exposes public read-only endpoints.
- This is appropriate only because all shipped records are synthetic. Never
  use this prototype with real supervisory information.
