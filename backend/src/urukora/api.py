"""Public health and verified Telegram Mini App sign-in foundation."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .config import ROOT, settings
from .db import initialize_db, save_signed_user
from .telegram_auth import TelegramAuthError, verify_init_data


class TelegramLoginRequest(BaseModel):
    init_data: str = Field(min_length=1, max_length=8192)


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_db()
    yield


app = FastAPI(title="URUKORA API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin.rstrip("/")],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/v1/health")
async def health() -> dict:
    return {"status": "ok", "service": "urukora-api", "version": "0.1.0"}


@app.post("/api/v1/auth/telegram")
async def telegram_login(payload: TelegramLoginRequest) -> dict:
    # Verification only; add a secure session before making private user endpoints.
    if not settings.bot_token:
        raise HTTPException(status_code=503, detail="Bot is not configured")
    try:
        user = verify_init_data(payload.init_data, settings.bot_token)
    except TelegramAuthError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired Telegram login") from exc
    save_signed_user(user)
    return {
        "verified": True,
        "user": {
            "id": user["id"],
            "first_name": user.get("first_name", ""),
            "language_code": user.get("language_code", ""),
        },
    }


# Serve the compiled Mini App on the same host as our verified login API.
# Build the frontend first: cd miniapp && npm run build; then start/restart FastAPI.
# Never expose Vite's development server publicly.
miniapp_dist = ROOT / "miniapp" / "dist"
if miniapp_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(miniapp_dist), html=True), name="miniapp")
else:
    @app.get("/")
    async def miniapp_not_built() -> dict:
        return {
            "message": "Mini App not built. Run 'npm run build' in miniapp/ and restart the API."
        }
