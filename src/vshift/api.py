from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from vshift.config import config
from vshift.models.entities import (
    Assignment,
    AssignmentStatus,
    Shift,
    ShiftStatus,
)
from vshift.utils.db import db

app = FastAPI(
    title="VolunteerShift API",
    description="Autonomous volunteer coordination agent",
    version="0.2.0",
)

def _cors_origins() -> list[str]:
    raw = os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    )
    return [o.strip() for o in raw.split(",") if o.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _start_automation() -> None:
    from vshift.automation import AutomationWorker
    from vshift.utils.telemetry import setup_telemetry

    setup_telemetry()

    global _automation_worker
    _automation_worker = AutomationWorker()
    if config.automation_enabled:
        _automation_worker.start()


@app.on_event("shutdown")
async def _stop_automation() -> None:
    if _automation_worker is not None:
        _automation_worker.stop()


_automation_worker = None


class ShiftCreate(BaseModel):
    program_name: str
    start_time: str
    end_time: str
    location: str
    required_skills: list[str] = []
    required_volunteers: int = 1


class CheckInOut(BaseModel):
    volunteer_id: str


class VolunteerResponse(BaseModel):
    volunteer_id: str
    shift_id: str
    response: str  # "confirm" or "decline"


class TriggerRequest(BaseModel):
    action: str  # "schedule", "remind", "noshow_check", "track", "report"
    shift_id: str | None = None


class IngestShiftRequest(BaseModel):
    program_name: str
    start_time: str
    end_time: str
    location: str
    required_skills: list[str] = []
    required_volunteers: int = 1


class IngestVolunteerRequest(BaseModel):
    name: str
    email: str
    phone: str = ""
    skills: list[str] = []
    availability: dict[str, list[str]] = {}
    preferred_channels: list[str] = []


class EmailReplyRequest(BaseModel):
    subject: str = ""
    body: str = ""
    volunteer_email: str = ""
    shift_id: str = ""


@app.get("/api/dashboard")
async def get_dashboard() -> dict[str, Any]:
    shifts = db.scan(config.ddb_shifts_table)
    comms = db.scan(config.ddb_communications_table)
    recent_comms = sorted(comms, key=lambda x: x.get("sent_at", ""), reverse=True)[:20]

    active_shifts = [s for s in shifts if s.get("status") in ("open", "partially_filled", "filled", "in_progress")]

    return {
        "active_shifts": active_shifts,
        "recent_communications": recent_comms,
        "total_shifts": len(shifts),
        "total_communications": len(comms),
    }


@app.post("/api/shifts")
async def create_shift(req: ShiftCreate) -> dict[str, Any]:
    shift_id = str(uuid.uuid4())
    shift = Shift(
        id=shift_id,
        program_name=req.program_name,
        start_time=req.start_time,
        end_time=req.end_time,
        location=req.location,
        required_skills=req.required_skills,
        required_volunteers=req.required_volunteers,
        status=ShiftStatus.OPEN,
    )
    db.put_item(config.ddb_shifts_table, shift.to_dict())
    return {"shift_id": shift_id, "status": "created"}


@app.get("/api/shifts")
async def list_shifts() -> list[dict[str, Any]]:
    return db.scan(config.ddb_shifts_table)


@app.get("/api/shifts/{shift_id}")
async def get_shift(shift_id: str) -> dict[str, Any]:
    item = db.get_item(config.ddb_shifts_table, {"id": shift_id})
    if not item:
        raise HTTPException(status_code=404, detail="Shift not found")
    return item


@app.post("/api/shifts/{shift_id}/checkin")
async def check_in(shift_id: str, req: CheckInOut) -> dict[str, Any]:
    shift_data = db.get_item(config.ddb_shifts_table, {"id": shift_id})
    if not shift_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift = Shift.from_dict(shift_data)
    now = datetime.now(timezone.utc).isoformat()

    for a in shift.assigned_volunteers:
        if a.volunteer_id == req.volunteer_id:
            a.status = AssignmentStatus.CHECKED_IN
            a.checked_in_at = now
            db.put_item(config.ddb_shifts_table, shift.to_dict())
            return {"volunteer_id": req.volunteer_id, "status": "checked_in", "time": now}

    raise HTTPException(status_code=404, detail="Volunteer not assigned to this shift")


@app.post("/api/shifts/{shift_id}/checkout")
async def check_out(shift_id: str, req: CheckInOut) -> dict[str, Any]:
    shift_data = db.get_item(config.ddb_shifts_table, {"id": shift_id})
    if not shift_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift = Shift.from_dict(shift_data)
    now = datetime.now(timezone.utc).isoformat()

    for a in shift.assigned_volunteers:
        if a.volunteer_id == req.volunteer_id:
            a.status = AssignmentStatus.CHECKED_OUT
            a.checked_out_at = now
            db.put_item(config.ddb_shifts_table, shift.to_dict())
            return {"volunteer_id": req.volunteer_id, "status": "checked_out", "time": now}

    raise HTTPException(status_code=404, detail="Volunteer not assigned to this shift")


@app.get("/api/volunteers")
async def list_volunteers() -> list[dict[str, Any]]:
    return db.scan(config.ddb_volunteers_table)


@app.get("/api/volunteers/{volunteer_id}")
async def get_volunteer(volunteer_id: str) -> dict[str, Any]:
    item = db.get_item(config.ddb_volunteers_table, {"id": volunteer_id})
    if not item:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    return item


@app.get("/api/communications")
async def list_communications() -> list[dict[str, Any]]:
    return db.scan(config.ddb_communications_table)


@app.get("/api/audit")
async def list_audit(sort: str = "desc") -> list[dict[str, Any]]:
    """Return the agent audit trail (tool call history), newest first."""
    items = db.scan(config.ddb_audit_table)
    items.sort(key=lambda x: x.get("timestamp", ""), reverse=(sort == "desc"))
    return items[:200]


@app.get("/api/reports")
async def list_reports() -> list[dict[str, Any]]:
    return db.scan(config.ddb_reports_table)


@app.get("/api/reports/{report_id}")
async def get_report(report_id: str) -> dict[str, Any]:
    item = db.get_item(config.ddb_reports_table, {"id": report_id})
    if not item:
        raise HTTPException(status_code=404, detail="Report not found")
    return item


@app.post("/api/volunteers/respond")
async def volunteer_respond(req: VolunteerResponse) -> dict[str, Any]:
    """Volunteer confirms or declines a shift invitation via web form."""
    shift_data = db.get_item(config.ddb_shifts_table, {"id": req.shift_id})
    if not shift_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift = Shift.from_dict(shift_data)
    now = datetime.now(timezone.utc).isoformat()

    for a in shift.assigned_volunteers:
        if a.volunteer_id == req.volunteer_id:
            if req.response == "confirm":
                a.status = AssignmentStatus.CONFIRMED
                a.confirmed_at = now
            elif req.response == "decline":
                a.status = AssignmentStatus.DECLINED
            else:
                raise HTTPException(status_code=400, detail="Response must be 'confirm' or 'decline'")

            confirmed = sum(1 for a in shift.assigned_volunteers if a.status == AssignmentStatus.CONFIRMED)
            if confirmed >= shift.required_volunteers:
                shift.status = ShiftStatus.FILLED
            elif confirmed > 0:
                shift.status = ShiftStatus.PARTIALLY_FILLED

            db.put_item(config.ddb_shifts_table, shift.to_dict())
            return {
                "volunteer_id": req.volunteer_id,
                "shift_id": req.shift_id,
                "response": req.response,
                "shift_status": shift.status.value,
            }

    raise HTTPException(status_code=404, detail="Volunteer not assigned to this shift")


def _wire(agent, required_tools: list[str], resume_prompt: str) -> None:
    """Register audit hooks + reliability (auto-resume) hooks on an agent."""
    from vshift.agents._wiring import wire_agent

    wire_agent(agent, required_tools, resume_prompt)


@app.post("/api/ingest/shift")
async def ingest_shift_endpoint(req: IngestShiftRequest) -> dict[str, Any]:
    """Ingest a shift from an external system."""
    from vshift.ingestion import ingest_shift

    try:
        result = ingest_shift(req.model_dump())
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/api/ingest/volunteer")
async def ingest_volunteer_endpoint(req: IngestVolunteerRequest) -> dict[str, Any]:
    """Ingest a volunteer from an external system (upserts by email)."""
    from vshift.ingestion import ingest_volunteer

    try:
        result = ingest_volunteer(req.model_dump())
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/api/ingest/email-reply")
async def ingest_email_reply(req: EmailReplyRequest) -> dict[str, Any]:
    """Ingest a volunteer email reply and apply it to their assignment.

    This is the integration point for SES inbound email handling. A Lambda /
    SES rule calls this endpoint with the parsed subject/body + volunteer email.
    """
    from vshift.ingestion import find_volunteer_by_email, parse_volunteer_email_reply
    from vshift.models.entities import AssignmentStatus

    response = parse_volunteer_email_reply(req.subject, req.body)
    if response is None:
        return {"status": "unrecognized", "detail": "Could not classify email as confirm/decline"}

    volunteer = find_volunteer_by_email(req.volunteer_email) if req.volunteer_email else None
    if not volunteer:
        return {"status": "error", "detail": "Volunteer email not found"}

    shift_data = db.get_item(config.ddb_shifts_table, {"id": req.shift_id})
    if not shift_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift = Shift.from_dict(shift_data)
    now = datetime.now(timezone.utc).isoformat()

    for a in shift.assigned_volunteers:
        if a.volunteer_id == volunteer.id:
            if response == "confirm":
                a.status = AssignmentStatus.CONFIRMED
                a.confirmed_at = now
            else:
                a.status = AssignmentStatus.DECLINED

            confirmed = sum(1 for x in shift.assigned_volunteers if x.status == AssignmentStatus.CONFIRMED)
            if confirmed >= shift.required_volunteers:
                shift.status = ShiftStatus.FILLED
            elif confirmed > 0:
                shift.status = ShiftStatus.PARTIALLY_FILLED

            db.put_item(config.ddb_shifts_table, shift.to_dict())
            return {
                "status": "applied",
                "volunteer_id": volunteer.id,
                "shift_id": req.shift_id,
                "response": response,
                "shift_status": shift.status.value,
            }

    return {"status": "error", "detail": "Volunteer not assigned to this shift"}


@app.post("/api/trigger")
async def trigger_agent(req: TriggerRequest) -> dict[str, Any]:
    """Manually trigger a specific agent action on real data."""
    from vshift.agents.scheduler import create_scheduler_agent
    from vshift.agents.communicator import create_communicator_agent
    from vshift.agents.recovery import create_recovery_agent
    from vshift.agents.tracker import create_tracker_agent
    from vshift.agents.reporter import create_reporter_agent

    if req.action == "schedule" and req.shift_id:
        agent = create_scheduler_agent()
        _wire(agent, ["assign_volunteers_to_shift"],
              f"Query shift {req.shift_id}, find matching volunteers, and call assign_volunteers_to_shift to assign the top candidates. You MUST actually call the assign_volunteers_to_shift tool.")
        result = agent(f"Find, match, and assign volunteers for shift {req.shift_id}. Query the shift, find matching volunteers, rank them, and use assign_volunteers_to_shift to assign the top candidates.")
        return {"action": "schedule", "result": str(result)}

    elif req.action == "remind" and req.shift_id:
        agent = create_communicator_agent()
        _wire(agent, ["log_communication"],
              f"Send 48-hour reminders to all confirmed volunteers for shift {req.shift_id} using send_email/send_sms, and call log_communication for each. You MUST call the tools.")
        result = agent(f"Send 48-hour reminders to all confirmed volunteers for shift {req.shift_id}.")
        return {"action": "remind", "result": str(result)}

    elif req.action == "noshow_check" and req.shift_id:
        agent = create_recovery_agent()
        _wire(agent, ["check_shift_coverage"],
              f"Call check_shift_coverage for shift {req.shift_id} to detect no-shows, and act on the results. You MUST call the check_shift_coverage tool.")
        result = agent(f"Check shift {req.shift_id} for no-shows and find replacements if needed.")
        return {"action": "noshow_check", "result": str(result)}

    elif req.action == "track" and req.shift_id:
        agent = create_tracker_agent()
        _wire(agent, ["log_hours"],
              f"Call check_shift_coverage for shift {req.shift_id}, then for each volunteer who checked in and out call log_hours and update_volunteer_profile. You MUST actually call log_hours.")
        result = agent(f"Track hours and update profiles for completed shift {req.shift_id}. Call check_shift_coverage, then for each volunteer who checked in and out call log_hours and update_volunteer_profile. You MUST actually call these tools, not just describe them.")
        return {"action": "track", "result": str(result)}

    elif req.action == "report":
        from datetime import timedelta
        agent = create_reporter_agent()
        _wire(agent, ["generate_report"],
              "You MUST call the generate_report tool to create and store the report. Call it now with the exact dates provided.")
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end = (now + timedelta(days=14)).strftime("%Y-%m-%d")
        result = agent(f"Generate a weekly report. The exact start_date is {start} and the exact end_date is {end}. Call the generate_report tool with period='weekly', start_date='{start}', end_date='{end}'. You MUST call generate_report with these exact dates to create and store the report.")
        return {"action": "report", "result": str(result)}

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action or missing shift_id: {req.action}")


@app.get("/api/ping")
async def ping() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/automation/run")
async def automation_run() -> dict[str, Any]:
    """Manually run the automation cycle (for testing/control)."""
    from vshift.automation import run_due_cycle

    results = run_due_cycle()
    return {"ran": len(results), "results": results}


@app.get("/api/automation/status")
async def automation_status() -> dict[str, Any]:
    """Return automation worker status."""
    return {
        "enabled": config.automation_enabled,
        "worker_running": _automation_worker is not None and _automation_worker._thread is not None and _automation_worker._thread.is_alive(),
        "interval_seconds": config.scheduler_interval_seconds,
        "time_acceleration": config.time_acceleration,
        "clock": __import__("vshift.automation", fromlist=["clock"]).clock().isoformat(),
    }
