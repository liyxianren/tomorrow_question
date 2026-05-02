from __future__ import annotations

import json
import sqlite3
from typing import NotRequired, TypedDict

from ...contracts.models import (
    GameLogPayload,
    GamePayload,
    GameSnapshotPayload,
    PlayerSessionPayload,
    PlayerTurnInputPayload,
    RoomPayload,
)
from .repositories import (
    GameLogRepository,
    GameRepository,
    PlayerTurnInputRepository,
    RoomRepository,
    SessionRepository,
    SnapshotRepository,
)


class RecoveredRoomContextPayload(TypedDict):
    room: RoomPayload
    activeGame: NotRequired[GamePayload | None]
    activeSnapshot: NotRequired[GameSnapshotPayload | None]
    activeTurnInputs: NotRequired[list[PlayerTurnInputPayload]]
    gameLogs: NotRequired[list[GameLogPayload]]


class SessionRestorePayload(TypedDict):
    session: PlayerSessionPayload
    room: NotRequired[RoomPayload]
    activeGame: NotRequired[GamePayload | None]
    activeSnapshot: NotRequired[GameSnapshotPayload | None]
    activeTurnInputs: NotRequired[list[PlayerTurnInputPayload]]
    gameLogs: NotRequired[list[GameLogPayload]]


class ActiveStatePayload(TypedDict):
    rooms: list[RoomPayload]
    sessions: list[PlayerSessionPayload]
    games: list[GamePayload]
    snapshots: list[GameSnapshotPayload]
    turnInputs: list[PlayerTurnInputPayload]
    gameLogs: list[GameLogPayload]
    roomContexts: list[RecoveredRoomContextPayload]


class RecoveryRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection
        self.rooms = RoomRepository(connection)
        self.sessions = SessionRepository(connection)
        self.games = GameRepository(connection)
        self.snapshots = SnapshotRepository(connection)
        self.turn_inputs = PlayerTurnInputRepository(connection)
        self.game_logs = GameLogRepository(connection)

    def get_room_context(self, room_code: str) -> RecoveredRoomContextPayload | None:
        room = self.rooms.get(room_code)
        if room is None:
            return None

        context: RecoveredRoomContextPayload = {"room": room}
        current_game_id = room.get("currentGameId")
        if not current_game_id:
            return context

        try:
            game = self.games.get(current_game_id)
        except ValueError:
            return context
        if game is None:
            return context

        context["activeGame"] = game
        try:
            context["activeTurnInputs"] = self.turn_inputs.list_for_phase(
                game["gameId"],
                game["currentRound"],
                game["currentPhase"],
            )
            context["gameLogs"] = self.game_logs.list_for_game(game["gameId"])
        except ValueError:
            return context

        active_snapshot_id = game.get("activeSnapshotId")
        if not active_snapshot_id:
            return context

        try:
            snapshot = self.snapshots.get(active_snapshot_id)
            if snapshot is not None:
                context["activeSnapshot"] = snapshot
        except ValueError:
            return context

        return context

    def restore_session(self, session_id: str) -> SessionRestorePayload | None:
        session = self.sessions.get(session_id)
        if session is None:
            return None

        restored: SessionRestorePayload = {"session": session}
        room_code = session.get("roomCode")
        if not room_code:
            return restored

        room_context = self.get_room_context(room_code)
        if room_context is None:
            return restored

        restored["room"] = room_context["room"]
        if "activeGame" in room_context:
            restored["activeGame"] = room_context["activeGame"]
        if "activeSnapshot" in room_context:
            restored["activeSnapshot"] = room_context["activeSnapshot"]
        if "activeTurnInputs" in room_context:
            restored["activeTurnInputs"] = room_context["activeTurnInputs"]
        if "gameLogs" in room_context:
            restored["gameLogs"] = room_context["gameLogs"]

        return restored

    def load_active_state(self) -> ActiveStatePayload:
        rooms = self.rooms.list_active()
        room_codes = [room["roomCode"] for room in rooms]
        sessions = self.sessions.list_recoverable(room_codes)

        room_contexts: list[RecoveredRoomContextPayload] = []
        games: list[GamePayload] = []
        snapshots: list[GameSnapshotPayload] = []
        turn_inputs: list[PlayerTurnInputPayload] = []
        game_logs: list[GameLogPayload] = []

        seen_game_ids: set[str] = set()
        seen_snapshot_ids: set[str] = set()
        seen_turn_inputs: set[tuple[str, int, str, str]] = set()

        for room in rooms:
            context = self.get_room_context(room["roomCode"])
            if context is None:
                continue

            room_contexts.append(context)

            game = context.get("activeGame")
            if game is not None and game["gameId"] not in seen_game_ids:
                seen_game_ids.add(game["gameId"])
                games.append(game)

            snapshot = context.get("activeSnapshot")
            if snapshot is not None and snapshot["snapshotId"] not in seen_snapshot_ids:
                seen_snapshot_ids.add(snapshot["snapshotId"])
                snapshots.append(snapshot)

            for turn_input in context.get("activeTurnInputs", []):
                key = (
                    turn_input["gameId"],
                    turn_input["roundNo"],
                    turn_input["phase"],
                    turn_input["playerId"],
                )
                if key in seen_turn_inputs:
                    continue
                seen_turn_inputs.add(key)
                turn_inputs.append(turn_input)

            for game_log in context.get("gameLogs", []):
                game_logs.append(game_log)

        return {
            "rooms": rooms,
            "sessions": sessions,
            "games": games,
            "snapshots": snapshots,
            "turnInputs": turn_inputs,
            "gameLogs": game_logs,
            "roomContexts": room_contexts,
        }

    def load_games_with_active_deadlines(self) -> list[tuple[GamePayload, GameSnapshotPayload]]:
        """Load only (game, snapshot) pairs where snapshot has a phase_deadline_at set.

        Much cheaper than load_active_state — avoids loading all rooms,
        sessions, turn inputs, and game logs.
        """
        results: list[tuple[GamePayload, GameSnapshotPayload]] = []
        rows = self.connection.execute(
            """
            SELECT g.payload_json, s.payload_json
            FROM games g
            JOIN snapshots s ON g.active_snapshot_id = s.snapshot_id
            WHERE g.is_finished = 0
              AND g.current_phase != 'decision'
              AND s.phase_deadline_at IS NOT NULL
            """
        ).fetchall()
        for game_json, snapshot_json in rows:
            try:
                game = json.loads(game_json)
                snapshot = json.loads(snapshot_json)
                results.append((game, snapshot))
            except (ValueError, TypeError):
                continue
        return results
