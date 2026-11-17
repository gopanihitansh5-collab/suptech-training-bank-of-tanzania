# Test results

## Baseline — 2026-11-17

| Command | Expected | Actual |
| --- | --- | --- |
| `.venv/bin/python -m pytest` | Existing repository tests collect and run. | **Blocked:** collection errors in `tests/test_day2_api.py` and `tests/test_day3_live.py`; `ModuleNotFoundError: fastapi`. No tests completed. |
| `node --version` | Node 22+ for Day 6. | Passed: v22.22.0. |
| Local PostgreSQL discovery | Inspect without modifying. | Port 5432 accepts connections; metadata shows unrelated schemas/tables. No Day 6 migration or write was run there. |
| LM Studio model listing | Check local optional model availability. | Qwen 3.6 and Nomic embedding model IDs are advertised on loopback. Inference is not yet verified by Day 6. |

## Day 6

### Initial vertical slice — 2026-11-17

| Command / check | Expected | Actual |
| --- | --- | --- |
| `npm test` | Focused Day 6 unit tests pass. | **Passed before final UI compatibility edits:** 3 files, 9 tests. |
| `npm run typecheck` | Strict TypeScript check passes. | **Passed before final UI compatibility edits.** Must rerun after the last edits documented in `PROGRESS.md`. |
| `npm run build` | Optimized Next.js build succeeds. | **Passed before final UI compatibility edits.** Next.js 16 updated `tsconfig.json` to `react-jsx` and added `.next/dev/types/**/*.ts`; rerun after the last edits. |
| `npm run db:migrate` | Apply or confirm the isolated schema migration. | **Passed:** migration `001_initial` was already applied on the Day 6 database at loopback port 5433. |
| `npm run db:seed` | Persist deterministic fictional data. | **Passed:** 12 institutions, 288 reports, 2,880 indicators and 7 illustrative exceptions. |
| Browser overview | Sign-in reaches a database-backed dashboard with synthetic labeling. | **Passed before final UI compatibility edits:** displayed reporting period `2026-10`, 12 institutions, 12 reports, 2 open review signals, deposits, completeness, trend chart and recent signals. |
| Browser directory/detail | Searchable register links to source-linked institution history. | **Passed before final UI compatibility edits:** 12 entities; `TZ004` showed 12 monthly reports and one review signal. |
| API auth/data smoke | Protect data APIs and return validated persisted records. | **Passed:** no-session overview 401; login 200; overview/search/detail 200; invalid period 400; logout cookie expiry confirmed and a request without the cookie returned 401. |
| Logout token replay probe | Determine behavior if an old token is manually replayed. | A copied stateless signed token remains valid until expiry even after browser-cookie deletion. This is documented as a local-demo limitation; no server-side revocation is implemented. |

The final changes to the error boundary, institution parameter handling,
repeated search parameters and pagination controls were applied after these
checks and remain unverified. See the exact next steps in `PROGRESS.md`.
