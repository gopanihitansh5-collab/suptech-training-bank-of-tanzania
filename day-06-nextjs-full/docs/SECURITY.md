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
- Optional language/embedding models must use the explicitly configured
  loopback LM Studio endpoint. No user-supplied provider credentials and no
  public-provider fallback.
- Never copy apparently official names, laws, thresholds or telemetry from
  Stitch mockups into application data.
- The synthetic threshold outputs are review signals only; they do not
  establish misconduct, non-compliance or a regulatory finding.
