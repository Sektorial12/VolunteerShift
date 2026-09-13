"""Shared security helpers: signed respond links, API-key checks, redaction.

The one-tap respond links emailed to volunteers carry an HMAC token that binds
the volunteer to the shift, so the public respond endpoints cannot be replayed
for arbitrary (volunteer_id, shift_id) pairs harvested from the API.

The dashboard is a public demo surface: every response it consumes is passed
through the ``public_*`` helpers below, which mask volunteer PII and strip
respond tokens from free text. The raw records stay in DynamoDB; only the API
boundary is sanitized.

Both gates fail open when their secret is unset so local development works
without env setup; the API logs a prominent warning at startup in that case.
"""

from __future__ import annotations

import hashlib
import hmac
import re

from vshift.config import config

_TOKEN_RE = re.compile(r"token=[A-Za-z0-9._-]+")
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"\+\d{10,15}")


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


def mask_email(email: str) -> str:
    """jane@example.org -> j***@example.org"""
    email = (email or "").strip()
    if "@" not in email:
        return email
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


def mask_phone(phone: str) -> str:
    """+15550001111 -> +1***11"""
    phone = (phone or "").strip()
    if len(phone) < 5:
        return phone
    return f"{phone[:2]}***{phone[-2:]}"


def redact_text(text: str) -> str:
    """Redact respond tokens, emails, and phone numbers from free text."""
    text = _TOKEN_RE.sub("token=redacted", text or "")
    text = _EMAIL_RE.sub(lambda m: mask_email(m.group(0)), text)
    text = _PHONE_RE.sub(lambda m: mask_phone(m.group(0)), text)
    return text


def public_volunteer(volunteer: dict) -> dict:
    """Volunteer record with PII masked for the public dashboard."""
    out = dict(volunteer)
    out["email"] = mask_email(volunteer.get("email", ""))
    out["phone"] = mask_phone(volunteer.get("phone", ""))
    out["notes"] = ""
    return out


def public_communication(comm: dict) -> dict:
    """Communication record with respond tokens redacted from the body."""
    out = dict(comm)
    out["content"] = redact_text(comm.get("content", ""))
    return out


def public_audit(entry: dict) -> dict:
    """Audit entry with tokens/emails/phones redacted from input and result."""
    out = dict(entry)
    out["tool_input"] = redact_text(entry.get("tool_input", ""))
    out["result"] = redact_text(entry.get("result", ""))
    return out
