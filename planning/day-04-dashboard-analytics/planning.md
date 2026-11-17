# Day 4 — Dashboard analytics and supervisory investigation

## Goal

Extend the Day 3 dashboard with the threshold, comparison and trend workflows
identified in the PoC acceptance criteria, while keeping all displayed results
traceable to the public synthetic-data API and clearly labelling illustrative
policy.

## Scope

- Add consistent visual emphasis for exception severity and threshold breaches.
- Improve institution-level comparison using the existing indicator and
  exception endpoints.
- Add reporting-period trend views only where the API has multiple periods;
  show an explicit empty/insufficient-history state otherwise.
- Keep the selected institution, period and other filters visible and
  reproducible when opening a drill-down.
- Verify that the dashboard reads only the public, synthetic-data API and does
  not send credentials.
- Preserve the existing read-only API contract; do not invent, mutate or
  silently synthesize financial data.

## Tasks

1. Review the current dashboard and API contracts before choosing chart and
   comparison changes.
2. Implement threshold severity presentation with text labels in addition to
   color.
3. Implement institution comparison and period trends using available API
   records; avoid implying a trend when only one period is present.
4. Add focused component and API-client tests for filter propagation,
   threshold presentation, empty history and unauthenticated read-only requests.
5. Update the Day 4 architecture and usage documentation.

## Acceptance criteria

- Threshold breaches have consistent severity labels and visual emphasis in
  the dashboard.
- Comparison and drill-down results can be traced to API responses and active
  filters.
- A trend is shown only when multiple reporting periods are available; missing
  history is explained rather than represented as zero.
- Tests confirm public read-only requests work without credentials.
- Thresholds remain explicitly identified as illustrative, not official
  regulatory limits.

## Dependencies and constraints

- Depends on the Day 3 Next.js migration preserving the dashboard/API
  contract.
- The shipped synthetic dataset may not contain enough periods to demonstrate
  trends; use a clearly labelled synthetic test fixture only in tests, not as
  fallback production UI data.
- Large-list limits and pagination are tracked in
  [Phase 2](../phase-02-performance/planning.md).

## Status

Planned.
