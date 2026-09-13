"""Shared security helpers: signed respond links and API-key checks.

The one-tap respond links emailed to volunteers carry an HMAC token that binds
the volunteer to the shift, so the public respond endpoints cannot be replayed
for arbitrary (volunteer_id, shift_id) pairs harvested from the API.

Both helpers fail open when their secret is unset so local development works
without env setup; the API logs a prominent warning at startup in that case.
"""

from __future__ import annotations

import hashlib
import hmac

from vshift.config import config


def sign_respond_token(volunteer_id: str, shift_id: str) -> str:
    """Return the HMAC token for a (volunteer, shift) pair, or "" in dev mode."""
    secret = config.respond_token_secret
    if not secret:
        return ""
    message = f"{volunteer_id}:{shift_id}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_respond_token(volunteer_id: str, shift_id: str, token: str) -> bool:
    """Check a respond token against the expected HMAC (constant time)."""
    secret = config.respond_token_secret
    if not secret:
        return True
    expected = sign_respond_token(volunteer_id, shift_id)
    return hmac.compare_digest(expected, token or "")


def api_key_ok(provided: str | None) -> bool:
    """Check the X-API-Key header against API_KEY (constant time)."""
    expected = config.api_key
    if not expected:
        return True
    return hmac.compare_digest(expected, provided or "")
