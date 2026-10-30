"""Commands and delivery worker for private Telegram reminders.

Private Bot API messages provide trusted user IDs; no unauthenticated Mini App
endpoint is exposed. Server must run continuously for on-time delivery.
"""

import asyncio
import logging
import math
import time

from aiogram import Bot, Router
from aiogram.filters import Command
from aiogram.types import Message

from .reminders import (
    Reminder,
    ReminderError,
    cancel_reminder,
    claim_due,
    create_reminder,
    list_reminders,
    mark_delivered,
    mark_delivery_failed,
    parse_delay,
)

logger = logging.getLogger(__name__)
router = Router()
CHECK_INTERVAL_SECONDS = 5

HELP = {
    "ar": (
        "⏰ تذكيرات أوروكورا\n\n"
        "/remind 10m اشتري خبز — تذكير بعد 10 دقائق\n"
        "/remind 2h اتصل بصديق — بعد ساعتين\n"
        "/remind 1d راجع ملفاتك — بعد يوم\n"
        "/reminders — عرض التذكيرات\n"
        "/cancel 12 — إلغاء التذكير رقم 12\n"
        "/help — المساعدة\n\n"
        "المدة: m دقائق، h ساعات، d أيام (من دقيقة إلى 30 يوم).\n"
        "التذكيرات تشتغل فقط إذا السيرفر شغّال."
    ),
    "en": (
        "⏰ URUKORA reminders\n\n"
        "/remind 10m Buy groceries — in 10 minutes\n"
        "/remind 2h Call a friend — in 2 hours\n"
        "/remind 1d Review documents — tomorrow\n"
        "/reminders — List active reminders\n"
        "/cancel 12 — Cancel reminder #12\n"
        "/help — Help\n\n"
        "m = minutes, h = hours, d = days (1 minute to 30 days).\n"
        "The bot must be online to deliver reminders."
    ),
}


def language(message: Message) -> str:
    code = getattr(message.from_user, "language_code", "") or ""
    return "ar" if code.lower().startswith("ar") else "en"


def private_user(message: Message) -> int | None:
    if message.chat.type != "private" or not message.from_user:
        return None
    user_id = message.from_user.id
    if not isinstance(user_id, int) or user_id <= 0:
        return None
    # Telegram private chat ID is equal to the user's ID.
    if message.chat.id != user_id:
        return None
    return user_id


def time_until(due_at: int, now: int, lang: str) -> str:
    seconds = max(0, due_at - now)
    if seconds <= 0:
        return "مستحق" if lang == "ar" else "due"
    if seconds < 3600:
        amount = math.ceil(seconds / 60)
        return f"بعد {amount} دقيقة" if lang == "ar" else f"in {amount}m"
    if seconds < 86400:
        amount = math.ceil(seconds / 3600)
        return f"بعد {amount} ساعة" if lang == "ar" else f"in {amount}h"
    amount = math.ceil(seconds / 86400)
    return f"بعد {amount} يوم" if lang == "ar" else f"in {amount}d"


@router.message(Command("help"))
async def help_command(message: Message) -> None:
    await message.answer(HELP[language(message)])


@router.message(Command("remind"))
async def remind_command(message: Message) -> None:
    lang = language(message)
    user_id = private_user(message)
    if user_id is None:
        await message.answer(
            "استخدم التذكيرات بالمحادثة الخاصة ويّا البوت."
            if lang == "ar" else
            "Reminders only work in the bot's private chat."
        )
        return
    parts = (message.text or "").strip().split(maxsplit=2)
    if len(parts) != 3:
        await message.answer(
            "اكتب مثلاً: /remind 10m اشتري خبز"
            if lang == "ar" else
            "Try: /remind 10m Buy groceries"
        )
        return
    try:
        delay_seconds = parse_delay(parts[1])
        reminder = create_reminder(user_id, message.chat.id, parts[2], delay_seconds, lang=lang)
    except ReminderError:
        await message.answer(
            "تأكد من الوقت والنص. المدة 1m إلى 30d، النص حتى 280 حرف، والحد 20 تذكير.\n"
            "مثال: /remind 10m اشتري خبز"
            if lang == "ar" else
            "Check your duration, message (max 280 characters), and quota (20 active reminders).\n"
            "Example: /remind 10m Buy groceries"
        )
        return
    await message.answer(
        f"✅ سجلت تذكيرك #{reminder.id} — {time_until(reminder.due_at, int(time.time()), lang)}\n"
        f"📝 {reminder.message}"
        if lang == "ar" else
        f"✅ Saved reminder #{reminder.id} — {time_until(reminder.due_at, int(time.time()), lang)}\n"
        f"📝 {reminder.message}"
    )


@router.message(Command("reminders"))
async def reminders_command(message: Message) -> None:
    lang = language(message)
    user_id = private_user(message)
    if user_id is None:
        await message.answer("استخدم المحادثة الخاصة." if lang == "ar" else "Use a private chat.")
        return
    pending = list_reminders(user_id)
    if not pending:
        await message.answer(
            "ما عندك تذكيرات معلّقة. اكتب /help لمعرفة الأوامر."
            if lang == "ar" else "No active reminders. Send /help for commands."
        )
        return
    now = int(time.time())
    lines = [f"⏰ تذكيراتك ({len(pending)})" if lang == "ar"
             else f"⏰ Your reminders ({len(pending)})"]
    for reminder in pending:
        preview = reminder.message.replace("\n", " ").strip()
        if len(preview) > 60:
            preview = preview[:57] + "..."
        lines.append(f"#{reminder.id} — {time_until(reminder.due_at, now, lang)}\n{preview}")
    lines.append("للإلغاء: /cancel رقم" if lang == "ar" else "To cancel: /cancel ID")
    await message.answer("\n\n".join(lines))


@router.message(Command("cancel"))
async def cancel_command(message: Message) -> None:
    lang = language(message)
    user_id = private_user(message)
    if user_id is None:
        await message.answer("استخدم المحادثة الخاصة." if lang == "ar" else "Use a private chat.")
        return
    parts = (message.text or "").strip().split()
    if len(parts) != 2 or not parts[1].isascii() or not parts[1].isdigit():
        await message.answer(
            "اكتب /cancel 12 مثلاً." if lang == "ar" else "Try /cancel 12."
        )
        return
    reminder_id = int(parts[1])
    cancelled = cancel_reminder(user_id, reminder_id)
    await message.answer(
        ("✅ تم إلغاء التذكير." if lang == "ar" else "✅ Reminder cancelled.")
        if cancelled else
        ("ما لگيت تذكير قابل للإلغاء بهذا الرقم." if lang == "ar"
         else "No cancellable reminder with that ID.")
    )


def notification(reminder: Reminder) -> str:
    return (
        f"⏰ تذكير من أوروكورا\n\n{reminder.message}"
        if reminder.lang == "ar" else
        f"⏰ URUKORA reminder\n\n{reminder.message}"
    )


async def process_due_once(bot: Bot, *, now: int | None = None) -> int:
    """Attempt a bounded batch. Delivery is at-least-once, not exactly-once."""
    jobs = claim_due(now=now, limit=10)
    successful = 0
    for reminder in jobs:
        try:
            await bot.send_message(chat_id=reminder.chat_id, text=notification(reminder))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            state = mark_delivery_failed(reminder, now=now)
            logger.warning("Reminder delivery error id=%s status=%s type=%s",
                           reminder.id, state, type(exc).__name__)
        else:
            if mark_delivered(reminder):
                successful += 1
    return successful


async def reminder_worker(bot: Bot) -> None:
    while True:
        try:
            await process_due_once(bot)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Reminder worker loop failed")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
