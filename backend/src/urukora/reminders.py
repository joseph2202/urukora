"""Private-chat Telegram reminders. SQLite-backed; safe for one or more bot workers.

A delivery may rarely be repeated if the process dies after Telegram accepts a
message but before SQLite records success. No exactly-once delivery is claimed.
"""

import re
import secrets
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass

from .db import _connect

MAX_ACTIVE = 20
MAX_MESSAGE_LENGTH = 280
MAX_DELAY_SECONDS = 30 * 24 * 60 * 60
MAX_ATTEMPTS = 5
LEASE_SECONDS = 120
_DURATION_RE = re.compile(r"([1-9][0-9]{0,3})([mhd])", re.IGNORECASE)


class ReminderError(ValueError):
    """Invalid input or reminder quota reached."""


@dataclass(frozen=True)
class Reminder:
    id: int
    user_id: int
    chat_id: int
    message: str
    lang: str
    due_at: int
    attempts: int = 0
    lease_token: str = ""


def parse_delay(value: str) -> int:
    """Parse 1m to 30d; does not accept dates or fractional amounts."""
    match = _DURATION_RE.fullmatch(value.strip())
    if match is None:
        raise ReminderError("Invalid duration. Use 10m, 2h or 1d.")
    number = int(match.group(1))
    multiplier = {"m": 60, "h": 3600, "d": 86400}[match.group(2).lower()]
    delay = number * multiplier
    if not 60 <= delay <= MAX_DELAY_SECONDS:
        raise ReminderError("Duration must be between 1 minute and 30 days.")
    return delay


def init_reminders() -> None:
    """Create additive schema without touching existing user data."""
    with closing(_connect()) as db:
        with db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS reminders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    chat_id INTEGER NOT NULL,
                    message TEXT NOT NULL,
                    lang TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    due_at INTEGER NOT NULL,
                    not_before INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    attempts INTEGER NOT NULL DEFAULT 0,
                    lease_until INTEGER NOT NULL DEFAULT 0,
                    lease_token TEXT NOT NULL DEFAULT '',
                    request_key TEXT
                )
            """)
            # Additive schema upgrade for existing v0.3 SQLite databases.
            columns = {row[1] for row in db.execute("PRAGMA table_info(reminders)")}
            if "request_key" not in columns:
                db.execute("ALTER TABLE reminders ADD COLUMN request_key TEXT")
            db.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_idempotency
                ON reminders(user_id, request_key)
                WHERE request_key IS NOT NULL
            """)
            db.execute("""
                CREATE INDEX IF NOT EXISTS idx_reminders_queue
                ON reminders(status, due_at, not_before)
            """)
            db.execute("""
                CREATE INDEX IF NOT EXISTS idx_reminders_owner
                ON reminders(user_id, status, due_at)
            """)


def create_reminder(
    user_id: int,
    chat_id: int,
    message: str,
    delay_seconds: int,
    lang: str = "en",
    *,
    request_key: str | None = None,
    now: int | None = None,
) -> Reminder:
    if type(user_id) is not int or user_id <= 0 or chat_id != user_id:
        raise ReminderError("Reminders are only available in private chats.")
    if not isinstance(message, str) or not 1 <= len(message.strip()) <= MAX_MESSAGE_LENGTH:
        raise ReminderError("Enter a message of up to 280 characters.")
    if type(delay_seconds) is not int or not 60 <= delay_seconds <= MAX_DELAY_SECONDS:
        raise ReminderError("Duration must be 1 minute to 30 days.")
    if request_key is not None and not re.fullmatch(r"[a-f0-9]{32}", request_key):
        raise ReminderError("Invalid request key.")
    timestamp = int(time.time()) if now is None else now
    due_at = timestamp + delay_seconds
    language = "ar" if lang == "ar" else "en"
    with closing(_connect()) as db:
        # A write lock enforces quotas even if two requests arrive concurrently.
        db.execute("BEGIN IMMEDIATE")
        try:
            if request_key is not None:
                existing = db.execute("""
                    SELECT id, user_id, chat_id, message, lang, due_at, attempts,
                           (due_at - created_at) AS delay
                    FROM reminders
                    WHERE user_id = ? AND request_key = ?
                """, (user_id, request_key)).fetchone()
                if existing:
                    if (existing[3] != message.strip() or existing[4] != language
                            or existing[7] != delay_seconds):
                        raise ReminderError("Request key already used for a different reminder.")
                    db.commit()
                    return Reminder(*existing[:7])
            active = db.execute("""
                SELECT COUNT(*) FROM reminders
                WHERE user_id = ? AND status IN ('pending','leased')
            """, (user_id,)).fetchone()[0]
            if active >= MAX_ACTIVE:
                raise ReminderError(f"Maximum {MAX_ACTIVE} active reminders.")
            cur = db.execute("""
                INSERT INTO reminders (
                    user_id, chat_id, message, lang, created_at,
                    due_at, not_before, request_key
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, chat_id, message.strip(), language, timestamp, due_at, due_at, request_key))
            db.commit()
        except Exception:
            db.rollback()
            raise
    return Reminder(cur.lastrowid, user_id, chat_id, message.strip(), language, due_at)


def list_reminders(user_id: int) -> list[Reminder]:
    with closing(_connect()) as db:
        rows = db.execute("""
            SELECT id, user_id, chat_id, message, lang, due_at, attempts
            FROM reminders
            WHERE user_id = ? AND status IN ('pending','leased')
            ORDER BY due_at, id
            LIMIT ?
        """, (user_id, MAX_ACTIVE)).fetchall()
    return [Reminder(*row) for row in rows]


def cancel_reminder(user_id: int, reminder_id: int) -> bool:
    """Users may only cancel their own pending (not already sending) reminders."""
    if type(reminder_id) is not int or reminder_id <= 0:
        return False
    with closing(_connect()) as db:
        with db:
            changed = db.execute("""
                UPDATE reminders SET status = 'cancelled'
                WHERE id = ? AND user_id = ? AND status = 'pending'
            """, (reminder_id, user_id)).rowcount
    return changed == 1


def claim_due(*, now: int | None = None, limit: int = 10) -> list[Reminder]:
    """Atomically lease due jobs, including leases expired after a bot crash."""
    if not 1 <= limit <= 50:
        raise ValueError("Invalid batch size")
    timestamp = int(time.time()) if now is None else now
    claimed: list[Reminder] = []
    with closing(_connect()) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            rows = db.execute("""
                SELECT id, user_id, chat_id, message, lang, due_at, attempts
                FROM reminders
                WHERE (status = 'pending' AND due_at <= ? AND not_before <= ?)
                   OR (status = 'leased' AND lease_until <= ?)
                ORDER BY due_at, id
                LIMIT ?
            """, (timestamp, timestamp, timestamp, limit)).fetchall()
            for row in rows:
                token = secrets.token_hex(16)
                db.execute("""
                    UPDATE reminders
                    SET status = 'leased', lease_until = ?,
                        lease_token = ?, attempts = attempts + 1
                    WHERE id = ?
                """, (timestamp + LEASE_SECONDS, token, row[0]))
                claimed.append(Reminder(*row[:6], attempts=row[6] + 1, lease_token=token))
            db.commit()
        except Exception:
            db.rollback()
            raise
    return claimed


def mark_delivered(reminder: Reminder) -> bool:
    with closing(_connect()) as db:
        with db:
            return db.execute("""
                UPDATE reminders SET status = 'sent', lease_until = 0,
                    lease_token = ''
                WHERE id = ? AND status = 'leased' AND lease_token = ?
            """, (reminder.id, reminder.lease_token)).rowcount == 1


def mark_delivery_failed(reminder: Reminder, *, now: int | None = None) -> str:
    """Backoff on temporary failures; stop retrying after MAX_ATTEMPTS."""
    timestamp = int(time.time()) if now is None else now
    final = reminder.attempts >= MAX_ATTEMPTS
    backoff = min(60 * (2 ** (reminder.attempts - 1)), 900)
    with closing(_connect()) as db:
        with db:
            result = db.execute("""
                UPDATE reminders
                SET status = ?, not_before = ?, lease_until = 0, lease_token = ''
                WHERE id = ? AND status = 'leased' AND lease_token = ?
            """, ("failed" if final else "pending", timestamp + backoff,
                  reminder.id, reminder.lease_token))
    if not result.rowcount:
        return "not_owned"
    return "failed" if final else "retry"
