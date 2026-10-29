# URUKORA — Open Mini App inside Telegram (local Mac test)

This procedure uses a temporary HTTPS Quick Tunnel on a trusted test machine.
No domain, paid hosting, or Telegram account login is needed for the tunnel.

## Prerequisites

- The bot already responds to `/start` when run from your Mac.
- The bot token is stored only in local project-root `.env` (never in Git).
- `cloudflared` is installed: test with `cloudflared --version`; if absent use `brew install cloudflared`.
- Keep Vite's `npm run dev` process **local only**. Do not tunnel it.

## Step 1: update and build the Mini App

In VS Code Terminal:

```bash
cd ~/Documents/urukora
git pull --ff-only
cd miniapp
npm install
npm run build
```

The build creates `miniapp/dist/`, which is ignored by Git.

## Step 2: run the API (Terminal A)

```bash
cd ~/Documents/urukora/backend
source .venv/bin/activate
python -m uvicorn urukora.api:app --host 127.0.0.1 --port 8000
```

You should see API startup, then visit http://127.0.0.1:8000/ on the Mac to view the built Mini App (not the Vite development port 5173).
Test http://127.0.0.1:8000/api/v1/health as well.

## Step 3: start the HTTPS tunnel (Terminal B)

```bash
cloudflared tunnel --url http://127.0.0.1:8000
```

Copy the **real URL printed by your command**, which ends in `.trycloudflare.com`. Do not use a sample URL from documentation. The tunnel and your API process must keep running.

Anyone with this URL can reach the public site and its exposed endpoints, so this is strictly for short-lived testing.

## Step 4: set WEBAPP_URL in your local project root .env

Open `~/Documents/urukora/.env` and modify **only** the line:

```dotenv
WEBAPP_URL=https://YOUR-ACTUAL-URL.trycloudflare.com
```

Paste your actual generated HTTPS URL instead of the placeholder. Leave `BOT_TOKEN` untouched and NEVER paste your token in chat or GitHub.

## Step 5: restart your bot (Terminal C)

Press Ctrl+C in the old bot terminal to stop polling, then:

```bash
cd ~/Documents/urukora/backend
source .venv/bin/activate
python -m urukora.bot
```

Open your bot's private chat in Telegram and send `/start` again. The **Open URUKORA** reply-keyboard button should appear. Tap it to open the Mini App.

Expected: app starts inside Telegram, and a successful verified sign-in indicator appears. If you open the same URL in Safari/Chrome, the page remains in preview mode because a browser does not have Telegram-signed `initData`.

## Common problems

- No button: confirm `WEBAPP_URL` starts with `https://`, and restart the bot after saving `.env`.
- Page not loading: API and tunnel must both be running; test local 8000 URL first.
- Old interface: rerun `npm run build` and restart API.
- Auth error: confirm the bot and API use the same `BOT_TOKEN` in the local root `.env` and the URL was opened via the bot's **web app button**. Verify the tunnel routes to port 8000, not 5173.
- Tunnel URL changes: update `WEBAPP_URL` and restart the bot, then send a fresh `/start`.
- Stop all three terminals to end the temporary test. No server continues running when your Mac sleeps.

**Production later:** stable HTTPS domain, supervised services, access controls, rate limits and proper backup/recovery.
