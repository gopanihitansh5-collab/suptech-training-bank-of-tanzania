# NavsaTech — Development plan

The full product definition, page-by-page outcomes, architecture, end-to-end
demo journey, guardrails and delivery dependencies are in
[product-roadmap.md](./product-roadmap.md).

## Agreed direction

- Replace the Vite single-page app with a Next.js App Router application.
  Next.js uses React; this changes the framework and application structure,
  not the underlying UI library.
- Keep FastAPI and Next.js together in the `suptech-monitor` Vercel project,
  using Vercel Services and the shared
  `https://suptech-monitor.vercel.app` production domain.
- Start the analyst assistant with a mock planner, no external model provider
  or model credential required.
- Let the assistant explain its query plan and execute it only after user
  confirmation. Execute only validated, allowlisted, read-only API operations
  over summary, institution indicators and exceptions. No arbitrary SQL or
  write operations.
- Continue to use synthetic training data only. This is not an official Bank
  of Tanzania system or a production supervisory platform.
- Keep the public prototype free of logins and API-token prompts. Its API is
  read-only and public only because all shipped data is synthetic.
- Plan the complete nine-page platform, but implement in verified increments;
  mark anything not yet working as planned rather than displaying decorative
  controls.

## Phase documents

| Phase | Folder | Outcome |
| --- | --- | --- |
| 0 — Baseline and service boundaries | [phase-00-baseline/](./phase-00-baseline/planning.md) | Preserve the working API contract and establish service routing. |
| 1 — Next.js migration | [phase-01-nextjs/](./phase-01-nextjs/planning.md) | Replace the Vite app with Next.js while preserving behavior. |
| 2 — Large-data responsiveness | [phase-02-performance/](./phase-02-performance/planning.md) | Bound data requests and make large lists efficient. |
| 3 — Supervisory drill-downs | [phase-03-drilldowns/](./phase-03-drilldowns/planning.md) | Expand comparisons, trends and parameterized analysis. |
| 4 — Query planner and executor | [phase-04-query-agent/](./phase-04-query-agent/planning.md) | Preview and explicitly execute safe, read-only API queries. |
| 5 — Live triggers | [phase-05-live/](./phase-05-live/planning.md) | Make refresh and recovery correct across serverless instances. |
| 6 — Java/Python integration | [phase-06-java-python/](./phase-06-java-python/planning.md) | Document and test interoperable HTTP clients. |
| 7 — Verification and release | [phase-07-release/](./phase-07-release/planning.md) | Verify the full flow, update docs and push the release. |
| 8 — Custom report builder | [phase-08-custom-reports/](./phase-08-custom-reports/planning.md) | Configure, preview and export bounded analytical reports. |
| 9 — Data explorer | [phase-09-data-explorer/](./phase-09-data-explorer/planning.md) | Inspect synthetic datasets, validation and ingestion evidence. |
| 10 — System health and integrations | [phase-10-system-health/](./phase-10-system-health/planning.md) | Report verified service state and document Java/Python integration. |
| 11 — Administration and settings | [phase-11-admin-settings/](./phase-11-admin-settings/planning.md) | Demonstrate settings without false access-control claims. |
| 12 — Exception workflow and audit | [phase-12-exception-workflow/](./phase-12-exception-workflow/planning.md) | Plan review actions and audit boundaries; public demo stays read-only. |

Each phase folder contains its own `planning.md` with scope, tasks and
acceptance criteria. Status should be updated there as work is completed.

## Training days 4 and 5

The course-level delivery plan is also tracked separately from the technical
implementation phases:

| Day | Folder | Outcome |
| --- | --- | --- |
| 4 — Dashboard analytics | [day-04-dashboard-analytics/](./day-04-dashboard-analytics/planning.md) | Complete threshold highlighting, institution comparison and supported period trends. |
| 5 — Acceptance and demonstration | [day-05-acceptance-demo/](./day-05-acceptance-demo/planning.md) | Run and record acceptance checks, document limitations and prepare the end-to-end demonstration. |

## Current deployment

- Production URL: `https://suptech-monitor.vercel.app`
- Vercel project: `suptech-monitor`
- Latest pushed commit: `cadb5c7` (dashboard and Vercel deployment setup).
- The current deployment is the Vite + FastAPI application. The Next.js
  migration is in progress and has not yet been deployed.
- The previous API-token gate is being removed for this synthetic, public
  prototype. Production identity and protected write workflows remain future
  work.

## Platform note

Vercel Services is currently a beta feature. The single-project design keeps
the frontend and API on one domain and deploys them atomically, but it should
be verified against the account plan and project configuration during Phase 7.
