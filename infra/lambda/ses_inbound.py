"""Lambda: SES inbound email -> Vshift email-reply ingestion.

Triggered by SNS notifications from the SES receipt rule
(`vshift-inbound` rule set, `volshift.xyz` recipients).

Flow:
  1. SNS delivers the SES mail notification (with S3 pointer or raw content).
  2. Extract sender, subject, body (first text part, truncated).
  3. Resolve shift_id from the subject line (expects e.g. "[s001]" or "Shift s001").
  4. POST to the Vshift API /api/ingest/email-reply endpoint.

Env vars (set on the Lambda):
  VSHIFT_API_BASE - e.g. https://api.example.com  (no trailing slash)
  VSHIFT_API_KEY  - optional; sent as X-API-Key header if set
"""

from __future__ import annotations

import email
import json
import logging
import os
import re
import urllib.request

logger = logging.getLogger()
logger.setLevel(logging.INFO)

API_BASE = os.environ.get("VSHIFT_API_BASE", "").rstrip("/")
API_KEY = os.environ.get("VSHIFT_API_KEY", "")

SHIFT_PATTERNS = [
    re.compile(r"\[([A-Za-z0-9_-]{2,64})\]"),
    re.compile(r"[Ss]hift\s+([A-Za-z0-9_-]{2,64})"),
]


def extract_shift_id(subject: str) -> str:
    for pat in SHIFT_PATTERNS:
        m = pat.search(subject or "")
        if m:
            return m.group(1)
    return ""


def extract_text_body(msg: email.message.Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = str(part.get("Content-Disposition", ""))
            if ctype == "text/plain" and "attachment" not in disp:
                try:
                    return part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", errors="replace"
                    )[:4000]
                except Exception:  # noqa: BLE001
                    continue
        return ""
    try:
        return msg.get_payload(decode=True).decode(errors="replace")[:4000]
    except Exception:  # noqa: BLE001
        return str(msg.get_payload())[:4000]


def post_email_reply(subject: str, body: str, sender: str, shift_id: str) -> dict:
    payload = json.dumps(
        {
            "subject": subject,
            "body": body,
            "volunteer_email": sender,
            "shift_id": shift_id,
        }
    ).encode()
    req = urllib.request.Request(
        f"{API_BASE}/api/ingest/email-reply",
        data=payload,
        headers={"Content-Type": "application/json", **({"X-API-Key": API_KEY} if API_KEY else {})},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return {"status": resp.status, "body": resp.read().decode()[:2000]}


def handle_record(record: dict) -> dict:
    sns_msg = json.loads(record["Sns"]["Message"])
    mail = sns_msg.get("mail", {})
    sender = (mail.get("commonHeaders", {}).get("from") or [""])[0]
    # Strip display name: "Jane <jane@x.com>" -> jane@x.com
    m = re.search(r"<([^>]+)>", sender)
    if m:
        sender = m.group(1)

    content = sns_msg.get("content", "")
    subject, body = "", ""
    if content:
        msg = email.message_from_string(content)
        subject = msg.get("Subject", "")
        body = extract_text_body(msg)
    else:
        headers = mail.get("commonHeaders", {})
        subject = (headers.get("subject") or "")

    shift_id = extract_shift_id(subject)
    if not shift_id:
        logger.warning("No shift_id found in subject %r; skipping", subject)
        return {"skipped": True, "reason": "no shift_id in subject"}

    result = post_email_reply(subject, body, sender, shift_id)
    logger.info("Forwarded reply from %s for shift %s: %s", sender, shift_id, result)
    return result


def handler(event: dict, context) -> dict:  # noqa: ANN001, ANN201, ARG001
    results = [handle_record(r) for r in event.get("Records", [])]
    return {"processed": len(results), "results": results}
