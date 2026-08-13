import pytest


def test_config_defaults():
    from vshift.config import config

    assert config.aws_region is not None
    assert config.bedrock_model_id is not None
    assert config.noshow_threshold_minutes is not None


def test_volunteer_model_roundtrip():
    from vshift.models.entities import Volunteer, VolunteerStatus

    v = Volunteer(
        id="v001",
        name="Test Volunteer",
        email="test@example.org",
        skills=["food_handling"],
        availability={"monday": ["morning"]},
        reliability_score=0.9,
        status=VolunteerStatus.ACTIVE,
    )
    d = v.to_dict()
    assert d["id"] == "v001"
    assert d["skills"] == ["food_handling"]

    v2 = Volunteer.from_dict(d)
    assert v2.id == v.id
    assert v2.skills == v.skills
    assert v2.status == v.status


def test_shift_model_roundtrip():
    from vshift.models.entities import Assignment, AssignmentStatus, Shift, ShiftStatus

    s = Shift(
        id="s001",
        program_name="Food Bank",
        start_time="2026-08-15T10:00:00+00:00",
        end_time="2026-08-15T14:00:00+00:00",
        location="123 Main St",
        required_skills=["food_handling"],
        required_volunteers=3,
        assigned_volunteers=[
            Assignment(volunteer_id="v001", status=AssignmentStatus.CONFIRMED),
        ],
        status=ShiftStatus.PARTIALLY_FILLED,
    )
    d = s.to_dict()
    assert d["id"] == "s001"
    assert d["required_volunteers"] == 3
    assert d["assigned_volunteers"][0]["volunteer_id"] == "v001"

    s2 = Shift.from_dict(d)
    assert s2.id == s.id
    assert s2.required_volunteers == s.required_volunteers
    assert len(s2.assigned_volunteers) == 1
    assert s2.assigned_volunteers[0].volunteer_id == "v001"


def test_communication_model_roundtrip():
    from vshift.models.entities import Channel, Communication, MessageType

    c = Communication(
        id="c001",
        shift_id="s001",
        volunteer_id="v001",
        channel=Channel.EMAIL,
        message_type=MessageType.INVITATION,
        content="You are invited to a shift",
        sent_at="2026-08-13T10:00:00+00:00",
    )
    d = c.to_dict()
    assert d["channel"] == "email"
    assert d["message_type"] == "invitation"

    c2 = Communication.from_dict(d)
    assert c2.channel == Channel.EMAIL
    assert c2.message_type == MessageType.INVITATION


def test_report_model_roundtrip():
    from vshift.models.entities import Report, ReportPeriod

    r = Report(
        id="r001",
        period=ReportPeriod.WEEKLY,
        start_date="2026-08-07",
        end_date="2026-08-14",
        total_shifts=5,
        total_volunteers=20,
        total_hours=80.0,
        no_show_rate=8.0,
        coverage_rate=92.0,
    )
    d = r.to_dict()
    assert d["period"] == "weekly"
    assert d["total_shifts"] == 5

    r2 = Report.from_dict(d)
    assert r2.period == ReportPeriod.WEEKLY
    assert r2.total_shifts == 5


def test_seed_data_generates_volunteers():
    from vshift.utils.seed_data import generate_volunteers

    volunteers = generate_volunteers()
    assert len(volunteers) == 50
    assert all(v.email for v in volunteers)
    assert all(v.skills is not None for v in volunteers)


def test_seed_data_generates_shifts():
    from vshift.utils.seed_data import generate_shifts

    shifts = generate_shifts()
    assert len(shifts) == 5
    assert all(s.program_name for s in shifts)
    assert all(s.required_volunteers > 0 for s in shifts)


def test_agent_prompts_exist():
    from vshift.agents.prompts import (
        COMMUNICATOR_SYSTEM_PROMPT,
        RECOVERY_SYSTEM_PROMPT,
        REPORTER_SYSTEM_PROMPT,
        SCHEDULER_SYSTEM_PROMPT,
        TRACKER_SYSTEM_PROMPT,
    )

    assert len(SCHEDULER_SYSTEM_PROMPT) > 100
    assert len(COMMUNICATOR_SYSTEM_PROMPT) > 100
    assert len(RECOVERY_SYSTEM_PROMPT) > 100
    assert len(TRACKER_SYSTEM_PROMPT) > 100
    assert len(REPORTER_SYSTEM_PROMPT) > 100
