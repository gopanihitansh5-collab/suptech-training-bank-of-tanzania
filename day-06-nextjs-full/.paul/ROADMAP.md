# Day 6 roadmap

| Phase | Goal | Exit evidence |
| --- | --- | --- |
| 01 — Foundation | Standalone Next.js shell, local demo auth, Postgres migration/seed and health. | App starts; database is isolated; focused tests and API smoke pass. |
| 02 — Supervisory data | Institutions, reports, indicators, thresholds, exceptions and audit. | Server-side filters/pagination and formula tests pass. |
| 03 — Stitch workspace | All nine responsive screens and functional navigation/actions. | Core journeys pass; no dead active controls. |
| 04 — Ingestion | Safe TXT/CSV upload, checksums, jobs, provenance and retry. | Upload, error, duplicate and delete tests pass. |
| 05 — Search and assistant | Lexical/optional local embeddings, citations, allowlisted analytics and persisted trace. | Curated retrieval/grounding tests and offline fallback pass. |
| 06 — Reports and events | Filtered preview/CSV, persisted synthetic events and SSE recovery. | Export matches preview; reconnect/replay tests pass. |
| 07 — Hardening | Security, accessibility, responsive checks and regression evidence. | Limitations and test results documented; no production claims. |
