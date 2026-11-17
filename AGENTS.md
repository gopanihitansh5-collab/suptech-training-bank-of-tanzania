# Repository contribution rules

## Commit identity

- Use the repository owner's already configured Git identity for commits.
- Do not add `Co-authored-by` trailers or other commit attribution for Copilot,
  subagents, AI agents, or automation.
- Do not rewrite pushed history unless the owner explicitly requests it.
- Before pushing, verify the commit author and inspect the commit message for
  unwanted co-author attribution.

## Credentials

- Never add API tokens, personal access tokens, passwords, private keys or
  other secrets to source files, documentation, tests, command examples or Git.
- Keep secrets in the appropriate local/Vercel environment configuration and
  use placeholders in documentation.
- Do not print or inspect the contents of local credential files. Keep known
  credential files ignored by Git.
