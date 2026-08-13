from __future__ import annotations

from strands import Agent

from vshift.agents.model import create_model
from vshift.agents.prompts import REPORTER_SYSTEM_PROMPT
from vshift.tools.volunteer_tools import generate_report, query_shifts


def create_reporter_agent() -> Agent:
    """Create the Reporter Agent that generates summary reports."""
    return Agent(
        system_prompt=REPORTER_SYSTEM_PROMPT,
        model=create_model(),
        tools=[
            query_shifts,
            generate_report,
        ],
    )
