# Phase 5 — Live triggers and action analytics

## Goal

Refresh dashboards reliably when a new analytics run is available.

## Tasks

- Define which published analytics changes trigger refreshes or notifications.
- Keep the run manifest as the source of truth and document reconnect behavior.
- Account for serverless instances being independent: an in-memory event broker
  is not a shared production event bus.
- Use a durable event or queue service when cross-instance delivery is
  required; otherwise use bounded client refreshes against the run/read-model
  API.
- Display event time, run identifier and the reason a panel refreshed.
- Demonstrate the synthetic flow: new report -> validation -> analytics ->
  threshold evaluation -> exception -> notification -> dashboard refresh.
- Include event timestamps and a session activity timeline for demo events.
- Keep review actions session-only; do not add public persistent write
  endpoints.

## Acceptance criteria

- Reconnect and missed-run recovery work without relying on one warm function
  instance.
- Live status explains when the stream is unavailable and when data last
  refreshed.
- Every event shown is explicitly synthetic or simulated and includes its
  timestamp and source run.

## Status

Pending.
