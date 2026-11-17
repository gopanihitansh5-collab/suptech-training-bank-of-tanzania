# Day 6 — SupTech Monitor (Next.js)

Day 6 is a standalone, full-stack Next.js training PoC. Next.js App Router
pages and route handlers are the application boundary; TypeScript services
perform analytics, ingestion, retrieval and reporting; PostgreSQL stores the
demo records and audit trail.

The earlier Python training days remain unchanged. Day 6 does not depend on
their runtime or proxy API requests to FastAPI.

> Every institution, report, threshold and uploaded sample in this application
> is synthetic or illustrative. It is not a Bank of Tanzania system, does not
> express official regulatory policy, and must not be used with confidential
> supervisory data.

## Local setup

Requirements: Node.js 22+, npm, Docker with Compose, and a local `.env` file.

1. Copy `.env.example` to `.env`. Replace the local database password, demo
   password and `AUTH_SECRET` before starting. Generate a session secret with
   `openssl rand -base64 32`.
2. Install dependencies and start the isolated PostgreSQL service:

   ```sh
   npm install
   docker compose up -d db
   npm run db:migrate
   npm run db:seed
   ```

3. Start the app, bound to loopback:

   ```sh
   npm run dev
   ```

Open <http://127.0.0.1:3000>. Sign in with the local demo username and password
from `.env`. The database container binds only to `127.0.0.1:5433`; it does not
reuse or modify the unrelated PostgreSQL instance on port 5432.

`ENABLE_DEMO_UPLOADS=true` enables local demo uploads for the explicitly
supported formats. Keep it disabled unless you are using synthetic training
documents. Do not expose this PoC to the public internet.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run Next.js on loopback. |
| `npm run typecheck` | Type-check the application. |
| `npm test` | Run focused unit and route tests. |
| `npm run build` | Type-check and create the production build. |
| `npm run db:migrate` | Apply additive, versioned SQL migrations to the configured Day 6 database. |
| `npm run db:seed` | Idempotently seed the synthetic training dataset. |

## Product boundaries

- The application has nine modules matching the supplied Stitch references.
- Read endpoints and all analytics use persisted demo records; values are not
  hardcoded in page components.
- The default assistant is deterministic and uses allowlisted tools. It never
  generates or executes SQL. Optional local LM Studio models are configurable
  through `.env`; there is no public model-provider fallback.
- Document ingestion is limited to the formats named in the feature matrix.
- Thresholds are training configuration, not official limits. An exception is
  a review signal, not a finding of misconduct or non-compliance.
- Authentication is a local demonstration boundary, not a production identity
  system. No real access-control or deployment-readiness claim is made.

See `docs/` for the decision record, implementation plan, feature matrix,
known issues and verification evidence.
