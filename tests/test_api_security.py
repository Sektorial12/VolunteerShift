"""Security tests: API-key gate, signed respond links, sanitized public stats."""

from __future__ import annotations

import dataclasses

import pytest
from fastapi.testclient import TestClient

from vshift import api as api_module
from vshift import security
from vshift.config import config
from vshift.models.entities import (
    Assignment,
    Shift,
    ShiftStatus,
    Volunteer,
)


class FakeDB:
    def __init__(self, tables: dict[str, list[dict]] | None = None):
        self.tables = tables or {}

    def scan(self, table):
        return list(self.tables.get(table, []))

    def get_item(self, table, key):
        for item in self.tables.get(table, []):
            if item.get("id") == key.get("id"):
                return item
        return None

    def put_item(self, table, item):
        rows = self.tables.setdefault(table, [])
        for i, row in enumerate(rows):
            if row.get("id") == item.get("id"):
                rows[i] = item
                return
        rows.append(item)


def _shift() -> Shift:
    return Shift(
        id="s1",
        program_name="Demo Shift",
        start_time="2026-09-20T09:00:00+00:00",
        end_time="2026-09-20T12:00:00+00:00",
        location="Community Hall",
        required_skills=["logistics"],
        required_volunteers=1,
        assigned_volunteers=[Assignment(volunteer_id="v1")],
        status=ShiftStatus.FILLED,
    )


def _volunteer() -> Volunteer:
    return Volunteer(
        id="v1", name="Jane Doe", email="jane@example.org", phone="+15550001111"
    )


@pytest.fixture
def secure_env(monkeypatch):
    """Patch config with an API key + respond secret and a fake DB."""
    secure = dataclasses.replace(
        config,
        api_key="test-key",
        respond_token_secret="test-secret",
        automation_enabled=False,
    )
    monkeypatch.setattr(api_module, "config", secure)
    monkeypatch.setattr(security, "config", secure)
    fake = FakeDB(
        {
            secure.ddb_shifts_table: [_shift().to_dict()],
            secure.ddb_volunteers_table: [_volunteer().to_dict()],
            secure.ddb_communications_table: [],
            secure.ddb_audit_table: [],
        }
    )
    monkeypatch.setattr(api_module, "db", fake)
    return secure


@pytest.fixture
def client():
    return TestClient(api_module.app)


def test_protected_endpoint_requires_api_key(client, secure_env):
    assert client.get("/api/volunteers").status_code == 401
    assert client.get("/api/volunteers", headers={"x-api-key": "wrong"}).status_code == 401
    ok = client.get("/api/volunteers", headers={"x-api-key": "test-key"})
    assert ok.status_code == 200
    assert ok.json()[0]["id"] == "v1"


def test_public_paths_open_without_key(client, secure_env):
    assert client.get("/api/ping").status_code == 200
    assert client.get("/api/public/stats").status_code == 200


def test_docs_disabled(client, secure_env):
    # With the key the route simply does not exist; without it the middleware
    # rejects first, so the schema is unreachable either way.
    assert client.get("/docs", headers={"x-api-key": "test-key"}).status_code == 404
    assert client.get("/openapi.json", headers={"x-api-key": "test-key"}).status_code == 404
    assert client.get("/openapi.json").status_code == 401


def test_respond_token_roundtrip(secure_env):
    token = security.sign_respond_token("v1", "s1")
    assert token
    assert security.verify_respond_token("v1", "s1", token)
    assert not security.verify_respond_token("v1", "s2", token)
    assert not security.verify_respond_token("v1", "s1", "bogus")
    assert not security.verify_respond_token("v1", "s1", "")


def test_respond_token_dev_mode_unsigned(monkeypatch):
    dev = dataclasses.replace(config, respond_token_secret="")
    monkeypatch.setattr(security, "config", dev)
    assert security.sign_respond_token("v1", "s1") == ""
    assert security.verify_respond_token("v1", "s1", "")


def test_respond_context_requires_valid_token(client, secure_env):
    params = {"volunteer_id": "v1", "shift_id": "s1"}
    assert client.get("/api/respond/context", params=params).status_code == 403
    assert (
        client.get("/api/respond/context", params={**params, "token": "bad"}).status_code
        == 403
    )

    token = security.sign_respond_token("v1", "s1")
    res = client.get("/api/respond/context", params={**params, "token": token})
    assert res.status_code == 200
    body = res.json()
    assert body["volunteer_name"] == "Jane Doe"
    assert body["assignment_status"] == "invited"
    assert body["shift"]["program_name"] == "Demo Shift"
    # No PII beyond the name.
    flat = str(body)
    assert "jane@example.org" not in flat
    assert "+15550001111" not in flat


def test_respond_applies_with_token(client, secure_env):
    payload = {"volunteer_id": "v1", "shift_id": "s1", "response": "confirm"}
    assert client.post("/api/volunteers/respond", json=payload).status_code == 403

    token = security.sign_respond_token("v1", "s1")
    ok = client.post("/api/volunteers/respond", json={**payload, "token": token})
    assert ok.status_code == 200
    assert ok.json()["shift_status"] == "filled"


def test_public_stats_sanitized(client, secure_env):
    res = client.get("/api/public/stats")
    assert res.status_code == 200
    body = res.json()
    assert body["total_shifts"] == 1
    assert body["active_shifts"][0]["program_name"] == "Demo Shift"
    assert body["active_shifts"][0]["committed"] == 0
    flat = str(body)
    assert "jane@example.org" not in flat
    assert "volunteer_id" not in flat
