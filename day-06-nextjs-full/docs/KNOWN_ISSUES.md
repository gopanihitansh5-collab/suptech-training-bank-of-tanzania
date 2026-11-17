# Known issues and workarounds

- **Existing Python baseline:** The repository test collection fails because
  `fastapi` is not installed in the selected Python environment. The Day 6
  application does not depend on that environment. Do not install Python
  packages merely to make the new Next.js app run.
- **Existing PostgreSQL service:** The default local cluster on port 5432
  contains unrelated application tables. It is intentionally not used. Day 6
  Compose maps its private database to loopback port 5433.
- **Optional local models:** LM Studio may unload or run out of memory. The
  assistant must remain deterministic, show provider state honestly and
  return lexical results when embeddings or chat are unavailable.
- **Format support:** Only formats listed as implemented and tested in
  `FEATURE_MATRIX.md` may be offered by the upload control.
- **Demo auth:** Environment-configured local credentials and signed cookies
  are not production identity or institution-level authorization.
