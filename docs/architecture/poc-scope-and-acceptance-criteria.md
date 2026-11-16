# PoC scope and acceptance criteria

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Client context:** Bank of Tanzania (training prototype only)

> This is a training-level prototype built on synthetic data. It is not production
> software and it does not represent Bank of Tanzania internal data or systems.

---

## 1. The PoC in one paragraph

A **Supervisory Monitoring Dashboard** that ingests institution-level supervisory
reporting records, validates them against a declared rule catalog, derives supervisory
indicators from the records that pass, applies threshold rules to produce exceptions,
exposes those indicators and exceptions through an authenticated API, and presents
them on a responsive React dashboard that updates live when the pipeline produces a
new event.

---

## 2. Scope

### In scope

| Capability | Delivered on |
| --- | --- |
| Ingestion of institution reporting records with a preserved raw layer. | Day 1 |
| A declared rule catalog with `BLOCK` and `WARN` severities. | Day 1 |
| Partitioning into valid, review, rejected and duplicate destinations. | Day 1 |
| An audit trail explaining every finding. | Day 1 |
| A defined analytical data model and target relational structures. | Day 1 |
| Loading the curated layer into PostgreSQL. | Day 2 |
| Supervisory KPIs, KRIs, thresholds and exception rules. | Day 2 |
| A REST API exposing indicators and exception records, with authentication. | Day 2 |
| A live update mechanism, Server-Sent Events or WebSockets. | Day 3 |
| A responsive React dashboard with charts, tables, filters, drill-downs and live status. | Days 3 and 4 |
| Threshold highlighting and institution-level comparison and trend views. | Day 4 |
| Tests against the acceptance criteria below. | Day 5 |
| A demonstration of the full data-to-dashboard workflow. | Day 5 |

### Out of scope

These are excluded deliberately. Saying so is part of the training, because the
difference between a prototype and a production system is almost entirely in the
list of things a prototype does not claim to do.

- Production deployment, integration with live Bank systems, enterprise-scale
  infrastructure and operational go-live.
- Real institution data. The dataset is synthetic throughout.
- A real regulatory reporting standard. The rule catalog is illustrative.
- Automated resolution of resubmissions. The pipeline detects them and routes them
  to a supervisor, because the evidence needed to decide is not in the file.
- Model risk management, model validation and formal model governance.
- A production identity provider. Day 2 uses a simple token scheme that is
  explicitly labelled as training-only.
- Multi-tenancy, data residency and the full regulatory obligations that come with
  holding real supervisory data.

---

## 3. Acceptance criteria

Each criterion is measurable, and each one names how it is checked. A criterion that
cannot be checked is not an acceptance criterion.

### Day 1 — ingestion, validation and the data model

| # | Criterion | How it is verified | State |
| --- | --- | --- | --- |
| D1.1 | Every received record is accounted for in exactly one destination: valid, review, rejected or duplicate. | `tests/test_day1_pipeline.py::test_partition_accounts_for_every_record` and `::test_partitions_do_not_overlap`. | Met |
| D1.2 | A submitted value that cannot be parsed is rejected and its original text is preserved. | `::test_non_numeric_amount_is_rejected_not_zero_filled` and `::test_rejected_records_keep_the_original_submitted_values`. | Met |
| D1.3 | A missing financial amount is never silently replaced with zero. | `::test_missing_value_is_never_replaced_with_zero`. | Met |
| D1.4 | An exact duplicate and a resubmission are distinguished and reported separately. | `::test_exact_duplicate_does_not_also_trigger_the_resubmission_rule` and `::test_resubmission_is_detected_and_the_first_submission_survives`. | Met |
| D1.5 | A `WARN` finding never removes a record from the curated dataset. | `::test_warning_severity_keeps_the_record_out_of_rejection` and `::test_warnings_never_remove_a_record`. | Met |
| D1.6 | Every finding is recorded in an audit trail with the rule, the severity and the value observed. | `::test_every_finding_is_recorded_in_the_audit_trail` and `::test_audit_entries_carry_a_rule_and_an_explanation`. | Met |
| D1.7 | The pipeline is reproducible: the same input file always produces the same output. | `::test_the_pipeline_is_deterministic` and `::test_the_manifest_has_no_wall_clock_dependency`. | Met |
| D1.8 | The run is traceable to the exact bytes of its inputs. | `::test_the_manifest_records_the_input_hash`. | Met |
| D1.9 | The rule catalog is exercised end to end by the shipped dataset. | `::test_every_rule_in_the_catalog_is_exercised`. | Met |
| D1.10 | The submitted file is never modified, and rejected records keep their original values. | `::test_ingestion_preserves_the_submitted_values` and `::test_rejected_records_keep_the_original_submitted_values`. | Met |
| D1.11 | The target relational structures are defined, documented and parse as valid PostgreSQL DDL. | `::test_the_generated_ddl_contains_the_expected_objects` and `::test_the_ddl_is_valid_sql`. | Met |
| D1.12 | The Colab notebook and the reusable implementation agree on every record. | `tests/test_notebook_parity.py`, six tests. | Met |

### Day 2 — analytics and API

| # | Criterion | How it is verified |
| --- | --- | --- |
| D2.1 | Selected indicators and threshold-based exceptions match independently checked expected results. | Indicator unit tests against hand-computed values. |
| D2.2 | Protected endpoints enforce the configured authentication and reject an absent or invalid token. | API tests for both the success and the failure path. |
| D2.3 | The curated layer loads into PostgreSQL with the declared constraints intact. | Load test plus constraint assertions. |
| D2.4 | Every exception record carries the audit entries that explain it. | Join test between the exception table and the audit table. |

### Days 3 and 4 — real-time communication and the dashboard

| # | Criterion | How it is verified |
| --- | --- | --- |
| D3.1 | The dashboard displays data that came from the API, not from a fixture. | Network inspection during a manual run. |
| D3.2 | The dashboard updates when the pipeline generates a new event, and recovers after a disconnection. | Live update test plus a reconnect test. |
| D4.1 | Threshold breaches are highlighted consistently between the API and the dashboard. | Cross-check of the same record on both sides. |
| D4.2 | Access controls are applied to the dashboard's data requests. | Unauthenticated request test. |

### Day 5 — acceptance

| # | Criterion | How it is verified |
| --- | --- | --- |
| D5.1 | Core data processing, API, integration and dashboard workflows pass their tests. | The full suite, run and reported. |
| D5.2 | Results are measured against the criteria above and the result is documented. | The acceptance checklist at the Day 5 review. |
| D5.3 | The PoC is demonstrated and its architecture, its limitations and its next steps are explained. | The demonstration, reviewed against the architecture document. |

---

## 4. The data the acceptance is measured against

| Dataset | Grain | Use |
| --- | --- | --- |
| `institution_reports_synthetic.csv` | One row per institution per reporting period. | The primary dataset. 25 records, deliberately covering every rule in the catalog. |
| `institutions_registry.csv` | One row per institution. | Reference data for `R002`, `R003`, `W003`, `W004`. |
| `reporting_calendar.csv` | One row per reporting period. | Reference data for `R005`, `R006`, `R007`, `R015`. |
| World Bank country indicators | One row per country per year per indicator. | A separate context source. Not joined to the institution-level data. |

The dataset is small on purpose. Its job is to make every rule reachable, so that a
rejection can be traced back to a line in the file and a rule in the
catalog.

---

## 5. Risks to the PoC, and how they are handled

| Risk | Handling |
| --- | --- |
| A warning is treated as a rejection and usable data is discarded. | The severity split is enforced by the pipeline, not by convention, and by two tests. |
| A rejection cannot be explained later. | Every finding is in the audit trail with the observed value, and the run manifest pins the input bytes. |
| Country-level context gets joined to institution-level records. | The two grains are documented as separate, the context notebook is separate, and the architecture says not to join them. |
| The prototype is mistaken for a production system. | Every document states the scope note, and the out-of-scope list is explicit. |
| A rule threshold is treated as an official limit. | Thresholds are declared in one place, are labelled as prototype values, and are configurable. |
| The PoC depends on one machine. | The pipeline is a plain script with no services to start, and `python -m pytest` verifies the environment in one command. |
