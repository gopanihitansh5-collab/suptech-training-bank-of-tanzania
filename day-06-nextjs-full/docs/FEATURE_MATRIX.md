# Feature matrix

Status meanings: **implemented/tested**, **implemented/not tested**, **deferred**,
**blocked**. Update this matrix with evidence as features are integrated.

| Capability | Status | Evidence / boundary |
| --- | --- | --- |
| Full-stack Next.js shell | Implemented; final compatibility edits need verification | Day 6 has its own App Router, protected pages and route handlers; production build passed before the final small edits. |
| Isolated PostgreSQL persistence | Implemented and exercised | Compose service uses loopback port 5433, not the existing 5432 cluster; migration and seed reran successfully. |
| Fictional synthetic institutions/reports | Implemented and exercised | Deterministic seed; 12 fictional institutions, 288 reports, 2,880 indicators, 7 illustrative exceptions; no official or live values. |
| Overview and institution directory/detail | Implemented; final compatibility edits need verification | Browser and API smoke tests read persisted records, including report provenance and review signals. |
| Local demo sign-in and protected read APIs | Implemented; final compatibility edits need verification | Signed local session and HTTP-only cookie; not production identity. Logout clears the cookie but does not revoke a copied stateless token. |
| TXT and CSV ingestion with provenance | Deferred | Enable only after parser and upload tests pass. |
| PDF/DOCX/XLSX/JSON uploads | Deferred | Do not display as supported until implemented and tested. |
| Keyword search and citations | Deferred | PostgreSQL lexical retrieval planned. |
| Semantic retrieval | Deferred | Optional local Nomic embeddings; report unavailable if not configured. |
| Assistant analytics | Deferred | Typed allowlisted domain tools; no generated SQL. |
| Report preview and CSV export | Deferred | PDF export is not promised. |
| SSE events | Deferred | Persist event before notification; reconnect/replay required. |
| Health and integration demo | Deferred | Local app/model/database states only; no external BoT connection. |
| Production RBAC, identity and deployment hardening | Deferred | Explicitly out of scope for this training PoC. |
