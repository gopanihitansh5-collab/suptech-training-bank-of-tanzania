# Architecture and product decisions

## 2026-11-17 — Keep Day 6 as a standalone full-stack Next.js application

- **Decision:** Use Next.js App Router, React, TypeScript route handlers and
  server-side domain services for the Day 6 application. Keep the existing
  Python Day 1–3 training materials intact and out of the Day 6 runtime.
- **Reason:** The user explicitly requested the application in Next.js and a
  new Day 6 folder. Reusing the Day 3 UI would retain its FastAPI proxy and
  would not meet that request.
- **Alternatives:** Continue using the Day 3 Next.js frontend with its FastAPI
  backend; rejected for this standalone Day 6 deliverable.
- **Trade-off:** Existing Python analytics are not called at runtime; their
  documented indicator semantics are being ported and tested in TypeScript.

## 2026-11-17 — Isolate PostgreSQL from the existing local service

- **Decision:** Day 6 uses a dedicated PostgreSQL 16 Compose service bound to
  `127.0.0.1:5433`, with its own named volume and SQL migrations.
- **Reason:** No database environment variables are configured. The local
  service on 5432 contains unrelated application schemas and tables.
- **Alternatives:** Reuse the local cluster; rejected because it is unrelated
  and not approved for this PoC. SQLite; rejected because the requested full
  stack needs persistent relational records and a Postgres-compatible search
  path.
- **Safety:** No schema, table, row or extension on port 5432 is changed.

## 2026-11-17 — Synthetic-only records and explicit training thresholds

- **Decision:** Seed deterministic, fictional institutions and reports.
  Display a persistent synthetic-data banner and label all thresholds as
  illustrative training configuration.
- **Reason:** The Stitch HTML contains realistic-looking institution names,
  regulatory citations and operational telemetry that are not verified
  evidence and must not be presented as real.
- **Alternatives:** Copy Stitch sample values; rejected because they could be
  mistaken for official or real supervisory data.

## 2026-11-17 — Local, optional model providers

- **Decision:** The deterministic allowlisted assistant remains the default.
  Optional embeddings and response synthesis may use LM Studio only through a
  configured loopback base URL. No public LLM provider or API-key fallback is
  used.
- **Reason:** Local Qwen and Nomic models are available, but the application
  must not depend on them or send records to an external provider.
- **Trade-off:** Semantic retrieval is reported as unavailable when local
  embeddings are not configured; lexical retrieval remains available.

## 2026-11-17 — Local demo auth, not production identity

- **Decision:** Mutating demo operations require a signed, HttpOnly local
  session configured through environment variables. No built-in credentials
  are committed. Read-only synthetic data can be explored after the demo
  session is configured.
- **Reason:** Uploads and administration are write operations; controls must
  not falsely imply that an unauthenticated public demo is protected.
- **Trade-off:** This is a training boundary, not a substitute for an
  organization identity provider, institution-level authorization or
  production security review.
