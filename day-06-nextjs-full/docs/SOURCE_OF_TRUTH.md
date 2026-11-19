# Day 6 — Single Source of Truth

**Status:** Canonical · **Effective:** 2026-11-18 · **Owner:** Lead / orchestrator

Any agent (human or automated) working on `day-06-nextjs-full` MUST read this
document first and MUST NOT contradict it. When code, comments or other docs
disagree with this file, this file wins and the conflict is a bug to be
recorded in `docs/FINDINGS_LOG.md`.

---

## 1. Product boundary (never violate)

- Every institution, report, threshold, uploaded sample and metric is
  **synthetic or illustrative training material**.
- This is **not** a Bank of Tanzania system and expresses no official
  regulatory policy. Thresholds are "training boundaries", never official
  limits. An exception is a **review signal**, never a finding of misconduct
  or non-compliance.
- Do not use real or Stitch-sample institution values.
- Groq may receive only an explicitly submitted user question and bounded,
  server-derived synthetic aggregate facts after the user confirms the
  synthetic-only notice. Never send document text, source rows, names,
  institution/record identifiers, credentials or other confidential data to
  Groq. Document retrieval answers remain local and extractive.
- Do not modify the existing port-5432 PostgreSQL cluster or the Python
  Day 1–3 sources. Local runs own **loopback port 5433 only** (`db-config.ts`
  enforces this); managed cloud deployments (Vercel) must connect to a
  managed PostgreSQL provider that **explicitly requires TLS**
  (`?sslmode=require|verify-ca|verify-full`), also enforced in
  `db-config.ts`.

## 2. Canonical vocabulary

| Term | Canonical meaning |
| --- | --- |
| **Period** | `YYYY-MM` reporting month, validated by `/^\d{4}-(0[1-9]|1[0-2])$/`. |
| **Indicator** | A computed value per institution-period (grain `institution`) or per sector-period (grain `sector`). Defined in `src/lib/catalog.ts`. |
| **Exception** | A persisted threshold breach (`supervisory_exceptions`), institution grain only. |
| **Open** | Exception `status = 'open'`. This exact set is what the overview "Open review signals" card and the register default filter both count. |
| **Under review** | Exception `status = 'under_review'`. Human decision, never set automatically. |
| **Resolved** | Exception `status = 'resolved'`. Set only by a human action or by reconciliation (see §6). |
| **Latest period** | `MAX(reporting_period)` across `institution_reports`. |

Never rename these words in UI copy or API fields without updating this file
and `docs/openapi.yaml` in the same change.

## 3. Data flow (one direction only)

```
demo-data.ts (deterministic synthetic generator)
      │
      ▼
metrics.ts: computeAnalytics(institutions, reports)
      │  · institution-grain indicators + sector-grain rollups
      │  · threshold evaluation (institution grain only)
      ▼
scripts/seed.ts  ──writes──▶  PostgreSQL (port 5433)
      │                        institutions, institution_reports,
      │                        indicator_definitions, threshold_configurations,
      │                        supervisory_indicators, supervisory_exceptions,
      │                        users (demo user), roles/permissions, audit/system events
      ▼
repository.ts (all SQL lives here) ──▶ app/(dashboard) pages + app/api/* routes
```

Rules:

- **All SQL lives in `src/lib/repository.ts`** (plus `scripts/*`). Pages and
  routes never embed SQL.
- **All indicator formulas and thresholds live in `src/lib/catalog.ts`**
  (`INDICATOR_DEFINITIONS`, `TRAINING_THRESHOLDS`). This TS catalog is the
  **single source of truth for training configuration**. The DB tables
  `indicator_definitions` and `threshold_configurations` are a **read-only
  mirror** written only by the seed script; runtime code must not read
  thresholds from the DB to evaluate breaches (that keeps computation
  deterministic and reviewable in code). If you need DB-driven thresholds,
  first amend this document — do not silently diverge.
- `demo-data.ts` must remain deterministic (no `Math.random()`), because
  seeded results and tests depend on reproducibility.

## 4. Indicator catalog (canonical)

Unit semantics: `TZS bn` = Tanzanian shillings, billions (synthetic);
`%` = percent; `count` = integer count.

Sector-grain aggregation rules (computed in `computeAnalytics`, stored with
`grain='sector'`, `subject_key='SECTOR'`):

| Indicator | Unit | Institution grain | Sector grain (canonical aggregation) |
| --- | --- | --- | --- |
| `deposits` | TZS bn | reported deposits | **sum** across institutions |
| `loans` | TZS bn | reported loans | **sum** across institutions |
| `loan_to_deposit` | % | loans / deposits × 100 | **sum(loans) / sum(deposits) × 100** |
| `deposit_growth` | % | (current − previous period) / previous × 100, **previous must be the consecutive month** | sector sums, same consecutive-month rule |
| `loan_growth` | % | same rule as `deposit_growth` | sector sums, same rule |
| `capital_adequacy` | % | reported ratio | **deposit-weighted mean** |
| `npl_ratio` | % | reported ratio | **deposit-weighted mean** |
| `liquidity` | % | reported ratio | **deposit-weighted mean** |
| `completeness` | % | reported completeness | **simple mean** |
| `quality_failure_rate` | % | rejected / (submitted + rejected) × 100; null when denominator is 0. `records_submitted` and `records_rejected` are disjoint counts (rejected rows are **not** included in submitted). | **sum(rejected) / (sum(submitted) + sum(rejected)) × 100** |
| `late_submission` | count | reported `late_submission_days` | **simple mean** of late days |

Null policy: a derived indicator is `null` (never 0, never ∞) when any
required denominator is 0/missing or when periods are non-consecutive.

## 5. Threshold catalog (canonical, institution grain only)

Evaluation compares the **rounded** observed value (2 dp — the same value
shown to reviewers) with strict `<` / `>`. A value exactly equal to the
boundary is compliant.

| Threshold | Indicator | Operator | Value | Severity |
| --- | --- | --- | --- | --- |
| `TRN-CAR-LOW` | `capital_adequacy` | lt | 10 | critical |
| `TRN-LDR-HIGH` | `loan_to_deposit` | gt | 110 | high |
| `TRN-NPL-HIGH` | `npl_ratio` | gt | 8 | high |
| `TRN-LIQ-LOW` | `liquidity` | lt | 100 | high |
| `TRN-COMP-LOW` | `completeness` | lt | 90 | medium |
| `TRN-DQ-HIGH` | `quality_failure_rate` | gt | 1 | medium |
| `TRN-LATE-HIGH` | `late_submission` | gt | 3 | medium |

## 6. Exception lifecycle & identity

- **ID format:** `EXC-{threshold_id}-{institution_id}-{period}`
  (deterministic ⇒ idempotent re-seeding via `ON CONFLICT`).
- **Lifecycle:** `open → under_review → resolved`. Automation may create
  `open` and may **reconcile**: when a re-seed/recompute shows the breach no
  longer holds, the exception is marked `resolved` with an appended note.
  Automation must never create `under_review`.
- **Reconciliation rule:** seed regenerates the full expected breach set;
  exceptions present in the DB with `status='open'` that are **not** in the
  fresh set are resolved with note `reconciled: breach no longer holds`.
  `under_review` and `resolved` are never overwritten by the seed.
- Exceptions are only ever raised at institution grain. Sector-level breaches
  are intentionally out of scope for the register.

## 7. Auth model

- Env-configured demo identity: `DEMO_USERNAME`, `DEMO_PASSWORD`,
  `AUTH_SECRET` (≥ 32 chars), `DEMO_ROLE` ∈ `viewer | supervisor | admin`.
- Session = HMAC-SHA256 signed, base64url payload cookie
  `suptech_demo_session`, TTL 8 h, `httpOnly`, `sameSite=strict`,
  `secure` in production.
- The login page offers one-click demo access in Preview and Production.
  Production access is public, uses the configured demo identity with the
  `supervisor` role, and is for synthetic training data only. Preview retains the
  configured `DEMO_ROLE`. The endpoint records an audit event and remains
  unavailable in local development. This is not production identity or an
  authorization control.
- The DB tables `users/roles/permissions` are a **demo RBAC mirror**. The
  seed inserts one demo user whose `user_id` equals `DEMO_USERNAME` (fallback
  `demo.supervisor` when the env var is absent at seed time). **If you change
  `DEMO_USERNAME`, re-run `npm run db:seed`** so the mirror matches the
  session identity — Phase 4 ingestion writes reference this user via FK.
- Password login is rate-limited per username (in-memory fixed window, 5
  failures / 5 min → 429). This is a demo boundary control, not a production
  control. One-click demo access is intentionally public and is not rate-limited.
- `viewer < supervisor < admin`; role checks go through
  `requireDemoSession(allowedRoles)` — routes never parse cookies themselves.

## 8. Model and deployment boundary

- The shared page assistant is on-demand and contextual to the active
  dashboard route and allowlisted filters. The server derives page facts from
  PostgreSQL; clients cannot provide aggregate values. Answers are not cached
  or persisted, use bounded follow-up history, cite returned fact IDs, and
  fall back to a deterministic summary when the model is unavailable or fails
  evidence validation.
- `MODEL_PROVIDER=groq` selects Groq. `GROQ_API_KEY` must be a Vercel Secret;
  the default chat model is `openai/gpt-oss-120b`, with the provider's
  configured fallback. Missing credentials remain visible as an unavailable
  Groq configuration and do not silently select LM Studio.
- The Agents module may send the user's explicitly confirmed prompt and
  aggregate dashboard totals to the configured model. Workflow composer
  context is allowlisted aggregate data only. Document excerpts and row-level
  institution, report, and exception details remain server-side.
- `MODEL_PROVIDER=lmstudio` and `LM_STUDIO_BASE_URL` are for local development.
  Vercel does not have the developer's loopback model endpoint; use Groq there.
- Vercel uploads require persistent S3-compatible storage configured with
  `AWS_REGION`, `AWS_ENDPOINT_URL_S3`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`
  and `AWS_SECRET_ACCESS_KEY`. The local filesystem fallback is disabled on
  Vercel; upload health reports storage as unavailable until configured.
- A production deployment also requires `DATABASE_URL` with enforced TLS,
  `AUTH_SECRET` (32+ characters), `DEMO_USERNAME` and `DEMO_PASSWORD`.
  Production one-click login is public supervisor access for synthetic demos,
  not production identity or an authorization system.

## 9. Environment contract

| Variable | Used by | Rules |
| --- | --- | --- |
| `DATABASE_URL` | db.ts | **Local:** `postgres(ql)://…@localhost|127.0.0.1|::1:5433/…`. **Vercel runtime:** managed PostgreSQL URL with TLS (`sslmode=require` or stronger); use Neon's pooled endpoint for application traffic. |
| `DATABASE_URL_UNPOOLED` | scripts/migrate.ts | Preferred direct, non-pooler Neon PostgreSQL URL with TLS for remote migrations. If absent, the migration script accepts `DATABASE_URL` only when it is a direct endpoint and fails closed on pooler hosts. Never use a pooled endpoint for schema migrations. |
| `AUTH_SECRET` | auth | ≥ 32 chars; must not contain `replace-with`. |
| `DEMO_USERNAME` / `DEMO_PASSWORD` | auth | Must not be `replace-before-use`. Username is also the seeded `users.user_id`. |
| `DEMO_ROLE` | auth | Optional, default `supervisor`. |
| `MODEL_PROVIDER` | model-provider.ts | `groq` on Vercel; `lmstudio` is local development only. |
| `GROQ_API_KEY` | model-provider.ts | Required Vercel Secret when Groq is selected; never commit or print its value. |
| `GROQ_CHAT_MODEL` / `GROQ_BASE_URL` | model-provider.ts | Optional Groq model/HTTPS endpoint overrides; defaults are production Groq settings. |
| `AWS_REGION`, `AWS_ENDPOINT_URL_S3`, `AWS_S3_BUCKET` | ingestion-store.ts | Required on Vercel for persistent document uploads. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | ingestion-store.ts | Required storage credentials; provision as deployment secrets only. |
| `LM_STUDIO_BASE_URL` | model-provider.ts | Optional loopback endpoint for local development; not available in Vercel. |

Secrets stay in local `.env` (never committed). `.env.example` carries
placeholders only.

## 10. API contract

- The machine-readable contract is **`docs/openapi.yaml`** (OpenAPI 3.1).
  Any route/param/schema change must update it in the same commit.
- All `/api/*` handlers call `requireDemoSession()` first and return errors
  exclusively through `errorResponse()` (400 validation, 401 auth, 403 role,
  404 not found, 429 rate limit, 503 misconfigured, 500 generic).
- Response envelope for lists: `{ items, page, pageSize, total, totalPages }`.
- Pagination bounds: `page ≥ 1`, `1 ≤ pageSize ≤ 50`.
- `GET /api/report-imports` lists persisted synthetic CSV import batches for
  signed-in sessions. `POST /api/report-imports` requires supervisor/admin,
  exact same-origin `Origin`, multipart CSV, and explicit synthetic-data
  confirmation. Preview before commit; limits are 1 MB, 500 rows and 64
  columns. Required report fields support automatic aliases or explicit
  mapping, valid rows are imported while invalid rows are retained as
  validation results, unmapped columns are stored as metadata, and existing
  institution/period reports are never overwritten. Migration
  `002_report_imports.sql` stores batch/row provenance and audit history.
- `POST /api/assistant/contextual-answer` requires a signed-in session,
  same-origin request and explicit synthetic-only confirmation. It accepts a
  question plus the active dashboard route and allowlisted filters, derives
  aggregate context server-side, returns citations, and disables response
  caching. Never add client-supplied metric values or source rows to this
  request.
- `POST /api/orchestration` also requires synthetic-only confirmation. When
  Groq is selected, prompts are accompanied only by bounded dashboard
  aggregates; document excerpts and row-level records are never sent.

## 11. Agent working rules (multi-agent coordination)

- **File ownership:** an agent edits only the files its task lists. Default
  zones: `metrics.ts`/`catalog.ts`/`demo-data.ts` = logic owner;
  `repository.ts` = data-access owner; `app/**` = UI owner;
  `scripts/*` = pipeline owner; `docs/*` = docs owner. Never edit two zones
  in one task without saying so in the task description.
- **Change protocol:** read this file → implement → run
  `npm run typecheck && npm test` → update `docs/FINDINGS_LOG.md` (new
  findings) and this file (if a canonical decision changed) → only then is
  the slice "done".
- **Conflicts:** if two agents would touch the same file, the orchestrator
  serialises them. No agent merges its own unreviewed work into `main`.
- **No attribution trailers** in commits, and no secrets in prompts, code or
  docs (repository rule).
- **Provenance:** every numeric value rendered in the UI must come from the
  database via `repository.ts` — no hardcoded values in components.
- **Boundaries in §1 are also agent boundaries.** Prompts to reviewer agents
  must contain no credentials, no confidential records and no user documents.

## 12. Verification commands (definition of done)

```sh
npm run typecheck     # tsc --noEmit
npm test              # vitest run
npm run build         # production build (optional per slice)
```

Database slices additionally require `npm run db:migrate && npm run db:seed`
against the port-5433 instance.

## 13. Document map

| Doc | Role |
| --- | --- |
| `docs/SOURCE_OF_TRUTH.md` | This file — canonical decisions. |
| `docs/openapi.yaml` | API contract (OpenAPI 3.1). |
| `docs/FINDINGS_LOG.md` | Timestamped findings register + fix status. |
| `docs/REMEDIATION_PLAN.md` | Structured plan for hardening/remediation waves. |
| `docs/DECISIONS.md` | Historical decision record (narrative). |
| `docs/KNOWN_ISSUES.md` | Environment constraints and workarounds. |
| `.paul/STATE.md` | Current PAUL loop position (phase/plan progress). |
