# Security and privacy boundaries

- Use synthetic training data only. Do not upload confidential supervisory
  data or personal information.
- Keep the app and PostgreSQL port bound to loopback in local development.
  Do not deploy the demo to a public network.
- Do not commit `.env`, passwords, session secrets, uploaded files or local
  database data.
- All SQL must be parameterized. LLM output is never SQL and cannot authorize
  a write.
- Uploaded files and retrieved text are untrusted. Enforce size/type limits,
  random storage names, checksums, bounded parsing and safe error messages.
- Mutating actions require the configured local demo session and an audit
  record. This local demo auth is not an identity provider or production
  authorization system.
- Optional language/embedding models must use the explicitly configured
  loopback LM Studio endpoint. No user-supplied provider credentials and no
  public-provider fallback.
- Never copy apparently official names, laws, thresholds or telemetry from
  Stitch mockups into application data.
- The synthetic threshold outputs are review signals only; they do not
  establish misconduct, non-compliance or a regulatory finding.
