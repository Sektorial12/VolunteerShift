"""Integration tests that require real AWS services.

Run with: pytest tests/test_integration.py -v --tb=short

Requires:
- AWS credentials configured
- DynamoDB tables created (run: python -m vshift.utils.seed_data)
- AWS_BEARER_TOKEN_BEDROCK env var set
"""

import os
import pytest
from decimal import Decimal

from vshift.config import config
from vshift.utils.db import db
from vshift.models.entities import Volunteer, Shift, Assignment, AssignmentStatus, ShiftStatus


@pytest.fixture
def cleanup_test_data():
    """Clean up any test data after tests."""
    yield
    # Cleanup is handled per-test


def test_dynamodb_volunteers_loaded():
    """Verify seed volunteers are in DynamoDB."""
    items = db.scan(config.ddb_volunteers_table)
    assert len(items) >= 50, f"Expected 50+ volunteers, got {len(items)}"


def test_dynamodb_shifts_loaded():
    """Verify seed shifts are in DynamoDB."""
    items = db.scan(config.ddb_shifts_table)
    assert len(items) >= 5, f"Expected 5+ shifts, got {len(items)}"


def test_query_volunteers_tool():
    """Test query_volunteers tool with real DynamoDB."""
    from vshift.tools.volunteer_tools import query_volunteers

    result = query_volunteers(skills=["food_handling"])
    assert len(result) > 0
    assert all("food_handling" in v["skills"] for v in result)


def test_query_volunteers_filter_by_day():
    """Test query_volunteers tool filters by day."""
    from vshift.tools.volunteer_tools import query_volunteers

    result = query_volunteers(day="saturday")
    assert len(result) > 0
    assert all("saturday" in v["availability"] for v in result)


def test_get_shift_tool():
    """Test get_shift tool with real DynamoDB."""
    from vshift.tools.volunteer_tools import get_shift

    result = get_shift(shift_id="s001")
    assert result is not None
    assert result["id"] == "s001"
    assert result["program_name"] == "Food Bank Distribution"


def test_get_volunteer_tool():
    """Test get_volunteer tool with real DynamoDB."""
    from vshift.tools.volunteer_tools import get_volunteer

    result = get_volunteer(volunteer_id="v001")
    assert result is not None
    assert result["id"] == "v001"
    assert result["name"] == "Maria Garcia"


def test_match_volunteers_to_shifts_tool():
    """Test match_volunteers_to_shifts tool with real DynamoDB."""
    from vshift.tools.volunteer_tools import match_volunteers_to_shifts

    result = match_volunteers_to_shifts(shift_id="s001")
    assert len(result) > 0
    assert all("score" in v for v in result)
    # Scores should be sorted descending
    scores = [v["score"] for v in result]
    assert scores == sorted(scores, reverse=True)


def test_check_shift_coverage_tool():
    """Test check_shift_coverage tool with real DynamoDB."""
    from vshift.tools.volunteer_tools import check_shift_coverage

    result = check_shift_coverage(shift_id="s001")
    assert result["shift_id"] == "s001"
    assert "required" in result
    assert "assigned" in result


def test_check_shift_coverage_nonexistent():
    """Test check_shift_coverage returns error for nonexistent shift."""
    from vshift.tools.volunteer_tools import check_shift_coverage

    result = check_shift_coverage(shift_id="nonexistent")
    assert result["status"] == "shift not found"


def test_log_communication_tool():
    """Test log_communication tool writes to DynamoDB."""
    from vshift.tools.volunteer_tools import log_communication

    result = log_communication(
        shift_id="s001",
        volunteer_id="v001",
        channel="email",
        message_type="invitation",
        content="Test invitation message",
    )
    assert result["status"] == "logged"
    assert "id" in result

    # Verify it was written
    comm = db.get_item(config.ddb_communications_table, {"id": result["id"]})
    assert comm is not None
    assert comm["content"] == "Test invitation message"

    # Cleanup
    db.delete_item(config.ddb_communications_table, {"id": result["id"]})


def test_update_volunteer_profile_tool():
    """Test update_volunteer_profile tool updates DynamoDB."""
    from vshift.tools.volunteer_tools import update_volunteer_profile

    original = db.get_item(config.ddb_volunteers_table, {"id": "v001"})
    original_score = float(original["reliability_score"])

    result = update_volunteer_profile(
        volunteer_id="v001",
        reliability_score=0.99,
    )
    assert result["status"] == "updated"

    updated = db.get_item(config.ddb_volunteers_table, {"id": "v001"})
    assert float(updated["reliability_score"]) == 0.99

    # Restore original
    update_volunteer_profile(volunteer_id="v001", reliability_score=original_score)


def test_update_volunteer_profile_nonexistent():
    """Test update_volunteer_profile handles nonexistent volunteer."""
    from vshift.tools.volunteer_tools import update_volunteer_profile

    result = update_volunteer_profile(volunteer_id="nonexistent", reliability_score=0.5)
    assert result["status"] == "volunteer not found"


def test_generate_report_tool():
    """Test generate_report tool creates a report in DynamoDB."""
    from datetime import datetime, timedelta
    from vshift.tools.volunteer_tools import generate_report

    now = datetime.now()
    start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    end = now.strftime("%Y-%m-%d")

    result = generate_report(period="weekly", start_date=start, end_date=end)
    assert result["report_id"] is not None
    assert result["period"] == "weekly"

    # Verify it was stored
    report = db.get_item(config.ddb_reports_table, {"id": result["report_id"]})
    assert report is not None

    # Cleanup
    db.delete_item(config.ddb_reports_table, {"id": result["report_id"]})


@pytest.mark.skipif(
    not os.getenv("AWS_BEARER_TOKEN_BEDROCK"),
    reason="AWS_BEARER_TOKEN_BEDROCK not set",
)
def test_scheduler_agent_with_real_bedrock():
    """Test Scheduler Agent produces ranked volunteer list via real Bedrock."""
    from vshift.agents.scheduler import create_scheduler_agent

    agent = create_scheduler_agent()
    result = agent("Find volunteers for shift s001. Use match_volunteers_to_shifts tool and report the top 3.")

    result_str = str(result)
    assert len(result_str) > 50
    # Should mention at least one volunteer ID
    assert any(f"v0" in result_str for _ in [1])
