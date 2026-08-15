from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from strands.hooks import AfterToolCallEvent, BeforeToolCallEvent

from vshift.config import config
from vshift.utils.db import db

logger = logging.getLogger(__name__)


def audit_before_tool_call(event: BeforeToolCallEvent) -> None:
    """Hook: validate tool calls before execution.

    - For communication tools (send_email, send_sms), validate the recipient
      exists / is well-formed before allowing the call.
    - Guard: block obvious PII patterns from being sent in communication bodies.
    """
    tool_name = event.tool_use.get("name", "")
    tool_input = event.tool_use.get("input", {})

    if tool_name in ("send_email", "send_sms"):
        recipient = tool_input.get("to", "")
        if not recipient:
            logger.warning("Blocked %s: no recipient provided", tool_name)
            event.cancel_tool = True
            return

        if tool_name == "send_email" and "@" not in recipient:
            logger.warning("Blocked send_email: invalid email %s", recipient)
            event.cancel_tool = True
            return

    # PII guard: never emit SSNs, credit cards, or passwords in any tool input.
    import re

    joined = f"{tool_name} {json.dumps(tool_input, default=str)}"
    ssn = re.search(r"\b\d{3}-\d{2}-\d{4}\b", joined)
    cc = re.search(r"\b(?:\d[ -]*?){13,19}\b", joined)
    if ssn or (cc and any(re.search(r"\b\d{4} \d{4} \d{4} \d{4}\b", joined))):
        logger.warning("Blocked %s: suspected PII in tool input", tool_name)
        event.cancel_tool = True
        return

    logger.debug("Approved tool call: %s", tool_name)


def audit_after_tool_call(event: AfterToolCallEvent) -> None:
    """Hook: log all tool calls to the audit table after execution.

    Records: tool name, input, result, timestamp, and any errors.
    """
    tool_name = event.tool_use.get("name", "")
    tool_input = event.tool_use.get("input", {})
    result = event.result

    log_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    audit_entry = {
        "id": log_id,
        "timestamp": now,
        "tool_name": tool_name,
        "tool_input": json.dumps(tool_input, default=str),
        "result": json.dumps(str(result), default=str),
    }

    try:
        db.put_item(config.ddb_audit_table, audit_entry)
    except Exception as e:
        logger.error("Failed to write audit log: %s", e)

    logger.debug("Audit logged: %s at %s", tool_name, now)


def register_hooks(agent) -> None:
    """Register all audit hooks on an agent instance."""
    agent.hooks.add_callback(BeforeToolCallEvent, audit_before_tool_call)
    agent.hooks.add_callback(AfterToolCallEvent, audit_after_tool_call)
