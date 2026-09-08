from datetime import datetime, timedelta, timezone

from vshift.models.entities import Assignment, AssignmentStatus, Shift, ShiftStatus


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


def test_invite_due_for_assigned_volunteers():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        scheduled_at="done",
        status=ShiftStatus.PARTIALLY_FILLED,
        assigned_volunteers=[Assignment(volunteer_id="v001", status=AssignmentStatus.INVITED)],
    )
    assert "invite" in due_actions(shift, now)


def test_invite_not_due_after_invitations_sent():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        scheduled_at="done",
        invitations_sent=True,
        status=ShiftStatus.PARTIALLY_FILLED,
        assigned_volunteers=[Assignment(volunteer_id="v001", status=AssignmentStatus.INVITED)],
    )
    assert "invite" not in due_actions(shift, now)


def test_invite_not_due_without_invited_assignments():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        scheduled_at="done",
        status=ShiftStatus.PARTIALLY_FILLED,
        assigned_volunteers=[Assignment(volunteer_id="v001", status=AssignmentStatus.DECLINED)],
    )
    assert "invite" not in due_actions(shift, now)


def test_invite_not_due_for_completed_shift():
    from vshift.automation import due_actions

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        scheduled_at="done",
        status=ShiftStatus.COMPLETED,
        assigned_volunteers=[Assignment(volunteer_id="v001", status=AssignmentStatus.INVITED)],
    )
    assert "invite" not in due_actions(shift, now)


def test_respond_link_format():
    from vshift.automation import respond_link

    link = respond_link("v001", "s001")
    assert link.startswith("http")
    assert link.endswith("/respond?volunteer_id=v001&shift_id=s001")


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


def test_filled_shift_goes_in_progress_after_start():
    from vshift.automation import advance_lifecycle_status

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        start_time=_dt(timedelta(minutes=-10)),
        end_time=_dt(timedelta(hours=3)),
        scheduled_at="done",
        status=ShiftStatus.FILLED,
    )
    assert advance_lifecycle_status(shift, now) is True
    assert shift.status == ShiftStatus.IN_PROGRESS


def test_future_filled_shift_stays_unstarted():
    from vshift.automation import advance_lifecycle_status

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        start_time=_dt(timedelta(hours=10)),
        end_time=_dt(timedelta(hours=14)),
        scheduled_at="done",
        status=ShiftStatus.FILLED,
    )
    assert advance_lifecycle_status(shift, now) is False
    assert shift.status == ShiftStatus.FILLED


def test_open_unstaffed_shift_not_flipped():
    from vshift.automation import advance_lifecycle_status

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    shift = _shift(
        start_time=_dt(timedelta(minutes=-10)),
        end_time=_dt(timedelta(hours=3)),
        status=ShiftStatus.OPEN,
    )
    assert advance_lifecycle_status(shift, now) is False
    assert shift.status == ShiftStatus.OPEN


def test_cancelled_and_in_progress_shifts_not_flipped():
    from vshift.automation import advance_lifecycle_status

    now = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    for status in (ShiftStatus.CANCELLED, ShiftStatus.IN_PROGRESS, ShiftStatus.COMPLETED):
        shift = _shift(
            start_time=_dt(timedelta(minutes=-10)),
            end_time=_dt(timedelta(hours=3)),
            status=status,
        )
        assert advance_lifecycle_status(shift, now) is False
        assert shift.status == status


def test_mark_track_done_completes_shift(monkeypatch):
    from vshift import automation

    stored = {
        "s-test": _shift(
            start_time=_dt(timedelta(hours=-5)),
            end_time=_dt(timedelta(minutes=-1)),
            scheduled_at="done",
            reminder_48h_sent=True,
            reminder_2h_sent=True,
            no_show_checked=True,
            hours_tracked=False,
            status=ShiftStatus.IN_PROGRESS,
        ).to_dict()
    }

    class FakeDB:
        def get_item(self, table, key):
            return stored.get(key["id"])

        def put_item(self, table, item):
            stored[item["id"]] = item

    monkeypatch.setattr(automation, "db", FakeDB())

    automation.mark_action_done("s-test", "track")
    updated = Shift.from_dict(stored["s-test"])
    assert updated.hours_tracked is True
    assert updated.status == ShiftStatus.COMPLETED
