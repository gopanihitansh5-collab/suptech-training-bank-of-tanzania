# SupTech Monitor — product roadmap

## Product vision

Build a coherent supervisory intelligence workspace for a technical
demonstration. Supervisors should be able to inspect synthetic reporting
data, understand indicators and exceptions, trace findings to their evidence,
ask controlled analytical questions, and preview useful reports.

The application is a training PoC, not a Bank of Tanzania system. Every
institution, record, calculation, event and threshold is synthetic or
illustrative. The deployed prototype is public and read-only; it must never
receive real supervisory data.

## Prototype guardrails

- No login, API token prompt or credential entry for a demo user.
- Public API routes are GET-only and expose synthetic data only.
- Do not add public write endpoints. Annotations, assignment and status
  changes remain clearly labelled session-only simulations until an
  authenticated, persistent workflow is approved.
- AI questions use a validated, allowlisted query registry. No arbitrary SQL,
  generated SQL execution or data mutation.
- An LLM provider is optional and server-configured; the prototype must work
  in mock mode without a provider key or user-supplied credential.
- Never present illustrative thresholds as official regulatory policy.
- Mark missing, stale, unavailable and insufficient-history data explicitly;
  never invent values or make an outage look like a successful empty result.
- Production authentication, role enforcement, audit controls, secure data
  handling and operational readiness are future requirements, not claims of
  this public synthetic-data demo.

## Application map

| Page | Product outcome | Planned work |
| --- | --- | --- |
| 1. Executive overview | Communicate portfolio status, report completeness, monitored indicators, open exceptions, data-quality issues, trends, institution comparisons, recent activity and ingestion time. | Phase 1 shell; Phases 2–3 data and responsive views; Phase 5 event refresh. |
| 2. Institution directory | Search, filter, sort and page through institutions; open a detail view with profile, latest period, indicators, reporting history, exceptions, quality and activity. | Phases 2–3. |
| 3. Supervisory analytics | Choose a KPI/KRI, institution and period; compare institutions, inspect trends, formulas, missing-data behavior and source records. | Phases 2–3. |
| 4. Exceptions and alerts | Filter and inspect exceptions, severity, observed value, threshold, period and evidence; distinguish a review signal from a confirmed violation. | Phases 3, 5 and 12. |
| 5. Custom reports | Select institutions, indicators, periods, columns, filters, grouping and sort order; preview and export CSV, with PDF only if supported. | Phase 8; Phase 4 can prepare a report request. |
| 6. Data explorer | Inspect dataset metadata, row counts, columns, missing/duplicate/invalid records, validation results, ingestion runs and safe sample records. | Phase 9. |
| 7. AI supervisory assistant | Ask natural-language questions; see a query plan, filters, sources, calculations and results; get follow-ups and supported report actions. | Phase 4. |
| 8. Integrations and system health | Show API, database, ingestion, processing, event-stream and application status; describe the Java–Python contract without claiming a real external connection. | Phases 6 and 10. |
| 9. Administration and settings | Demonstrate threshold and notification settings and role concepts without presenting public demo controls as real access control. | Phase 11; production identity is out of scope. |

## Page-by-page functional breakdown

### 1. Executive overview

- KPI cards: monitored institutions, reports received, reports pending,
  indicators monitored, exceptions requiring review and data-quality issues.
- Portfolio views: institution reporting status, deposit and loan trends,
  institution comparison and risk/exception distribution.
- Recent synthetic supervisory activity, latest verified ingestion time and
  active simulated notification summary.
- KPI cards and chart selections navigate to the corresponding filtered
  detail view.
- All cards show loading, unavailable, empty and stale states; no sample
  number is presented as a live result.

### 2. Institution directory

- List institution ID/name/category, reporting status, latest period, key
  indicators and open exception count.
- Search by institution name/identifier; filter, stable-sort and paginate on
  the server for large datasets.
- Detail view: institution profile, historical indicators, reporting history,
  exceptions, data-quality summary and activity timeline.
- Provide explicit missing-history states where the current synthetic data
  only has one period.

### 3. Supervisory analytics

- Select KPI/KRI, institution, reporting period and date range.
- Compare institutions and view trends only when source periods exist.
- Trace aggregates and drill-downs to the API records/source references used.
- Document formulas and null/missing-data behavior for deposit growth, loan
  growth, reporting completeness and loan-to-deposit ratio.
- Display threshold deviations as illustrative configuration, never official
  regulatory limits.

### 4. Exceptions and alerts

- Show exception totals, severity distribution, new/under-review/resolved
  categories, institution, indicator, observed value, configured threshold,
  period and detection time where supplied.
- Filter and open evidence-rich details; show comparison rule, source record
  and data-quality findings.
- Clearly state that an exception requires human review and is not a confirmed
  violation.
- Annotation, assignment and status transitions are desired workflow
  behavior, but the public demo may only simulate them in the current session.
  Persistent mutations require a separate authenticated product design.

### 5. Custom report builder

- Choose institutions, KPIs/KRIs, periods and output columns.
- Apply validated filters, grouping and sorting; preview the exact result.
- Provide Institution Summary, Monthly Supervisory Overview, Exception
  Register, Data Quality Report and Indicator Trend Report templates.
- Export CSV; support PDF only when a reliable, testable implementation is
  selected.
- Use server-side processing, limits and pagination for large reports.
- Require confirmation before export or future distribution; distribution is
  not part of the public prototype.

### 6. Data explorer

- List datasets with grain, row count, schema and processing state.
- Show missing-value, duplicate, invalid-record and validation summaries.
- Separate raw, validated, rejected, curated and analytical layers.
- Allow bounded sample inspection with validation messages and source-row
  references.
- Show ingestion history only when backed by actual manifests or durable job
  records; do not fabricate history.

### 7. AI supervisory assistant

- Current-session conversation history, natural-language input, suggested
  questions and selected institution/reporting-period context.
- Stream responses only where the provider and runtime are verified to
  support it.
- Render structured tables/charts, explain calculations and cite the
  reporting period, dataset and source records.
- Example: rank institutions by exception count using approved exception
  records, group/sort deterministically, and state which period was queried.
- Example: explain a flagged institution by retrieving its exception,
  observed value, configured threshold, period and evidence; explicitly ask
  for human review.
- Example: ask for missing report parameters, generate a monthly report
  preview and offer supported export.
- Suggested follow-ups and contextual links must derive from the returned
  evidence, not invented facts.

### 8. Integrations and system health

- Report backend/API status, database connectivity when actually checked,
  ingestion/processing state, last successful run, response-time samples,
  recent safe error summaries and event-stream state.
- Display Java–Python architecture, OpenAPI contract and tested example
  clients; label a local mock as a mock.
- Do not imply external Bank connectivity or real Java service integration.
- Hide sensitive payloads and credentials from operational diagnostics.

### 9. Administration and settings

- Plan threshold configuration, notification preferences, demo roles,
  application settings, activity review and user-management concepts.
- Show least-privilege concepts as educational examples only.
- Do not claim real role enforcement or expose public persistent settings
  writes; persistent administration waits for identity, authorization and
  audit controls.

### Shared application shell

The planned shell has a collapsible sidebar, top navigation, breadcrumbs,
global search, reporting-period context, notification centre, connection
status and a profile/settings area where appropriate. Shared patterns include
accessible tables, filters, KPI cards, chart panels, status badges, detail
drawers, confirmation prompts, loading skeletons, empty states and explicit
errors. Layouts must work on desktop, tablet and mobile, with desktop
prioritized.

Every visible control must work, be explicitly marked as a demo, or be omitted.
Do not ship decorative nonfunctional controls.

## Data and technical architecture

```text
synthetic CSV / reference data
  -> Python ingestion and validation
  -> curated records and audit evidence
  -> analytics and threshold evaluation
  -> read-only FastAPI endpoints
  -> Next.js App Router dashboard and controlled assistant
  -> SSE demo events and report previews
```

- **Frontend:** Next.js App Router, React, TypeScript, reusable components
  and Recharts. The migration is implemented; Vercel release verification is
  pending.
- **Backend:** Python, FastAPI, Pydantic and SQLAlchemy.
- **Storage:** PostgreSQL schema and loader are defined; local/demo operation
  can use the current in-memory read model. Do not claim a live database
  connection unless one is verified.
- **Processing:** Pandas/NumPy-compatible Python pipeline over synthetic data.
- **Communication:** REST for read operations and SSE for one-way demo events.
  Add WebSockets only if a real bidirectional use case is approved.
- **Testing:** pytest, API and contract tests, frontend component/interaction
  tests, build/typecheck, and an end-to-end demo checklist.
- **Local setup:** document the API and Next.js development servers, using
  same-origin API paths. Deployment keeps the Next.js and FastAPI services in
  one Vercel project; Vercel Services is a beta feature.

### Data model roadmap

The existing model covers institutions, submitted reports, curated records,
supervisory indicators, exceptions, definitions and threshold configuration.
Planned additions or explicit decisions cover ingestion jobs, report exports,
activity/audit events and assistant query logs. User accounts and persisted
permissions are future production work and must not be simulated as effective
security in the public demo.

Indexes and server-side query limits should support common institution,
period, severity and indicator filters. Large result sets must not be loaded
into the browser at once.

## Controlled assistant behavior

The assistant follows this pipeline:

```text
question
 -> intent and entity extraction
 -> period/institution validation
 -> approved query registry
 -> parameterized read-only API/analytics operation
 -> result validation
 -> structured response with evidence and explanation
```

Each answer identifies its reporting period and dataset, explains relevant
calculations, calls out missing data, cites records or source identifiers,
and avoids unsupported conclusions. Plans are shown before execution. Export
or any state-changing/report-distribution action requires an explicit
confirmation. The mock planner is the baseline; optional model assistance
must use the same validated executor and fail closed to clear errors, never to
invented results.

Planned assistant features include conversation history for the current
session, natural-language input, suggested questions, selected
institution/period context, streaming where supported, structured tables and
charts, calculation explanations, source references and approved report
actions.

## End-to-end demonstration journey

For the full page-by-page navigation flow, user tasks, page value, cross-page
handoffs and current implementation caveats, see the
[end-to-end user journey](./end-to-end-user-journey.md).

1. Open the dashboard without a login or token.
2. Select a synthetic institution and inspect its indicators and reporting
   history.
3. Identify an exception and drill into its observed value, illustrative
   threshold and source evidence.
4. Ask the assistant to explain the exception; inspect and confirm its
   allowlisted query plan.
5. Preview a monthly or exception report and export supported formats.
6. Observe a clearly simulated new event and the dashboard's reconnect state.
7. Review API health, data-quality results, limitations and the Java–Python
   integration example.

## Design and verification requirements

- Visual direction: deep navy/charcoal structure, restrained teal/cyan
  accents, off-white content surfaces, clean typography, consistent spacing,
  subtle borders and minimal shadows.
- Reuse accessible KPI cards, tables, filters, date/period selectors, chart
  panels, status badges, detail drawers, confirmation prompts, notifications,
  skeletons, empty states and error states.
- Test API route shapes, parameter validation, sorting/pagination stability,
  formulas, source references, assistant plans/execution, report exports,
  event reconnects, responsive layouts and keyboard interactions.
- Verify the actual local data-to-dashboard flow and the deployed
  frontend/API paths; report skipped live-database or service checks instead
  of implying they passed.
- Release acceptance includes the mapped test evidence, known limitations,
  demonstration script, deployment verification and an accurate roadmap for
  production-only work.

## Delivery order and dependencies

| Order | Phase | Depends on | Exit evidence |
| --- | --- | --- | --- |
| 0 | [Baseline and service boundaries](./phase-00-baseline/planning.md) | Existing Day 1–3 implementation | Routes, data contract, and public synthetic-only behavior documented. |
| 1 | [Next.js migration](./phase-01-nextjs/planning.md) | Phase 0 | App Router build, working routes, no token prompt. |
| 2 | [Large-data responsiveness](./phase-02-performance/planning.md) | Phase 1 | Bounded lists, search, pagination and responsive states. |
| 3 | [Supervisory drill-downs](./phase-03-drilldowns/planning.md) | Phases 1–2 | Traceable institution, analytics and exception views. |
| 4 | [Controlled assistant](./phase-04-query-agent/planning.md) | Phases 1–3 | Confirmed, tested allowlisted query plans and evidenced responses. |
| 5 | [Live triggers](./phase-05-live/planning.md) | Phases 0–3 | Reconnectable synthetic event flow and explicit transient-state limits. |
| 6 | [Java/Python integration](./phase-06-java-python/planning.md) | Phase 0 API contract | Tested Java client and documented mock integration boundary. |
| 8 | [Custom reports](./phase-08-custom-reports/planning.md) | Phases 2–4 | Previewed reports with tested filters and export. |
| 9 | [Data explorer](./phase-09-data-explorer/planning.md) | Phases 0–2 | Traceable synthetic dataset and validation inspection. |
| 10 | [System health and integrations](./phase-10-system-health/planning.md) | Phases 5–6 | Honest API/data/event status and integration evidence. |
| 11 | [Administration and settings](./phase-11-admin-settings/planning.md) | Phases 3 and 10 | Clearly demo-only settings without false access-control claims. |
| 12 | [Exception workflow and audit](./phase-12-exception-workflow/planning.md) | Phases 3, 5 and 11 | Explicitly simulated or approved, auditable review actions. |
| Final | [Verification and release](./phase-07-release/planning.md) | All selected release scope | Acceptance evidence, known gaps, build and deployment verification. |

Day 4 and Day 5 course checklists are maintained separately in
[Day 4](./day-04-dashboard-analytics/planning.md) and
[Day 5](./day-05-acceptance-demo/planning.md).

## Current state

- Day 1 and Day 2 processing and analytics are implemented with synthetic
  fixtures and tests.
- Day 3 live API and dashboard exist; the Next.js migration is in progress.
- The mock query planner is a scaffold, not a production LLM assistant.
- Report builder, data explorer, institutional comparison/trends,
  administrative workflows and the system-health page remain planned.
- Production authentication, role-based access, durable event infrastructure,
  real external integrations and real supervisory data are not implemented.
