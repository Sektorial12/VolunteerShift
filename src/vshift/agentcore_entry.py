"""AgentCore Runtime entry point for VolunteerShift.

This module wraps the Strands multi-agent system as an HTTP service
compatible with Amazon Bedrock AgentCore Runtime requirements.
"""

from __future__ import annotations

import logging
import os
import sys

# Make the src/ layout importable regardless of how the runtime executes this
# entrypoint (AgentCore CodeZip runs from the artifact root, not with PYTHONPATH set).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent

from vshift.agents.graph import create_vshift_graph
from vshift.agents.model import create_model
from vshift.agents.prompts import SCHEDULER_SYSTEM_PROMPT
from vshift.tools.volunteer_tools import ALL_TOOLS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp(debug=True)


def _setup() -> None:
    from vshift.utils.telemetry import setup_telemetry

    setup_telemetry()


_setup()

graph, agents = create_vshift_graph(with_hooks=True)


@app.entrypoint
def handler(payload: dict) -> dict:
    """Handle agent invocation requests.

    Args:
        payload: Dictionary with 'prompt' key containing the user message.

    Returns:
        Dictionary with 'result' key containing the agent response.
    """
    prompt = payload.get("prompt", "")
    if not prompt:
        return {"result": "No prompt provided"}

    logger.info("Received prompt: %s", prompt[:100])

    result = graph(prompt)

    return {
        "result": str(result),
        "status": result.status,
        "completed_nodes": result.completed_nodes,
        "failed_nodes": result.failed_nodes,
    }


if __name__ == "__main__":
    app.run()
