"""Generate and load seed data into DynamoDB.

Run: python -m vshift.utils.seed_data
"""

import uuid
from datetime import datetime, timedelta, timezone

from vshift.config import config
from vshift.models.entities import (
    Assignment,
    AssignmentStatus,
    Shift,
    ShiftStatus,
    Volunteer,
    VolunteerStatus,
)
from vshift.utils.db import db


def _volunteer(
    vid: str,
    name: str,
    email: str,
    skills: list[str],
    availability: dict[str, list[str]],
    reliability: float = 0.8,
    phone: str = "",
) -> Volunteer:
    return Volunteer(
        id=vid,
        name=name,
        email=email,
        phone=phone,
        skills=skills,
        availability=availability,
        reliability_score=reliability,
        status=VolunteerStatus.ACTIVE,
    )


def generate_volunteers() -> list[Volunteer]:
    morning = ["morning"]
    afternoon = ["afternoon"]
    evening = ["evening"]
    full_day = ["morning", "afternoon", "evening"]

    return [
        _volunteer("v001", "Maria Garcia", "maria.garcia@example.org", ["food_handling", "driving"], {"monday": full_day, "wednesday": afternoon, "saturday": morning}, 0.95),
        _volunteer("v002", "James Chen", "james.chen@example.org", ["food_handling", "first_aid"], {"tuesday": morning, "thursday": evening, "saturday": full_day}, 0.92),
        _volunteer("v003", "Sarah Johnson", "sarah.johnson@example.org", ["food_handling"], {"monday": afternoon, "friday": morning, "sunday": full_day}, 0.88),
        _volunteer("v004", "Robert Williams", "robert.williams@example.org", ["driving", "food_handling"], {"wednesday": full_day, "saturday": afternoon}, 0.91),
        _volunteer("v005", "Emily Davis", "emily.davis@example.org", ["food_handling", "first_aid", "driving"], {"monday": full_day, "wednesday": full_day, "friday": full_day}, 0.97),
        _volunteer("v006", "Michael Brown", "michael.brown@example.org", ["food_handling"], {"tuesday": evening, "thursday": evening}, 0.75),
        _volunteer("v007", "Jessica Martinez", "jessica.martinez@example.org", ["food_handling", "driving"], {"monday": morning, "wednesday": morning, "saturday": full_day}, 0.90),
        _volunteer("v008", "David Wilson", "david.wilson@example.org", ["food_handling"], {"friday": afternoon, "sunday": morning}, 0.82),
        _volunteer("v009", "Linda Anderson", "linda.anderson@example.org", ["food_handling", "first_aid"], {"tuesday": full_day, "thursday": full_day}, 0.93),
        _volunteer("v010", "Christopher Lee", "christopher.lee@example.org", ["driving"], {"saturday": full_day, "sunday": full_day}, 0.85),
        _volunteer("v011", "Patricia Taylor", "patricia.taylor@example.org", ["food_handling"], {"monday": evening, "wednesday": evening}, 0.78),
        _volunteer("v012", "Daniel Thomas", "daniel.thomas@example.org", ["food_handling", "driving"], {"friday": full_day, "saturday": full_day}, 0.89),
        _volunteer("v013", "Jennifer Moore", "jennifer.moore@example.org", ["food_handling", "first_aid"], {"monday": morning, "tuesday": morning}, 0.94),
        _volunteer("v014", "Matthew Jackson", "matthew.jackson@example.org", ["food_handling"], {"thursday": afternoon, "saturday": morning}, 0.70),
        _volunteer("v015", "Lisa Martin", "lisa.martin@example.org", ["food_handling", "driving"], {"wednesday": evening, "sunday": afternoon}, 0.86),
        _volunteer("v016", "Kevin White", "kevin.white@example.org", ["food_handling"], {"monday": afternoon, "friday": evening}, 0.81),
        _volunteer("v017", "Amy Harris", "amy.harris@example.org", ["food_handling", "first_aid", "driving"], {"tuesday": full_day, "saturday": full_day}, 0.96),
        _volunteer("v018", "Steven Clark", "steven.clark@example.org", ["food_handling"], {"wednesday": morning, "friday": morning}, 0.77),
        _volunteer("v019", "Karen Lewis", "karen.lewis@example.org", ["food_handling", "driving"], {"thursday": full_day, "sunday": full_day}, 0.90),
        _volunteer("v020", "Brian Walker", "brian.walker@example.org", ["food_handling"], {"monday": full_day, "wednesday": full_day}, 0.84),
        _volunteer("v021", "Nancy Hall", "nancy.hall@example.org", ["food_handling", "first_aid"], {"tuesday": afternoon, "friday": afternoon}, 0.88),
        _volunteer("v022", "Mark Allen", "mark.allen@example.org", ["driving", "food_handling"], {"saturday": morning, "sunday": morning}, 0.83),
        _volunteer("v023", "Susan Young", "susan.young@example.org", ["food_handling"], {"monday": evening, "thursday": evening}, 0.79),
        _volunteer("v024", "Paul King", "paul.king@example.org", ["food_handling", "driving"], {"wednesday": afternoon, "saturday": afternoon}, 0.91),
        _volunteer("v025", "Betty Wright", "betty.wright@example.org", ["food_handling", "first_aid"], {"tuesday": morning, "friday": full_day}, 0.93),
        _volunteer("v026", "George Scott", "george.scott@example.org", ["food_handling"], {"monday": morning, "saturday": evening}, 0.72),
        _volunteer("v027", "Helen Green", "helen.green@example.org", ["food_handling", "driving"], {"wednesday": full_day, "sunday": full_day}, 0.87),
        _volunteer("v028", "Donald Adams", "donald.adams@example.org", ["food_handling"], {"thursday": morning, "saturday": morning}, 0.80),
        _volunteer("v029", "Carol Baker", "carol.baker@example.org", ["food_handling", "first_aid"], {"monday": full_day, "friday": full_day}, 0.95),
        _volunteer("v030", "Eric Nelson", "eric.nelson@example.org", ["driving"], {"tuesday": evening, "saturday": full_day}, 0.76),
        _volunteer("v031", "Dorothy Carter", "dorothy.carter@example.org", ["food_handling"], {"wednesday": evening, "sunday": afternoon}, 0.85),
        _volunteer("v032", "Ronald Mitchell", "ronald.mitchell@example.org", ["food_handling", "driving"], {"monday": afternoon, "friday": afternoon}, 0.89),
        _volunteer("v033", "Sharon Perez", "sharon.perez@example.org", ["food_handling", "first_aid"], {"tuesday": full_day, "thursday": full_day}, 0.92),
        _volunteer("v034", "Anthony Roberts", "anthony.roberts@example.org", ["food_handling"], {"saturday": full_day, "sunday": full_day}, 0.74),
        _volunteer("v035", "Margaret Turner", "margaret.turner@example.org", ["food_handling", "driving"], {"monday": morning, "wednesday": morning}, 0.90),
        _volunteer("v036", "Steven Phillips", "steven.phillips@example.org", ["food_handling"], {"friday": evening, "sunday": morning}, 0.78),
        _volunteer("v037", "Sandra Campbell", "sandra.campbell@example.org", ["food_handling", "first_aid", "driving"], {"tuesday": afternoon, "saturday": full_day}, 0.94),
        _volunteer("v038", "Andrew Parker", "andrew.parker@example.org", ["food_handling"], {"monday": full_day, "thursday": full_day}, 0.82),
        _volunteer("v039", "Donna Evans", "donna.evans@example.org", ["food_handling", "driving"], {"wednesday": afternoon, "sunday": full_day}, 0.87),
        _volunteer("v040", "Joshua Edwards", "joshua.edwards@example.org", ["food_handling"], {"friday": morning, "saturday": afternoon}, 0.73),
        _volunteer("v041", "Carol Collins", "carol.collins@example.org", ["food_handling", "first_aid"], {"monday": evening, "tuesday": evening}, 0.91),
        _volunteer("v042", "Kenneth Stewart", "kenneth.stewart@example.org", ["driving", "food_handling"], {"thursday": full_day, "saturday": full_day}, 0.86),
        _volunteer("v043", "Shirley Morris", "shirley.morris@example.org", ["food_handling"], {"wednesday": morning, "friday": morning}, 0.80),
        _volunteer("v044", "Larry Rogers", "larry.rogers@example.org", ["food_handling", "driving"], {"monday": afternoon, "sunday": full_day}, 0.88),
        _volunteer("v045", "Cynthia Reed", "cynthia.reed@example.org", ["food_handling", "first_aid"], {"tuesday": morning, "saturday": morning}, 0.93),
        _volunteer("v046", "Ralph Bell", "ralph.bell@example.org", ["food_handling"], {"friday": full_day, "sunday": afternoon}, 0.71),
        _volunteer("v047", "Joyce Bailey", "joyce.bailey@example.org", ["food_handling", "driving"], {"monday": full_day, "wednesday": full_day}, 0.90),
        _volunteer("v048", "Louis Rivera", "louis.rivera@example.org", ["food_handling"], {"thursday": evening, "saturday": evening}, 0.76),
        _volunteer("v049", "Angela Cooper", "angela.cooper@example.org", ["food_handling", "first_aid", "driving"], {"tuesday": full_day, "friday": full_day}, 0.96),
        _volunteer("v050", "Howard Richardson", "howard.richardson@example.org", ["food_handling"], {"monday": morning, "saturday": full_day}, 0.83),
    ]


def generate_shifts() -> list[Shift]:
    now = datetime.now(timezone.utc)
    next_sat = now + timedelta(days=(5 - now.weekday()) % 7)
    next_sat_10am = next_sat.replace(hour=10, minute=0, second=0, microsecond=0)
    next_sat_2pm = next_sat.replace(hour=14, minute=0, second=0, microsecond=0)
    next_sun = next_sat + timedelta(days=1)
    next_sun_9am = next_sun.replace(hour=9, minute=0, second=0, microsecond=0)
    next_wed = now + timedelta(days=(2 - now.weekday()) % 7)
    next_wed_6pm = next_wed.replace(hour=18, minute=0, second=0, microsecond=0)
    next_mon = now + timedelta(days=(0 - now.weekday()) % 7)
    if next_mon <= now:
        next_mon += timedelta(days=7)
    next_mon_9am = next_mon.replace(hour=9, minute=0, second=0, microsecond=0)

    def fmt(dt: datetime) -> str:
        return dt.isoformat()

    return [
        Shift(
            id="s001",
            program_name="Food Bank Distribution",
            start_time=fmt(next_sat_10am),
            end_time=fmt(next_sat_10am + timedelta(hours=4)),
            location="Community Food Bank, 123 Main St",
            required_skills=["food_handling"],
            required_volunteers=5,
            status=ShiftStatus.OPEN,
        ),
        Shift(
            id="s002",
            program_name="Food Bank Distribution",
            start_time=fmt(next_sun_9am),
            end_time=fmt(next_sun_9am + timedelta(hours=3)),
            location="Community Food Bank, 123 Main St",
            required_skills=["food_handling", "driving"],
            required_volunteers=3,
            status=ShiftStatus.OPEN,
        ),
        Shift(
            id="s003",
            program_name="Literacy Tutoring",
            start_time=fmt(next_wed_6pm),
            end_time=fmt(next_wed_6pm + timedelta(hours=2)),
            location="Public Library, 456 Oak Ave",
            required_skills=[],
            required_volunteers=4,
            status=ShiftStatus.OPEN,
        ),
        Shift(
            id="s004",
            program_name="Animal Shelter Care",
            start_time=fmt(next_sat_2pm),
            end_time=fmt(next_sat_2pm + timedelta(hours=3)),
            location="Animal Shelter, 789 Pine Rd",
            required_skills=[],
            required_volunteers=2,
            status=ShiftStatus.OPEN,
        ),
        Shift(
            id="s005",
            program_name="Food Bank Distribution",
            start_time=fmt(next_mon_9am),
            end_time=fmt(next_mon_9am + timedelta(hours=4)),
            location="Community Food Bank, 123 Main St",
            required_skills=["food_handling"],
            required_volunteers=5,
            status=ShiftStatus.OPEN,
        ),
    ]


def load_seed_data() -> None:
    volunteers = generate_volunteers()
    shifts = generate_shifts()

    for v in volunteers:
        db.put_item(config.ddb_volunteers_table, v.to_dict())

    for s in shifts:
        db.put_item(config.ddb_shifts_table, s.to_dict())

    print(f"Loaded {len(volunteers)} volunteers and {len(shifts)} shifts into DynamoDB")


def create_tables() -> None:
    db.create_table_if_not_exists(
        config.ddb_volunteers_table,
        key_schema=[{"AttributeName": "id", "KeyType": "HASH"}],
        attribute_definitions=[{"AttributeName": "id", "AttributeType": "S"}],
    )
    db.create_table_if_not_exists(
        config.ddb_shifts_table,
        key_schema=[{"AttributeName": "id", "KeyType": "HASH"}],
        attribute_definitions=[{"AttributeName": "id", "AttributeType": "S"}],
    )
    db.create_table_if_not_exists(
        config.ddb_communications_table,
        key_schema=[{"AttributeName": "id", "KeyType": "HASH"}],
        attribute_definitions=[
            {"AttributeName": "id", "AttributeType": "S"},
            {"AttributeName": "shift_id", "AttributeType": "S"},
            {"AttributeName": "volunteer_id", "AttributeType": "S"},
        ],
        gsi=[
            {
                "IndexName": "shift_id-index",
                "KeySchema": [{"AttributeName": "shift_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            },
            {
                "IndexName": "volunteer_id-index",
                "KeySchema": [{"AttributeName": "volunteer_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
    )
    db.create_table_if_not_exists(
        config.ddb_reports_table,
        key_schema=[{"AttributeName": "id", "KeyType": "HASH"}],
        attribute_definitions=[{"AttributeName": "id", "AttributeType": "S"}],
    )
    db.create_table_if_not_exists(
        config.ddb_audit_table,
        key_schema=[{"AttributeName": "id", "KeyType": "HASH"}],
        attribute_definitions=[
            {"AttributeName": "id", "AttributeType": "S"},
            {"AttributeName": "timestamp", "AttributeType": "S"},
        ],
        gsi=[
            {
                "IndexName": "timestamp-index",
                "KeySchema": [{"AttributeName": "timestamp", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
    )
    print("All DynamoDB tables created (or already existed)")


if __name__ == "__main__":
    create_tables()
    load_seed_data()
