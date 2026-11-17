# Phase 2 — Responsive performance for larger datasets

## Goal

Keep the dashboard usable as the number of records and indicators grows.

## Tasks

- Add bounded pagination and request limits to list endpoints where needed.
- Apply filtering and sorting before data reaches the browser.
- Add database indexes for common institution, period, severity and indicator
  filters when those routes use PostgreSQL.
- Avoid rendering unbounded tables; use pagination or virtualization only where
  the dataset size justifies it.
- Debounce global and table search, lazy-load secondary panels and define
  sensible API timeouts.
- Add explicit loading, empty, retry and partial-data states.
- Test large synthetic fixtures and narrow-screen layouts.

## Acceptance criteria

- Large result sets do not require rendering every row at once.
- Pagination and filters produce stable results with explicit limits.
- Search and common filters remain responsive under a documented synthetic
  large-data test.
- Keyboard navigation and responsive layouts remain usable.

## Status

Pending.
