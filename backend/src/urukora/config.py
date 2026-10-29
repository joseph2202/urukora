"""Load settings from the local, untracked project root .env or environment variables."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )
    bot_token: str = ""
    webapp_url: str = ""
    frontend_origin: str = "http://localhost:5173"
    database_path: str = "./data/urukora.db"
    debug: bool = False


settings = Settings()
