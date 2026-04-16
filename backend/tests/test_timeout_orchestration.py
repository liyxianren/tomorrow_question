from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import ConnectionStatus, CountryCode, GamePhase, SocketEventName
from app.extensions import socketio
from app.modules.persistence import RecoveryRepository, connect_database, initialize_database
from app.modules.realtime import phase_timer as phase_timer_module
from app.modules.room.models import Room
from app.modules.room.service import add_member, assign_country, create_room, mark_member_ready
from app.modules.session.models import PlayerSession
from app.modules.session.service import create_session
from app.modules.settlement import attempt_start_game
from app.modules.settlement.phase_submission import build_player_turn_input


def build_full_room() -> tuple[Room, dict[str, PlayerSession]]:
    created_at = datetime(2026, 3, 29, 12, 0, tzinfo=UTC)
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
        add_member(room, player_id=player_id, nickname=f"Player {idx}", connection_status=ConnectionStatus.ONLINE)
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


def build_decision_payload() -> dict[str, object]:
    return {
        "factoryPlan": {
            "productionOrders": [{"goodsId": "steel", "quantity": 1}],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {"pointPurchases": [], "strategySelections": []},
    }


class TimeoutOrchestrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "timeout-orchestration.sqlite3"
        self.connection = connect_database(self.database_path)
        initialize_database(self.connection)
        self.recovery_repository = RecoveryRepository(self.connection)

    def tearDown(self) -> None:
        self.connection.close()
        self.temp_dir.cleanup()

    def seed_started_game(self, *, phase_deadline_at: datetime):
        room, sessions_by_player = build_full_room()
        self.recovery_repository.rooms.save(room.to_payload())
        for session in sessions_by_player.values():
            self.recovery_repository.sessions.save(session.to_payload())

        with patch.object(socketio, "emit"):
            started = attempt_start_game(
                room=room,
                sessions=list(sessions_by_player.values()),
                recovery_repository=self.recovery_repository,
                socketio=socketio,
                phase_deadline_at=phase_deadline_at,
            )
        self.assertIsNotNone(started)
        assert started is not None
        return started

    def test_decision_phase_timeout_does_not_auto_advance(self) -> None:
        """Decision phase should NOT auto-advance on timeout — players must manually submit."""
        started = self.seed_started_game(phase_deadline_at=datetime(2026, 3, 29, 12, 3, tzinfo=UTC))

        orchestrator = phase_timer_module.PhaseTimeoutOrchestrator(
            database_path=str(self.database_path),
            socketio=socketio,
            phase_duration_seconds=180,
        )

        with patch.object(socketio, "emit"):
            processed = orchestrator.run_once(now=datetime(2026, 3, 29, 12, 4, tzinfo=UTC))

        # Decision phase does not auto-advance
        self.assertEqual(processed, 0)

    def test_timeout_runner_finishes_game_on_final_settlement_and_is_idempotent(self) -> None:
        started = self.seed_started_game(phase_deadline_at=datetime(2026, 3, 29, 12, 3, tzinfo=UTC))
        started.game.current_round = started.game.total_rounds
        started.game.current_phase = GamePhase.SETTLEMENT
        started.snapshot.round_no = started.game.total_rounds
        started.snapshot.phase = GamePhase.SETTLEMENT
        started.snapshot.phase_deadline_at = datetime(2026, 3, 29, 12, 3, tzinfo=UTC)
        for index, player_state in enumerate(started.snapshot.player_states, start=1):
            player_state.national_income = 0
            player_state.cumulative_national_income = 100 - (index * 10)
        self.recovery_repository.games.save(started.game.to_payload())
        self.recovery_repository.snapshots.save(started.snapshot.to_payload())

        orchestrator = phase_timer_module.PhaseTimeoutOrchestrator(
            database_path=str(self.database_path),
            socketio=socketio,
            phase_duration_seconds=180,
        )

        with patch.object(socketio, "emit") as emit_mock:
            first_processed = orchestrator.run_once(now=datetime(2026, 3, 29, 12, 4, tzinfo=UTC))
            second_processed = orchestrator.run_once(now=datetime(2026, 3, 29, 12, 4, tzinfo=UTC))

        self.assertEqual(first_processed, 1)
        self.assertEqual(second_processed, 0)
        self.assertEqual(
            [call.args[0] for call in emit_mock.call_args_list],
            [SocketEventName.GAME_PHASE_SETTLED.value, SocketEventName.GAME_FINISHED.value],
        )

        persisted_game = self.recovery_repository.games.get(started.game.game_id)
        self.assertTrue(persisted_game["isFinished"])
        self.assertEqual(self.recovery_repository.rooms.get(started.room.room_code)["status"].value, "finished")
        self.assertEqual(
            self.recovery_repository.turn_inputs.list_for_phase(
                started.game.game_id,
                started.snapshot.round_no,
                started.snapshot.phase,
            ),
            [],
        )


if __name__ == "__main__":
    unittest.main()
