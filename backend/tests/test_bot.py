"""Telegram Mini App launch must use an inline web_app button for signed initData."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from aiogram.types import InlineKeyboardMarkup
from urukora.bot import start
from urukora.config import settings


def fake_message(language: str = "en", chat_type: str = "private"):
    return SimpleNamespace(
        from_user=SimpleNamespace(language_code=language),
        chat=SimpleNamespace(type=chat_type),
        answer=AsyncMock(),
    )


def test_private_start_has_inline_webapp(monkeypatch):
    monkeypatch.setattr(settings, "webapp_url", "https://test-preview.trycloudflare.com")
    message = fake_message()
    asyncio.run(start(message))
    message.answer.assert_awaited_once()
    keyboard = message.answer.await_args.kwargs["reply_markup"]
    assert isinstance(keyboard, InlineKeyboardMarkup)
    assert keyboard.inline_keyboard[0][0].web_app.url == settings.webapp_url


def test_arabic_start_button(monkeypatch):
    monkeypatch.setattr(settings, "webapp_url", "https://test-preview.trycloudflare.com")
    message = fake_message("ar")
    asyncio.run(start(message))
    keyboard = message.answer.await_args.kwargs["reply_markup"]
    assert "أوروكورا" in keyboard.inline_keyboard[0][0].text


def test_group_start_does_not_send_inline_webapp(monkeypatch):
    monkeypatch.setattr(settings, "webapp_url", "https://test-preview.trycloudflare.com")
    message = fake_message(chat_type="supergroup")
    asyncio.run(start(message))
    assert "reply_markup" not in message.answer.await_args.kwargs


def test_start_without_webapp_url(monkeypatch):
    monkeypatch.setattr(settings, "webapp_url", "")
    message = fake_message()
    asyncio.run(start(message))
    assert "reply_markup" not in message.answer.await_args.kwargs
