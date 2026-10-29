# URUKORA | أوروكورا

**Ancient roots. Infinite possibilities. — جذور عريقة. إمكانيات بلا حدود.**

Bilingual (Arabic/English) Telegram bot and Mini App foundation. Version **0.1** is a development starter, **not a deployed production bot**.

## Available now
- Telegram `/start` reply in Arabic or English.
- Inline Web App button (private chat) when an HTTPS `WEBAPP_URL` is configured. Unlike reply-keyboard buttons, this launch mode provides signed Telegram Mini App initData.
- React + TypeScript Mini App, Arabic RTL / English LTR switching.
- Local QR code generation in the browser, no QR contents sent to our API.
- FastAPI health endpoint `GET /api/v1/health`.
- Verified Telegram Mini App `initData` login (signature and freshness).
- SQLite verified-user storage; backend regression tests and GitHub CI.

**Not implemented yet:** file/PDF conversion, reminders, channels, AI, payments, dashboard, production sessions, PostgreSQL and deployment.

## Run on your Mac

Requires Python 3.11+, Node 20+, npm, and your BotFather bot token.

```bash
git clone https://github.com/joseph2202/urukora.git
cd urukora
cp .env.example .env
```

Open only your **local** `.env` and place your token after `BOT_TOKEN=`. The token MUST NEVER be committed or pasted into chat. On a public repo this is especially critical.

### Terminal 1 — API
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
python -m uvicorn urukora.api:app --reload --host 127.0.0.1 --port 8000
```
Health: http://127.0.0.1:8000/api/v1/health

### Terminal 2 — Telegram bot
```bash
cd urukora/backend
source .venv/bin/activate
urukora-bot
```
Use the repository folder on your machine (not a literal nested `urukora/backend` if already inside it). Send `/start` to your bot. With no deployed HTTPS Mini App URL, the bot sends a message instead of a Web App button.

### Terminal 3 — Mini App preview
```bash
cd urukora/miniapp
cp .env.example .env
npm install
npm run dev
```
Open http://127.0.0.1:5173. Preview mode supports changing language and generating QR codes without Telegram authentication.

### Tests
```bash
cd backend
python -m pytest -q
cd ../miniapp
npm run build
```

## Open the Mini App **inside Telegram** (temporary preview)

See **[Telegram Mini App quick-test steps](docs/TELEGRAM_MINIAPP_TEST.md)**.

The Mini App and API are served together from FastAPI after `npm run build`. Cloudflare Quick Tunnel can temporarily expose your local API via HTTPS for testing from a phone. This does **not** provide always-on hosting.

## Security and deployment
- A real Mini App inside Telegram requires a **public HTTPS** URL. Use the temporary tunnel procedure for testing; permanent hosting comes later.
- `initDataUnsafe` may supply UI hints but NEVER grants access. Server verifies `initData`.
- No persistent authenticated API session exists in v0.1. Add secure sessions before private endpoints.
- Keep secrets off GitHub, even if repository is private.
- The public repository holds code and examples only; local database and `.env` are ignored.

See `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `docs/ROADMAP.md`.
