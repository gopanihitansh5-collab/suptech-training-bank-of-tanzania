# Agent roles

| Role | Assignment | Status |
| --- | --- | --- |
| Lead / orchestrator | Owns scope, architecture, integration, domain/API/UI implementation, testing, security decisions and durable docs. | Active |
| Qwen local agent | Create only `src/lib/demo-data.ts`: pure deterministic synthetic institution and report data. | In progress |
| QA | Main orchestrator runs focused unit, database, route, build and UI verification after each slice. | Active |
| Security review | Main orchestrator checks local auth, database isolation, uploads, prompt injection and external model boundaries. | Ongoing |

No second agent owns the same files or reviews the same bounded data-generation
task. The Qwen assignment contains no credentials, user files or private
application data.
