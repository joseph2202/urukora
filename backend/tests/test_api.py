import hashlib
import hmac
import json
import time
from urllib.parse import urlencode
from fastapi.testclient import TestClient
from urukora.api import app
from urukora.config import settings


def signed_init_data(token: str):
    fields = {"auth_date": str(int(time.time())), "user": json.dumps(
        {"id": 987654321, "first_name": "Test User", "language_code": "ar"}
    )}
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def test_health_and_auth(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "bot_token", "TEST_ONLY_BOT_TOKEN")
    with TestClient(app) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert client.post("/api/v1/auth/telegram", json={"init_data": "garbage"}).status_code == 401
        good = client.post("/api/v1/auth/telegram", json={"init_data": signed_init_data(settings.bot_token)})
        assert good.status_code == 200
        assert good.json()["user"]["id"] == 987654321
