# Test results

## Baseline — 2026-11-17

| Command | Expected | Actual |
| --- | --- | --- |
| `.venv/bin/python -m pytest` | Existing repository tests collect and run. | **Blocked:** collection errors in `tests/test_day2_api.py` and `tests/test_day3_live.py`; `ModuleNotFoundError: fastapi`. No tests completed. |
| `node --version` | Node 22+ for Day 6. | Passed: v22.22.0. |
| Local PostgreSQL discovery | Inspect without modifying. | Port 5432 accepts connections; metadata shows unrelated schemas/tables. No Day 6 migration or write was run there. |
| LM Studio model listing | Check local optional model availability. | Qwen 3.6 and Nomic embedding model IDs are advertised on loopback. Inference is not yet verified by Day 6. |

## Day 6

### Initial vertical slice — 2026-11-18

| Command / check | Expected | Actual |
| --- | --- | --- |
| `npm test` | Focused Day 6 unit tests pass. | **Passed:** 3 files, 9 tests. |
| `npm run typecheck` | Strict TypeScript check passes. | **Passed** after final compatibility edits. |
| `npm run build` | Optimized Next.js build succeeds. | **Passed** after final compatibility edits; expected App Router and API routes generated. |
| `npm audit --omit=dev` | No known production dependency advisories. | **Passed:** 0 vulnerabilities. |
| Database container | Isolated Day 6 database remains reachable. | **Passed:** healthy container, bound only to `127.0.0.1:5433`. Port 5432 was not accessed for writes. |
| Migration and seed | Apply/confirm schema and persist deterministic fictional data. | **Passed:** migration `001_initial` already applied; seed reported 12 institutions, 288 reports, 2,880 indicators and 7 illustrative exceptions. |
| Protected API smoke | Enforce local sign-in and return persisted, validated data. | **Passed:** unauthenticated 401; invalid credentials 401; login 200; overview/search/detail 200; invalid pagination/period 400; missing institution 404; invalid identifier 400; logout expires cookie and no-cookie request returns 401. |
| Server-rendered page smoke | Signed-in pages render data and unknown IDs are not found. | **Passed:** `/`, `/institutions`, `/institutions/TZ004` returned 200; `/institutions/NOPE` returned 404. |
| Prior browser smoke | Visually inspect first slice and source-linked details. | **Passed:** overview, 12-entry directory and `TZ004` detail rendered. The browser handle was unavailable after resume; the final pass used HTTP checks for the same pages. |
| Local Qwen chat | Confirm local chat inference is usable. | **Passed:** LM Studio returned the expected `QWEN_READY` response from `qwen/qwen3.6-35b-a3b`. |
| Local Nomic embeddings | Confirm local embedding inference is usable. | **Passed:** `text-embedding-nomic-embed-text-v1.5` returned a finite 768-dimension vector. Retrieval is not yet integrated into the app. |
| Logout token replay probe | Determine behavior if an old token is manually replayed. | A copied stateless signed token remains valid until expiry even after browser-cookie deletion. This is documented as a local-demo limitation; no server-side revocation is implemented. |

### Analytics and exception register — 2026-11-18

| Command / check | Expected | Actual |
| --- | --- | --- |
| `npm test` | Focused Day 6 tests pass. | **Passed:** 4 files, 12 tests, including malformed periods, unknown indicators, invalid severities, page bounds, long search, and institution-ID validation. |
| `npm run typecheck` | Strict TypeScript check passes. | **Passed.** |
| `npm run build` | Optimized app build includes analytics and exceptions. | **Passed:** `/analytics`, `/exceptions`, and both protected API routes generated. |
| Protected API smoke | Enforce session and return filtered persisted data. | **Passed:** unauthenticated routes 401; valid login; analytics period/indicator query returned 200 with a value and 12 history periods; filtered exception query returned the matching synthetic signal. |
| Invalid API filters | Reject malformed indicator, severity, page size, and institution ID. | **Passed:** each tested invalid filter returned 400. Invalid period and overlong search have focused repository tests. |
| Server-rendered page smoke | Render analytics and filtered exception pages with training notices. | **Passed:** `/analytics`, `/exceptions`, and filtered `/exceptions` returned 200 and included the synthetic/training notice. |
| Service/API error handling | Surface validation and service failures; do not disguise failures as empty data. | **Passed by code-path inspection:** validation maps to 400; generic service failures are logged and return 500. No live database-outage injection was performed. |

### Stitch workspace — 2026-11-18

| Command / check | Expected | Actual |
| --- | --- | --- |
| `npm test` | Focused tests pass for report-list validation. | **Passed:** 4 files, 13 tests. |
| `npm run build` | All nine workspace modules compile. | **Passed:** Next.js generated the five added routes and all existing routes. |
| Authenticated route smoke | All nine navigation destinations render inside the shared shell. | **Passed:** `/`, `/institutions`, `/analytics`, `/exceptions`, `/reports`, `/data-explorer`, `/assistant`, `/system-health`, and `/settings` returned 200. |
| Report preview and explorer filters | Query the seeded report set and preserve institution provenance. | **Passed:** filtered `TZ004` / `2026-10` queries returned the matching report ID on both pages. |
| Invalid filters | Reject invalid periods and unsafe page numbers explicitly. | **Passed:** both pages rendered an explicit invalid-filter response; repository tests cover validation before database access. |
| Capability disclosure | Do not imply unfinished chat, uploads, export, settings writes or external integrations. | **Passed:** assistant/settings pages are explicit; the health page showed the live Day 6 database as connected and models/external systems as not connected. |

### Known demo authentication limitation

A copied stateless signed token remains valid until its eight-hour expiry even
after the browser cookie is cleared. This does not affect the normal browser
logout flow but is not a production revocation strategy.
