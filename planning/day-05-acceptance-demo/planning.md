# Day 5 — Acceptance, documentation and demonstration

## Goal

Verify the complete training prototype against its measurable acceptance
criteria and prepare a reproducible end-to-end demonstration.

## Scope

- Run the Python, dashboard, contract and integration test suites.
- Run the dashboard typecheck and production build.
- Verify the full local data-processing-to-dashboard workflow.
- Verify public read-only API access, filters, drill-downs, query-plan confirmation and live
  refresh/reconnect behavior.
- Verify the combined Vercel deployment only after local checks pass.
- Record environment-dependent checks and known limitations accurately.
- Prepare a short demonstration sequence using synthetic data only.

## Tasks

1. Create a test matrix mapping each acceptance criterion to its command,
   automated test or manual verification.
2. Run focused tests during implementation, followed by the full relevant
   suites at acceptance.
3. Verify startup instructions from a clean checkout and document prerequisites.
4. Check the deployed Next.js pages and public read-only API endpoints.
5. Document results, skipped checks, deployment status and limitations in the
   project acceptance record.
6. Prepare a demonstration covering ingestion, validation evidence, analytics,
   exceptions and the dashboard's investigation workflow.

## Acceptance criteria

- Core data processing, API, integration and dashboard tests pass; skips and
  environment-dependent checks are called out.
- The production build and typecheck pass.
- The deployed site and API are verified if deployment credentials and service
  configuration are available; otherwise the blocker is recorded without
  claiming deployment verification.
- The acceptance record maps criteria to evidence and names remaining gaps.
- The demonstration uses synthetic data and explains architecture, limitations
  and next steps.

## Dependencies and constraints

- Depends on Day 4 analytics acceptance and completion of the planned
  integration examples where applicable.
- Do not use real Bank of Tanzania data or credentials in tests or demos.
- A successful local test does not imply live PostgreSQL or Vercel behavior has
  been verified.

## Status

Planned.
