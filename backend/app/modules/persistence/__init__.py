"""Persistence module boundary.

Expected file ownership:
- db.py: SQLite connection and schema bootstrap
- repositories.py: room/session/game/snapshot/turn-input/log repositories
- recovery.py: restore queries for room and active game context

Shared transport contracts are locked in app.contracts.models.
"""

from .db import connect_database, initialize_database
from .recovery import ActiveStatePayload, RecoveryRepository, RecoveredRoomContextPayload, SessionRestorePayload
from .repositories import (
    GameLogRepository,
    GameRepository,
    PlayerTurnInputRepository,
    RoomRepository,
    SessionRepository,
    SnapshotRepository,
)

__all__ = [
    "connect_database",
    "initialize_database",
    "RoomRepository",
    "SessionRepository",
    "GameRepository",
    "SnapshotRepository",
    "PlayerTurnInputRepository",
    "GameLogRepository",
    "RecoveryRepository",
    "RecoveredRoomContextPayload",
    "SessionRestorePayload",
    "ActiveStatePayload",
]
