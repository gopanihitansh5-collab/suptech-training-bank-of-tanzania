---
description: "A grounded, full-stack synthetic SupTech supervisory workspace."
type: Project
about: "suptech-monitor-day-06"
---

# SupTech Monitor — Day 6

## What This Is

A standalone training application for exploring synthetic financial institution
reports, supervisory indicators, review signals, uploaded training documents,
and bounded evidence-based assistant workflows in one Next.js application.

## Core Value

Supervisory trainees can inspect traceable synthetic data and understand why
an indicator or report merits review without confusing a demo signal with an
official regulatory finding.

## Current State

| Attribute | Value |
|-----------|-------|
| Type | Application |
| Version | 0.1.0 |
| Status | Training PoC in progress |
| Last Updated | 2026-11-17 |

## Requirements

### Core Features

- Nine Stitch-inspired supervisory modules with a consistent accessible shell.
- Fictional, deterministic synthetic data persisted in a dedicated PostgreSQL
  database.
- Tested analytics and illustrative thresholds with source report IDs.
- Explicit local demo sign-in and protected write paths.
- Supported document ingestion, keyword/optional local semantic retrieval and
  grounded citations.
- Reports, health status and deterministic allowlisted assistant workflows.

### Validated

- [x] Architecture and baseline recorded.
- [x] Initial deterministic synthetic data module implemented in-session.
- [x] Isolated schema migration and idempotent seed created.
- [x] Seven focused metric and database-guard unit tests pass.
- [x] Day 6 database seeded with 12 fictional institutions, 288 reports and
  2,880 indicators.

### Active

- [x] Complete database-backed services and auth boundary for current
  overview, analytics, exception and report-exploration features.
- [x] Build all nine reachable module pages with implemented filters/links and
  honest later-phase capability disclosures.
- [x] Verify migrations, seeded data, current APIs, production build and
  authenticated route journeys.
- [ ] Implement document ingestion, grounded assistant, export/SSE and
  administrative writes through their planned phases.

### Planned

- Optional local Qwen/Nomic integration, persisted agent trace, SSE replay and
  expanded retrieval evaluation.

### Out of Scope

- Real Bank of Tanzania data, official thresholds or live regulator
  integration.
- Public deployment, production identity, compliance certification or
  confidential uploads.
- Public model-provider access or model-generated SQL.

## Target Users

**Primary:** SupTech training participants and supervisors using fictional
data to learn reporting, analytics and evidence review.

## Context

The existing Day 1–3 Python pipeline and Day 3 Next.js dashboard remain
unchanged. Day 6 is self-contained and does not proxy to FastAPI. The supplied
Stitch designs are visual references, not verified evidence.

## Constraints

- Use the isolated local PostgreSQL service on `127.0.0.1:5433`.
- Keep the unrelated existing PostgreSQL cluster on port 5432 untouched.
- Keep local model calls on the configured loopback LM Studio endpoint.
- Preserve nulls for unavailable metrics, use parameterized SQL, and make
  synthetic-only boundaries visible.

## Key Decisions

| Decision | Rationale | Date | Status |
|----------|-----------|------|--------|
| Full-stack Next.js App Router | Explicit user request; separates Day 6 from FastAPI proxy. | 2026-11-17 | Active |
| Isolated PostgreSQL on loopback 5433 | Existing port 5432 contains unrelated application data. | 2026-11-17 | Active |
| PAUL installed locally under `.claude` | Makes workflow available to Claude Code users; this Copilot session applies its loop manually. | 2026-11-17 | Active |

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Synthetic seed | 12 institutions, 288 monthly reports | Seeded | Achieved |
| Focused domain tests | All pass | 13/13 | Achieved |
| Nine screens | Reachable shared shell, persisted data where available | 9/9 route smoke passed | Achieved |
| Build and acceptance checks | Pass with evidence | Tests, typecheck, build and route smoke passed | Achieved |

## Tech Stack / Tools

| Layer | Technology | Notes |
|-------|------------|-------|
| Application | Next.js 16, React, TypeScript | App Router UI and API route handlers |
| Persistence | PostgreSQL 16, `pg` | Dedicated loopback Compose service |
| Tests | Vitest | Pure domain tests plus route/database verification |
| Optional models | LM Studio, Qwen and Nomic embeddings | Loopback only; not required |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-11-17*
