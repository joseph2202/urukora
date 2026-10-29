"""Telegram Mini App initData HMAC-SHA256 verification.

Official algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
Never authenticate using initDataUnsafe.
"""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


class TelegramAuthError(ValueError):
    """Invalid, forged or expired Telegram initData."""


def verify_init_data(
    init_data: str,
    bot_token: str,
    *,
    max_age_seconds: int = 3600,
    now: int | None = None,
) -> dict:
    if not bot_token:
        raise TelegramAuthError("Bot token is not configured")
    if not init_data or len(init_data) > 8192:
        raise TelegramAuthError("Missing or oversized initData")
    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
        fields = dict(pairs)
        if len(pairs) != len(fields):
            raise TelegramAuthError("Duplicate initData keys")
        received_hash = fields.pop("hash")
        if len(received_hash) != 64:
            raise TelegramAuthError("Invalid hash length")
        check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
        secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(received_hash.lower(), expected):
            raise TelegramAuthError("Invalid Telegram signature")

        auth_date = int(fields["auth_date"])
        current = int(time.time()) if now is None else now
        if auth_date > current + 60 or current - auth_date > max_age_seconds:
            raise TelegramAuthError("Expired or future Telegram initData")

        user = json.loads(fields["user"])
        if not isinstance(user, dict) or type(user.get("id")) is not int or user["id"] <= 0:
            raise TelegramAuthError("Telegram user missing or invalid")
        return user
    except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        if isinstance(exc, TelegramAuthError):
            raise
        raise TelegramAuthError("Malformed Telegram initData") from exc
