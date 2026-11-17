# Phase 10 — Integrations and system health

## Goal

Give the demonstration a truthful operational view and document how Java and
Python services could interoperate without implying a real external
connection.

## Tasks

- Show backend health, API availability, latest processing run and
  event-stream connection state.
- Show PostgreSQL status only when the running service can verify it; otherwise
  state that the prototype is using its in-memory read model or that status is
  unavailable.
- Display ingestion and processing timestamps only when present in source
  manifests.
- Capture bounded, non-sensitive application error summaries; never expose
  secrets or raw user data in diagnostics.
- Document API response-time and event-stream health measurements with
  explicit provider/deployment prerequisites.
- Add a Java HTTP client example for documented FastAPI read endpoints and a
  Python-facing mock contract where a real Java service is unavailable.
- Label all integrations as examples or simulations until an external service
  is actually configured and verified.

## Acceptance criteria

- Every status item is backed by a health endpoint, manifest or runtime
  measurement, or is visibly marked unavailable.
- No placeholder claims a real PostgreSQL, Java, external Bank or production
  integration exists.
- Java example tests cover typed success responses and HTTP failures.
- Diagnostic output contains no credentials or sensitive record payloads.

## Dependencies

- Depends on Phase 5 live-event semantics and Phase 6 integration contracts.
- Durable logs, telemetry and production metrics require approved platform
  configuration.

## Status

Planned.
