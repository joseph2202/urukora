# URUKORA Architecture — v0.1

- `backend/src/urukora/bot.py`: aiogram 3 Telegram bot. Polling is for local development.
- `backend/src/urukora/api.py`: FastAPI HTTP health / verified Telegram auth.
- `backend/src/urukora/telegram_auth.py`: validates signed Mini App `initData` (no client-side trust).
- `backend/src/urukora/db.py`: local SQLite persistence of verified Telegram users.
- `miniapp/`: React/Vite TypeScript application. QR generation happens in browser.
- `admin/`: reserved; no public admin endpoint.
- `infrastructure/`: reserved for later deployment.

Plan: modular monolith, background workers for heavy jobs, then PostgreSQL and Redis when warranted. No real API user sessions exist yet. Avoid adding private endpoints until sessions and ownership checks exist.

## Single-origin Mini App test

For Telegram use, build `miniapp/dist` then restart the FastAPI server. FastAPI serves the compiled static site and login API from the same origin; this avoids localhost calls from a phone and avoids exposing Vite's dev server. During local UI development Vite proxies `/api` to 127.0.0.1:8000.

Follow `docs/TELEGRAM_MINIAPP_TEST.md` for a temporary HTTPS tunnel.

## v0.4 Mini App authenticated reminders

The React `RemindersPanel.tsx` uses same-origin JSON POST calls. Each call contains signed Telegram `initData`, which `reminder_api.py` revalidates with `telegram_auth.verify_init_data`. Server extracts the verified user ID, then calls owner-scoped SQLite operations in `reminders.py`. There is **no persistent browser bearer token** to manage in v0.4, and the token never reaches frontend code. The existing bot worker in `reminder_bot.py` handles delivery.

SQLite initialization now performs an additive idempotency-key migration on startup (bot and API both call initialization). Future production hardening should add explicit sessions with CSRF protections as appropriate, rate-limits, database privacy controls, and supervised background workers.
