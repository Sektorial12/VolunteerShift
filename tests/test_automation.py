from datetime import datetime, timedelta, timezone

from vshift.models.entities import Shift, ShiftStatus


def _dt(offset: timedelta) -> str:
    base = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    return (base + offset).isoformat()


def _shift(**kwargs) -> Shift:
    defaults = dict(
        id="s-test",
        program_name="Food Bank",
        start_time=_dt(timedelta(days=3)),
        end_time=_dt(timedelta(days=3, hours=4)),
        location="Somewhere",
        status=ShiftStatus.OPEN,
    )
    defaults.update(kwargs)
    return Shift(**defaults)


def test_open_unassigned_shift_schedules():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift()
    assert "schedule" in due_actions(shift, now)


def test_scheduled_shift_does_not_reschedule():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(scheduled_at="2026-08-15T11:00:00+00:00")
    assert "schedule" not in due_actions(shift, now)


def test_remind_48h_fires_near_shift():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    # shift starts in 10h (within 48h lead) -> remind_48h due
    shift = _shift(
        start_time=_dt(timedelta(hours=10)),
        end_time=_dt(timedelta(hours=14)),
        scheduled_at="done",
        status=ShiftStatus.PARTIALLY_FILLED,
    )
    assert "remind_48h" in due_actions(shift, now)
    # not yet at 2h lead
    assert "remind_2h" not in due_actions(shift, now)


def test_remind_2h_fires_within_two_hours():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        start_time=_dt(timedelta(hours=1)),
        end_time=_dt(timedelta(hours=5)),
        scheduled_at="done",
        reminder_48h_sent=True,
        status=ShiftStatus.PARTIALLY_FILLED,
    )
    assert "remind_2h" in due_actions(shift, now)


def test_noshow_check_after_threshold():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        start_time=_dt(timedelta(minutes=-5)),
        end_time=_dt(timedelta(hours=3)),
        scheduled_at="done",
        reminder_48h_sent=True,
        reminder_2h_sent=True,
        status=ShiftStatus.IN_PROGRESS,
    )
    assert "noshow_check" in due_actions(shift, now)


def test_track_after_shift_end():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        start_time=_dt(timedelta(hours=-3)),
        end_time=_dt(timedelta(minutes=-5)),
        scheduled_at="done",
        reminder_48h_sent=True,
        reminder_2h_sent=True,
        no_show_checked=True,
        status=ShiftStatus.COMPLETED,
    )
    assert "track" in due_actions(shift, now)


def test_cancelled_shift_no_actions():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(status=ShiftStatus.CANCELLED)
    assert due_actions(shift, now) == []


def test_idempotent_flags_prevent_duplicate_reminders():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        start_time=_dt(timedelta(hours=1)),
        end_time=_dt(timedelta(hours=5)),
        scheduled_at="done",
        reminder_48h_sent=True,
        reminder_2h_sent=True,
        status=ShiftStatus.PARTIALLY_FILLED,
    )
    actions = due_actions(shift, now)
    assert "remind_48h" not in actions
    assert "remind_2h" not in actions
