import hashlib
import hmac
import json
import time
from urllib.parse import urlencode
import pytest
from urukora.telegram_auth import TelegramAuthError, verify_init_data

TOKEN = "11111:TEST_ONLY_NOT_A_REAL_BOT_TOKEN"


def signed_data(*, date: int | None = None, user_id: int = 12345) -> str:
    fields = {
        "user": json.dumps({"id": user_id, "first_name": "Test"}, separators=(",", ":")),
        "auth_date": str(date if date is not None else int(time.time())),
        "query_id": "AA_test",
    }
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def test_valid_hmac():
    assert verify_init_data(signed_data(), TOKEN)["id"] == 12345


def test_invalid_token():
    with pytest.raises(TelegramAuthError):
        verify_init_data(signed_data(), "wrong-token")


def test_tampering_rejected():
    with pytest.raises(TelegramAuthError):
        verify_init_data(signed_data().replace("12345", "12346"), TOKEN)


def test_expired_rejected():
    with pytest.raises(TelegramAuthError):
        verify_init_data(signed_data(date=int(time.time()) - 7200), TOKEN)


def test_future_rejected():
    with pytest.raises(TelegramAuthError):
        verify_init_data(signed_data(date=int(time.time()) + 300), TOKEN)


def test_duplicate_keys_rejected():
    with pytest.raises(TelegramAuthError):
        verify_init_data(signed_data() + "&auth_date=1234", TOKEN)


def test_missing_signature_rejected():
    with pytest.raises(TelegramAuthError):
        verify_init_data("auth_date=111&user=abc", TOKEN)
