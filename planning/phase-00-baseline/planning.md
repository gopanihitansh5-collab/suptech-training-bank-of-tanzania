# Phase 0 — Baseline and service boundaries

## Goal

Preserve the deployed API contract while changing the frontend and deployment
layout.

## Tasks

- Record the existing API routes, read-only behavior, response types and tests as
  the migration contract.
- Route `/api/*` to FastAPI and the remaining application paths to Next.js
  using one Vercel project.
- Keep the dashboard and API publicly accessible for synthetic prototype data.

## Acceptance criteria

- API GET requests work without login or token.
- API responses contain only synthetic training data.

## Status

Baseline production behavior has been smoke-tested. Vercel Services routing
is pending the Next.js migration.
