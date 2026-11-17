# Phase 11 — Administration and settings

## Goal

Demonstrate threshold and notification configuration concepts without
misrepresenting the public prototype as a secured administration system.

## Tasks

- Create an administration/settings information architecture for indicator
  thresholds, notification preferences, demo roles and application settings.
- Label example roles and permission matrices as illustrative only.
- Allow safe local/session-only preference changes where a visible control is
  useful; do not persist shared settings or change public backend state.
- Show threshold definitions and their sources; require a clear confirmation
  before any future persistent change.
- Identify production prerequisites: real identity provider, authorization,
  protected write APIs, validation, audit records and operational ownership.

## Acceptance criteria

- No UI claims that a demonstration role enforces real authorization.
- Public demo actions do not alter shared data or threshold configuration.
- Any simulated setting is labelled transient and resets predictably.
- Production settings writes are not enabled before authentication and audit
  controls are approved.

## Dependencies

- Depends on Phase 3 threshold definitions and Phase 10 system-health
  information.
- Persistent administration remains blocked on a production identity and
  authorization design.

## Status

Planned.
