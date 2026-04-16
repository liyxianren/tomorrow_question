from __future__ import annotations

import sqlite3
from typing import Any

from flask import current_app, g, request

from app.modules.persistence import connect_database, initialize_database


_DATABASE_CONNECTION_KEY = "api_db_connection"


def get_db_connection() -> sqlite3.Connection:
    connection = getattr(g, _DATABASE_CONNECTION_KEY, None)
    if connection is None:
        connection = connect_database(current_app.config["DATABASE_PATH"])
        initialize_database(connection)
        setattr(g, _DATABASE_CONNECTION_KEY, connection)
    return connection


def close_db_connection(_: BaseException | None = None) -> None:
    connection = getattr(g, _DATABASE_CONNECTION_KEY, None)
    if connection is not None:
        delattr(g, _DATABASE_CONNECTION_KEY)
        connection.close()


def get_request_json() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    if isinstance(payload, dict):
        return payload
    return {}


def get_session_id() -> str | None:
    header_value = request.headers.get("X-Session-Id")
    if header_value:
        return header_value

    payload = get_request_json()
    session_id = payload.get("sessionId")
    return session_id if isinstance(session_id, str) else None
