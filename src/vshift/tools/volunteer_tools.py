from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from strands import tool

from vshift.config import config
from vshift.models.entities import (
    Assignment,
    AssignmentStatus,
    Channel,
    MessageType,
    Shift,
    ShiftStatus,
    Volunteer,
)
from vshift.utils.db import db


@tool
def query_volunteers(
    skills: list[str] | None = None,
    status: str = "active",
    min_reliability: float = 0.0,
    day: str | None = None,
) -> list[dict[str, Any]]:
    """Query the volunteer pool with optional filters.

    Args:
        skills: If provided, only return volunteers who have ALL these skills.
        status: Volunteer status filter (active, pending, inactive). Defaults to active.
        min_reliability: Minimum reliability score (0.0-1.0). Defaults to 0.0.
        day: If provided, only return volunteers available on this day (e.g., "monday").

    Returns:
        List of volunteer dictionaries matching the criteria.
    """
    items = db.scan(config.ddb_volunteers_table)
    volunteers = [Volunteer.from_dict(item) for item in items]

    result = []
    for v in volunteers:
        if v.status.value != status:
            continue
        if v.reliability_score < min_reliability:
            continue
        if skills and not all(s in v.skills for s in skills):
            continue
        if day and day.lower() not in v.availability:
            continue
        result.append(v.to_dict())

    return result


@tool
def query_shifts(
    status: str | None = None,
    program_name: str | None = None,
) -> list[dict[str, Any]]:
    """Query shifts with optional filters.

    Args:
        status: If provided, filter by shift status (open, partially_filled, filled, in_progress, completed, cancelled).
        program_name: If provided, filter by program name.

    Returns:
        List of shift dictionaries matching the criteria.
    """
    items = db.scan(config.ddb_shifts_table)
    shifts = [Shift.from_dict(item) for item in items]

    result = []
    for s in shifts:
        if status and s.status.value != status:
            continue
        if program_name and s.program_name != program_name:
            continue
        result.append(s.to_dict())

    return result


@tool
def get_shift(shift_id: str) -> dict[str, Any] | None:
    """Get a single shift by its ID.

    Args:
        shift_id: The unique identifier of the shift.

    Returns:
        Shift dictionary if found, None otherwise.
    """
    item = db.get_item(config.ddb_shifts_table, {"id": shift_id})
    if item:
        return Shift.from_dict(item).to_dict()
    return None


@tool
def get_volunteer(volunteer_id: str) -> dict[str, Any] | None:
    """Get a single volunteer by their ID.

    Args:
        volunteer_id: The unique identifier of the volunteer.

    Returns:
        Volunteer dictionary if found, None otherwise.
    """
    item = db.get_item(config.ddb_volunteers_table, {"id": volunteer_id})
    if item:
        return Volunteer.from_dict(item).to_dict()
    return None


@tool
def match_volunteers_to_shifts(shift_id: str) -> list[dict[str, Any]]:
    """Find and rank volunteers for a specific shift.

    Scores volunteers by: skills match, availability, reliability, and past participation.
    Excludes volunteers already assigned to the shift.

    Args:
        shift_id: The ID of the shift to find volunteers for.

    Returns:
        Ranked list of volunteer dictionaries with a 'score' field added.
    """
    shift_data = db.get_item(config.ddb_shifts_table, {"id": shift_id})
    if not shift_data:
        return []

    shift = Shift.from_dict(shift_data)
    assigned_ids = {a.volunteer_id for a in shift.assigned_volunteers}

    all_volunteers_data = query_volunteers(status="active")
    all_volunteers = [Volunteer.from_dict(v) for v in all_volunteers_data]

    shift_day = datetime.fromisoformat(shift.start_time).strftime("%A").lower()

    scored = []
    for v in all_volunteers:
        if v.id in assigned_ids:
            continue

        if not all(s in v.skills for s in shift.required_skills):
            continue

        if shift_day not in v.availability:
            continue

        score = 0.0
        score += v.reliability_score * 40
        if shift.program_name in v.notes:
            score += 10
        program_shifts = sum(
            1 for sid in v.past_shifts if sid.startswith(shift.program_name[:3])
        )
        score += min(program_shifts * 5, 15)
        score += min(v.total_hours * 0.1, 10)
        scored.append((score, v))

    scored.sort(key=lambda x: x[0], reverse=True)

    result = []
    for score, v in scored:
        d = v.to_dict()
        d["score"] = round(score, 2)
        result.append(d)

    return result


@tool
def send_email(to: str, subject: str, body: str) -> dict[str, str]:
    """Send an email via AWS SES.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Email body content (plain text).

    Returns:
        Dictionary with 'message_id' and 'status' keys.
    """
    import boto3

    ses = boto3.client("ses", region_name=config.aws_region)
    try:
        response = ses.send_email(
            Source=config.ses_source_email,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject},
                "Body": {"Text": {"Data": body}},
            },
        )
        return {
            "message_id": response["MessageId"],
            "status": "sent",
        }
    except Exception as e:
        return {
            "message_id": "",
            "status": f"failed: {e}",
        }


@tool
def send_sms(to: str, message: str) -> dict[str, str]:
    """Send an SMS via AWS SNS.

    Args:
        to: Recipient phone number (E.164 format, e.g., +15551234567).
        message: SMS message content.

    Returns:
        Dictionary with 'message_id' and 'status' keys.
    """
    import boto3

    sns = boto3.client("sns", region_name=config.aws_region)
    try:
        response = sns.publish(PhoneNumber=to, Message=message)
        return {
            "message_id": response["MessageId"],
            "status": "sent",
        }
    except Exception as e:
        return {
            "message_id": "",
            "status": f"failed: {e}",
        }


@tool
def log_communication(
    shift_id: str,
    volunteer_id: str,
    channel: str,
    message_type: str,
    content: str,
    response: str | None = None,
) -> dict[str, str]:
    """Record a communication sent to a volunteer.

    Args:
        shift_id: The shift this communication relates to.
        volunteer_id: The volunteer who was contacted.
        channel: Communication channel (email, sms, dashboard).
        message_type: Type of message (invitation, reminder_48h, reminder_2h, urgent_replacement, coordinator_notification).
        content: The message content that was sent.
        response: Optional response received from the volunteer.

    Returns:
        Dictionary with the communication 'id' and 'status'.
    """
    comm_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    item = {
        "id": comm_id,
        "shift_id": shift_id,
        "volunteer_id": volunteer_id,
        "channel": channel,
        "message_type": message_type,
        "content": content,
        "sent_at": now,
        "response": response,
        "responded_at": None,
    }

    db.put_item(config.ddb_communications_table, item)
    return {"id": comm_id, "status": "logged"}


@tool
def log_hours(
    volunteer_id: str,
    shift_id: str,
    checked_in_at: str,
    checked_out_at: str,
) -> dict[str, Any]:
    """Log volunteer hours for a completed shift.

    Args:
        volunteer_id: The volunteer's ID.
        shift_id: The shift ID.
        checked_in_at: ISO timestamp of check-in.
        checked_out_at: ISO timestamp of check-out.

    Returns:
        Dictionary with 'volunteer_id', 'hours_logged', and 'status'.
    """
    check_in = datetime.fromisoformat(checked_in_at)
    check_out = datetime.fromisoformat(checked_out_at)
    hours = (check_out - check_in).total_seconds() / 3600.0

    volunteer_data = db.get_item(config.ddb_volunteers_table, {"id": volunteer_id})
    if not volunteer_data:
        return {"volunteer_id": volunteer_id, "hours_logged": 0, "status": "volunteer not found"}

    volunteer = Volunteer.from_dict(volunteer_data)
    volunteer.total_hours += hours
    if shift_id not in volunteer.past_shifts:
        volunteer.past_shifts.append(shift_id)

    db.put_item(config.ddb_volunteers_table, volunteer.to_dict())

    return {
        "volunteer_id": volunteer_id,
        "hours_logged": round(hours, 2),
        "status": "logged",
    }


@tool
def update_volunteer_profile(
    volunteer_id: str,
    reliability_score: float | None = None,
    notes: str | None = None,
    status: str | None = None,
) -> dict[str, str]:
    """Update a volunteer's profile fields.

    Args:
        volunteer_id: The volunteer's ID.
        reliability_score: New reliability score (0.0-1.0), if updating.
        notes: New notes string, if updating.
        status: New status (active, pending, inactive), if updating.

    Returns:
        Dictionary with 'volunteer_id' and 'status'.
    """
    volunteer_data = db.get_item(config.ddb_volunteers_table, {"id": volunteer_id})
    if not volunteer_data:
        return {"volunteer_id": volunteer_id, "status": "volunteer not found"}

    volunteer = Volunteer.from_dict(volunteer_data)

    if reliability_score is not None:
        volunteer.reliability_score = max(0.0, min(1.0, reliability_score))
    if notes is not None:
        volunteer.notes = notes
    if status is not None:
        volunteer.status = type(volunteer.status)(status)

    db.put_item(config.ddb_volunteers_table, volunteer.to_dict())
    return {"volunteer_id": volunteer_id, "status": "updated"}


@tool
def notify_coordinator(
    subject: str,
    message: str,
) -> dict[str, str]:
    """Send an escalation notification to the coordinator.

    Args:
        subject: Notification subject.
        message: Notification body content.

    Returns:
        Dictionary with 'status' and 'message_id'.
    """
    result = send_email(
        to=config.ses_source_email,
        subject=f"[Vshift Alert] {subject}",
        body=message,
    )
    return {
        "status": result["status"],
        "message_id": result["message_id"],
    }


@tool
def check_shift_coverage(shift_id: str) -> dict[str, Any]:
    """Check the coverage status of a shift.

    Reports how many volunteers are assigned, confirmed, checked in, and identifies no-shows.

    Args:
        shift_id: The shift ID to check.

    Returns:
        Dictionary with coverage details: required, assigned, confirmed, checked_in, no_shows, and status.
    """
    shift_data = db.get_item(config.ddb_shifts_table, {"id": shift_id})
    if not shift_data:
        return {"shift_id": shift_id, "status": "shift not found"}

    shift = Shift.from_dict(shift_data)

    assigned = len(shift.assigned_volunteers)
    confirmed = sum(
        1 for a in shift.assigned_volunteers if a.status == AssignmentStatus.CONFIRMED
    )
    checked_in = sum(
        1 for a in shift.assigned_volunteers if a.status == AssignmentStatus.CHECKED_IN
    )
    checked_out = sum(
        1 for a in shift.assigned_volunteers if a.status == AssignmentStatus.CHECKED_OUT
    )
    no_shows = [
        a.volunteer_id
        for a in shift.assigned_volunteers
        if a.status == AssignmentStatus.NO_SHOW
    ]
    pending_check_in = [
        a.volunteer_id
        for a in shift.assigned_volunteers
        if a.status == AssignmentStatus.CONFIRMED
    ]

    return {
        "shift_id": shift_id,
        "required": shift.required_volunteers,
        "assigned": assigned,
        "confirmed": confirmed,
        "checked_in": checked_in,
        "checked_out": checked_out,
        "no_shows": no_shows,
        "pending_check_in": pending_check_in,
        "shift_status": shift.status.value,
    }


@tool
def generate_report(
    period: str,
    start_date: str,
    end_date: str,
) -> dict[str, Any]:
    """Generate a summary report for a given period.

    Args:
        period: Report period type (weekly or monthly).
        start_date: Start date in ISO format (YYYY-MM-DD).
        end_date: End date in ISO format (YYYY-MM-DD).

    Returns:
        Dictionary with report metrics and 'report_id'.
    """
    from vshift.models.entities import Report, ReportPeriod

    shifts_data = db.scan(config.ddb_shifts_table)
    all_shifts = [Shift.from_dict(s) for s in shifts_data]

    start_dt = datetime.fromisoformat(start_date)
    end_dt = datetime.fromisoformat(end_date)

    period_shifts = []
    for s in all_shifts:
        try:
            shift_start = datetime.fromisoformat(s.start_time)
            if start_dt <= shift_start <= end_dt:
                period_shifts.append(s)
        except (ValueError, TypeError):
            continue

    total_shifts = len(period_shifts)
    total_volunteers = sum(len(s.assigned_volunteers) for s in period_shifts)
    total_assignments = sum(
        1
        for s in period_shifts
        for a in s.assigned_volunteers
        if a.status not in (AssignmentStatus.INVITED, AssignmentStatus.DECLINED)
    )
    no_show_count = sum(
        1
        for s in period_shifts
        for a in s.assigned_volunteers
        if a.status == AssignmentStatus.NO_SHOW
    )
    filled_shifts = sum(
        1
        for s in period_shifts
        if s.status in (ShiftStatus.FILLED, ShiftStatus.COMPLETED, ShiftStatus.IN_PROGRESS)
    )

    no_show_rate = (no_show_count / total_assignments * 100) if total_assignments > 0 else 0.0
    coverage_rate = (filled_shifts / total_shifts * 100) if total_shifts > 0 else 0.0

    report_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    report = Report(
        id=report_id,
        period=ReportPeriod(period),
        start_date=start_date,
        end_date=end_date,
        total_shifts=total_shifts,
        total_volunteers=total_volunteers,
        total_hours=0.0,
        no_show_rate=round(no_show_rate, 1),
        coverage_rate=round(coverage_rate, 1),
        generated_at=now,
    )

    db.put_item(config.ddb_reports_table, report.to_dict())

    return {
        "report_id": report_id,
        "period": period,
        "total_shifts": total_shifts,
        "total_volunteers": total_volunteers,
        "no_show_rate": round(no_show_rate, 1),
        "coverage_rate": round(coverage_rate, 1),
        "generated_at": now,
    }


ALL_TOOLS = [
    query_volunteers,
    query_shifts,
    get_shift,
    get_volunteer,
    match_volunteers_to_shifts,
    send_email,
    send_sms,
    log_communication,
    log_hours,
    update_volunteer_profile,
    notify_coordinator,
    check_shift_coverage,
    generate_report,
]
