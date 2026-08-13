from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
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
    version="0.1.0",
)


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
        result = agent(f"Find and match volunteers for shift {req.shift_id}. Use the tools to query the shift and find matching volunteers.")
        return {"action": "schedule", "result": str(result)}

    elif req.action == "remind" and req.shift_id:
        agent = create_communicator_agent()
        result = agent(f"Send 48-hour reminders to all confirmed volunteers for shift {req.shift_id}.")
        return {"action": "remind", "result": str(result)}

    elif req.action == "noshow_check" and req.shift_id:
        agent = create_recovery_agent()
        result = agent(f"Check shift {req.shift_id} for no-shows and find replacements if needed.")
        return {"action": "noshow_check", "result": str(result)}

    elif req.action == "track" and req.shift_id:
        agent = create_tracker_agent()
        result = agent(f"Track hours and update profiles for completed shift {req.shift_id}.")
        return {"action": "track", "result": str(result)}

    elif req.action == "report":
        agent = create_reporter_agent()
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
        result = agent(f"Generate a weekly report from {start} to {end}.")
        return {"action": "report", "result": str(result)}

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action or missing shift_id: {req.action}")


@app.get("/api/ping")
async def ping() -> dict[str, str]:
    return {"status": "ok"}
