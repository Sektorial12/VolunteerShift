from __future__ import annotations

from strands import Agent

from vshift.agents.prompts import SCHEDULER_SYSTEM_PROMPT
from vshift.tools.volunteer_tools import (
    get_shift,
    get_volunteer,
    match_volunteers_to_shifts,
    query_shifts,
    query_volunteers,
)


def create_scheduler_agent() -> Agent:
    """Create the Scheduler Agent that matches volunteers to shifts."""
    return Agent(
        system_prompt=SCHEDULER_SYSTEM_PROMPT,
        tools=[
            query_volunteers,
            query_shifts,
            get_shift,
            get_volunteer,
            match_volunteers_to_shifts,
        ],
    )
