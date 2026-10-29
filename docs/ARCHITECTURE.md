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
