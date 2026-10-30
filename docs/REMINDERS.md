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

## Mini App v0.4 management

The Reminders tile now provides a bilingual create/list/cancel UI. It calls these same-origin HTTPS endpoints:

- `POST /api/v1/reminders/list` with `init_data`
- `POST /api/v1/reminders/create` with `init_data`, `message`, `lang`, `delay_seconds`, and a 32-character hex `request_key`
- `POST /api/v1/reminders/cancel` with `init_data` and `reminder_id`

**All endpoints reverify** the Telegram Mini App HMAC signature and `auth_date`. The backend derives `user_id` from verified data, never from an untrusted request body. Login data expire after one hour; reopen the app to refresh. A normal browser preview is read-only for reminders.

Database migrations are additive and run automatically when the API starts. The bot and API use the same SQLite file, so edits in the Mini App appear in `/reminders` and vice versa. The bot delivery loop is unchanged.

Idempotency: the browser creates a secure random request key; reusing the key for identical content returns the original reminder and does not create another record. It is not a complete anti-replay or DDoS defense. Additional rate limiting and server-side sessions are needed before a production release.

The reminders UI shows a local clock-time rendering of a relative delay, not a timezone-aware scheduling tool.
