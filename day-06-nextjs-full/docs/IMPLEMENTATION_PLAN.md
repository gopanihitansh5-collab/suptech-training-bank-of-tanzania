# Day 6 implementation plan

## Phase gates

| Phase | Scope | Exit evidence |
| --- | --- | --- |
| 0 — Discovery | Requirements, existing app/runtime, DB safety, Stitch and baseline. | Architecture and baseline recorded. |
| 1 — Foundation | Standalone Next.js shell, design tokens, local auth boundary, health endpoint, Postgres migration/seed. | App starts locally; isolated DB migrates/seeds; health and tests pass. |
| 2 — Supervisory domain | Institutions, monthly reports, formulas, configured thresholds, exceptions, pagination and audit. | Unit/DB tests verify calculations, nulls, thresholds and persisted reads. |
| 3 — UI integration | All nine Stitch modules in one responsive shell. | API-backed tables/filters, keyboardable controls, no dead active controls. |
| 4 — Ingestion | Safe TXT/CSV upload, checksums, jobs, parsing, provenance and retry. | Upload limits, parser errors, duplicate handling and persisted chunks tested. |
| 5 — Search/RAG | Keyword and optional local semantic retrieval, citations, grounded responses. | Curated source/citation checks and provider-offline fallback pass. |
| 6 — Assistant | Intent routing to allowlisted analytics/search/report tools; bounded trace and verifier. | Numeric output derives from domain services; unsupported requests fail closed. |
| 7 — Reporting/events | Filtered report preview/CSV, persisted event feed and SSE reconnect. | Export filters match preview; event IDs/replay tested. |
| 8 — Hardening | Auth boundaries, upload security, accessibility, responsive and regression checks. | Build/test evidence and limitations documented; no production-readiness claim. |

## Work ownership and dependencies

| Owner | Files / responsibility | Depends on |
| --- | --- | --- |
| Main orchestrator | Architecture, SQL migration/seed integration, domain services, API, UI, tests, docs and final review. | Phase 0. |
| Local Qwen agent | One isolated file: deterministic fictional institution/report seed records in `src/lib/demo-data.ts`. | Data contract from main prompt. |
| Main orchestrator | Reviews and integrates agent output; agent does not own migrations, UI or shared APIs. | Qwen file completion. |

## Acceptance criteria

- A clean setup command path is documented and binds only to loopback by
  default.
- Day 6 uses only its own database and never runs migrations against the
  unrelated port-5432 cluster.
- Every displayed metric comes from the same seeded/persisted services used by
  the API. Null or missing values remain explicit.
- All nine Stitch-inspired modules are reachable in the same shell and use
  synthetic labels, fictional records and non-official thresholds.
- Search and assistant tools are scoped, bounded and do not execute model-made
  SQL.
- Upload extensions, content types, size, checksums and safe storage paths are
  validated; unsupported formats are rejected explicitly.
- Report preview and CSV export share the same validated filters.
- Auth/write limitations, local model availability and unimplemented
  capabilities remain visible in docs and UI.

## File ownership

- Main agent owns all files except the Qwen-assigned `src/lib/demo-data.ts`
  until the task completes.
- Migrations have one owner at a time: main orchestrator.
- No shared DB reset or destructive migration is permitted.
