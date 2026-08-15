"""Reliability hooks that make agent tool-calling more robust.

Mistral and other models occasionally finish a turn by *describing* a tool call
in text instead of actually invoking it (e.g. the reporter printing
``query_shifts{...}`` as its final answer, or returning before calling a
required tool). These hooks detect that a required tool was never invoked and
automatically resume the agent with a corrective instruction.

Usage:
    register_reliability_hooks(agent, required_tools=[...], resume_prompt=...)
"""

from __future__ import annotations

import logging
from typing import Any

from strands.hooks import AfterInvocationEvent, AfterToolCallEvent

logger = logging.getLogger(__name__)


def register_reliability_hooks(
    agent,
    required_tools: list[str],
    resume_prompt: str,
    max_resumes: int = 2,
) -> None:
    """Register reliability hooks on an agent.

    Tracks every tool call across the whole invocation (including resume cycles,
    so state lives in a closure rather than invocation_state which may reset).
    If the agent finishes without invoking every required tool, it is resumed
    with ``resume_prompt`` up to ``max_resumes`` times.

    Args:
        agent: The Strands Agent instance.
        required_tools: Tool names that MUST be invoked for the action to succeed.
        resume_prompt: Instruction to resume the agent with when a required tool
            was not called.
        max_resumes: Maximum number of resume attempts before giving up.
    """
    made_calls: set[str] = set()
    resumes_used = {"count": 0}

    def _track_tool_calls(event: AfterToolCallEvent) -> None:
        tool_name = event.tool_use.get("name", "")
        if tool_name:
            made_calls.add(tool_name)

    def _resume_if_missing(event: AfterInvocationEvent) -> None:
        if resumes_used["count"] >= max_resumes:
            return
        missing = [t for t in required_tools if t not in made_calls]
        if missing:
            resumes_used["count"] += 1
            logger.warning(
                "Agent finished without required tool(s) %s (resume %d/%d). Resuming.",
                missing, resumes_used["count"], max_resumes,
            )
            event.resume = resume_prompt

    agent.hooks.add_callback(AfterToolCallEvent, _track_tool_calls)
    agent.hooks.add_callback(AfterInvocationEvent, _resume_if_missing)
