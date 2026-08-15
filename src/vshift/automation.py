"""Automation scheduler for VolunteerShift.

Runs the agent actions (schedule, remind, no-show check, track) automatically
based on each shift's start/end times, so the system operates without manual
``/api/trigger`` calls.

Trigger model (per shift):
    - schedule:       once, when the shift is first created (open, no assignment)
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
from vshift.models.entities import Shift, ShiftStatus
from vshift.utils.db import db

logger = logging.getLogger(__name__)

# Mapping of action name -> (shift flag field that marks it done, required shift status)
_ACTION_META = {
    "schedule": ("scheduled_at", None),
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
            "Query the shift, find matching volunteers, rank them, and use "
            "assign_volunteers_to_shift to assign the top candidates."
        )
    elif action in ("remind_48h", "remind_2h"):
        from vshift.agents.communicator import create_communicator_agent
        agent = create_communicator_agent()
        prompt = (
            f"Send {'48-hour' if action == 'remind_48h' else 'final 2-hour'} reminders "
            f"to all confirmed volunteers for shift {shift_id}."
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
        "remind_48h": ["log_communication"],
        "remind_2h": ["log_communication"],
        "noshow_check": ["check_shift_coverage"],
        "track": ["log_hours"],
    }.get(action, [])


def _resume_prompt(action: str) -> str:
    return {
        "schedule": "You MUST call assign_volunteers_to_shift to assign the top candidates.",
        "remind_48h": "You MUST call send_email/send_sms and log_communication.",
        "remind_2h": "You MUST call send_email/send_sms and log_communication.",
        "noshow_check": "You MUST call check_shift_coverage to detect no-shows.",
        "track": "You MUST actually call log_hours for volunteers who checked in and out.",
    }.get(action, "")


def run_due_cycle(now: datetime | None = None) -> list[dict[str, Any]]:
    """Scan all shifts, run any due actions, and return the results."""
    now = now or clock()
    shifts_data = db.scan(config.ddb_shifts_table)
    executed: list[dict[str, Any]] = []

    for item in shifts_data:
        shift = Shift.from_dict(item)
        for action in due_actions(shift, now):
            # Re-check due status inside the loop to avoid acting on a shift whose
            # status changed while earlier actions in this cycle ran.
            try:
                result = run_action(action, shift.id)
                executed.append(result)
            except Exception as e:  # noqa: BLE001
                logger.exception("Automation action %s for shift %s failed: %s", action, shift.id, e)
                executed.append({"action": action, "shift_id": shift.id, "error": str(e)})

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
