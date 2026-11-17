# Phase 8 — Custom report builder

## Goal

Let a demo user construct, preview and export reproducible analytical reports
from the approved synthetic read model.

## Tasks

- Provide report templates for institution summaries, monthly overviews,
  exception registers, data-quality summaries and indicator trends.
- Allow selection of institutions, indicators, reporting periods and visible
  columns.
- Support validated filters, grouping and stable sorting.
- Show a report preview with its filters, dataset, period and generation time.
- Export CSV; add PDF only if a supported, testable generation path is selected.
- Reuse the same query registry and validations as the assistant's report
  workflow.
- Apply server-side limits or streaming for large reports; never fetch
  unbounded records into the browser.
- Do not implement report distribution or persistent export history in the
  public demo.

## Acceptance criteria

- Each template produces a preview from API data, not hardcoded figures.
- Filters and selected columns are reflected in both preview and exported
  output.
- CSV output is deterministic for the same data and options.
- Invalid or oversized requests return a visible error and do not silently
  produce partial reports.
- Report period, data source, calculation definitions and limitations are
  visible before export.

## Dependencies

- Depends on Phase 2 request limits and Phase 3 data filters.
- Assistant-triggered report generation depends on Phase 4's allowlisted
  operations and explicit confirmation.

## Status

Planned.
