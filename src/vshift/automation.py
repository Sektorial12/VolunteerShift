"""Automation scheduler for VolunteerShift.

Runs the agent actions (schedule, remind, no-show check, track) automatically
based on each shift's start/end times, so the system operates without manual
``/api/trigger`` calls.

Trigger model (per shift):
    - schedule:       once, when the shift is first created (open, no assignment)
    - invite:         once, right after volunteers are assigned (invitation + respond link)
    - remind_48h:     48h before shift start (or configurable)
    - remind_2h:      2h before shift start
    - noshow_check:   at shift start + noshow threshold
    - track:          at shift end

Idempotency: each action is marked done on the shift record after running, so a
re-run never duplicates work.

Time acceleration: ``TIME_ACCELERATION`` scales real elapsed time so a demo can
compress a multi-day shift lifecycle into minutes. ``clock()`` returns an
accelerated "shift time" used for all scheduling decisions.
"""

from __future__ import annotations

import logging
import threading
import time as _time
from datetime import datetime, timedelta, timezone
from typing import Any

from vshift.config import config
from vshift.models.entities import AssignmentStatus, Shift, ShiftStatus
from vshift.utils.db import db

logger = logging.getLogger(__name__)

# Mapping of action name -> (shift flag field that marks it done, required shift status)
_ACTION_META = {
    "schedule": ("scheduled_at", None),
    "invite": ("invitations_sent", None),
    "remind_48h": ("reminder_48h_sent", None),
    "remind_2h": ("reminder_2h_sent", None),
    "noshow_check": ("no_show_checked", None),
    "track": ("hours_tracked", None),
}

# How long before shift start the 48h / 2h reminders fire (timedelta)
REMIND_48H_LEAD = timedelta(hours=48)
REMIND_2H_LEAD = timedelta(hours=2)

_start_time = _time.monotonic()


def clock() -> datetime:
    """Return the accelerated 'shift time' used for scheduling decisions.

    When ``TIME_ACCELERATION`` is 1.0 this equals real UTC now. Higher values
    advance the clock faster than wall time, enabling demo time-compression.
    """
    accel = config.time_acceleration
    if accel <= 1.0:
        return datetime.now(timezone.utc)
    elapsed = _time.monotonic() - _start_time
    shifted = datetime.now(timezone.utc) + timedelta(seconds=elapsed * (accel - 1.0))
    return shifted


def respond_link(volunteer_id: str, shift_id: str) -> str:
    """One-tap confirm/decline URL for a volunteer's assignment on a shift."""
    base = config.public_dashboard_url.rstrip("/")
    return f"{base}/respond?volunteer_id={volunteer_id}&shift_id={shift_id}"


def _communicator_context(shift_id: str, statuses: tuple[AssignmentStatus, ...]) -> str | None:
    """Build the data block the Communicator agent needs to act on real records.

    The Communicator has no query tools, so its caller must hand it the shift
    details plus one line per matching volunteer (contact info + exact respond
    link). Returns None when no volunteer's assignment status is in ``statuses``
    (nothing to send). Raises ValueError when the shift does not exist.
    """
    shift_data = db.get_item(config.ddb_shifts_table, {"id": shift_id})
    if not shift_data:
        raise ValueError(f"shift {shift_id} not found")
    shift = Shift.from_dict(shift_data)

    lines = [
        f"Shift {shift.id}: {shift.program_name}",
        f"When: {shift.start_time} to {shift.end_time}",
        f"Where: {shift.location}",
    ]
    if shift.required_skills:
        lines.append(f"Required skills: {', '.join(shift.required_skills)}")

    volunteer_lines = []
    for a in shift.assigned_volunteers:
        if a.status not in statuses:
            continue
        v = db.get_item(config.ddb_volunteers_table, {"id": a.volunteer_id})
        if not v:
            volunteer_lines.append(f"- (id={a.volunteer_id}) MISSING VOLUNTEER RECORD - do not contact, skip")
            continue
        channels = ", ".join(v.get("preferred_channels") or ["email"])
        contact = f"email={v.get('email', '')}"
        if v.get("phone"):
            contact += f" phone={v['phone']}"
        volunteer_lines.append(
            f"- {v.get('name', 'volunteer')} (id={a.volunteer_id}) {contact} "
            f"prefers={channels} respond link: {respond_link(a.volunteer_id, shift.id)}"
        )

    if not volunteer_lines:
        return None
    lines.append("")
    lines.append("Volunteers to contact (use these exact addresses and links):")
    lines.extend(volunteer_lines)
    return "\n".join(lines)


def _parse_dt(value: str) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def due_actions(shift: Shift, now: datetime | None = None) -> list[str]:
    """Return the list of actions that are due for a shift at ``now``."""
    now = now or clock()
    start = _parse_dt(shift.start_time)
    end = _parse_dt(shift.end_time)
    actions: list[str] = []

    if shift.status == ShiftStatus.CANCELLED:
        return []

    # schedule: open shift that has not been scheduled yet
    if (
        not shift.scheduled_at
        and shift.status in (ShiftStatus.OPEN,)
        and not shift.assigned_volunteers
    ):
        actions.append("schedule")

    # invite: assigned volunteers who have not been contacted yet
    if (
        not shift.invitations_sent
        and shift.status != ShiftStatus.COMPLETED
        and any(a.status == AssignmentStatus.INVITED for a in shift.assigned_volunteers)
    ):
        actions.append("invite")

    if start:
        if not shift.reminder_48h_sent and now >= start - REMIND_48H_LEAD:
            actions.append("remind_48h")
        if not shift.reminder_2h_sent and now >= start - REMIND_2H_LEAD:
            actions.append("remind_2h")

    if (
        start
        and not shift.no_show_checked
        and now >= start + timedelta(minutes=config.noshow_threshold_minutes)
    ):
        actions.append("noshow_check")

    if end and not shift.hours_tracked and now >= end:
        actions.append("track")

    return actions


def advance_lifecycle_status(shift: Shift, now: datetime | None = None) -> bool:
    """Flip a staffed shift to IN_PROGRESS once its start time passes.

    Returns True when the status changed (the caller should persist the shift).
    COMPLETED is set by ``mark_action_done`` when tracking finishes. An open
    unstaffed shift is left alone so late scheduling still works.
    """
    now = now or clock()
    if shift.status in (ShiftStatus.PARTIALLY_FILLED, ShiftStatus.FILLED):
        start = _parse_dt(shift.start_time)
        if start and now >= start:
            shift.status = ShiftStatus.IN_PROGRESS
            return True
    return False


def invitations_pending(shift_id: str) -> bool:
    """True when the shift has invited-but-uncontacted volunteers (invite due)."""
    data = db.get_item(config.ddb_shifts_table, {"id": shift_id})
    if not data:
        return False
    return "invite" in due_actions(Shift.from_dict(data))


def mark_action_done(shift_id: str, action: str) -> None:
    """Persist that ``action`` has been completed for ``shift_id``."""
    meta = _ACTION_META.get(action)
    if not meta:
        return
    field = meta[0]
    shift_data = db.get_item(config.ddb_shifts_table, {"id": shift_id})
    if not shift_data:
        return
    shift = Shift.from_dict(shift_data)

    if action == "schedule":
        shift.scheduled_at = datetime.now(timezone.utc).isoformat()
    else:
        setattr(shift, field, True)

    # Tracking is the last lifecycle action: hours are logged, the shift is over.
    if action == "track" and shift.status != ShiftStatus.CANCELLED:
        shift.status = ShiftStatus.COMPLETED

    db.put_item(config.ddb_shifts_table, shift.to_dict())


def run_action(action: str, shift_id: str) -> dict[str, Any]:
    """Execute a single agent action for a shift.

    Returns the result dict, or an error dict if the action could not run.
    """
    if action == "report":
        return {"action": action, "error": "report has no shift; call /api/trigger"}

    logger.info("Automation running action=%s shift=%s", action, shift_id)

    if action == "schedule":
        from vshift.agents.scheduler import create_scheduler_agent
        agent = create_scheduler_agent()
        prompt = (
            f"Find, match, and assign volunteers for shift {shift_id}. "
            "Call get_shift first to see the shift's date, time and required skills. "
            "Then call match_volunteers_to_shifts with the shift id to get ranked candidates "
            "(it handles skills and availability matching - do not filter by day yourself). "
            "Finally call assign_volunteers_to_shift to assign the top candidates."
        )
    elif action == "invite":
        from vshift.agents.communicator import create_communicator_agent
        context = _communicator_context(shift_id, (AssignmentStatus.INVITED,))
        if context is None:
            mark_action_done(shift_id, action)
            return {"action": action, "shift_id": shift_id, "result": "no invited volunteers to contact", "skipped": True}
        agent = create_communicator_agent()
        prompt = (
            "Send invitation emails for the shift below to every listed volunteer. "
            "Personalize each message, include their exact respond link, and tell them "
            "they can also simply reply to this email with YES or NO.\n\n" + context
        )
    elif action in ("remind_48h", "remind_2h"):
        from vshift.agents.communicator import create_communicator_agent
        context = _communicator_context(shift_id, (AssignmentStatus.CONFIRMED,))
        if context is None:
            mark_action_done(shift_id, action)
            return {"action": action, "shift_id": shift_id, "result": "no confirmed volunteers to remind", "skipped": True}
        agent = create_communicator_agent()
        label = "48-hour" if action == "remind_48h" else "final 2-hour"
        prompt = (
            f"Send {label} reminders for the shift below to every listed confirmed volunteer. "
            f"Include the shift details and their exact respond link.\n\n" + context
        )
    elif action == "noshow_check":
        from vshift.agents.recovery import create_recovery_agent
        agent = create_recovery_agent()
        prompt = f"Check shift {shift_id} for no-shows and find replacements if needed."
    elif action == "track":
        from vshift.agents.tracker import create_tracker_agent
        agent = create_tracker_agent()
        prompt = (
            f"Track hours and update profiles for completed shift {shift_id}. "
            "Call check_shift_coverage, then for each volunteer who checked in and out "
            "call log_hours and update_volunteer_profile."
        )
    else:
        return {"action": action, "shift_id": shift_id, "error": "unknown action"}

    from vshift.agents._wiring import wire_agent

    wire_agent(agent, _required_tools(action), _resume_prompt(action))
    result = agent(prompt)
    mark_action_done(shift_id, action)
    return {"action": action, "shift_id": shift_id, "result": str(result)}


def _required_tools(action: str) -> list[str]:
    return {
        "schedule": ["assign_volunteers_to_shift"],
        "invite": ["send_email", "log_communication"],
        "remind_48h": ["send_email", "log_communication"],
        "remind_2h": ["send_email", "log_communication"],
        "noshow_check": ["check_shift_coverage"],
        "track": ["log_hours"],
    }.get(action, [])


def _resume_prompt(action: str) -> str:
    send_and_log = (
        "You MUST actually call send_email (or send_sms when the volunteer prefers SMS) "
        "and log_communication for every listed volunteer."
    )
    return {
        "schedule": "You MUST call assign_volunteers_to_shift to assign the top candidates.",
        "invite": send_and_log,
        "remind_48h": send_and_log,
        "remind_2h": send_and_log,
        "noshow_check": "You MUST call check_shift_coverage to detect no-shows.",
        "track": "You MUST actually call log_hours for volunteers who checked in and out.",
    }.get(action, "")


def run_due_cycle(now: datetime | None = None) -> list[dict[str, Any]]:
    """Scan all shifts, run any due actions, and return the results.

    After each action the shift record is re-read so follow-up actions that
    became due (e.g. ``invite`` right after ``schedule`` assigns volunteers)
    run in the same cycle. A failed action stops that shift's cycle; it is
    retried on the next pass because its completion flag was never set.
    """
    now = now or clock()
    shifts_data = db.scan(config.ddb_shifts_table)
    executed: list[dict[str, Any]] = []

    for item in shifts_data:
        shift = Shift.from_dict(item)
        if advance_lifecycle_status(shift, now):
            db.put_item(config.ddb_shifts_table, shift.to_dict())
        while True:
            pending = due_actions(shift, now)
            if not pending:
                break
            action = pending[0]
            try:
                result = run_action(action, shift.id)
                executed.append(result)
            except Exception as e:  # noqa: BLE001
                logger.exception("Automation action %s for shift %s failed: %s", action, shift.id, e)
                from vshift.utils.metrics import agent_action_failed
                agent_action_failed(action=action)
                executed.append({"action": action, "shift_id": shift.id, "error": str(e)})
                break
            refreshed = db.get_item(config.ddb_shifts_table, {"id": shift.id})
            if not refreshed:
                break
            shift = Shift.from_dict(refreshed)

    return executed


class AutomationWorker:
    """Background worker that periodically runs due actions."""

    def __init__(self, interval_seconds: int | None = None):
        self.interval = interval_seconds or config.scheduler_interval_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="vshift-automation")
        self._thread.start()
        logger.info("Automation worker started (interval=%ss, accel=%sx)", self.interval, config.time_acceleration)

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                results = run_due_cycle()
                if results:
                    logger.info("Automation cycle ran %d action(s)", len(results))
            except Exception as e:  # noqa: BLE001
                logger.exception("Automation cycle error: %s", e)
            self._stop.wait(self.interval)
