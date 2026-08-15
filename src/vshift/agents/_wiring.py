"""Shared helper to wire audit + reliability hooks onto an agent."""

from __future__ import annotations

from typing import Any


def wire_agent(agent, required_tools: list[str], resume_prompt: str) -> None:
    """Register audit hooks + reliability (auto-resume) hooks on an agent."""
    from vshift.agents.hooks import register_hooks
    from vshift.agents.reliability import register_reliability_hooks

    register_hooks(agent)
    register_reliability_hooks(
        agent,
        required_tools=required_tools,
        resume_prompt=resume_prompt,
        max_resumes=2,
    )
