from __future__ import annotations

from strands import Agent

from vshift.agents.prompts import COMMUNICATOR_SYSTEM_PROMPT
from vshift.tools.volunteer_tools import (
    log_communication,
    notify_coordinator,
    send_email,
    send_sms,
)


def create_communicator_agent() -> Agent:
    """Create the Communicator Agent that sends personalized communications."""
    return Agent(
        system_prompt=COMMUNICATOR_SYSTEM_PROMPT,
        tools=[
            send_email,
            send_sms,
            log_communication,
            notify_coordinator,
        ],
    )
