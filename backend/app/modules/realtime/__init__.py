from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterator, Mapping

from flask import request
from flask_socketio import SocketIO, join_room

from app.contracts.enums import ConnectionStatus, ErrorCode, PlayerSubmissionStatus, RoomStatus, SocketEventName
from app.contracts.socket import socket_envelope
from app.modules.game_state.models import Game, GameSnapshot
from app.modules.persistence import RecoveryRepository, connect_database, initialize_database
from app.modules.room.models import Room
from app.modules.room.service import touch_room
from app.modules.session.models import PlayerSession
from app.modules.session.service import connect_session, disconnect_session


@dataclass(slots=True)
class RealtimeAuthError(Exception):
    error_code: ErrorCode
    message: str

    def __str__(self) -> str:
        return self.message


_registered_socketio_keys: set[int] = set()
_repository_sources: dict[int, tuple[RecoveryRepository | None, str | None]] = {}
_connected_session_ids: dict[tuple[int, str], str] = {}


def build_room_channel(room_code: str) -> str:
    return f"room:{room_code}"


def build_game_channel(game_id: str) -> str:
    return f"game:{game_id}"


def register_socketio_handlers(
    *,
    socketio: SocketIO,
    recovery_repository: RecoveryRepository | None = None,
    database_path: str | None = None,
) -> None:
    if recovery_repository is None and database_path is None:
        raise ValueError("register_socketio_handlers requires recovery_repository or database_path.")

    socketio_key = id(socketio)
    _repository_sources[socketio_key] = (recovery_repository, database_path)

    if socketio_key in _registered_socketio_keys:
        return

    @socketio.on("connect")
    def handle_connect(auth: Mapping[str, Any] | None = None) -> bool:
        with _recovery_context(socketio_key) as repository:
            try:
                restored = restore_socket_session(
                    auth=auth,
                    recovery_repository=repository,
                )
            except RealtimeAuthError:
                return False

            _connected_session_ids[(socketio_key, request.sid)] = restored["session"].session_id
            repository.sessions.save(restored["session"].to_payload())

            room = restored.get("room")
            if room is None:
                return True

            game = restored.get("game")
            snapshot = restored.get("snapshot")
            if room.status in {RoomStatus.WAITING, RoomStatus.READYING}:
                touch_room(room)
                repository.rooms.save(room.to_payload())
            bind_connection_channels(room=room, game=game)
            emit_room_updated(socketio=socketio, room=room)
            if game is None or snapshot is None:
                return True

            socketio.start_background_task(
                _emit_snapshot_sync_after_connect,
                socketio,
                room,
                game,
                snapshot,
                request.sid,
            )
        return True

    @socketio.on("disconnect")
    def handle_disconnect() -> None:
        session_id = _connected_session_ids.pop((socketio_key, request.sid), None)
        if session_id is None:
            return

        with _recovery_context(socketio_key) as repository:
            payload = repository.sessions.get(session_id)
            if payload is None:
                return

            disconnected = PlayerSession.from_payload(payload)
            disconnect_session(disconnected)
            repository.sessions.save(disconnected.to_payload())

            if not disconnected.room_code:
                return

            room_payload = repository.rooms.get(disconnected.room_code)
            if room_payload is None:
                return

            room = Room.from_payload(room_payload)
            member = room.get_member(disconnected.player_id)
            if member is not None:
                member.connection_status = ConnectionStatus.OFFLINE_RECOVERABLE
                if room.status in {RoomStatus.WAITING, RoomStatus.READYING}:
                    touch_room(room)
                repository.rooms.save(room.to_payload())
                emit_room_updated(socketio=socketio, room=room)

    _registered_socketio_keys.add(socketio_key)


def restore_socket_session(
    *,
    auth: Mapping[str, Any] | None,
    recovery_repository: RecoveryRepository,
) -> dict[str, PlayerSession | Room | Game | GameSnapshot | None]:
    session_id = None if auth is None else auth.get("sessionId")
    if not isinstance(session_id, str) or not session_id.strip():
        raise RealtimeAuthError(ErrorCode.INVALID_SESSION, "Socket auth.sessionId is required.")

    restored_payload = recovery_repository.restore_session(session_id)
    if restored_payload is None:
        raise RealtimeAuthError(ErrorCode.INVALID_SESSION, "Session could not be restored.")

    session = PlayerSession.from_payload(restored_payload["session"])
    connect_session(session)

    restored: dict[str, PlayerSession | Room | Game | GameSnapshot | None] = {"session": session}

    room_payload = restored_payload.get("room")
    if room_payload is None:
        return restored

    room = Room.from_payload(room_payload)
    member = room.get_member(session.player_id)
    if member is not None:
        member.connection_status = ConnectionStatus.ONLINE
    if room.status in {RoomStatus.WAITING, RoomStatus.READYING}:
        touch_room(room)
    recovery_repository.rooms.save(room.to_payload())
    restored["room"] = room

    game_payload = restored_payload.get("activeGame")
    if game_payload is not None:
        restored["game"] = Game.from_payload(game_payload)

    snapshot_payload = restored_payload.get("activeSnapshot")
    if snapshot_payload is not None:
        restored["snapshot"] = GameSnapshot.from_payload(snapshot_payload)

    return restored


def bind_connection_channels(*, room: Room, game: Game | None = None) -> None:
    join_room(build_room_channel(room.room_code))
    if game is not None:
        join_room(build_game_channel(game.game_id))


def emit_room_updated(*, socketio: SocketIO, room: Room, members_summary: dict[str, Any] | None = None) -> None:
    socketio.emit(
        SocketEventName.ROOM_UPDATED.value,
        socket_envelope(
            room_code=room.room_code,
            payload={
                "room": room.to_payload(),
                "membersSummary": members_summary or build_members_summary(room),
            },
        ),
        to=build_room_channel(room.room_code),
    )


def emit_game_started(*, socketio: SocketIO, room: Room, game: Game, snapshot: GameSnapshot) -> None:
    socketio.emit(
        SocketEventName.GAME_STARTED.value,
        socket_envelope(
            room_code=room.room_code,
            game_id=game.game_id,
            payload={
                "game": game.to_payload(),
                "snapshot": snapshot.to_payload(),
            },
        ),
        to=build_room_channel(room.room_code),
    )


def emit_game_phase_started(
    *,
    socketio: SocketIO,
    room: Room,
    game: Game,
    snapshot: GameSnapshot,
    submission_status_by_player_id: Mapping[str, str] | None = None,
) -> None:
    socketio.emit(
        SocketEventName.GAME_PHASE_STARTED.value,
        socket_envelope(
            room_code=room.room_code,
            game_id=game.game_id,
            payload={
                "game": game.to_payload(),
                "snapshot": snapshot.to_payload(),
                "submissionStatusByPlayerId": dict(
                    submission_status_by_player_id
                    or {
                        player_state.player_id: PlayerSubmissionStatus.PENDING.value
                        for player_state in snapshot.player_states
                    }
                ),
            },
        ),
        to=build_room_channel(room.room_code),
    )


def emit_game_phase_settled(
    *,
    socketio: SocketIO,
    room: Room,
    game: Game,
    snapshot: GameSnapshot,
    logs: list[dict[str, Any]],
    auto_submitted_player_ids: list[str],
) -> None:
    socketio.emit(
        SocketEventName.GAME_PHASE_SETTLED.value,
        socket_envelope(
            room_code=room.room_code,
            game_id=game.game_id,
            payload={
                "game": game.to_payload(),
                "snapshot": snapshot.to_payload(),
                "logs": list(logs),
                "autoSubmittedPlayerIds": list(auto_submitted_player_ids),
                "rankingWorkspace": deepcopy(snapshot.ranking_workspace) if snapshot.ranking_workspace else snapshot.to_payload()["rankingWorkspace"],
                "lastSettlementWorkspace": (
                    deepcopy(snapshot.last_settlement_workspace)
                    if snapshot.last_settlement_workspace is not None
                    else snapshot.to_payload()["lastSettlementWorkspace"]
                ),
            },
        ),
        to=build_room_channel(room.room_code),
    )


def emit_game_finished(
    *,
    socketio: SocketIO,
    room: Room,
    game: Game,
    snapshot: GameSnapshot,
    final_ranking: list[dict[str, Any]],
    final_logs: list[dict[str, Any]],
) -> None:
    socketio.emit(
        SocketEventName.GAME_FINISHED.value,
        socket_envelope(
            room_code=room.room_code,
            game_id=game.game_id,
            payload={
                "game": game.to_payload(),
                "snapshot": snapshot.to_payload(),
                "finalRanking": list(final_ranking),
                "finalLogs": list(final_logs),
            },
        ),
        to=build_room_channel(room.room_code),
    )


def emit_game_snapshot_sync(
    *,
    socketio: SocketIO,
    room: Room,
    game: Game,
    snapshot: GameSnapshot,
    sid: str | None = None,
) -> None:
    socketio.emit(
        SocketEventName.GAME_SNAPSHOT_SYNC.value,
        socket_envelope(
            room_code=room.room_code,
            game_id=game.game_id,
            payload={
                "room": room.to_payload(),
                "game": game.to_payload(),
                "snapshot": snapshot.to_payload(),
            },
        ),
        to=sid or build_room_channel(room.room_code),
    )


def _emit_snapshot_sync_after_connect(
    socketio: SocketIO,
    room: Room,
    game: Game,
    snapshot: GameSnapshot,
    sid: str,
) -> None:
    socketio.sleep(0)
    emit_game_snapshot_sync(
        socketio=socketio,
        room=room,
        game=game,
        snapshot=snapshot,
        sid=sid,
    )


def build_members_summary(room: Room) -> dict[str, Any]:
    return {
        "memberCount": len(room.members),
        "readyCount": sum(1 for member in room.members if member.is_ready),
        "onlineCount": sum(1 for member in room.members if member.connection_status == ConnectionStatus.ONLINE),
    }


@contextmanager
def _recovery_context(socketio_key: int) -> Iterator[RecoveryRepository]:
    recovery_repository, database_path = _repository_sources[socketio_key]
    if recovery_repository is not None:
        yield recovery_repository
        return

    if database_path is None:
        raise RuntimeError("SocketIO recovery source is not configured.")

    connection = connect_database(database_path)
    initialize_database(connection)
    try:
        yield RecoveryRepository(connection)
    finally:
        connection.close()


__all__ = [
    "RealtimeAuthError",
    "build_game_channel",
    "bind_connection_channels",
    "build_room_channel",
    "build_members_summary",
    "emit_game_finished",
    "emit_game_phase_settled",
    "emit_game_phase_started",
    "emit_game_snapshot_sync",
    "emit_game_started",
    "emit_room_updated",
    "register_socketio_handlers",
    "restore_socket_session",
]
