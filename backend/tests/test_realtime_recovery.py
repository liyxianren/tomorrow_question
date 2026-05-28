from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app
from app.contracts.enums import ConnectionStatus, CountryCode, RoomStatus, SocketEventName
from app.extensions import socketio
from app.modules.game_state.models import Game, GameSnapshot
from app.modules.persistence import RecoveryRepository, connect_database, initialize_database
from app.modules.realtime import (
    RealtimeAuthError,
    build_game_channel,
    build_room_channel,
    bind_connection_channels,
    emit_game_snapshot_sync,
    emit_room_updated,
    restore_socket_session,
    register_socketio_handlers,
)
from app.modules.room.models import Room
from app.modules.room.service import (
    add_member,
    assign_country,
    create_room,
    fill_bots,
    mark_member_ready,
)
from app.modules.session.models import PlayerSession
from app.modules.session.service import create_session, disconnect_session
from app.modules.settlement import StartGameResult, attempt_start_game


class RealtimeRecoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "realtime.sqlite3"
        self.connection = connect_database(self.database_path)
        initialize_database(self.connection)
        self.recovery_repository = RecoveryRepository(self.connection)
        self.app = create_app()
        register_socketio_handlers(socketio=socketio, recovery_repository=self.recovery_repository)

    def tearDown(self) -> None:
        self.connection.close()
        self.temp_dir.cleanup()

    def test_connect_rejects_missing_session_id(self) -> None:
        with self.assertRaises(RealtimeAuthError):
            restore_socket_session(auth=None, recovery_repository=self.recovery_repository)

    def test_connect_rejects_invalid_session_id(self) -> None:
        with self.assertRaises(RealtimeAuthError):
            restore_socket_session(
                auth={"sessionId": "session-missing"},
                recovery_repository=self.recovery_repository,
            )

    def test_restore_socket_session_recovers_active_game_context_and_marks_online(self) -> None:
        room, sessions_by_player = build_full_room()
        persisted_game = Game(
            game_id="game-sync",
            room_code=room.room_code,
            current_round=2,
            total_rounds=10,
            active_snapshot_id="snapshot-sync",
        )
        persisted_snapshot = GameSnapshot(
            snapshot_id="snapshot-sync",
            game_id=persisted_game.game_id,
            round_no=2,
            phase=persisted_game.current_phase,
            phase_deadline_at=datetime(2026, 3, 29, 12, 30, tzinfo=timezone.utc),
        )
        room.current_game_id = persisted_game.game_id
        room.status = RoomStatus.IN_GAME

        self.recovery_repository.rooms.save(room.to_payload())
        for session in sessions_by_player.values():
            self.recovery_repository.sessions.save(session.to_payload())
        self.recovery_repository.games.save(persisted_game.to_payload())
        self.recovery_repository.snapshots.save(persisted_snapshot.to_payload())

        disconnected = sessions_by_player["player-1"]
        disconnect_session(disconnected, now=datetime(2026, 3, 29, 12, 5, tzinfo=timezone.utc))
        self.recovery_repository.sessions.save(disconnected.to_payload())

        restored = restore_socket_session(
            auth={"sessionId": disconnected.session_id},
            recovery_repository=self.recovery_repository,
        )

        self.assertEqual(restored["session"].connection_status, ConnectionStatus.ONLINE)
        self.assertEqual(restored["room"].room_code, room.room_code)
        self.assertEqual(restored["game"].game_id, persisted_game.game_id)
        self.assertEqual(restored["snapshot"].snapshot_id, persisted_snapshot.snapshot_id)

    def test_bind_connection_channels_joins_room_and_game_channels(self) -> None:
        room, _ = build_full_room()
        game = Game(game_id="game-bind", room_code=room.room_code)

        with patch("app.modules.realtime.join_room") as join_room_mock:
            bind_connection_channels(room=room, game=game)

        join_room_mock.assert_any_call(build_room_channel(room.room_code))
        join_room_mock.assert_any_call(build_game_channel(game.game_id))

    def test_snapshot_sync_emitter_targets_room_members(self) -> None:
        room, sessions_by_player = build_full_room()
        game = Game(
            game_id="game-room",
            room_code=room.room_code,
            current_round=1,
            total_rounds=10,
            active_snapshot_id="snapshot-room",
        )
        snapshot = GameSnapshot(
            snapshot_id="snapshot-room",
            game_id=game.game_id,
            round_no=1,
            phase=game.current_phase,
        )

        with patch.object(socketio, "emit") as emit_mock:
            emit_game_snapshot_sync(socketio=socketio, room=room, game=game, snapshot=snapshot)

        emit_mock.assert_called_once()
        event_name, envelope = emit_mock.call_args.args[:2]
        self.assertEqual(event_name, SocketEventName.GAME_SNAPSHOT_SYNC.value)
        self.assertEqual(envelope["roomCode"], room.room_code)
        self.assertEqual(envelope["gameId"], game.game_id)
        self.assertEqual(envelope["payload"]["snapshot"]["snapshotId"], snapshot.snapshot_id)
        self.assertEqual(emit_mock.call_args.kwargs["to"], build_room_channel(room.room_code))

    def test_room_updated_emitter_targets_room_channel(self) -> None:
        room, _ = build_full_room()

        with patch.object(socketio, "emit") as emit_mock:
            emit_room_updated(socketio=socketio, room=room)

        emit_mock.assert_called_once()
        event_name, envelope = emit_mock.call_args.args[:2]
        self.assertEqual(event_name, SocketEventName.ROOM_UPDATED.value)
        self.assertEqual(envelope["roomCode"], room.room_code)
        self.assertEqual(envelope["payload"]["room"]["roomCode"], room.room_code)
        self.assertEqual(emit_mock.call_args.kwargs["to"], build_room_channel(room.room_code))


class SettlementStartTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "settlement.sqlite3"
        self.connection = connect_database(self.database_path)
        initialize_database(self.connection)
        self.recovery_repository = RecoveryRepository(self.connection)
        self.app = create_app()
        register_socketio_handlers(socketio=socketio, recovery_repository=self.recovery_repository)

    def tearDown(self) -> None:
        self.connection.close()
        self.temp_dir.cleanup()

    def test_attempt_start_game_persists_state_and_broadcasts_game_started(self) -> None:
        room, sessions_by_player = build_full_room()
        self.recovery_repository.rooms.save(room.to_payload())
        for session in sessions_by_player.values():
            self.recovery_repository.sessions.save(session.to_payload())

        with patch("app.modules.settlement.emit_game_started") as game_started_mock:
            result = attempt_start_game(
                room=room,
                sessions=list(sessions_by_player.values()),
                recovery_repository=self.recovery_repository,
                socketio=socketio,
                phase_deadline_at=datetime(2026, 3, 29, 13, 0, tzinfo=timezone.utc),
            )

        self.assertIsInstance(result, StartGameResult)
        self.assertEqual(result.room.current_game_id, result.game.game_id)
        self.assertIsNotNone(self.recovery_repository.rooms.get(room.room_code))
        self.assertIsNotNone(self.recovery_repository.games.get(result.game.game_id))
        self.assertIsNotNone(self.recovery_repository.snapshots.get(result.snapshot.snapshot_id))
        game_started_mock.assert_called_once()
        self.assertEqual(game_started_mock.call_args.kwargs["room"].room_code, room.room_code)
        self.assertEqual(game_started_mock.call_args.kwargs["game"].game_id, result.game.game_id)
        self.assertEqual(game_started_mock.call_args.kwargs["snapshot"].snapshot_id, result.snapshot.snapshot_id)

    def test_attempt_start_game_returns_none_until_all_players_ready(self) -> None:
        room, sessions_by_player = build_full_room()
        room.get_member("player-5").is_ready = False  # type: ignore[union-attr]

        result = attempt_start_game(
            room=room,
            sessions=list(sessions_by_player.values()),
            recovery_repository=self.recovery_repository,
            socketio=socketio,
        )

        self.assertIsNone(result)

    def test_attempt_start_game_accepts_host_plus_bots_without_bot_sessions(self) -> None:
        created_at = datetime(2026, 3, 29, 12, 0, tzinfo=timezone.utc)
        room = create_room(room_code="ROOM42", host_player_id="player-1", host_nickname="Player 1")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        mark_member_ready(room, "player-1", True)
        fill_bots(room, actor_player_id="player-1")
        sessions_by_player = {
            "player-1": create_session(
                nickname="Player 1",
                room_code=room.room_code,
                selected_country=CountryCode.BRITAIN,
                now=created_at,
                player_id="player-1",
                session_id="session-1",
            )
        }

        result = attempt_start_game(
            room=room,
            sessions=list(sessions_by_player.values()),
            recovery_repository=self.recovery_repository,
            socketio=socketio,
            phase_deadline_at=datetime(2026, 3, 29, 13, 0, tzinfo=timezone.utc),
        )

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(len(result.snapshot.player_states), 5)


def build_full_room() -> tuple[Room, dict[str, PlayerSession]]:
    created_at = datetime(2026, 3, 29, 12, 0, tzinfo=timezone.utc)
    room = create_room(room_code="ROOM42", host_player_id="player-1", host_nickname="Player 1")
    sessions_by_player: dict[str, PlayerSession] = {
        "player-1": create_session(
            nickname="Player 1",
            room_code=room.room_code,
            selected_country=CountryCode.BRITAIN,
            now=created_at,
            player_id="player-1",
            session_id="session-1",
        )
    }

    assignments = {
        "player-1": CountryCode.BRITAIN,
        "player-2": CountryCode.FRANCE,
        "player-3": CountryCode.PRUSSIA,
        "player-4": CountryCode.AUSTRIA,
        "player-5": CountryCode.RUSSIA,
    }

    for idx in range(2, 6):
        player_id = f"player-{idx}"
        add_member(
            room,
            player_id=player_id,
            nickname=f"Player {idx}",
            connection_status=ConnectionStatus.ONLINE,
        )
        sessions_by_player[player_id] = create_session(
            nickname=f"Player {idx}",
            room_code=room.room_code,
            selected_country=assignments[player_id],
            now=created_at,
            player_id=player_id,
            session_id=f"session-{idx}",
        )

    for player_id, country in assignments.items():
        assign_country(room, player_id=player_id, country=country)
        mark_member_ready(room, player_id=player_id, is_ready=True)

    return room, sessions_by_player


if __name__ == "__main__":
    unittest.main()
