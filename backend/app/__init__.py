import os
from pathlib import Path

from flask import Flask, request, send_from_directory

from .api import register_api
from .config import Settings
from .contracts.api import ok_response
from .extensions import socketio
from .modules.balance_config import set_active_balance_config_dir
from .modules.persistence import connect_database, initialize_database
from .modules.realtime.phase_timer import start_phase_timeout_runner
from .modules.realtime import register_socketio_handlers


def create_app(settings: Settings | None = None) -> Flask:
    settings = settings or Settings.from_env()
    balance_config = set_active_balance_config_dir(settings.balance_config_dir)
    phase_duration_seconds = settings.phase_duration_seconds
    if phase_duration_seconds is None:
        phase_duration_seconds = balance_config.global_config.phase_duration_seconds

    app = Flask(__name__)
    app.config.from_mapping(settings.to_flask_config())
    app.config["PHASE_DURATION_SECONDS"] = phase_duration_seconds

    bootstrap_connection = connect_database(settings.database_path)
    initialize_database(bootstrap_connection)
    bootstrap_connection.close()

    register_api(app)
    register_runtime_routes(app, settings, phase_duration_seconds)
    register_http_cors(app, settings)

    # python-socketio accepts "*" (bare string) to allow all origins; a list like ["*"]
    # would be treated as an explicit allowlist that matches nothing. Unwrap accordingly.
    socketio_cors: str | list[str] = (
        "*" if "*" in settings.cors_allowed_origins else settings.cors_allowed_origins
    )
    socketio.init_app(
        app,
        cors_allowed_origins=socketio_cors,
        async_mode=settings.socketio_async_mode,
    )
    register_socketio_handlers(socketio=socketio, database_path=settings.database_path)
    if _should_start_phase_timeout_runner(settings, phase_duration_seconds):
        print(f"[App] Will start PhaseTimer (phase_duration={phase_duration_seconds}s)", flush=True)
        start_phase_timeout_runner(
            socketio=socketio,
            database_path=settings.database_path,
            phase_duration_seconds=phase_duration_seconds,
        )
    else:
        print(f"[App] PhaseTimer NOT started (phase_duration={phase_duration_seconds}, env={settings.app_env})", flush=True)

    return app


def _should_start_phase_timeout_runner(settings: Settings, phase_duration_seconds: int) -> bool:
    if phase_duration_seconds <= 0:
        return False
    if settings.app_env == "test":
        return False
    if os.getenv("PYTEST_CURRENT_TEST"):
        return False
    return True


def register_http_cors(app: Flask, settings: Settings) -> None:
    allowed_origins = set(settings.cors_allowed_origins)
    allow_all = "*" in allowed_origins

    @app.after_request
    def apply_cors_headers(response):
        origin = request.headers.get("Origin")

        if origin and (allow_all or origin in allowed_origins):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Session-Id"

        return response


def register_runtime_routes(app: Flask, settings: Settings, phase_duration_seconds: int) -> None:
    frontend_dist = Path(settings.frontend_dist).resolve()
    database_path = Path(settings.database_path).resolve()

    @app.get("/healthz")
    def healthz():
        return ok_response(
            {
                "service": "backend",
                "appEnv": settings.app_env,
                "databaseReady": database_path.exists(),
                "frontendReady": frontend_dist.exists(),
                "balanceConfigReady": True,
                "phaseDurationSeconds": phase_duration_seconds,
            }
        )

    if not frontend_dist.exists():
        return

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def serve_frontend(path: str):
        target = frontend_dist / path
        if path and target.exists():
            return send_from_directory(frontend_dist, path)
        return send_from_directory(frontend_dist, "index.html")
