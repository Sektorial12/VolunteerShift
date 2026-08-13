from __future__ import annotations

from strands import Agent

from vshift.agents.prompts import RECOVERY_SYSTEM_PROMPT
from vshift.tools.volunteer_tools import (
    check_shift_coverage,
    get_shift,
    log_communication,
    match_volunteers_to_shifts,
    notify_coordinator,
    query_volunteers,
    send_email,
    send_sms,
)


def create_recovery_agent() -> Agent:
    """Create the Recovery Agent that detects no-shows and finds replacements."""
    return Agent(
        system_prompt=RECOVERY_SYSTEM_PROMPT,
        tools=[
            check_shift_coverage,
            query_volunteers,
            match_volunteers_to_shifts,
            get_shift,
            send_email,
            send_sms,
            log_communication,
            notify_coordinator,
        ],
    )
