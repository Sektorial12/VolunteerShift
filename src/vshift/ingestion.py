"""Data ingestion for VolunteerShift.

Provides webhook-style ingestion so external systems (nonprofit portals, Google
Calendar, Airtable, CSV uploads) can feed shifts and volunteers into DynamoDB.
Also handles volunteer response ingestion via email/web form.

All ingestion is validated and deduplicated before writing.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from vshift.config import config
from vshift.models.entities import (
    Shift,
    ShiftStatus,
    Volunteer,
    VolunteerStatus,
)
from vshift.utils.db import db

# Programs are open-set; any string is accepted. Keep the canonical list for
# validation hints / dashboard filtering.
KNOWN_PROGRAMS = ("Food Bank Distribution", "Literacy Tutoring", "Animal Shelter Care")


def _parse_datetime(value: str) -> str:
    """Parse and normalize an ISO-ish datetime string, raising on invalid input."""
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError) as e:
        raise ValueError(f"Invalid datetime: {value!r}") from e
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _split_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    return []


def find_duplicate_shift(
    program_name: str,
    start_time: str,
    location: str,
) -> Shift | None:
    """Return an existing non-cancelled shift matching program+start+location."""
    items = db.scan(config.ddb_shifts_table)
    for item in items:
        s = Shift.from_dict(item)
        if (
            s.program_name == program_name
            and s.start_time == start_time
            and s.location == location
            and s.status != ShiftStatus.CANCELLED
        ):
            return s
    return None


def find_volunteer_by_email(email: str) -> Volunteer | None:
    """Return an existing volunteer with the given email (case-insensitive)."""
    email = (email or "").strip().lower()
    if not email:
        return None
    items = db.scan(config.ddb_volunteers_table)
    for item in items:
        if str(item.get("email", "")).strip().lower() == email:
            return Volunteer.from_dict(item)
    return None


def ingest_shift(payload: dict[str, Any], dedupe: bool = True) -> dict[str, Any]:
    """Create a shift from an external payload.

    Expected keys: program_name, start_time, end_time, location,
    required_skills (optional), required_volunteers (optional).

    When ``dedupe`` is True, refuses to create a shift that duplicates an
    existing one (same program + start + location).
    """
    program = (payload.get("program_name") or "").strip()
    start_raw = (payload.get("start_time") or "").strip()
    end_raw = (payload.get("end_time") or "").strip()
    location = (payload.get("location") or "").strip()

    if not program or not start_raw or not end_raw or not location:
        raise ValueError("program_name, start_time, end_time, and location are required")

    start_time = _parse_datetime(start_raw)
    end_time = _parse_datetime(end_raw)
    if end_time <= start_time:
        raise ValueError("end_time must be after start_time")

    required_skills = _split_list(payload.get("required_skills"))
    try:
        required_volunteers = int(payload.get("required_volunteers", 1))
    except (TypeError, ValueError) as e:
        raise ValueError("required_volunteers must be an integer") from e
    if required_volunteers < 1:
        raise ValueError("required_volunteers must be >= 1")

    if dedupe:
        existing = find_duplicate_shift(program, start_time, location)
        if existing:
            return {
                "status": "duplicate",
                "shift_id": existing.id,
                "message": "Shift already exists",
            }

    shift = Shift(
        id=str(uuid.uuid4()),
        program_name=program,
        start_time=start_time,
        end_time=end_time,
        location=location,
        required_skills=required_skills,
        required_volunteers=required_volunteers,
        status=ShiftStatus.OPEN,
    )
    db.put_item(config.ddb_shifts_table, shift.to_dict())
    return {"status": "created", "shift_id": shift.id}


def ingest_volunteer(payload: dict[str, Any], upsert_by_email: bool = True) -> dict[str, Any]:
    """Create or update a volunteer from an external payload.

    Expected keys: name, email, phone (optional), skills (optional),
    availability (optional), preferred_channels (optional).

    When ``upsert_by_email`` is True, an existing volunteer with the same email
    is updated instead of creating a duplicate.
    """
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()

    if not name or not email:
        raise ValueError("name and email are required")

    existing = find_volunteer_by_email(email) if upsert_by_email else None

    if existing:
        if name:
            existing.name = name
        existing.skills = _split_list(payload.get("skills")) or existing.skills
        if payload.get("availability") is not None:
            existing.availability = payload["availability"]
        if payload.get("phone"):
            existing.phone = str(payload["phone"])
        if payload.get("preferred_channels"):
            existing.preferred_channels = _split_list(payload["preferred_channels"])
        db.put_item(config.ddb_volunteers_table, existing.to_dict())
        return {"status": "updated", "volunteer_id": existing.id}

    volunteer = Volunteer(
        id=str(uuid.uuid4()),
        name=name,
        email=email,
        phone=str(payload.get("phone", "")),
        skills=_split_list(payload.get("skills")),
        availability=payload.get("availability", {}),
        status=VolunteerStatus.ACTIVE,
        preferred_channels=_split_list(payload.get("preferred_channels")) or ["email"],
    )
    db.put_item(config.ddb_volunteers_table, volunteer.to_dict())
    return {"status": "created", "volunteer_id": volunteer.id}


def parse_volunteer_email_reply(subject: str, body: str) -> str | None:
    """Parse a volunteer email reply into a response ('confirm'/'decline').

    Returns None if the reply cannot be confidently classified.
    """
    text = f"{subject} {body}".lower()
    if any(word in text for word in ("yes", "confirm", "confirming", "i'll be there", "i will be there", "count me in")):
        return "confirm"
    if any(word in text for word in ("no", "decline", "can't", "cannot", "unavailable", "not able")):
        return "decline"
    return None
