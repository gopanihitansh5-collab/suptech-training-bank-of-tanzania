# Agent roles

| Role | Assignment | Status |
| --- | --- | --- |
| Lead / orchestrator | Owns scope, architecture, integration, domain/API/UI implementation, testing, security decisions, PAUL state and durable docs. | Active |
| Local Qwen reviewer | Bounded read-only review of a scoped code slice; no credentials or edits. | Phase 1 attempt failed before response due to context overflow; no findings were returned. |
| QA | Orchestrator runs focused unit, database, route, build, model-readiness and page smoke checks after each slice. | Active |
| Security review | Orchestrator checks local auth, database isolation, uploads, prompt injection and model boundaries; use a dedicated reviewer for explicit security reviews. | Ongoing |
| Local Nomic embeddings | Local-only inference for the planned retrieval phase; not a code-editing agent and not yet integrated into the app. | Endpoint verified; integration deferred |

Keep agent scopes small, independently verifiable and non-overlapping. The
first delegated dataset-generation attempt exceeded the local model context
limit and did not edit the file; the orchestrator implemented the deterministic
dataset directly. The Phase 1 Qwen review also failed before its first response
because the prompt exceeded the model context. Do not treat that failed
attempt as independent approval. Never include local credentials, confidential
supervisory records, or user documents in agent prompts.
