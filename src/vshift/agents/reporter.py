from __future__ import annotations

from strands import Agent

from vshift.agents.prompts import REPORTER_SYSTEM_PROMPT
from vshift.tools.volunteer_tools import generate_report, query_shifts


def create_reporter_agent() -> Agent:
    """Create the Reporter Agent that generates summary reports."""
    return Agent(
        system_prompt=REPORTER_SYSTEM_PROMPT,
        tools=[
            query_shifts,
            generate_report,
        ],
    )
