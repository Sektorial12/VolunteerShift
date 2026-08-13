from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any


def _to_dynamodb(value: Any) -> Any:
    """Convert float values to Decimal for DynamoDB compatibility."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_dynamodb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_dynamodb(v) for v in value]
    return value


class VolunteerStatus(str, Enum):
    ACTIVE = "active"
    PENDING = "pending"
    INACTIVE = "inactive"


class ShiftStatus(str, Enum):
    OPEN = "open"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class AssignmentStatus(str, Enum):
    INVITED = "invited"
    CONFIRMED = "confirmed"
    DECLINED = "declined"
    NO_RESPONSE = "no_response"
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    NO_SHOW = "no_show"
    REPLACED = "replaced"


class MessageType(str, Enum):
    INVITATION = "invitation"
    CONFIRMATION = "confirmation"
    REMINDER_48H = "reminder_48h"
    REMINDER_2H = "reminder_2h"
    URGENT_REPLACEMENT = "urgent_replacement"
    COORDINATOR_NOTIFICATION = "coordinator_notification"


class Channel(str, Enum):
    EMAIL = "email"
    SMS = "sms"
    DASHBOARD = "dashboard"


class ReportPeriod(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"


@dataclass
class Volunteer:
    id: str
    name: str
    email: str
    phone: str = ""
    skills: list[str] = field(default_factory=list)
    availability: dict[str, list[str]] = field(default_factory=dict)
    reliability_score: float = 0.8
    total_hours: float = 0.0
    past_shifts: list[str] = field(default_factory=list)
    status: VolunteerStatus = VolunteerStatus.ACTIVE
    preferred_channels: list[str] = field(default_factory=lambda: ["email"])
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return _to_dynamodb({
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "skills": self.skills,
            "availability": self.availability,
            "reliability_score": self.reliability_score,
            "total_hours": self.total_hours,
            "past_shifts": self.past_shifts,
            "status": self.status.value,
            "preferred_channels": self.preferred_channels,
            "notes": self.notes,
        })

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Volunteer:
        return cls(
            id=data["id"],
            name=data["name"],
            email=data["email"],
            phone=data.get("phone", ""),
            skills=data.get("skills", []),
            availability=data.get("availability", {}),
            reliability_score=float(data.get("reliability_score", 0.8)),
            total_hours=float(data.get("total_hours", 0.0)),
            past_shifts=data.get("past_shifts", []),
            status=VolunteerStatus(data.get("status", "active")),
            preferred_channels=data.get("preferred_channels", ["email"]),
            notes=data.get("notes", ""),
        )


@dataclass
class Assignment:
    volunteer_id: str
    status: AssignmentStatus = AssignmentStatus.INVITED
    confirmed_at: str | None = None
    checked_in_at: str | None = None
    checked_out_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "volunteer_id": self.volunteer_id,
            "status": self.status.value,
            "confirmed_at": self.confirmed_at,
            "checked_in_at": self.checked_in_at,
            "checked_out_at": self.checked_out_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Assignment:
        return cls(
            volunteer_id=data["volunteer_id"],
            status=AssignmentStatus(data.get("status", "invited")),
            confirmed_at=data.get("confirmed_at"),
            checked_in_at=data.get("checked_in_at"),
            checked_out_at=data.get("checked_out_at"),
        )


@dataclass
class Shift:
    id: str
    program_name: str
    start_time: str
    end_time: str
    location: str
    required_skills: list[str] = field(default_factory=list)
    required_volunteers: int = 1
    assigned_volunteers: list[Assignment] = field(default_factory=list)
    status: ShiftStatus = ShiftStatus.OPEN

    def to_dict(self) -> dict[str, Any]:
        return _to_dynamodb({
            "id": self.id,
            "program_name": self.program_name,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "location": self.location,
            "required_skills": self.required_skills,
            "required_volunteers": self.required_volunteers,
            "assigned_volunteers": [a.to_dict() for a in self.assigned_volunteers],
            "status": self.status.value,
        })

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Shift:
        return cls(
            id=data["id"],
            program_name=data["program_name"],
            start_time=data["start_time"],
            end_time=data["end_time"],
            location=data["location"],
            required_skills=data.get("required_skills", []),
            required_volunteers=data.get("required_volunteers", 1),
            assigned_volunteers=[
                Assignment.from_dict(a) for a in data.get("assigned_volunteers", [])
            ],
            status=ShiftStatus(data.get("status", "open")),
        )


@dataclass
class Communication:
    id: str
    shift_id: str
    volunteer_id: str
    channel: Channel
    message_type: MessageType
    content: str
    sent_at: str
    response: str | None = None
    responded_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "shift_id": self.shift_id,
            "volunteer_id": self.volunteer_id,
            "channel": self.channel.value,
            "message_type": self.message_type.value,
            "content": self.content,
            "sent_at": self.sent_at,
            "response": self.response,
            "responded_at": self.responded_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Communication:
        return cls(
            id=data["id"],
            shift_id=data["shift_id"],
            volunteer_id=data["volunteer_id"],
            channel=Channel(data.get("channel", "email")),
            message_type=MessageType(data.get("message_type", "invitation")),
            content=data["content"],
            sent_at=data["sent_at"],
            response=data.get("response"),
            responded_at=data.get("responded_at"),
        )


@dataclass
class Report:
    id: str
    period: ReportPeriod
    start_date: str
    end_date: str
    total_shifts: int = 0
    total_volunteers: int = 0
    total_hours: float = 0.0
    no_show_rate: float = 0.0
    coverage_rate: float = 0.0
    generated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return _to_dynamodb({
            "id": self.id,
            "period": self.period.value,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "total_shifts": self.total_shifts,
            "total_volunteers": self.total_volunteers,
            "total_hours": self.total_hours,
            "no_show_rate": self.no_show_rate,
            "coverage_rate": self.coverage_rate,
            "generated_at": self.generated_at,
        })

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Report:
        return cls(
            id=data["id"],
            period=ReportPeriod(data.get("period", "weekly")),
            start_date=data["start_date"],
            end_date=data["end_date"],
            total_shifts=int(data.get("total_shifts", 0)),
            total_volunteers=int(data.get("total_volunteers", 0)),
            total_hours=float(data.get("total_hours", 0.0)),
            no_show_rate=float(data.get("no_show_rate", 0.0)),
            coverage_rate=float(data.get("coverage_rate", 0.0)),
            generated_at=data.get("generated_at", ""),
        )
