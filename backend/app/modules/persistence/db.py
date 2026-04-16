from __future__ import annotations

import sqlite3
from pathlib import Path


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS rooms (
    room_code TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    host_player_id TEXT NOT NULL,
    current_game_id TEXT,
    last_activity_at TEXT,
    payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL UNIQUE,
    room_code TEXT,
    selected_country TEXT,
    connection_status TEXT NOT NULL,
    last_seen_at TEXT,
    payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_room_code ON sessions(room_code);

CREATE TABLE IF NOT EXISTS games (
    game_id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    current_round INTEGER NOT NULL,
    total_rounds INTEGER NOT NULL,
    current_phase TEXT NOT NULL,
    is_finished INTEGER NOT NULL,
    active_snapshot_id TEXT,
    payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);

CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    round_no INTEGER NOT NULL,
    phase TEXT NOT NULL,
    phase_deadline_at TEXT,
    payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_game_id ON snapshots(game_id);

CREATE TABLE IF NOT EXISTS turn_inputs (
    game_id TEXT NOT NULL,
    round_no INTEGER NOT NULL,
    phase TEXT NOT NULL,
    player_id TEXT NOT NULL,
    submission_status TEXT NOT NULL,
    submitted_at TEXT,
    is_timeout_generated INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (game_id, round_no, phase, player_id)
);

CREATE INDEX IF NOT EXISTS idx_turn_inputs_phase
ON turn_inputs(game_id, round_no, phase);

CREATE TABLE IF NOT EXISTS game_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    round_no INTEGER NOT NULL,
    phase TEXT,
    kind TEXT NOT NULL,
    created_at TEXT,
    payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_game_logs_game_id ON game_logs(game_id);
CREATE INDEX IF NOT EXISTS idx_game_logs_phase ON game_logs(game_id, round_no, phase);
"""


def connect_database(database_path: str | Path) -> sqlite3.Connection:
    path = Path(database_path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON;")
    return connection


def initialize_database(connection: sqlite3.Connection) -> None:
    connection.executescript(SCHEMA_SQL)
    _ensure_rooms_last_activity_column(connection)
    connection.commit()


def _ensure_rooms_last_activity_column(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"] if isinstance(row, sqlite3.Row) else row[1]
        for row in connection.execute("PRAGMA table_info(rooms)").fetchall()
    }
    if "last_activity_at" not in columns:
        connection.execute("ALTER TABLE rooms ADD COLUMN last_activity_at TEXT")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_rooms_last_activity_at ON rooms(last_activity_at)")
