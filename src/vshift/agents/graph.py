from __future__ import annotations

import logging

from strands import Agent
from strands.multiagent import GraphBuilder

from vshift.agents.communicator import create_communicator_agent
from vshift.agents.recovery import create_recovery_agent
from vshift.agents.reporter import create_reporter_agent
from vshift.agents.scheduler import create_scheduler_agent
from vshift.agents.tracker import create_tracker_agent

logger = logging.getLogger(__name__)


def create_vshift_graph(with_hooks: bool = False) -> tuple:
    """Create the multi-agent Graph for VolunteerShift.

    Graph topology:
        scheduler -> communicator -> recovery -> tracker -> reporter

    Args:
        with_hooks: If True, register audit hooks on all agents.

    Returns:
        Tuple of (graph, agents_dict) where agents_dict maps names to Agent instances.
    """
    scheduler = create_scheduler_agent()
    communicator = create_communicator_agent()
    recovery = create_recovery_agent()
    tracker = create_tracker_agent()
    reporter = create_reporter_agent()

    if with_hooks:
        from vshift.agents.hooks import register_hooks

        for agent in [scheduler, communicator, recovery, tracker, reporter]:
            register_hooks(agent)
        logger.info("Audit hooks registered on all agents")

    agents = {
        "scheduler": scheduler,
        "communicator": communicator,
        "recovery": recovery,
        "tracker": tracker,
        "reporter": reporter,
    }

    builder = GraphBuilder()

    builder.add_node(scheduler, "scheduler")
    builder.add_node(communicator, "communicator")
    builder.add_node(recovery, "recovery")
    builder.add_node(tracker, "tracker")
    builder.add_node(reporter, "reporter")

    builder.add_edge("scheduler", "communicator")
    builder.add_edge("communicator", "recovery")
    builder.add_edge("recovery", "tracker")
    builder.add_edge("tracker", "reporter")

    builder.set_entry_point("scheduler")
    builder.set_execution_timeout(300)

    graph = builder.build()

    logger.info("Vshift multi-agent graph created with 5 nodes")
    return graph, agents
