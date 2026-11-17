# AI Assistant Instructions

## What I Can Do

- **Read files** — use `view` or `read` tools to read files and directories
- **Edit files** — use `edit` or `create` tools to modify or create files
- **Run commands** — use `bash` to execute shell commands, tests, builds
- **Search code** — use `grep`, `glob`, `semantic_search` to find code
- **GitHub** — use `gh` CLI via bash for GitHub operations
- **Python** — use Pylance tools for type analysis, debugging, profiling
- **Browser** — use browser tools for web UI interaction
- **Planning** — manage todos, create tasks, track progress

## What NOT To Do

- **DO NOT call `read_agent("copilot")`** — this is not a valid agent ID and will fail
- **DO NOT call `read_agent` with any made-up agent ID** — only use IDs from actual task results or notifications
- **DO NOT retry a failed tool call more than once** — if a tool fails, switch to a different approach
- **DO NOT get stuck in loops** — if the same tool fails twice, stop and reassess

## Project Exploration Checklist

When asked to understand a project:

1. **Read the root directory** — use `view` on the project root
2. **Read key files** — `README.md`, `pyproject.toml`, `requirements.txt`, `AGENTS.md`
3. **Explore source directories** — use `view` or `glob` to find source files
4. **Read source files** — use `view` on key Python files
5. **Run tests** — use `bash` to run `pytest` if available
6. **Check the virtual environment** — use `bash` to check `.venv` contents

## Tool Selection Guide

| Task | Use This Tool |
|------|--------------|
| Read a file | `view` with `path` |
| Read a directory | `view` with `path` |
| Search for text | `grep` |
| Find files by pattern | `glob` |
| Run a command | `bash` |
| Edit a file | `edit` |
| Create a file | `create` |
| Explore GitHub | `gh` CLI via `bash` |

## Remember

- Use the **right tool for the job**
- If a tool fails, **try a different tool** — don't retry the same one
- Keep responses **concise and helpful**
- Always **verify** your work
