# URUKORA Architecture — v0.1

- `backend/src/urukora/bot.py`: aiogram 3 Telegram bot. Polling is for local development.
- `backend/src/urukora/api.py`: FastAPI HTTP health / verified Telegram auth.
- `backend/src/urukora/telegram_auth.py`: validates signed Mini App `initData` (no client-side trust).
- `backend/src/urukora/db.py`: local SQLite persistence of verified Telegram users.
- `miniapp/`: React/Vite TypeScript application. QR generation happens in browser.
- `admin/`: reserved; no public admin endpoint.
- `infrastructure/`: reserved for later deployment.

Plan: modular monolith, background workers for heavy jobs, then PostgreSQL and Redis when warranted. No real API user sessions exist yet. Avoid adding private endpoints until sessions and ownership checks exist.
