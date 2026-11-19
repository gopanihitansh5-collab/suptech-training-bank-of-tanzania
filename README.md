# SupTech Monitor

A full-stack supervisory-intelligence workspace built as a training proof of
concept for the Bank of Tanzania SupTech programme. The running application is
a standalone Next.js App Router project in [`day-06-nextjs-full/`](./day-06-nextjs-full/).
It persists synthetic supervisory records in PostgreSQL, computes indicators
and review signals, exposes read-only APIs, supports document ingestion and
grounded retrieval, and provides a controlled assistant plus a multi-agent
analysis workspace.

> **Synthetic training data only.** Every institution, report, threshold,
> uploaded sample, metric and event in this repository is fictional or
> illustrative. This is not a Bank of Tanzania system, it does not express
> official regulatory policy, and it must never receive real supervisory data.
> A threshold breach is a **review signal**, never a finding of misconduct or
> non-compliance.

---

## 1. Status at a glance

Verified on the current tree:

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | Pass |
| Unit and route tests | `npm test` | Pass, 14 files / 111 tests |
| Production build | `npm run build` | Pass, all routes generated |

Seeded synthetic dataset: **12 institutions**, **288 monthly reports**,
**3,432 indicator values** and **151 illustrative review signals**
(1 critical, 2 high, 148 medium).

The application is implemented in `day-06-nextjs-full/`. The older
`day-01-data-engineering/`, `day-02-supervisory-analytics/` and
`day-03-react-realtime/` folders are historical course material and are **not
used at runtime** by the Next.js application.

---

## 2. What the system is for

The product question is: *can a supervisor move from a portfolio number to the
record, rule and evidence behind it without leaving the workspace?*

The application answers that by combining:

- a persisted synthetic reporting dataset with a real relational schema;
- a declared indicator and threshold catalog;
- server-rendered pages that read only from the database;
- read-only APIs that the UI and external clients can call;
- document ingestion and hybrid retrieval with citations;
- a deterministic, allowlisted assistant that previews a plan before running it;
- an optional local-model workspace for scoped analysis;
- audit events, persisted system events and an exception review workflow.

The design deliberately separates **what is computed** (catalog and metrics),
**what is stored** (PostgreSQL), **what is exposed** (repository and route
handlers) and **what is shown** (server components and client widgets). That
separation is the main reason the system is testable and the reason every
number on a page can be traced back to a row.

---

## 3. System architecture

```text
Browser
  |
  |  HTTPS, signed demo session cookie
  v
Next.js App Router (day-06-nextjs-full)
  |
  +-- Server Components  -> app/(dashboard)/**
  |     render pages on the server, call domain services directly
  |
  +-- Route Handlers     -> app/api/**
  |     validate input, require a demo session, return JSON or SSE
  |
  v
Domain services (src/lib/**)
  |
  +-- repository.ts        all SQL for reads and triage
  +-- metrics.ts           indicator computation and threshold evaluation
  +-- catalog.ts           indicator and threshold definitions
  +-- demo-data.ts         deterministic synthetic generator
  +-- auth.ts              signed session, roles, login rate limiting
  +-- ingestion.ts         upload validation, parsing, chunking
  +-- ingestion-store.ts   file storage, ingestion jobs, document records
  +-- search.ts            lexical search over documents and structured data
  +-- grounded-retrieval.ts hybrid lexical + embedding retrieval
  +-- grounded-answer.ts   cited answer from retrieved evidence
  +-- assistant-planner.ts deterministic question -> plan
  +-- assistant-tools.ts   allowlisted read-only tool executor
  +-- orchestration.ts     multi-agent and stateful supervisory workflow
  +-- events.ts            persisted system events and SSE chunks
  +-- reports-export.ts    bounded CSV export
  |
  v
PostgreSQL 16 (local loopback port 5433, or managed TLS provider)
  |
  +-- institutions, institution_reports
  +-- indicator_definitions, threshold_configurations
  +-- supervisory_indicators, supervisory_exceptions
  +-- uploaded_documents, ingestion_jobs, document_chunks
  +-- report_definitions, report_runs
  +-- users, roles, permissions, audit_events
  +-- conversations, messages, agent_runs, saved_memory_records
  +-- system_events

Optional side services:
  - S3-compatible object storage for uploads (otherwise local .local/uploads)
  - LM Studio on loopback (Qwen chat, Nomic embeddings); optional and bounded
```

### Why this shape

- **One deployable, one origin.** Next.js serves both the pages and the API, so
  the browser never needs a cross-origin call or a token prompt.
- **Server-side data access.** Pages and route handlers call domain services;
  the browser never holds database credentials.
- **All SQL in one place.** `src/lib/repository.ts` is the data-access boundary,
  which makes review, parameterisation and pagination consistent.
- **Configuration is code.** `src/lib/catalog.ts` is the single source of truth
  for indicator formulas and training thresholds. Database catalogs are a
  read-only mirror written by the seed script.
- **Deterministic by default.** `demo-data.ts` uses no randomness, so seeds,
  tests and demos are reproducible. The assistant plans with rules, not a model.
- **Local models are optional.** When LM Studio is unavailable, retrieval falls
  back to keyword search and the assistant falls back to deterministic answers.
- **Honest failure.** Missing, stale or unavailable data is shown as such; the
  system never invents a value or turns an outage into a successful empty result.

---

## 4. Request lifecycle

### A page request

1. `app/(dashboard)/layout.tsx` calls `requireDemoSession()`. Without a valid
   signed cookie the user is redirected to `/login`.
2. The page component (a React Server Component) reads `searchParams`, validates
   them and calls a domain service such as `getOverview`, `listInstitutions`,
   `getAnalytics`, `listExceptions` or `getInstitutionDetail`.
3. The domain service runs parameterised SQL through `src/lib/db.ts`.
4. The page renders HTML on the server. Client widgets (charts, assistant,
   triage form) receive only the data they need.

### An API request

1. The route handler calls `requireDemoSession()` first.
2. Input is validated (Zod or explicit checks). Bodies are read with a byte
   bound by `readJsonBody()`.
3. The handler calls a domain service.
4. Errors are converted by `errorResponse()` into a consistent JSON envelope:
   `400` validation, `401` auth, `403` role, `404` not found, `413` too large,
   `429` rate limit, `503` misconfigured, `500` generic.

### An ingestion request

1. `POST /api/uploads` requires a `supervisor` or `admin` demo role.
2. `validateUpload()` checks extension, content type, size and emptiness.
3. `ingestDocument()` computes a SHA-256 checksum, rejects duplicates, stores
   the file (S3 or local), inserts `uploaded_documents` and an `ingestion_jobs`
   row, parses and chunks the content, then marks the document and job complete.
4. Chunks become searchable through `document_chunks.content_search` (a
   generated `tsvector`) and are included in the semantic corpus.

---

## 5. Backend logic in detail

### 5.1 Synthetic data generation and seeding

`src/lib/demo-data.ts` deterministically builds 12 fictional institutions and
24 monthly reports per institution (2024-11 through 2026-10). It includes
deliberate anomalies so the indicator and threshold logic has something to
find. `scripts/seed.ts` then:

1. computes indicators and exceptions with `metrics.computeAnalytics()`;
2. upserts institutions, indicator definitions, threshold configurations,
   reports, indicators and exceptions in one transaction;
3. reconciles stale `open` exceptions that no longer breach a threshold;
4. inserts the demo user and audit/system events.

The seed is idempotent. Deterministic exception IDs
(`EXC-{threshold}-{institution}-{period}`) make `ON CONFLICT` safe.

### 5.2 Indicator and threshold catalog

`src/lib/catalog.ts` defines 11 indicators: deposits, loans, loan-to-deposit,
deposit growth, loan growth, capital adequacy, NPL ratio, liquidity,
completeness, data-quality failure rate and late submission.

`metrics.ts` computes institution-grain values and sector-grain rollups:

- sums for deposits and loans;
- ratio of sums for loan-to-deposit;
- consecutive-month comparison for growth;
- deposit-weighted means for capital adequacy, NPL and liquidity;
- simple means for completeness and late submission;
- disjoint submitted/rejected counts for the failure rate.

A derived value is `null` when a denominator is zero or a previous period is
missing; it is never replaced with zero. Thresholds are evaluated only at
institution grain, compare the rounded observed value, and treat a value exactly
on the boundary as compliant.

### 5.3 Repository and pagination

`src/lib/repository.ts` owns every SQL statement used at runtime. It provides:

- `getOverview()` for portfolio totals, a 12-period trend and recent signals;
- `listInstitutions()` and `getInstitutionDetail()`;
- `listReports()` and `listExceptions()`;
- `getExceptionById()` and `updateExceptionStatus()` (triage with audit);
- `getAnalytics()` for catalog indicators and trend;
- `getDataExplorerStats()` and `getSemanticCorpus()`;
- conversation and message persistence.

Lists use a stable envelope `{ items, page, pageSize, total, totalPages }` with
`page >= 1` and `1 <= pageSize <= 50`. Search terms are escaped for `ILIKE`.
Periods are validated as `YYYY-MM`. Identifiers are validated before querying.

### 5.4 Authentication and roles

`src/lib/auth.ts` implements a local demo session:

- credentials come from `DEMO_USERNAME`, `DEMO_PASSWORD`, `AUTH_SECRET` and
  `DEMO_ROLE`;
- the session is an HMAC-SHA256 signed, base64url payload in an `httpOnly`,
  `sameSite=strict` cookie with an 8-hour TTL;
- roles are `viewer < supervisor < admin`;
- login is rate-limited in memory (5 failures in 5 minutes, then `429`);
- login writes an audit event.
- Vercel Preview deployments show a `One-click login` button that issues a demo
  session server-side without sending the configured credentials to the browser.
  The endpoint is Preview-only; keep Vercel Deployment Protection enabled.

This is a demonstration boundary, not production identity, and it is labelled
as such in the UI.

### 5.5 Document ingestion

Supported formats today are `.txt`, `.csv` and `.json` up to 2 MB. CSV is
parsed row by row into `column=value` chunks; JSON arrays become one chunk per
item and objects are chunked; text is chunked with overlap. Duplicate uploads
are rejected by checksum. Storage uses S3 when the AWS variables are set,
otherwise the local `.local/uploads` directory. Documents, jobs and chunks are
persisted with status, counts and error messages.

### 5.6 Search and grounded retrieval

`src/lib/search.ts` performs lexical search across:

- completed document chunks (PostgreSQL full-text search);
- exceptions, reports and institutions (`ILIKE`).

`src/lib/grounded-retrieval.ts` adds hybrid retrieval: it builds a scoped corpus,
embeds the query and corpus with the local Nomic model, ranks by cosine
similarity, fuses lexical and semantic lists with reciprocal-rank fusion, and
falls back to keyword-only results when embeddings are unavailable.

`src/lib/grounded-answer.ts` asks the local Qwen model to answer strictly from
the retrieved evidence, validates that every `[S#]` citation maps to a real
retrieved source, and returns an explicit unavailable state when the model is
offline or the answer fails validation.

### 5.7 Controlled assistant

`src/lib/assistant-planner.ts` maps a natural-language question to one of six
allowlisted tools using deterministic rules:

| Tool | Purpose |
| --- | --- |
| `get_portfolio_overview` | Portfolio totals, completeness, open signals. |
| `list_exceptions` | Filtered review signals. |
| `get_institution` | One institution, its reports and signals. |
| `get_analytics` | Catalog indicators and trend. |
| `list_institutions` | Institution directory search. |
| `search_corpus` | Hybrid retrieval plus a cited local-model answer. |

`src/lib/assistant-tools.ts` validates every argument against the tool
descriptor, rejects unknown fields, enforces enum and format rules, and executes
only repository reads. There is no generated SQL and no write path. The UI shows
the plan and requires explicit confirmation before execution.

### 5.8 Multi-agent orchestration

`src/lib/orchestration.ts` provides two modes:

1. **Manual multi-role prompts.** Select up to 10 predefined analysis roles and
   run them in parallel or sequence against the loopback model.
2. **Stateful supervisory workflow.** Classify the question into `analytical`,
   `document`, `combined`, `exception_explanation`, `report` or `general`;
   resolve institution context; run the relevant specialists (data analyst,
   document retrieval, exception/indicator, report); run verification checks for
   citation fidelity, calculation sanity and policy wording; then compose a
   response. If the local model is offline, a deterministic response is used.

The workflow returns its plan, active agents, retrieved sources, analytical
results, verification report and the model used (`local-qwen` or
`deterministic-fallback`), so the UI can show how an answer was produced.

### 5.9 Events and live updates

`src/lib/events.ts` persists system events in `system_events` and serialises
them as SSE chunks. `GET /api/events` streams events after `Last-Event-ID`,
polls every 5 seconds, sends keep-alives and replays exactly what a reconnecting
client missed. Triage and report export also write system events.

### 5.10 Reports and audit

`src/lib/reports-export.ts` builds a bounded CSV export (maximum 1,000 rows,
20 pages of 50), records a `report_runs` row and emits a `report_exported`
event. Triage updates write an `audit_events` row and a system event. Login and
ingestion also write audit rows.

---

## 6. Data model

| Table | Purpose |
| --- | --- |
| `institutions` | Fictional institution register. |
| `institution_reports` | Monthly synthetic returns; one row per institution and period. |
| `indicator_definitions` | Read-only mirror of the TypeScript indicator catalog. |
| `threshold_configurations` | Read-only mirror of the TypeScript training thresholds. |
| `supervisory_indicators` | Institution- and sector-grain indicator values per period. |
| `supervisory_exceptions` | Persisted threshold comparisons with status and evidence. |
| `uploaded_documents` | Upload metadata, checksum, storage path and processing status. |
| `ingestion_jobs` | One row per ingestion attempt with status and error. |
| `document_chunks` | Parsed chunks, source references and a generated search vector. |
| `report_definitions` / `report_runs` | Report configuration and export/run history. |
| `users` / `roles` / `permissions` | Demo RBAC mirror; not production identity. |
| `audit_events` | Who did what, with structured details. |
| `conversations` / `messages` | Persisted assistant conversations. |
| `agent_runs` / `saved_memory_records` | Agent trace and memory scaffolding. |
| `system_events` | Durable event stream backing the SSE endpoint. |

The schema lives in `src/db/migrations/001_initial.sql`; the migration runner is
`scripts/migrate.ts`.

---

## 7. Pages and why each one is useful

The shared shell (`app/(dashboard)/layout.tsx`) provides the sidebar, session
label, role pill and logout control. Every page carries a synthetic-data banner.

| Page | Route | What it does | Why it matters |
| --- | --- | --- | --- |
| Executive overview | `/` | Portfolio KPI cards, 12-period deposits/loans trend, quality and signal chart, recent review signals, period selector. | Answers "what is the state of the portfolio right now?" in one screen. KPI cards link to the filtered detail view. |
| Institution directory | `/institutions` | Searchable, filterable, paginated register with latest period, deposits, capital, NPL and open signals. | The entry point for institution-level investigation. |
| Institution detail | `/institutions/[institutionId]` | Profile, latest position, 12-report history, linked review signals. | Traces a signal back to the institution and its reporting history. |
| Supervisory analytics | `/analytics` | Indicator catalog with formulas, period/indicator filters and portfolio trend. | Shows what each measure means and how it is calculated; supports period comparison. |
| Exceptions and alerts | `/exceptions` | Server-side filters (search, institution, period, severity, status), bounded pagination and source report IDs. | The working register for review signals; separates a signal from a finding. |
| Exception detail | `/exceptions/[exceptionId]` | Full evidence: observed value, threshold, message, source report and a triage form. | Supports the human review workflow and records an audited status change. |
| Custom reports | `/reports` | Filtered report preview plus CSV download of up to 1,000 rows. | Produces a portable extract without exposing a write path. |
| Data explorer | `/data-explorer` | Persisted dataset counts, table/schema disclosures, uploaded document inventory, searchable report list. | Makes the data boundary visible and distinguishes recorded evidence from unavailable evidence. |
| Search | `/search` | Lexical search across documents, exceptions, reports and institutions with citations. | Finds the record or document behind a question. |
| Document preview | `/documents/[documentId]` | Bounded preview of a stored document chunk with provenance. | Verifies what the retrieval layer actually used. |
| AI supervisory assistant | `/assistant` | Deterministic plan, explicit confirmation, allowlisted execution and source records. | Demonstrates controlled AI assistance without generated SQL or writes. |
| Multi-agentic supervision | `/agents` | Manual multi-role prompts and a stateful supervisory workflow with plan, agents, verification and citations. | Shows how specialised agents can be composed while keeping evidence visible. |
| Integrations and health | `/system-health` | Live database and local-model probes; external systems explicitly not connected. | Reports verified runtime state instead of claiming integrations that do not exist. |
| Administration and settings | `/settings` | Read-only session and configuration boundary. | Shows the current role and what is deliberately unavailable. |

The login page (`/login`) is the only page outside the dashboard shell.

---

## 8. API reference

All data routes require the demo session except `POST /api/auth/login` and the
Preview-only `POST /api/auth/demo-login` (which must remain behind Vercel
Deployment Protection).

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | public | Validate demo credentials and set the session cookie. |
| `POST` | `/api/auth/demo-login` | Preview only | Create a demo session server-side; requires Vercel Deployment Protection. |
| `POST` | `/api/auth/logout` | any | Clear the session cookie. |
| `GET` | `/api/overview` | any | Portfolio summary and trend. |
| `GET` | `/api/institutions` | any | Paginated institution list. |
| `GET` | `/api/institutions/{institutionId}` | any | Institution detail. |
| `GET` | `/api/analytics` | any | Indicator values and trend. |
| `GET` | `/api/exceptions` | any | Paginated exception list. |
| `PATCH` | `/api/exceptions` | supervisor/admin | Update a signal status with an audited note. |
| `GET` | `/api/exceptions/{exceptionId}` | any | One exception with evidence. |
| `GET` | `/api/search` | any | Lexical search across corpus kinds. |
| `GET` | `/api/events` | any | Server-Sent Events with replay. |
| `GET` / `POST` / `DELETE` | `/api/uploads` | GET any; writes supervisor/admin | List, ingest or delete synthetic documents. |
| `POST` | `/api/assistant/plan` | any | Turn a question into an allowlisted plan. |
| `POST` | `/api/assistant/execute` | any | Execute a confirmed read-only tool. |
| `GET` / `POST` | `/api/orchestration` | any | List agents, run roles or run the supervisory workflow. |
| `GET` / `POST` | `/api/conversations` | any | List or create conversations. |
| `GET` / `POST` | `/api/conversations/{conversationId}` | any | Read or append messages. |
| `GET` | `/api/reports/export` | any | Download a bounded CSV export. |

The machine-readable contract is in
[`day-06-nextjs-full/docs/openapi.yaml`](./day-06-nextjs-full/docs/openapi.yaml).

---

## 9. Repository layout

```text
.
├── day-06-nextjs-full/            the running application
│   ├── src/app/(dashboard)/       server-rendered workspace pages
│   ├── src/app/api/               route handlers
│   ├── src/components/            client widgets (charts, forms, workspaces)
│   ├── src/db/migrations/         SQL schema
│   ├── src/lib/                   domain services
│   ├── scripts/                   migrate and seed
│   ├── compose.yaml               isolated PostgreSQL on 127.0.0.1:5433
│   ├── docs/                      decisions, source of truth, OpenAPI, status
│   └── .env.example               placeholder environment contract
├── docs/                          programme architecture and research notes
├── planning/                      product roadmap and phase plans
├── day-01-data-engineering/       historical Python course material
├── day-02-supervisory-analytics/  historical Python course material
├── day-03-react-realtime/         historical Python + Vite course material
├── tests/                         historical Python test suite
├── vercel.json                    routes the domain to the Next.js service
└── build_vercel.py                historical FastAPI artefact builder
```

The historical folders are retained for training context. They are not imported
by the Next.js application and are not part of its runtime.

---

## 10. Local setup

### Prerequisites

- Node.js 22+ and npm
- Docker with Compose (for the isolated PostgreSQL service)
- Optional: LM Studio on `127.0.0.1:1235` with a chat model and
  `text-embedding-nomic-embed-text-v1.5`
- Optional: an S3-compatible bucket for uploads

### Steps

```sh
cd day-06-nextjs-full
cp .env.example .env
```

Edit `.env` and replace every placeholder. Generate a session secret with:

```sh
openssl rand -base64 32
```

Then:

```sh
npm install
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://127.0.0.1:3000> and sign in with the credentials in `.env`.

The database container binds only to `127.0.0.1:5433`. It does not reuse or
modify the unrelated PostgreSQL instance on port 5432, and `db-config.ts`
enforces that boundary.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js on loopback. |
| `npm run typecheck` | Type-check with `tsc --noEmit`. |
| `npm test` | Run the Vitest unit and route suite. |
| `npm run build` | Type-check and create the production build. |
| `npm run db:migrate` | Apply additive SQL migrations. |
| `npm run db:seed` | Idempotently seed the synthetic dataset. |

### Environment contract

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Local `127.0.0.1:5433` URL, or managed PostgreSQL with `sslmode=require`. |
| `AUTH_SECRET` | yes | At least 32 characters; signs the session cookie. |
| `DEMO_USERNAME` | yes | Demo login and seeded `users.user_id`. |
| `DEMO_PASSWORD` | yes | Demo login password. |
| `DEMO_ROLE` | optional | `viewer`, `supervisor` (default) or `admin`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | for Compose | Local database container. |
| `AWS_REGION` / `AWS_ENDPOINT_URL_S3` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | optional | S3-compatible upload storage. |
| `LOCAL_UPLOADS_DIR` | optional | Override the local upload directory. |
| `LM_STUDIO_BASE_URL` | optional | Loopback model endpoint; defaults to `http://127.0.0.1:1235/v1`. |
| `LM_STUDIO_CHAT_MODEL` / `LM_STUDIO_EMBEDDING_MODEL` | optional | Model names. |

Secrets stay in a local, untracked `.env`. Never commit credentials.

---

## 11. Deployment

The repository root is the Vercel project root. `vercel.json` defines a single
`frontend` service rooted at `day-06-nextjs-full`, and rewrites every path to
it. The API and dashboard therefore share one origin.

```sh
vercel link --project suptech-monitor
vercel deploy --prod
```

For a managed deployment, point `DATABASE_URL` at a PostgreSQL provider that
explicitly requires TLS (`sslmode=require`, `verify-ca` or `verify-full`).
`db-config.ts` rejects any other remote configuration.

This remains a training prototype: synthetic data, illustrative thresholds,
public read-only routes and a demo session. Do not deploy it with real
supervisory information.

---

## 12. What is implemented and what is not

### Implemented and verified

- Full Next.js App Router shell with all workspace modules reachable.
- Isolated PostgreSQL schema, migration and idempotent seed.
- Deterministic synthetic institutions, reports, indicators and signals.
- Overview, institution directory/detail, analytics, exception register/detail.
- Audited exception triage (open -> under_review -> resolved).
- Report preview and bounded CSV export.
- Data explorer with dataset counts, schema fields and document inventory.
- Document ingestion for `.txt`, `.csv` and `.json` (S3 or local storage).
- Lexical search plus hybrid retrieval with local embeddings and cited answers.
- Controlled assistant with deterministic plan, confirmation and allowlisted tools.
- Multi-agent manual prompts and a stateful supervisory workflow with verification.
- Persisted system events and replayable SSE.
- Persisted conversations and messages.
- Local database and model health probes.
- 111 passing tests, passing typecheck and a passing production build.

### Partial or not implemented

- **PDF, DOCX and XLSX ingestion.** Only `.txt`, `.csv` and `.json` are accepted.
- **Saved report templates, PDF export and dispatch.** Only filtered CSV export
  is implemented.
- **Persisted embeddings.** Embeddings are computed at query time and cached in
  memory; there is no vector column or index yet.
- **Data Explorer validation findings and full ingestion-run history.** The
  document inventory and job status exist, but row-level validation findings are
  not surfaced.
- **Assistant ranking and cross-institution comparison tools.** The deterministic
  planner supports overview, exceptions, institution, analytics, directory and
  corpus search, but not a dedicated "rank institutions" or "compare" tool.
- **Administrative writes.** Settings are read-only; threshold and user changes
  are not exposed.
- **Production identity, RBAC enforcement, audit retention and deployment
  hardening.** The demo session is not production authentication.
- **External integrations.** No Bank of Tanzania system or Java service is
  connected; the health page says so explicitly.
- **Distributed event infrastructure.** SSE polls the database every 5 seconds;
  it is durable but not a pub/sub service.
- **End-to-end browser and mobile visual verification.** Unit/route tests and
  build pass; a full Playwright or manual responsive pass is still outstanding.
- **Historical Python test baseline.** Collection fails when `fastapi` is absent
  from the Python environment; the Next.js app does not depend on it.

---

## 13. Guardrails

- Synthetic data only. Never upload, ingest or display confidential records.
- Thresholds are illustrative training configuration, not official limits.
- An exception is a review signal, never a finding of misconduct.
- No public write endpoints beyond the audited demo triage and upload paths.
- No generated SQL and no arbitrary query execution in the assistant.
- Local models only; no public model provider or credential fallback.
- Local database access is restricted to loopback port 5433; remote access
  requires TLS.
- Every visible control must work, be clearly labelled as a demo, or be omitted.

---

## 14. Where to read more

| Document | Contents |
| --- | --- |
| [`day-06-nextjs-full/docs/SOURCE_OF_TRUTH.md`](./day-06-nextjs-full/docs/SOURCE_OF_TRUTH.md) | Canonical vocabulary, data flow, catalog, auth and agent rules. |
| [`day-06-nextjs-full/docs/DECISIONS.md`](./day-06-nextjs-full/docs/DECISIONS.md) | Architecture and product decision record. |
| [`day-06-nextjs-full/docs/openapi.yaml`](./day-06-nextjs-full/docs/openapi.yaml) | OpenAPI 3.1 contract. |
| [`day-06-nextjs-full/docs/FEATURE_MATRIX.md`](./day-06-nextjs-full/docs/FEATURE_MATRIX.md) | Capability status with evidence and boundaries. |
| [`day-06-nextjs-full/docs/KNOWN_ISSUES.md`](./day-06-nextjs-full/docs/KNOWN_ISSUES.md) | Environment constraints and workarounds. |
| [`day-06-nextjs-full/docs/PROGRESS.md`](./day-06-nextjs-full/docs/PROGRESS.md) | Verification checkpoints and next steps. |
| [`docs/architecture/`](./docs/architecture/) | Programme-level architecture and acceptance criteria. |
| [`planning/product-roadmap.md`](./planning/product-roadmap.md) | Product vision, page outcomes and delivery order. |
