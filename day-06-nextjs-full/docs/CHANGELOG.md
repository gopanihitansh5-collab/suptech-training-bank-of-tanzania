# Changelog

## Unreleased

- Started a separate Day 6 full-stack Next.js application so the existing
  Python training days and Day 3 dashboard remain intact.
- Added the initial delivery plan, architecture decisions, feature matrix,
  agent roles, known issues and baseline verification record.
- Chose an isolated local PostgreSQL service on loopback port 5433 after
  discovering unrelated data on the pre-existing local cluster.
- Completed and verified the first authenticated, database-backed overview
  and institution-directory vertical slice; verified local Qwen chat and
  Nomic embedding inference for future scoped orchestration/retrieval work.
- Added protected database-backed analytics and a read-only exception
  register, with validated filters, bounded pagination, synthetic notices,
  and report/institution provenance.
- Added report preview, Data Explorer, assistant capability, local health and
  read-only settings screens; all nine modules now share protected navigation.
- Hardened the Phase 1–3 business logic after a full scan (see
  `docs/FINDINGS_LOG.md`): gap-aware growth indicators, sector-grain indicator
  rollups with canonical aggregation rules, a `late_submission` indicator and
  review threshold, exception reconciliation during re-seeding, a seeded demo
  user so Phase 4 ingestion can satisfy the `uploaded_by` foreign key, and a
  consistent `open` exception definition across overview and register.
- Hardened auth and observability: login rate limiting with `Retry-After`,
  runtime audit events on sign-in, and escaped ILIKE search patterns.
- Added the coordination and contract set: `docs/SOURCE_OF_TRUTH.md` (single
  source of truth for decisions, vocabulary and agent rules),
  `docs/openapi.yaml` (OpenAPI 3.1 contract for all seven API routes),
  `docs/REMEDIATION_PLAN.md` (wave-based plan) and `docs/FINDINGS_LOG.md`
  (timestamped findings register).
