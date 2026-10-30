import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from urukora.config import settings
from urukora.reminder_bot import (
    cancel_command, help_command, remind_command, reminders_command,
    process_due_once, private_user,
)
from urukora.reminders import create_reminder, init_reminders, list_reminders


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "reminders_bot.db"))
    init_reminders()


def message(user_id=1, chat_type="private", text="", language_code="en"):
    return SimpleNamespace(
        from_user=SimpleNamespace(id=user_id, language_code=language_code),
        chat=SimpleNamespace(id=user_id if chat_type == "private" else -100, type=chat_type),
        text=text, answer=AsyncMock(),
    )


def test_remind_and_list_commands():
    m = message(text="/remind 10m Buy groceries")
    asyncio.run(remind_command(m))
    assert "Saved reminder" in m.answer.await_args.args[0]
    m2 = message(text="/reminders")
    asyncio.run(reminders_command(m2))
    assert "Buy groceries" in m2.answer.await_args.args[0]
    assert len(list_reminders(1)) == 1


def test_cancel_own_reminder_only():
    created = create_reminder(1, 1, "private", 60)
    unauthorized = message(user_id=2, text=f"/cancel {created.id}")
    asyncio.run(cancel_command(unauthorized))
    assert len(list_reminders(1)) == 1
    own = message(text=f"/cancel {created.id}")
    asyncio.run(cancel_command(own))
    assert list_reminders(1) == []


def test_reject_group_and_missing_data():
    group = message(chat_type="group", text="/remind 10m Not allowed")
    asyncio.run(remind_command(group))
    assert list_reminders(1) == []
    bad = message(text="/remind 2h")
    asyncio.run(remind_command(bad))
    assert "Try:" in bad.answer.await_args.args[0]


def test_arabic_command_and_help():
    m = message(text="/remind 1m اشتري خبز", language_code="ar")
    asyncio.run(remind_command(m))
    assert "سجلت" in m.answer.await_args.args[0]
    help_msg = message(language_code="ar")
    asyncio.run(help_command(help_msg))
    assert "تذكيرات أوروكورا" in help_msg.answer.await_args.args[0]


def test_worker_sends_own_messages(monkeypatch):
    import urukora.reminder_bot as module
    create_reminder(123, 123, "call mom", 60, now=10)
    bot = SimpleNamespace(send_message=AsyncMock())
    count = asyncio.run(process_due_once(bot, now=70))
    assert count == 1
    bot.send_message.assert_awaited_once()
    assert bot.send_message.await_args.kwargs["chat_id"] == 123
    assert "call mom" in bot.send_message.await_args.kwargs["text"]
    assert asyncio.run(process_due_once(bot, now=100)) == 0


def test_worker_failure_retries_without_sent(monkeypatch):
    create_reminder(123, 123, "retry", 60, now=10)
    bot = SimpleNamespace(send_message=AsyncMock(side_effect=RuntimeError("test failure")))
    assert asyncio.run(process_due_once(bot, now=70)) == 0
    assert len(list_reminders(123)) == 1
    assert asyncio.run(process_due_once(bot, now=71)) == 0
    assert bot.send_message.await_count == 1


def test_private_user_must_match_chat():
    other_chat = message(user_id=3)
    other_chat.chat.id = 7
    assert private_user(other_chat) is None
