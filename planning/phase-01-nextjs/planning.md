# Phase 1 — Next.js migration

## Goal

Replace the Vite-hosted React SPA with a Next.js App Router frontend while
preserving the current dashboard behavior and API contract.

## Tasks

- Move the frontend entry point to `app/layout.tsx` and `app/page.tsx`.
- Keep reusable UI and data clients in `src/`.
- Open the dashboard directly without a login or API token prompt.
- Keep API requests on the same origin; proxy locally to FastAPI during
  development and route through Vercel Services in deployments.
- Migrate dashboard components, styling, filters and drill-downs.
- Update TypeScript, Vitest and package scripts for Next.js.
- Configure FastAPI and Next.js as services in the existing Vercel project.

## Acceptance criteria

- `npm test`, `npm run typecheck` and `npm run build` pass.
- The production domain serves the dashboard and API from one origin.
- The dashboard and analyst workspace load without a token prompt.
- The frontend sends no credential headers and no secret is bundled into
  client JavaScript.

## Status

In progress.
