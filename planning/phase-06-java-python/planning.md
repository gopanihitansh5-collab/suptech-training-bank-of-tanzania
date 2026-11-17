# Phase 6 — Java/Python integration examples

## Goal

Demonstrate interoperable, read-only HTTP communication between Java and the
public synthetic-data Python API.

## Tasks

- Publish an OpenAPI contract for the existing Python API.
- Add a small Java HTTP client for the summary and exception routes.
- Handle HTTP failures and typed response data.
- Demonstrate Python consuming a documented Java-facing HTTP contract with a
  local mock service until a real Java service is identified.
- Use synthetic data and keep the demo integration read-only.

## Acceptance criteria

- The Java example reads summary and exception data from the Python API.
- Python integration tests validate the agreed Java-service contract.

## Status

Pending. A real Java service has not been identified; the initial integration
will use a documented local mock contract.
