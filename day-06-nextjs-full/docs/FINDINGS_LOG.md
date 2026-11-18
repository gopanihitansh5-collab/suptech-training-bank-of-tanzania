# Findings log — Day 6 code & security scan

**Scan executed:** 2026-11-18 05:50 UTC · **Scope:** Phases 1–3 logic, data access, auth, seed, pages (`day-06-nextjs-full`)
**Method:** Manual review of `src/lib/*`, `src/app/**`, `scripts/seed.ts`, `src/db/migrations/001_initial.sql` against `docs/SOURCE_OF_TRUTH.md`.

Status values: `open` → `fixing` → `fixed` → `verified` (verified = typecheck + tests pass after the fix). Each status change appends a timestamped entry in that finding's history.

| ID | Sev | Area | Finding | Planned fix | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | High | metrics/seed | Exceptions never reconcile: `computeAnalytics` only creates `status='open'`; corrected reports leave stale breaches open forever. | Seed-time reconciliation per SoT §6 (resolve open exceptions no longer in the fresh breach set). | fixed |
| F-02 | High | metrics/DB | Threshold dual source of truth: `threshold_configurations` seeded but evaluation uses TS constant only. | Decision recorded in SoT §3: TS catalog is canonical; DB tables are a read-only mirror. | fixed |
| F-03 | High | metrics/repository | Sector grain never populated; `getAnalytics` averages institution values (wrong for sums; unweighted for ratios). | `computeAnalytics` emits sector rollups per SoT §4; `getAnalytics` reads `grain='sector'` with institution-average fallback. | verified |
| F-04 | Medium | metrics/catalog | `late_submission_days` is modeled but no indicator/threshold consumes it. | New indicator `late_submission` + threshold `TRN-LATE-HIGH` (gt 3 → medium). | verified |
| F-05 | High | metrics | Growth indicators compare across period gaps silently. | Consecutive-month rule: growth is null unless the prior report is exactly the preceding month. | verified |
| F-06 | Medium | metrics | `calculatePortfolioSummary` computes analytics on current period only, so growth context is lost (latent inconsistency). | Compute over full history, filter exceptions to latest period. | verified |
| F-07 | High | seed | `users` table never seeded; `uploaded_documents.uploaded_by` FK will break Phase 4 ingestion. | Seed inserts demo user (`DEMO_USERNAME` or `demo.supervisor`, valid role). | fixed |
| F-08 | Medium | repository | "Open" means two things: overview counts `status != 'resolved'`, register default filters `status = 'open'`. | Overview SQL counts `status = 'open'` (matches register default; SoT §2). | fixed |
| F-09 | Medium | auth | No runtime audit trail: `audit_events` written only by seed; sign-in is unaudited. | Best-effort `audit_events` insert on successful login. | fixed |
| F-10 | Low | repository | ILIKE patterns don't escape `%`/`_`; user search can misbehave (no injection — parameterized). | `escapeLike()` applied to all three search paths. | fixed |
| F-11 | Low | seed | Row-by-row INSERTs (~3k statements) make reseeds slow. | Deferred: acceptable for PoC volume; revisit if seed exceeds ~30 s. | open |
| F-12 | Medium | auth | No rate limiting on `POST /api/auth/login` (brute-force surface on local demo). | In-memory fixed-window limiter: 5 failures / 5 min per username → 429 + Retry-After. | verified |
| F-13 | Medium | process | No API contract, no single source of truth, no multi-agent protocol. | `docs/openapi.yaml`, `docs/SOURCE_OF_TRUTH.md`, `docs/REMEDIATION_PLAN.md`, agent rules in SoT §10. | fixed |
| F-14 | High | db-config | Connection guard rejects every managed cloud Postgres, so the Vercel deployment of Day 6 would fail on every database call. | Guard now allows managed providers that explicitly require TLS (`?sslmode=require`); local loopback:5433 rule unchanged. | verified |

**Environment notes (not findings):** `node_modules` was absent after pull (fresh checkout) — `npm install` required before verification. The in-repo `AGENTS.md` Next.js doc pointer (`node_modules/next/dist/docs/`) is therefore unreadable until install; all edits reuse existing in-repo patterns only.

**Status legend:** `fixed` = implemented, typecheck + unit tests pass, but not yet exercised against a live port-5433 database (Wave 4 smoke); `verified` = additionally covered by new unit tests asserting the fixed behavior; `open` = deferred with rationale.

## History

- 2026-11-18 05:50 UTC — scan recorded, F-01…F-13 opened.
- 2026-11-18 06:03 UTC — remediation applied across 9 files by five scoped agents (docs, logic, data-access, pipeline, security) with disjoint file ownership (SoT §10): F-02/F-13 decisions + contract written; F-01/F-07 seed changes; F-03/F-04/F-05/F-06 metrics changes; F-08/F-10 repository changes; F-09/F-12 auth changes. `npm run typecheck` clean; `npm test` 22/22 pass (9 new tests). One integration defect caught by typecheck (out-of-scope use of `reconciledCount` in `scripts/seed.ts`) and fixed by the orchestrator. F-01/F-07/F-08/F-09/F-10 marked `fixed` pending Wave 4 live-DB smoke; F-03/F-04/F-05/F-06/F-12 marked `verified`.
- 2026-11-18 07:10 UTC — F-14 opened during deployment review: `assertSafeDatabaseUrl` rejected all managed providers, making the planned Vercel deployment of Day 6 impossible. Guard extended: managed providers allowed only with explicit TLS (`sslmode=require|verify-ca|verify-full`); local loopback:5433 rule unchanged. `npm run typecheck` clean; `npm test` 24/24 pass (2 new guard tests). Marked `verified`. SoT §1/§8 updated with the managed-deployment boundary.
