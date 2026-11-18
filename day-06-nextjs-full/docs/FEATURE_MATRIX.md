# Feature matrix

Status meanings: **implemented/tested**, **implemented/not tested**, **deferred**,
**blocked**. Update this matrix with evidence as features are integrated.

| Capability | Status | Evidence / boundary |
| --- | --- | --- |
| Full-stack Next.js shell | Implemented and tested | Day 6 has its own App Router, protected pages and route handlers; all nine workspace modules render in the shared shell. |
| Isolated PostgreSQL persistence | Implemented and exercised | Compose service uses loopback port 5433, not the existing 5432 cluster; migration and seed reran successfully. |
| Fictional synthetic institutions/reports | Implemented and exercised | Deterministic seed; 12 fictional institutions, 288 reports, 2,880 indicators, 7 illustrative exceptions; no official or live values. |
| Overview and institution directory/detail | Implemented and tested | Page/API smoke checks read persisted records, including report provenance and review signals; unknown IDs return 404. |
| Local demo sign-in and protected read APIs | Implemented and tested | Signed local session and HTTP-only cookie; not production identity. Logout clears the cookie but does not revoke a copied stateless token. |
| Supervisory analytics | Implemented and tested | Database-backed indicator values, catalog formulas, period/indicator filters and 12-period portfolio trend; synthetic/training notice visible. |
| Read-only exception register | Implemented and tested | Parameterized filters, bounded pagination, severity/status, linked institution history and source report IDs; no write/triage actions. |
| Custom report preview | Implemented and tested | Period/institution filters preview persisted synthetic report records; saved templates, CSV export and dispatch remain deferred. |
| Data Explorer | Implemented and tested | Searchable, paginated report inventory with institution-history links; upload and ingestion actions remain deferred. |
| Assistant module screen | Implemented and tested | Honest capability page links to existing analytics and exception workflows; no chat, retrieval or generated answer is active. |
| Integrations and system health screen | Implemented and tested | Probes the isolated Day 6 database; local models and external systems are explicitly not connected by the app. |
| Administration and settings screen | Implemented and tested | Shows read-only demo session details and unavailable write capabilities; no user or policy mutation. |
| TXT and CSV ingestion with provenance | Deferred | Enable only after parser and upload tests pass. |
| PDF/DOCX/XLSX/JSON uploads | Deferred | Do not display as supported until implemented and tested. |
| Keyword search and citations | Deferred | PostgreSQL lexical retrieval planned. |
| Semantic retrieval | Deferred; local model verified | Nomic embeddings respond locally with 768 dimensions; retrieval pipeline is not yet integrated. |
| Assistant analytics | Deferred | Typed allowlisted domain tools; no generated SQL. The assistant screen is informational only. |
| Report preview and CSV export | Deferred | PDF export is not promised. |
| SSE events | Deferred | Persist event before notification; reconnect/replay required. |
| Health and integration demo | Deferred | Local app/model/database states only; no external BoT connection. |
| Production RBAC, identity and deployment hardening | Deferred | Explicitly out of scope for this training PoC. |
