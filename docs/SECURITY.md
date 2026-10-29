# Security baseline

- Never commit a BotFather token, `.env`, API keys or real user records, including to a public repository.
- Configure tokens in an ignored local `.env` or secure deployment secrets.
- Browser `initDataUnsafe` is not proof of identity. Server verifies Telegram-signed `initData`, timestamp, signature, and user ID.
- `/api/v1/auth/telegram` returns verification info, NOT a reusable session. Do not expose private user data without proper sessions.
- Restrict frontend CORS origin; deploy backend and Mini App on HTTPS for real Telegram use.
- Restrict uploads and scan/validate file types before enabling future file tools.
- If a bot token leaks, rotate it through BotFather immediately and invalidate any affected sessions.
- Do not log the raw `initData`, Bot Token, or private user files.
