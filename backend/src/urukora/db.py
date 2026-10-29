"""SQLite storage for validated Telegram users (foundation version)."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from .config import ROOT, settings


def _db_file() -> Path:
    path = Path(settings.database_path)
    return path if path.is_absolute() else ROOT / "backend" / path


def _connect() -> sqlite3.Connection:
    path = _db_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=10)
    con.execute("PRAGMA busy_timeout=10000")
    return con


def initialize_db() -> None:
    with _connect() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS users (
                telegram_id INTEGER PRIMARY KEY,
                first_name TEXT NOT NULL DEFAULT '',
                username TEXT,
                language_code TEXT,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL
            )
        """)


def save_signed_user(user: dict) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as con:
        con.execute("""
            INSERT INTO users (telegram_id, first_name, username, language_code, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(telegram_id) DO UPDATE SET
                first_name=excluded.first_name,
                username=excluded.username,
                language_code=excluded.language_code,
                last_seen=excluded.last_seen
        """, (
            user["id"],
            str(user.get("first_name") or "")[:128],
            str(user.get("username") or "")[:64] or None,
            str(user.get("language_code") or "")[:16] or None,
            now, now,
        ))
