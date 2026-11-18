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
