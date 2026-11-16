"""The Day 2 API authentication scheme.

The scheme is deliberately the simplest thing that can be defended in a
training prototype, and it is labelled as training-only everywhere it
appears:

* one shared bearer token, read from the ``SUPTECH_API_TOKEN`` environment
  variable;
* no default token. If the environment variable is missing, the API refuses
  to start. A hard-coded default would be a hard-coded credential;
* the comparison is constant time, so a wrong token cannot be found one
  character at a time.

What this scheme is **not**: it is not an identity provider. There are no
users, no roles, no token expiry, no refresh, no revocation and no record of
who asked for what. A production deployment needs all of those, and the
scope note for this repository says so.
"""

from __future__ import annotations

import os
import secrets

API_TOKEN_ENV = "SUPTECH_API_TOKEN"

#: The message returned when a token is missing or wrong. The same message is
#: used for both cases so that the API does not tell an attacker which of
#: the two it was.
INVALID_TOKEN_MESSAGE = (
    "A valid bearer token is required. Set the SUPTECH_API_TOKEN environment "
    "variable on the server and send it as 'Authorization: Bearer <token>'."
)


def token_from_environment() -> str:
    """Return the API token from the environment, or fail loudly.

    The token never travels through a notebook, a repository or a URL. It
    lives in the environment of the machine that runs the API.
    """
    token = os.environ.get(API_TOKEN_ENV, "").strip()
    if not token:
        raise RuntimeError(
            f"{API_TOKEN_ENV} is not set. The Day 2 API refuses to start "
            "without a token: export "
            f'{API_TOKEN_ENV}="<a value you choose>" and start it again. '
            "Do not commit a token to this repository."
        )
    return token


def token_matches(candidate: str, expected: str) -> bool:
    """Compare a presented token with the configured one, in constant time."""
    if not candidate or not expected:
        return False
    return secrets.compare_digest(candidate, expected)
