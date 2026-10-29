"""Bot entry point: run 'urukora-bot' after configuring local BOT_TOKEN."""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup, WebAppInfo
from .config import settings

logger = logging.getLogger(__name__)
dp = Dispatcher()


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

    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(
            text="🚀 افتح أوروكورا / Open URUKORA" if is_ar else "🚀 Open URUKORA",
            web_app=WebAppInfo(url=settings.webapp_url),
        )]],
        resize_keyboard=True,
    )
    await message.answer(greeting, reply_markup=keyboard)


async def run_bot() -> None:
    if not settings.bot_token:
        raise RuntimeError("BOT_TOKEN is missing. Set it in your local root .env")
    logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO)
    bot = Bot(token=settings.bot_token)
    try:
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


def main() -> None:
    asyncio.run(run_bot())


if __name__ == "__main__":
    main()
