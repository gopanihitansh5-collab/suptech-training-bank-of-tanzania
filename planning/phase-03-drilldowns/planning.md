# Phase 3 — Supervisory drill-downs and action analytics

## Goal

Make supervisory indicators, exceptions and comparisons easier to investigate.

## Tasks

- Expand period, institution, severity and indicator drill-downs using the
  existing read model.
- Complete the institution directory with search, sorting, pagination,
  reporting status, latest period and key indicator summaries.
- Add institution comparisons and period trends where the available data
  supports them.
- Show exception count, severity distribution, institution, indicator,
  observed value, illustrative threshold and reporting period.
- Explain the formulas for deposit growth, loan growth, completeness and
  loan-to-deposit ratio, including null and missing-data behavior.
- Trace exception and indicator details to source rows and validation
  findings where the API exposes that evidence.
- Show active parameters and the source of each displayed result.
- Keep descriptive analytics separate from illustrative threshold policy.
- State that an exception is a review signal, not a confirmed violation.

## Acceptance criteria

- Each detail view can be traced to API data and active filters.
- Institution lookup, directory search, sorting and pagination have explicit
  result limits and empty states.
- Missing periods and empty results are represented explicitly.
- Threshold, formula and source-record explanations match the API response.
- Thresholds remain labelled illustrative, not official regulatory limits.

## Status

Pending.
