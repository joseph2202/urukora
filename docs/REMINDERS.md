# URUKORA v0.3 — Telegram Reminders

The first productivity feature intentionally uses **Telegram Bot API chat commands** rather than an unsigned Mini App API. Authentication for commands is the trusted `message.from_user.id` received via Telegram; only a private chat with the matching chat ID is supported.

## Commands

| Command | Effect |
| --- | --- |
| `/remind 10m Buy groceries` | Schedule one-off reminder after ten minutes |
| `/remind 2h اتصل بصديق` | Schedule Arabic reminder after two hours |
| `/remind 1d Check project` | Schedule next-day reminder |
| `/reminders` | List your active reminders, with IDs and relative time |
| `/cancel 12` | Cancel your own still-pending reminder with ID 12 |
| `/help` | Show examples in Telegram account language |

Times are **relative durations**, not local clock times or time-zone dates. The UI is bilingual based on Telegram's language. Mini App language selection currently remains independent.

## Reliability model

- Delivery runs in `backend/src/urukora/reminder_bot.py` only while `urukora.bot` is running.
- Reminders persist in the local SQLite database under `backend/data/` by default.
- The 5-second polling loop leases up to 10 due jobs per iteration using a transaction. It retries failures using backoff and stops after five attempts.
- On restart, pending/overdue reminders are delivered late. In-flight leases are retried after expiry.
- Exactly-once guarantees are **not possible** in this design without Telegram-side message idempotency. A crash after sending but before marking sent can cause a duplicate.
- If Mac, bot process or network is off, no message is delivered at its due time. **Do not use this as a reliable production reminder service.**

## Abuse and data protection

- Up to 20 active reminders per Telegram user.
- Duration from 1 minute to 30 days, maximum 280 characters.
- IDs are internal; user-owned SQL queries prevent reading or cancelling anyone else's reminders.
- Reminder text is persisted as plain text on the user's own local computer. Protect backups, and do not commit the database or token to GitHub.
- No Mini App read/write endpoints for reminders; secure per-user API sessions would be required before enabling that interface.

## Test (when you return to your Mac)

```bash
cd ~/Documents/urukora
git pull --ff-only
cd backend
source .venv/bin/activate
python -m pip install -e '.[dev]'
python -m pytest -q
python -m urukora.bot
```

In the bot's private chat send `/remind 1m Test reminder`, check `/reminders`, and verify a message arrives while the bot keeps running. For the Mini App, separately build `miniapp/` and restart FastAPI.
