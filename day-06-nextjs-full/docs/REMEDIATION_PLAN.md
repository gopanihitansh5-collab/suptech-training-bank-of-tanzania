# Day 6 — Remediation Plan

**Status:** Approved · 2026-11-18 · **Owner:** Lead / orchestrator

**References:** `docs/SOURCE_OF_TRUTH.md` (canonical decisions, §10 working rules),
`docs/FINDINGS_LOG.md` (findings register F-01…F-13), `docs/AGENT_ROLES.md`
(roles), `docs/openapi.yaml` (API contract).

Remediation waves for the Day 6 synthetic SupTech training PoC. File zones
follow SoT §10: one owner per zone, and a wave that touches two zones declares
it here. Finding statuses move `open → fixing → fixed → verified`; every
transition appends a timestamped history entry in `docs/FINDINGS_LOG.md`.
Verification for every wave: `npm run typecheck && npm test` (SoT §11).

## Wave 1 — Logic correctness

**Status:** in progress 2026-11-18
**Goal:** make metrics, thresholds and seeding obey SoT §3–§6 so every number
rendered in the UI is reproducible, reconcilable and null-safe.
**Findings:** F-01, F-02, F-03, F-04, F-05, F-06, F-07
**File zones:** `src/lib/metrics.ts`, `src/lib/catalog.ts`,
`src/lib/metrics.test.ts`, `scripts/seed.ts`, `src/lib/repository.ts`
(analytics read path only).
**Owner role:** Lead / orchestrator (implementation); QA (verification).

### Tasks

- [ ] F-05 — Enforce the consecutive-month rule in growth indicators: growth
      is `null` unless the prior report is exactly the preceding month
      (in progress 2026-11-18).
- [ ] F-03 — Emit sector-grain rollups in `computeAnalytics`
      (`grain='sector'`, `subject_key='SECTOR'`) per the SoT §4 aggregation
      table (in progress 2026-11-18).
- [ ] F-03 — Read `getAnalytics` values from sector grain with an
      institution-grain average fallback when a sector row is absent
      (in progress 2026-11-18).
- [ ] F-04 — Add the `late_submission` indicator and the `TRN-LATE-HIGH`
      threshold (gt 3, medium) to the catalog and evaluation
      (in progress 2026-11-18).
- [ ] F-06 — Compute `calculatePortfolioSummary` over full history and filter
      exceptions to the latest period (in progress 2026-11-18).
- [ ] F-01 — Implement seed-time reconciliation per SoT §6: resolve stale
      open exceptions with note `reconciled: breach no longer holds`; never
      overwrite `under_review`/`resolved` (in progress 2026-11-18).
- [ ] F-07 — Seed the demo `users` row (`DEMO_USERNAME` or fallback
      `demo.supervisor`, valid role) so Phase 4 FK references hold
      (in progress 2026-11-18).
- [ ] F-02 — Keep the TS catalog canonical for thresholds; DB
      `indicator_definitions`/`threshold_configurations` remain a read-only
      seed mirror (in progress 2026-11-18).
- [ ] Unit tests: gap-aware growth, boundary strictness (rounded 2 dp,
      strict `<`/`>`), sector aggregation, late threshold, reconciliation
      semantics (in progress 2026-11-18).

### Acceptance criteria

- Consecutive-month growth rule implemented; non-consecutive or missing prior
  periods yield `null` (never 0 or ∞).
- Sector rollups follow SoT §4; analytics reads sector grain with
  institution-average fallback.
- `late_submission` indicator and `TRN-LATE-HIGH` threshold evaluate with the
  SoT §5 boundary rules.
- Portfolio summary uses full-history context; exceptions filtered to the
  latest period.
- Seed inserts the demo users row; reconciliation makes re-seeding idempotent.
- New unit tests cover gap-aware growth, boundary strictness, sector
  aggregation, the late threshold, and reconciliation semantics.
- `npm run typecheck` and `npm test` pass.

## Wave 2 — Consistency & security

**Status:** in progress 2026-11-18
**Goal:** align "open" semantics across surfaces, add the runtime audit trail
and brute-force protection, and harden search patterns.
**Findings:** F-08, F-09, F-10, F-12
**File zones:** `src/lib/repository.ts` (overview/like paths),
`src/lib/auth.ts`, `src/app/api/auth/login/route.ts`, `src/lib/auth.test.ts`.
Cross-zone task declared per SoT §10 (data-access owner + auth files in one
wave, serialised by the orchestrator).
**Owner role:** Lead / orchestrator (implementation); Security review (sign-off);
QA (verification).

### Tasks

- [ ] F-08 — Overview SQL counts `openExceptions`/`criticalExceptions` and
      selects `recentExceptions` with `status = 'open'`, matching the register
      default (SoT §2) (in progress 2026-11-18).
- [ ] F-09 — Best-effort `audit_events` insert on successful login
      (in progress 2026-11-18).
- [ ] F-10 — Escape `%`/`_` in every ILIKE pattern (institutions, reports and
      exceptions search paths) (in progress 2026-11-18).
- [ ] F-12 — In-memory fixed-window login limiter: 5 failed attempts per
      username per 5 minutes → 429 with `Retry-After` (in progress 2026-11-18).

### Acceptance criteria

- Overview "open" counts equal the register default (`status = 'open'`).
- A successful login writes an `audit_events` row; failures leave the 401 path
  unchanged.
- All ILIKE patterns escaped; search remains parameterized (no injection
  either way).
- 429 rate limit with `Retry-After` verified by unit test; limiter documented
  as a demo boundary control (SoT §7), not a production control.
- `npm run typecheck` and `npm test` pass.

## Wave 3 — Contract & documentation

**Status:** complete 2026-11-18 (this plan and `docs/openapi.yaml` created)
**Goal:** machine-readable API contract and a cross-referenced documentation
set (SoT §9, §12).
**Findings:** F-13
**File zones:** `docs/*` (docs owner).
**Owner role:** Lead / orchestrator; QA (spot-check).

### Tasks

- [x] Create `docs/openapi.yaml` (OpenAPI 3.1) covering all 7 routes —
      login, logout, overview, analytics, institutions, institution detail,
      exceptions — with operationIds, tags, cookie security and the shared
      error envelope (2026-11-18).
- [x] Create `docs/REMEDIATION_PLAN.md` (this file) (2026-11-18).
- [x] Cross-references in place: SoT §9 names `docs/openapi.yaml` as the
      contract, SoT §12 maps the document set, and FINDINGS_LOG F-13 lists
      these deliverables (2026-11-18).
- [ ] Update `README.md` to point to `docs/openapi.yaml`,
      `docs/SOURCE_OF_TRUTH.md`, `docs/FINDINGS_LOG.md` and this plan.

### Acceptance criteria

- `docs/openapi.yaml` validates with an OpenAPI 3.1 validator and describes
  all 7 routes (methods, params, schemas, statuses) matching the post-fix
  behavior.
- SOURCE_OF_TRUTH, FINDINGS_LOG and this plan cross-reference each other.
- README points to the documentation set (remaining).

## Wave 4 — Phase 4 readiness (rehearsal before ingestion)

**Status:** pending
**Goal:** prove the seeded local stack end-to-end before Phase 4 ingestion
writes against it.
**Findings:** F-11 (deferred); verification of F-01…F-13.
**File zones:** local environment configuration only, plus
`docs/TEST_RESULTS.md` (docs owner). No source changes.
**Owner role:** Lead / orchestrator; QA (execution); Security review (auth
boundary confirmation).

### Tasks

- [ ] Create local `.env` from `.env.example`; keep secrets out of Git
      (SoT §8).
- [ ] Run `npm run db:migrate && npm run db:seed` against the port-5433
      instance; confirm the demo users row exists.
- [ ] Seed a second time and confirm reconciliation idempotence, including
      the resolved-then-regressed handling documented in SoT §6.
- [ ] Smoke test all 7 endpoints authenticated and record results in
      `docs/TEST_RESULTS.md`.
- [ ] F-11 — keep seed batching deferred unless the seed exceeds ~30 s;
      revisit then (FINDINGS_LOG status stays `open` until decided).

### Acceptance criteria

- All 7 endpoints return 200 with seeded data when authenticated.
- Seed is idempotent; reconciliation handles resolved-then-regressed breaches
  as documented in SoT §6.
- Findings statuses in `docs/FINDINGS_LOG.md` updated to `verified` with
  timestamped history entries.

## Change control

- Any API shape change (route, parameter, response field, status code) updates
  `docs/openapi.yaml` in the same change (SoT §9).
- Any canonical decision change updates `docs/SOURCE_OF_TRUTH.md` first; code
  and other docs follow it.
- Finding statuses move `open → fixing → fixed → verified`; every transition
  appends a timestamped history entry in `docs/FINDINGS_LOG.md`.
- Waves own disjoint file zones; conflicts are serialised by the Lead /
  orchestrator (SoT §10). No attribution trailers in commits; no secrets in
  code, docs or prompts (repository rule).
