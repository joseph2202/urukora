# URUKORA | أوروكورا

**Ancient roots. Infinite possibilities. — جذور عريقة. إمكانيات بلا حدود.**

Bilingual (Arabic/English) Telegram bot and Mini App foundation. Version **0.4** is a developer preview, **not a deployed production bot**.

## Available now
- Telegram `/start` reply in Arabic or English.
- Inline Web App button (private chat) when an HTTPS `WEBAPP_URL` is configured. Unlike reply-keyboard buttons, this launch mode provides signed Telegram Mini App initData.
- React + TypeScript Mini App, Arabic RTL / English LTR switching.
- Local QR code generation in the browser, no QR contents sent to our API.
- **PDF Studio** — merge 2–5 PDFs in order or extract pages using ranges such as `1-3,5`; browser-only.
- **Image Studio** — convert JPG/PNG/WebP, resize longest edge and adjust output quality; browser-only.
- **Activity** — local operation history with timestamps and output sizes, never file contents or original names.
- **Telegram reminders** — private-chat `/remind`, `/reminders`, `/cancel`, `/help` plus **Mini App create/list/cancel** backed by verified Telegram-signed initData on every request. SQLite persistence, safe retries and owner checks.
- Client-side safety limits: 12MB/file, 36MB total PDFs, 200 resulting PDF pages, 24MP image input.
- Bilingual labels (Arabic + English), RTL support.
- FastAPI health endpoint `GET /api/v1/health`.
- Verified Telegram Mini App `initData` login (signature and freshness).
- SQLite verified-user storage; backend regression tests and GitHub CI.

**Not implemented yet:** image-to-PDF, PDF OCR, Office conversion, password-encrypted PDFs, large/batch background jobs, server-side file history, recurring reminders, channels, AI, payments, dashboard, production sessions, PostgreSQL and deployment.

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
npm run test
npm run build
```

## Open the Mini App **inside Telegram** (temporary preview)

See **[Telegram Mini App quick-test steps](docs/TELEGRAM_MINIAPP_TEST.md)**.

The Mini App and API are served together from FastAPI after `npm run build`. Cloudflare Quick Tunnel can temporarily expose your local API via HTTPS for testing from a phone. This does **not** provide always-on hosting.

## Security and deployment
- A real Mini App inside Telegram requires a **public HTTPS** URL. Use the temporary tunnel procedure for testing; permanent hosting comes later.
- `initDataUnsafe` may supply UI hints but NEVER grants access. Server verifies `initData`.
- There is no long-lived API login session. v0.4 reminder operations require fresh Telegram-signed initData verified separately on every request. Other private endpoints must use equivalent authentication and ownership checks.
- Keep secrets off GitHub, even if repository is private.
- The public repository holds code and examples only; local database and `.env` are ignored.

See `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `docs/ROADMAP.md`.

## v0.2 File Studio notes

No `BOT_TOKEN` or deployment configuration changes are needed. After pulling changes and running `cd miniapp && npm install && npm run build`, restart the API so it serves the newly built site. Your existing Cloudflare tunnel still points to port 8000 while the Mac is on.

PDFs and images are processed in the **browser's memory** and immediately offered for download; files are not uploaded or stored on the backend. Local activity records include only operation type, timestamp, and output size, and can be cleared in the Activity tab. Very large, scanned, damaged, or encrypted PDFs may not work in mobile WebViews. PDF text recognition (OCR) is not available.

`npm run test` executes frontend unit tests. See `docs/FILE_STUDIO.md` for supported formats and limitations.

## v0.3 Telegram reminders (bot commands)

**Only in your bot's private chat**, send:

```text
/remind 10m Buy groceries
/remind 2h Call a friend
/remind 1d Review notes
/reminders
/cancel 12
/help
```

Arabic works too: `/remind 10m اشتري خبز`.

- One-off delays of 1 minute to 30 days. Unit `m` = minutes, `h` = hours, `d` = days.
- Max **20 active reminders per user**, 280 characters per reminder.
- Reminders are stored in **local SQLite**, not GitHub.
- Owner-only listing and cancellation, using verified Telegram Bot API message identities.
- Delivery worker checks roughly every 5 seconds while the **bot process is running**. If your Mac is off, reminders **do not fire**. Overdue reminders may arrive late when you restart the bot. Never rely on this development setup for important deadlines.
- Failed deliveries retry with backoff up to 5 total attempts.
- Rare duplicate notifications are possible after a process crash between Telegram accepting the message and the database recording success. Exactly-once delivery is not guaranteed.
- Messages are stored in plaintext in the local SQLite database; keep the Mac and backups protected.
- The Mini App now supports authenticated create/list/cancel through signed Telegram initData; the bot commands are still available.

To test after downloading updates, start only the **bot process** if you don't need the Mini App:
```bash
cd ~/Documents/urukora
git pull --ff-only
cd backend
source .venv/bin/activate
python -m urukora.bot
```
See `docs/REMINDERS.md` for operational details.

## v0.4 — Reminders directly in the Mini App

Open URUKORA from the **inline button under the bot's private chat message**. The Reminders card now supports:

- Enter reminder text, choose quantity and minutes/hours/days, and create a reminder.
- List upcoming reminders with their local displayed time, including reminders created using bot commands.
- Cancel your own pending reminders.
- Works in Arabic and English; unauthenticated browser preview cannot modify or read reminders.
- Each API request verifies a fresh Telegram-signed `initData`; the launch data expires after **one hour**. Close and reopen the Mini App to obtain new data.
- Requests include a random idempotency key to help prevent duplicate reminders if a response is lost.
- Existing v0.3 SQLite data is preserved by an additive migration: a nullable `request_key` column and a unique index.

**Security:** the signed `initData` is a temporary credential. Keep it out of URLs, logs, screenshots and analytics. Protect your tunnel URL and BotFather token. We do **not** use `initDataUnsafe` for authorization. Same-origin HTTPS is required for Mini App API access.

**Run v0.4 on Mac after merging**:

```bash
cd ~/Documents/urukora
git pull --ff-only
cd miniapp && npm install && npm run test && npm run build
```

Restart FastAPI (port 8000), the bot process, and any expired Cloudflare tunnel, then tap a **new** inline Open URUKORA button. Test with `1m` and a harmless reminder. **The Mac must remain on and the bot process running for the reminder to arrive on time.**
