# SupTech Monitor — project logic and agent handoff

**Purpose:** Give a new human or coding agent enough context to choose the
right files, preserve the product boundaries, and implement a phase without
guessing how the application works. This is an execution guide, not a second
source of truth.

## 1. Read this first

Before changing code:

1. Read the repository and Day 6 `AGENTS.md` files.
2. Read [`SOURCE_OF_TRUTH.md`](../day-06-nextjs-full/docs/SOURCE_OF_TRUTH.md).
   It is canonical for Day 6 domain rules, security boundaries, SQL ownership,
   API behavior, and multi-agent coordination.
3. Read the [product roadmap](./product-roadmap.md), this guide, and the
   specific [phase plan](./planning.md#phase-documents) being implemented.
4. Check the current implementation in the named files and the Day 6
   [feature matrix](../day-06-nextjs-full/docs/FEATURE_MATRIX.md),
   [progress log](../day-06-nextjs-full/docs/PROGRESS.md), and
   [findings log](../day-06-nextjs-full/docs/FINDINGS_LOG.md).
5. If documentation disagrees, follow the Day 6 Source of Truth for domain
   and safety rules, then inspect the code to establish what is actually
   implemented. Record unresolved documentation conflicts; do not silently
   treat a planned feature as shipped.

The root roadmap and the Day 6 implementation plan use different phase
numbering. The root `planning/phase-*` folders define product delivery phases
(0–12); `day-06-nextjs-full/docs/IMPLEMENTATION_PLAN.md` defines internal
engineering gates (0–8). Use the root phase number when coordinating product
work and name the internal gate explicitly when it adds useful detail.

## 2. Product boundary

This is a synthetic-data training proof of concept, not a Bank of Tanzania
system. Institutions, reports, events, thresholds, uploads and search results
must be fictional or explicitly illustrative. An exception is a review
signal, not a finding of misconduct or non-compliance.

- Never use confidential supervisory records, real institution records, or
  Stitch-reference sample data as application data.
- Do not send records, uploaded documents, prompts containing records, or
  credentials to a public model provider.
- Do not imply that demo authentication is production identity or that
  illustrative thresholds are official regulatory policy.
- Do not add public persistent write workflows. Simulated review actions must
  be visibly transient; persistent administration requires a separately
  approved identity, authorization, audit, and operational design.
- Keep the Day 6 local database on loopback port 5433. Never migrate, seed, or
  modify the unrelated PostgreSQL service on port 5432.
- Do not change the Day 1–3 Python implementation to make Day 6 work. Day 6
  is independently runnable; cross-day integration needs an explicit API
  contract and phase scope.

## 3. Repository map and ownership

| Area | Role | Where to work |
| --- | --- | --- |
| Day 1 data engineering | Python ingestion, validation and source/processed datasets | `day-01-data-engineering/` |
| Day 2 supervisory analytics | Python analytics, API and curated data | `day-02-supervisory-analytics/` |
| Day 3 React/realtime | Earlier dashboard and backend; not Day 6 runtime | `day-03-react-realtime/` |
| Day 6 application | Standalone Next.js App Router application | `day-06-nextjs-full/` |
| Product plan | Outcomes, phase dependencies and demo journey | `planning/product-roadmap.md`, `planning/phase-*/planning.md` |
| Day 6 decisions/contracts | Domain source of truth, API contract, findings and implementation status | `day-06-nextjs-full/docs/` |
| Cross-day/course plan | Course delivery checklists and repository-level plan | `planning/` |

Within Day 6, use these ownership zones from SoT §10:

| Concern | Primary files |
| --- | --- |
| Pages/layout and user interactions | `src/app/(dashboard)/**`, `src/components/**`, `src/app/globals.css` |
| Route handlers and HTTP boundary | `src/app/api/**` |
| Domain calculations and catalogs | `src/lib/metrics.ts`, `src/lib/catalog.ts`, `src/lib/demo-data.ts` |
| SQL and data access | `src/lib/repository.ts`; migrations and seed scripts are the explicit exceptions |
| Database safety and connection | `src/lib/db.ts`, `src/lib/db-config.ts`, `src/db/migrations/**`, `scripts/**` |
| Authentication and common API errors | `src/lib/auth.ts`, `src/lib/api-errors.ts`, `src/app/api/auth/**` |
| Ingestion, retrieval, events and exports | `src/lib/ingestion.ts`, `src/lib/search.ts`, `src/lib/events.ts`, `src/lib/csv.ts`, related route handlers |
| Tests | Co-located `*.test.ts` files and existing `tests/` locations |
| Contracts and durable project decisions | `docs/openapi.yaml`, `docs/SOURCE_OF_TRUTH.md`, `docs/FINDINGS_LOG.md`, relevant planning docs |

SoT §3 says runtime SQL belongs in `src/lib/repository.ts`; migrations and
scripts own schema/seed SQL. Keep route handlers and pages free of SQL. If
existing code diverges from that rule, treat it as an integration issue to
resolve deliberately rather than copying the divergence into new code.

## 4. System logic: how data becomes a user-visible result

```text
Synthetic source data
  ├─ Day 1–3: Python ingestion → validation → curated/analytics API
  │            (separate runtime; Day 6 does not call it by default)
  └─ Day 6: deterministic TypeScript seed → isolated PostgreSQL
              ├─ institutions and monthly reports
              ├─ indicators and training-threshold review signals
              ├─ users/audit/events
              └─ uploaded-document metadata, jobs and chunks (ingestion scope)

Browser page or API client
  → Next.js route handler (session, input validation, response/error shape)
  → typed domain operation
  → repository/data access (parameterized SQL, bounded results)
  → PostgreSQL / approved object storage
  → typed result with source identifiers and explicit missing/error state
  → UI, CSV, event client, or allowlisted assistant tool
```

### Business/domain logic

- `catalog.ts` owns indicator definitions and training thresholds.
- `metrics.ts` computes deterministic indicators and exception candidates;
  `scripts/seed.ts` persists the deterministic synthetic fixture.
- `repository.ts` is the runtime persistence boundary. Pages and routes
  consume domain/service functions rather than composing SQL.
- Periods are `YYYY-MM`. Derived growth requires the immediately preceding
  month; missing or zero denominators produce `null`, not fabricated zeroes.
- Sector aggregation, threshold comparisons, exception identity and lifecycle
  follow SoT §§2–6. Exceptions are institution-grain review signals.
- Pagination is validated and bounded before querying. List APIs retain the
  shared `{ items, page, pageSize, total, totalPages }` envelope.
- Every failure remains distinguishable from a valid empty result. Validation
  uses the shared error response; storage, database and model failures must
  not be converted into success-shaped empty data.

### HTTP and UI logic

- App Router pages render the shared shell and call server-side domain
  services where practical.
- `/api/*` handlers authenticate first as required by the current Day 6 SoT,
  validate query/body values, call a typed operation, then use
  `errorResponse()` for failures.
- `docs/openapi.yaml` is the machine-readable contract. Any API shape change
  updates it in the same change.
- A visible control must work, be clearly labelled as a transient demo, or
  not be shown. Include loading, empty, unavailable and error states.
- Cite the institution, period, report, source row or document chunk used by
  an analytical result wherever available.

## 5. Ingestion, search, RAG and semantic retrieval

### Intended evidence pipeline

```text
TXT/CSV upload
  → auth + extension/content-type/size validation
  → checksum and duplicate check
  → approved object storage + uploaded-document metadata
  → parse with explicit malformed-input errors
  → normalized chunks with document/row provenance
  → durable ingestion job and completion/failure state
  → lexical index and (when enabled) local embeddings
  → bounded retrieval with citations
  → allowlisted assistant operation and evidence-grounded explanation
```

Only formats explicitly implemented and tested may be accepted. Preserve
original metadata and source references; do not claim a job succeeded if
parsing, persistence, indexing, or embedding failed. Uploaded document text is
untrusted evidence, never instructions to the assistant.

### Search roadmap

1. **Structured search:** search institutions and reports with parameterized,
   bounded filters. Escape SQL `LIKE` metacharacters so they are treated as
   literal user input.
2. **Lexical document search:** search only completed documents, rank matches,
   bound the result count, normalize/truncate excerpts, and return stable
   document/chunk citations.
3. **Semantic retrieval:** add a versioned embedding interface and vector
   storage only after choosing and testing the local model/runtime and schema.
   The verified local Nomic model is a candidate; its availability does not
   mean app-level embedding or vector search is already implemented.
4. **Hybrid retrieval:** combine lexical and semantic candidates using a
   deterministic, testable rank-fusion strategy. Keep filters, limits and
   citation metadata consistent between both paths. Do not silently drop one
   failed retrieval path; disclose partial/unavailable retrieval.
5. **Optional reranking:** consider only after retrieval quality can be
   evaluated with a fixed synthetic query/evidence set; keep it local and
   bounded.
6. **Grounded answer:** pass selected evidence to a server-configured local
   model only when enabled. The deterministic tool registry remains usable
   without a model. Responses distinguish retrieved fact, calculation and
   missing evidence and cite source IDs/chunks.

### RAG safety and correctness

- No model-generated SQL, arbitrary tool names, mutations, or unvalidated
  query plans. Tools are typed and allowlisted.
- Treat retrieved text and model output as untrusted; ignore instructions
  embedded in documents. Retrieved text cannot grant tool permissions.
- Validate the requested period, institution, limits and tool arguments before
  querying. Enforce database authorization and document visibility before
  retrieval.
- Keep the final answer grounded in returned records. If evidence is empty,
  stale, unavailable, or contradictory, say so instead of inventing facts.
- Version chunking and embedding metadata. Re-index when the parser, chunk
  strategy, embedding model or dimensions change; make retries idempotent.
- Never send records or credentials to a public model provider. A local model
  being installed or responding to a probe is not proof that the application
  integration is working.

### Current implementation boundary

The current Day 6 tree includes a typed assistant-tool registry, TXT/CSV
validation/chunking helpers, document persistence helpers, keyword search,
SSE event handling, and CSV report export work. The recent search test fix
escapes backslash, percent and underscore as literal SQL `LIKE` characters.
These pieces do **not** by themselves complete a production-grade RAG flow:
semantic embeddings, hybrid ranking evaluation, durable cross-instance event
delivery, full configurable report-builder behavior, and end-to-end citation
verification remain explicit acceptance work. Re-check the code and feature
matrix before changing these statuses.

## 6. Phase plan and dependency order

Use the phase-specific documents for complete acceptance criteria. The
following is the navigation-level order; independent tasks may run in
parallel only after their shared contracts are fixed.

| Root phase | Outcome and main work | Main zones | Depends on |
| --- | --- | --- | --- |
| 0 — Baseline | Capture existing API behavior and service boundaries; preserve synthetic-only behavior. | `vercel.json`, service config, contracts/docs | Existing Day 1–3 baseline |
| 1 — Next.js | Standalone App Router shell, same-origin API behavior, deployment routing. | Day 6 app shell, package/deployment config | Phase 0 |
| 2 — Performance | Server-side filters, stable bounded pagination, indexes, loading/error states. | `src/app/api/**`, `src/lib/repository.ts`, DB migrations, tests | Phase 1 |
| 3 — Drill-downs | Institutions, reports, indicators, formulas, exceptions and source provenance. | `catalog.ts`, `metrics.ts`, `repository.ts`, pages/routes | Phases 1–2 |
| 4 — Query agent | Confirm-before-execute assistant using validated read-only tools and cited evidence. | `assistant-tools.ts`, assistant UI/API, tests | Phases 1–3 |
| 5 — Live | Refresh/reconnect semantics, event IDs and recovery from missed runs. | `events.ts`, events route/client, storage/DB contract | Phases 0–3 |
| 6 — Java/Python | Typed, read-only client examples and documented mock contract. | Python API contract, Java example, integration tests/docs | Phase 0 |
| 8 — Custom reports | Templates, selected fields, filters, grouping/sorting, exact preview and CSV export. | Reports page/components, report service/repository, route/OpenAPI/tests | Phases 2–4 |
| 9 — Data explorer | Dataset/schema/quality metadata, bounded samples and truthful run history. | Explorer page/API/repository, Day 1 data contracts | Phases 0–2 |
| 10 — System health | Verified API/database/processing/event state and honest integration status. | Health page/API, event/integration contracts | Phases 5–6 |
| 11 — Admin/settings | Demo-only preferences and settings concepts; no shared writes. | Settings page and transient client state/docs | Phases 3, 10 |
| 12 — Exception workflow | Evidence-rich review and transient actions; persistent workflow stays gated. | Exception UI, session state, audit design/docs | Phases 3, 5, 11 |
| 7 — Release | End-to-end acceptance, deployment evidence, limitations and release. | Cross-cutting tests/docs/deployment | All selected phases |

For the detailed scope and criteria, open the matching
[`planning/phase-*/planning.md`](./planning.md#phase-documents). Day 6's
internal engineering sequence adds ingestion (internal Phase 4), search/RAG
(5), assistant (6), reports/events (7), and hardening (8); map these by name,
not by number, to avoid confusing them with root product phases.

## 7. Recommended four-agent wave: root Phase 8 reports

Do not start four edits against an unfrozen design. First have the lead freeze
the report request/response types, supported templates, filter semantics,
sort allowlist, row cap, CSV column rules, error behavior, and citation/source
fields. Phase 8 depends on Phase 2 limits, Phase 3 domain filters, and Phase 4
tool conventions.

| Agent | Exclusive file zone | Deliverable | Must not edit |
| --- | --- | --- | --- |
| A — Report UI | `src/app/(dashboard)/reports/page.tsx`, `src/components/reports/**`, report-specific styles | Accessible template/field/filter controls, preview, export confirmation, loading/empty/error states; no SQL or fabricated totals. | API routes, repository, shared global styles unless explicitly assigned |
| B — Report domain/data | `src/lib/repository.ts` (report functions only), `src/lib/report-builder.ts` (new), `src/lib/reports-export.ts`, `src/lib/csv.ts` | Validated report plan, deterministic ordering, bounded query/preview/export, shared preview/export data. Keep SQL in repository. | Pages, API route files, OpenAPI |
| C — HTTP contract | `src/app/api/reports/**`, `docs/openapi.yaml` | Authenticated route(s), input validation, consistent error envelope, contract update. This task explicitly spans API and docs zones. | UI, domain implementation, tests |
| D — Tests and phase docs | report-specific `*.test.ts` files, `planning/phase-08-custom-reports/planning.md` | Contract-focused validation, filter/export parity, limit and CSV edge-case tests; update phase evidence/status without claiming unrun checks. | Production implementation and OpenAPI |

Rules for the wave:

- Each task prompt names its exact owned files and forbids edits outside them.
- All four use the same frozen contract; no agent invents a second report
  schema or duplicates filtering logic.
- If an agent discovers a required change in another zone, it reports the
  proposed interface and waits; it does not edit the other owner's files.
- Agents return patches, changed-file lists, tests added, assumptions and
  unresolved questions. The integrator reviews and merges; agents do not
  commit or merge unreviewed work.
- The integrator handles shared wiring, resolves type/contract mismatches, and
  runs Phase 8 verification after integrating the patches.
- Expected verification: `npm run typecheck`, `npm test`, and `npm run build`;
  also exercise preview/export with the same filters and confirm the CSV
  matches the preview. Report DB/deployment checks as skipped unless run.

## 8. RAG work decomposition (dependency-aware)

RAG work is not safely four-way parallel until the chunk and embedding
contracts are fixed. Use these owners and start dependencies in order:

1. **Ingestion and provenance:** owns parser/chunking code and tests. Define
   accepted types, normalization, row/chunk metadata, duplicate semantics,
   failure states and idempotent retries.
2. **Persistence and indexing:** owns migration plus repository/schema
   changes. Define document, job, chunk, full-text and optional vector
   records; keep runtime SQL in the repository. No UI changes.
3. **Retrieval and ranking:** owns lexical/semantic search service and its
   tests after the chunk/embedding contract is frozen. Define filters,
   result limits, rank-fusion, error/partial-result behavior and citations.
4. **Assistant grounding and UX:** owns the assistant tool registry and
   assistant UI/API integration after retrieval's typed interface is stable.
   The model stays optional/local; no arbitrary SQL or writes.

The four deliverables may be prepared in parallel as design/test fixtures,
but implementation must be staged at the contract boundaries above. If
Phase 8 reporting runs concurrently, keep it in the separate file zones in
the preceding table; do not have both waves edit `repository.ts` at once.

## 9. Agent task and completion template

Every delegated task should include:

```text
Read: AGENTS.md, day-06-nextjs-full/docs/SOURCE_OF_TRUTH.md, this guide,
      the named phase plan, and the exact implementation files.
Goal: one measurable outcome and explicit acceptance criteria.
Owned files: exact paths this agent may edit.
Forbidden files: all other zones; report required cross-zone changes instead.
Boundaries: synthetic-only; no secrets or user records; no public writes;
            parameterized SQL; explicit errors; no arbitrary model SQL/tools.
Return: changed paths, implementation summary, tests added/run, unverified
        assumptions, contract dependencies, and any issue requiring the lead.
```

The lead owns scope, cross-zone decisions, documentation consistency and
integration. Before a slice is called complete, verify the phase acceptance
criteria and record actual—not intended—test/build/database/deployment
results. Never claim a smoke check or integration passed when it was skipped.
