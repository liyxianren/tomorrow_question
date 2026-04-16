from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from app.modules.balance_config import DEFAULT_BALANCE_CONFIG_DIR


def _read_bool(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _read_optional_int(name: str) -> int | None:
    raw_value = os.getenv(name)
    if raw_value is None or not raw_value.strip():
        return None
    return int(raw_value)


@dataclass(slots=True)
class Settings:
    app_env: str
    secret_key: str
    host: str
    port: int
    database_path: str
    frontend_dist: str
    socketio_async_mode: str
    cors_allowed_origins: list[str]
    debug: bool
    phase_duration_seconds: int | None = None
    balance_config_dir: str = str(DEFAULT_BALANCE_CONFIG_DIR)

    @classmethod
    def from_env(cls) -> "Settings":
        frontend_dist = os.getenv("FRONTEND_DIST", "../frontend/dist")
        cors_origins = os.getenv(
            "CORS_ALLOWED_ORIGINS",
            "http://127.0.0.1:5173,http://localhost:5173",
        )

        return cls(
            app_env=os.getenv("APP_ENV", "development"),
            secret_key=os.getenv("SECRET_KEY", "dev-secret-key"),
            host=os.getenv("HOST", "127.0.0.1"),
            port=int(os.getenv("PORT", "5000")),
            database_path=os.getenv("DATABASE_PATH", "./data/tomorrow_question.sqlite3"),
            frontend_dist=str(Path(frontend_dist)),
            socketio_async_mode=os.getenv("SOCKETIO_ASYNC_MODE", "threading"),
            cors_allowed_origins=[
                value.strip() for value in cors_origins.split(",") if value.strip()
            ],
            phase_duration_seconds=_read_optional_int("PHASE_DURATION_SECONDS"),
            balance_config_dir=os.getenv("BALANCE_CONFIG_DIR", str(DEFAULT_BALANCE_CONFIG_DIR)),
            debug=_read_bool("DEBUG", True),
        )

    def to_flask_config(self) -> dict[str, object]:
        config = {
            "ENV": self.app_env,
            "SECRET_KEY": self.secret_key,
            "DATABASE_PATH": self.database_path,
            "FRONTEND_DIST": self.frontend_dist,
            "SOCKETIO_ASYNC_MODE": self.socketio_async_mode,
            "CORS_ALLOWED_ORIGINS": self.cors_allowed_origins,
            "BALANCE_CONFIG_DIR": self.balance_config_dir,
        }
        if self.phase_duration_seconds is not None:
            config["PHASE_DURATION_SECONDS"] = self.phase_duration_seconds
        return config
