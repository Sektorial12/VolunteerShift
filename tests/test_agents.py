import pytest


def test_graph_creation_no_hooks():
    from vshift.agents.graph import create_vshift_graph

    graph, agents = create_vshift_graph(with_hooks=False)
    assert len(agents) == 5
    assert "scheduler" in agents
    assert "communicator" in agents
    assert "recovery" in agents
    assert "tracker" in agents
    assert "reporter" in agents


def test_graph_creation_with_hooks():
    from vshift.agents.graph import create_vshift_graph

    graph, agents = create_vshift_graph(with_hooks=True)
    assert len(agents) == 5


def test_hooks_module_imports():
    from vshift.agents.hooks import audit_after_tool_call, audit_before_tool_call, register_hooks

    assert callable(audit_before_tool_call)
    assert callable(audit_after_tool_call)
    assert callable(register_hooks)


def test_session_manager_imports():
    from vshift.agents.sessions import create_file_session_manager, create_session_manager

    assert callable(create_session_manager)
    assert callable(create_file_session_manager)


def test_all_tool_specs_registered():
    from vshift.agents.scheduler import create_scheduler_agent
    from vshift.agents.communicator import create_communicator_agent
    from vshift.agents.recovery import create_recovery_agent
    from vshift.agents.tracker import create_tracker_agent
    from vshift.agents.reporter import create_reporter_agent

    scheduler = create_scheduler_agent()
    assert "query_volunteers" in [s["name"] for s in scheduler.tool_registry.get_all_tool_specs()]
    assert "match_volunteers_to_shifts" in [s["name"] for s in scheduler.tool_registry.get_all_tool_specs()]

    communicator = create_communicator_agent()
    assert "send_email" in [s["name"] for s in communicator.tool_registry.get_all_tool_specs()]
    assert "send_sms" in [s["name"] for s in communicator.tool_registry.get_all_tool_specs()]
    assert "log_communication" in [s["name"] for s in communicator.tool_registry.get_all_tool_specs()]

    recovery = create_recovery_agent()
    assert "check_shift_coverage" in [s["name"] for s in recovery.tool_registry.get_all_tool_specs()]
    assert "notify_coordinator" in [s["name"] for s in recovery.tool_registry.get_all_tool_specs()]

    tracker = create_tracker_agent()
    assert "log_hours" in [s["name"] for s in tracker.tool_registry.get_all_tool_specs()]
    assert "update_volunteer_profile" in [s["name"] for s in tracker.tool_registry.get_all_tool_specs()]

    reporter = create_reporter_agent()
    assert "generate_report" in [s["name"] for s in reporter.tool_registry.get_all_tool_specs()]
