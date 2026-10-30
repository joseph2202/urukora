"""Bot entry point: run 'urukora-bot' after configuring local BOT_TOKEN."""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo
from .config import settings
from .db import initialize_db
from .reminders import init_reminders
from .reminder_bot import router as reminder_router, reminder_worker

logger = logging.getLogger(__name__)
dp = Dispatcher()
dp.include_router(reminder_router)


@dp.message(CommandStart())
async def start(message: Message) -> None:
    is_ar = bool(message.from_user and (message.from_user.language_code or "").lower().startswith("ar"))
    greeting = (
        "هلا بيك بأوروكورا! 🚀\nأدواتك الذكية داخل تيليجرام."
        if is_ar else
        "Welcome to URUKORA! 🚀\nYour intelligent Telegram workspace."
    )
    if not settings.webapp_url:
        suffix = (
            "\n\nالتطبيق بعده قيد الإعداد؛ راح يظهر زر فتحه بعد ما نضيف رابط HTTPS."
            if is_ar else
            "\n\nThe Mini App will appear here after its HTTPS URL is configured."
        )
        await message.answer(greeting + suffix)
        return

    if not settings.webapp_url.startswith("https://"):
        logger.error("WEBAPP_URL must use HTTPS")
        await message.answer(greeting)
        return

    # Telegram does not supply signed initData to Mini Apps opened via a
    # ReplyKeyboardMarkup web_app button. Use an inline web_app button instead.
    # Telegram only supports inline web_app buttons in private bot chats.
    if message.chat.type != "private":
        await message.answer(
            greeting + (
                "\n\nافتح المحادثة الخاصة بالبوت حتى تستخدم التطبيق."
                if is_ar else
                "\n\nOpen the bot's private chat to launch the Mini App."
            )
        )
        return

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(
            text="🚀 افتح أوروكورا / Open URUKORA" if is_ar else "🚀 Open URUKORA",
            web_app=WebAppInfo(url=settings.webapp_url),
        )]],
    )
    await message.answer(greeting, reply_markup=keyboard)


async def run_bot() -> None:
    if not settings.bot_token:
        raise RuntimeError("BOT_TOKEN is missing. Set it in your local root .env")
    logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO)
    initialize_db()
    init_reminders()
    bot = Bot(token=settings.bot_token)
    task = asyncio.create_task(reminder_worker(bot))
    try:
        await dp.start_polling(bot)
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        await bot.session.close()


def main() -> None:
    asyncio.run(run_bot())


if __name__ == "__main__":
    main()
