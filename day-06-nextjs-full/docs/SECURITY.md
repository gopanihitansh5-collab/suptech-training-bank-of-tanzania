# Security and privacy boundaries

- Use synthetic training data only. Do not upload confidential supervisory
  data or personal information.
- Keep PostgreSQL bound to loopback in local development. Public deployment
  is permitted only as a synthetic-data demo; never use confidential or
  operational supervisory data.
- Do not commit `.env`, passwords, session secrets, uploaded files or local
  database data.
- All SQL must be parameterized. LLM output is never SQL and cannot authorize
  a write.
- Uploaded files and retrieved text are untrusted. Enforce size/type limits,
  random storage names, checksums, bounded parsing and safe error messages.
- Production one-click login is public and grants the shared demo identity's
  `supervisor` role, including non-admin review capabilities. It is for
  synthetic demo access only, not an identity provider or production
  authorization system. Admin-only operations must enforce the `admin` role
  independently. Preview uses the configured demo role.
- Groq may receive only an explicitly submitted user question and
  server-derived synthetic aggregates after a visible confirmation. Never
  send document text, source rows, institution/record identifiers, credentials
  or confidential data to the public provider. Document retrieval remains
  local and extractive.
- `MODEL_PROVIDER=groq` is required for Vercel AI calls; missing credentials
  are surfaced as unavailable rather than silently switching providers.
  LM Studio loopback is local-development only. Do not accept provider
  credentials from users.
- Vercel document uploads must use persistent S3-compatible storage. The
  ephemeral function filesystem is not a storage fallback.
- Never copy apparently official names, laws, thresholds or telemetry from
  Stitch mockups into application data.
- The synthetic threshold outputs are review signals only; they do not
  establish misconduct, non-compliance or a regulatory finding.
