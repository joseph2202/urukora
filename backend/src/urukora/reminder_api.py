"""Authenticated Mini App reminder endpoints.

Telegram-signed initData must accompany *each* request, not merely the initial
UI login. Signed data expires after one hour; users must reopen the Mini App to
obtain fresh launch data. Never use the unverified initDataUnsafe user ID.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .config import settings
from .reminders import Reminder, ReminderError, cancel_reminder, create_reminder, list_reminders
from .telegram_auth import TelegramAuthError, verify_init_data

router = APIRouter(prefix="/api/v1/reminders", tags=["reminders"])


class SignedRequest(BaseModel):
    init_data: str = Field(min_length=1, max_length=8192)


class CreateRequest(SignedRequest):
    message: str = Field(min_length=1, max_length=280)
    delay_seconds: int = Field(strict=True, ge=60, le=2592000)
    lang: str = Field(default="en", pattern="^(ar|en)$")
    request_key: str = Field(min_length=32, max_length=32, pattern="^[a-f0-9]{32}$")


class CancelRequest(SignedRequest):
    reminder_id: int = Field(strict=True, ge=1)


def verified_user_id(init_data: str) -> int:
    if not settings.bot_token:
        raise HTTPException(status_code=503, detail="Bot not configured")
    try:
        user = verify_init_data(init_data, settings.bot_token)
    except TelegramAuthError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired Telegram login") from exc
    return user["id"]


def public_reminder(reminder: Reminder) -> dict:
    # Never return internal chat IDs, delivery leases or idempotency keys.
    return {
        "id": reminder.id,
        "message": reminder.message,
        "due_at": reminder.due_at,
        "lang": reminder.lang,
    }


@router.post("/list")
def get_reminders(payload: SignedRequest) -> dict:
    user_id = verified_user_id(payload.init_data)
    return {"items": [public_reminder(r) for r in list_reminders(user_id)]}


@router.post("/create", status_code=201)
def add_reminder(payload: CreateRequest) -> dict:
    user_id = verified_user_id(payload.init_data)
    try:
        reminder = create_reminder(
            user_id=user_id,
            chat_id=user_id,
            message=payload.message,
            delay_seconds=payload.delay_seconds,
            lang=payload.lang,
            request_key=payload.request_key,
        )
    except ReminderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": public_reminder(reminder)}


@router.post("/cancel")
def delete_reminder(payload: CancelRequest) -> dict:
    user_id = verified_user_id(payload.init_data)
    if not cancel_reminder(user_id, payload.reminder_id):
        raise HTTPException(status_code=404, detail="Reminder not found or currently sending")
    return {"cancelled": True}
