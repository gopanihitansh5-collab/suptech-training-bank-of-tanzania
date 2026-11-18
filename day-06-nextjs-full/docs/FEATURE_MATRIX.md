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
| Supervisory analytics | Implemented and tested | Database-backed indicator values, catalog formulas, period/indicator filters and 12-period portfolio trend; keyboard-operable chart series toggles and synthetic/training notice. |
| Read-only exception register | Implemented and tested | Parameterized filters, bounded pagination, severity/status, linked institution history and source report IDs; no write/triage actions. |
| Custom report preview and CSV download | Implemented and tested | Filtered persisted synthetic reports are previewed and exported with the same period/institution filters; saved templates and dispatch remain deferred. |
| Data Explorer | Implemented and tested | Persisted table counts, expandable table/schema details, latest period and explicit unavailable validation/history states; searchable paginated report inventory with institution links. |
| Keyword search and source preview | Implemented and tested | Searches existing stored document chunks and structured reports/institutions; citations link to a bounded 4,000-character source preview. Upload/ingestion remains deferred. |
| Assistant module | Implemented and tested | Deterministic plan review, explicit execution confirmation, session-only conversation, and typed allowlisted read-only tools for overview, exceptions, institutions and analytics; no generated SQL or model planning. Ranking, comparisons and document retrieval remain deferred. |
| Local Agents module | Implemented and tested | Optional LM Studio calls are limited to loopback, fixed supervisory roles, bounded prompts/timeouts and validated responses. No database records are added to prompts; public model providers are disabled. |
| Integrations and system health screen | Implemented and tested | Probes the isolated Day 6 database and configured local model endpoint; external systems are explicitly unavailable. |
| Administration and settings screen | Implemented and tested | Shows read-only demo session details and unavailable write capabilities; no user or policy mutation. |
| TXT and CSV ingestion with provenance | Deferred | Enable only after parser and upload tests pass. |
| PDF/DOCX/XLSX/JSON uploads | Deferred | Do not display as supported until implemented and tested. |
| Document upload and ingestion | Deferred | Existing stored document chunks can be searched and previewed; upload, parsing, checksum and ingestion-run workflow are not implemented. |
| Semantic retrieval | Deferred; local model verified | Nomic embeddings respond locally with 768 dimensions; retrieval pipeline is not integrated. |
| Assistant ranking, comparison and document-grounded answers | Deferred | Current deterministic planner supports a bounded set of read-only data operations; unsupported intents fail closed. |
| Saved report templates, PDF export and dispatch | Deferred | CSV download is implemented; PDF export and external dispatch are not promised. |
| SSE events | Deferred | Persist event before notification; reconnect/replay required. |
| Durable event stream, ingestion history and validation findings | Deferred | No event replay or persisted ingestion/validation audit history. |
| Health and external integrations | Partial | Local app/database/model states only; no external BoT or Java service connection. |
| Production RBAC, identity and deployment hardening | Deferred | Explicitly out of scope for this training PoC. |
