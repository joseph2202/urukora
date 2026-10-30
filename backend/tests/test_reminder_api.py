"""Mini App authenticated reminders: reject forgery, isolate users, avoid duplicates."""

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from fastapi.testclient import TestClient

from urukora.api import app
from urukora.config import settings
from urukora.reminders import create_reminder, init_reminders, list_reminders


def signed(token: str, user_id: int = 101, date: int | None = None) -> str:
    fields = {
        "auth_date": str(int(time.time()) if date is None else date),
        "user": json.dumps({"id": user_id, "first_name": "Tester", "language_code": "ar"}),
    }
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(key, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "db.sqlite"))
    monkeypatch.setattr(settings, "bot_token", "999:TEST_NOT_A_REAL_TOKEN")
    with TestClient(app) as c:
        yield c


def test_happy_path_and_idempotency(client):
    auth = signed(settings.bot_token)
    body = {"init_data": auth, "message": "Buy groceries", "delay_seconds": 60,
            "lang": "en", "request_key": "a" * 32}
    created = client.post("/api/v1/reminders/create", json=body)
    assert created.status_code == 201
    original = created.json()["item"]
    assert set(original) == {"id", "message", "due_at", "lang"}

    duplicate = client.post("/api/v1/reminders/create", json=body)
    assert duplicate.status_code == 201
    assert duplicate.json()["item"]["id"] == original["id"]
    assert len(list_reminders(101)) == 1

    listed = client.post("/api/v1/reminders/list", json={"init_data": auth})
    assert listed.status_code == 200
    assert listed.json()["items"][0]["id"] == original["id"]

    cancelled = client.post("/api/v1/reminders/cancel",
                            json={"init_data": auth, "reminder_id": original["id"]})
    assert cancelled.status_code == 200
    assert client.post("/api/v1/reminders/list",
                       json={"init_data": auth}).json()["items"] == []


def test_user_isolation(client):
    mine = create_reminder(101, 101, "Private message", 60)
    other = signed(settings.bot_token, user_id=202)
    response = client.post("/api/v1/reminders/list", json={"init_data": other})
    assert response.json()["items"] == []
    deny = client.post("/api/v1/reminders/cancel",
                       json={"init_data": other, "reminder_id": mine.id})
    assert deny.status_code == 404
    assert len(list_reminders(101)) == 1


@pytest.mark.parametrize("bad", ["invalid", "", "auth_date=1&user=x&hash=" + "0" * 64])
def test_reject_unsigned_requests(client, bad):
    resp = client.post("/api/v1/reminders/list", json={"init_data": bad})
    assert resp.status_code in (401, 422)
    creation = client.post("/api/v1/reminders/create", json={
        "init_data": bad, "message": "bad", "delay_seconds": 60,
        "lang": "ar", "request_key": "b" * 32,
    })
    assert creation.status_code in (401, 422)
    assert list_reminders(101) == []


def test_reject_expired_and_wrong_key(client):
    expired = signed(settings.bot_token, date=int(time.time()) - 4000)
    assert client.post("/api/v1/reminders/list", json={"init_data": expired}).status_code == 401
    foreign = signed("wrong-token")
    assert client.post("/api/v1/reminders/list", json={"init_data": foreign}).status_code == 401


def test_validate_bad_payload_and_quota(client):
    auth = signed(settings.bot_token)
    base = {"init_data": auth, "message": "test", "delay_seconds": 60,
            "lang": "ar", "request_key": "a" * 32}
    for patch in [{"delay_seconds": 3}, {"delay_seconds": 60.5},
                  {"message": " " * 281}, {"request_key": "not-uuid"},
                  {"lang": "other"}]:
        result = client.post("/api/v1/reminders/create", json={**base, **patch})
        assert result.status_code in (400, 422)
    assert list_reminders(101) == []
    for i in range(20):
        data = {**base, "request_key": f"{i:032x}"}
        assert client.post("/api/v1/reminders/create", json=data).status_code == 201
    data = {**base, "request_key": "f" * 32}
    assert client.post("/api/v1/reminders/create", json=data).status_code == 400


def test_conflicting_request_key_rejected(client):
    auth = signed(settings.bot_token)
    base = {"init_data": auth, "message": "first", "delay_seconds": 60,
            "lang": "en", "request_key": "1" * 32}
    assert client.post("/api/v1/reminders/create", json=base).status_code == 201
    assert client.post("/api/v1/reminders/create",
                       json={**base, "message": "different"}).status_code == 400
    assert len(list_reminders(101)) == 1


def test_idempotency_schema_migrates_v03(tmp_path, monkeypatch):
    import sqlite3
    path = tmp_path / "old.sqlite"
    monkeypatch.setattr(settings, "database_path", str(path))
    with sqlite3.connect(path) as db:
        db.execute("""
            CREATE TABLE reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                chat_id INTEGER NOT NULL, message TEXT NOT NULL, lang TEXT NOT NULL,
                created_at INTEGER NOT NULL, due_at INTEGER NOT NULL,
                not_before INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
                lease_token TEXT NOT NULL DEFAULT ''
            )
        """)
        db.execute("""INSERT INTO reminders
            (user_id,chat_id,message,lang,created_at,due_at,not_before)
            VALUES (101,101,'existing','en',10,70,70)""")
    init_reminders()
    assert list_reminders(101)[0].message == "existing"
    created = create_reminder(101, 101, "new", 60, request_key="d" * 32)
    assert created.id > 1
    init_reminders()  # repeated calls must stay safe
