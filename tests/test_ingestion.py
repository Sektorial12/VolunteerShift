from datetime import datetime, timezone

import pytest


def test_parse_datetime_normalizes_tz():
    from vshift.ingestion import _parse_datetime

    out = _parse_datetime("2026-08-20T09:00:00Z")
    assert out.endswith("+00:00")


def test_parse_datetime_rejects_invalid():
    from vshift.ingestion import _parse_datetime

    with pytest.raises(ValueError):
        _parse_datetime("not-a-date")


def test_split_list_handles_csv_and_list():
    from vshift.ingestion import _split_list

    assert _split_list("a, b, c") == ["a", "b", "c"]
    assert _split_list(["x", "y"]) == ["x", "y"]
    assert _split_list(None) == []
    assert _split_list("") == []


def test_parse_volunteer_email_reply_confirm():
    from vshift.ingestion import parse_volunteer_email_reply

    assert parse_volunteer_email_reply("Re: Shift", "Yes I will be there") == "confirm"


def test_parse_volunteer_email_reply_decline():
    from vshift.ingestion import parse_volunteer_email_reply

    assert parse_volunteer_email_reply("Re: Shift", "Sorry, can't make it") == "decline"


def test_parse_volunteer_email_reply_unrecognized():
    from vshift.ingestion import parse_volunteer_email_reply

    assert parse_volunteer_email_reply("Re: Shift", "Is parking available?") is None


def test_ingest_shift_validation():
    from vshift.ingestion import ingest_shift

    with pytest.raises(ValueError):
        ingest_shift({"program_name": "X"})  # missing required fields

    with pytest.raises(ValueError):
        ingest_shift({
            "program_name": "X",
            "start_time": "2026-08-20T10:00:00Z",
            "end_time": "2026-08-20T09:00:00Z",  # end before start
            "location": "L",
        })
