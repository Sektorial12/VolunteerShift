from __future__ import annotations

from strands import Agent

from vshift.agents.model import create_model
from vshift.agents.prompts import TRACKER_SYSTEM_PROMPT
from vshift.tools.volunteer_tools import (
    check_shift_coverage,
    get_shift,
    log_hours,
    update_volunteer_profile,
)


def create_tracker_agent() -> Agent:
    """Create the Tracker Agent that logs hours and updates profiles."""
    return Agent(
        system_prompt=TRACKER_SYSTEM_PROMPT,
        model=create_model(),
        tools=[
            check_shift_coverage,
            get_shift,
            log_hours,
            update_volunteer_profile,
        ],
    )
