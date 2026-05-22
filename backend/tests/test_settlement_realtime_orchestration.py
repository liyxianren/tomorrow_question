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
from app.modules.realtime import restore_socket_session
from app.modules.room.models import Room
from app.modules.room.service import add_member, assign_country, create_room, fill_bots, mark_member_ready
from app.modules.session.models import PlayerSession
from app.modules.session.service import create_session
from app.modules.settlement import attempt_start_game
from app.modules.settlement.phase_submission import build_player_turn_input, build_timeout_player_turn_input
from app.modules.settlement.submission_application import run_phase_settlement


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


class SettlementRealtimeOrchestrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "settlement-realtime.sqlite3"
        self.connection = connect_database(self.database_path)
        initialize_database(self.connection)
        self.recovery_repository = RecoveryRepository(self.connection)

    def tearDown(self) -> None:
        self.connection.close()
        self.temp_dir.cleanup()

    def test_attempt_start_game_also_broadcasts_phase_started_contract(self) -> None:
        room, sessions_by_player = build_full_room()
        self.recovery_repository.rooms.save(room.to_payload())
        for session in sessions_by_player.values():
            self.recovery_repository.sessions.save(session.to_payload())

        with patch.object(socketio, "emit") as emit_mock:
            result = attempt_start_game(
                room=room,
                sessions=list(sessions_by_player.values()),
                recovery_repository=self.recovery_repository,
                socketio=socketio,
                phase_deadline_at=datetime(2026, 3, 29, 13, 0, tzinfo=UTC),
            )

        self.assertIsNotNone(result)
        self.assertEqual(
            [call.args[0] for call in emit_mock.call_args_list],
            [SocketEventName.GAME_STARTED.value, SocketEventName.GAME_PHASE_STARTED.value],
        )

        phase_started_payload = emit_mock.call_args_list[1].args[1]["payload"]
        self.assertEqual(set(phase_started_payload.keys()), {"game", "snapshot", "submissionStatusByPlayerId"})
        self.assertEqual(phase_started_payload["game"]["gameId"], result.game.game_id)
        self.assertEqual(phase_started_payload["snapshot"]["snapshotId"], result.snapshot.snapshot_id)
        self.assertEqual(phase_started_payload["snapshot"]["phaseWorkspace"]["phase"], GamePhase.DECISION)
        self.assertEqual(phase_started_payload["snapshot"]["rankingWorkspace"]["standings"], [])
        self.assertIsNone(phase_started_payload["snapshot"]["lastSettlementWorkspace"])
        self.assertEqual(
            phase_started_payload["submissionStatusByPlayerId"],
            {
                "player-1": "pending",
                "player-2": "pending",
                "player-3": "pending",
                "player-4": "pending",
                "player-5": "pending",
            },
        )

    def test_phase_settlement_from_decision_advances_to_market_and_restores_latest_snapshot(self) -> None:
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
                phase_deadline_at=datetime(2026, 3, 29, 13, 0, tzinfo=UTC),
            )
        self.assertIsNotNone(started)
        assert started is not None

        turn_inputs = [
            build_player_turn_input(
                game_id=started.game.game_id,
                round_no=started.snapshot.round_no,
                phase=started.snapshot.phase,
                player_id="player-1",
                payload=build_decision_payload(),
                submitted_at=datetime(2026, 3, 29, 12, 10, tzinfo=UTC),
            ),
            build_timeout_player_turn_input(
                game_id=started.game.game_id,
                round_no=started.snapshot.round_no,
                phase=started.snapshot.phase,
                player_id="player-2",
                submitted_at=datetime(2026, 3, 29, 12, 11, tzinfo=UTC),
            ),
            build_timeout_player_turn_input(
                game_id=started.game.game_id,
                round_no=started.snapshot.round_no,
                phase=started.snapshot.phase,
                player_id="player-3",
                submitted_at=datetime(2026, 3, 29, 12, 11, tzinfo=UTC),
            ),
            build_timeout_player_turn_input(
                game_id=started.game.game_id,
                round_no=started.snapshot.round_no,
                phase=started.snapshot.phase,
                player_id="player-4",
                submitted_at=datetime(2026, 3, 29, 12, 11, tzinfo=UTC),
            ),
            build_timeout_player_turn_input(
                game_id=started.game.game_id,
                round_no=started.snapshot.round_no,
                phase=started.snapshot.phase,
                player_id="player-5",
                submitted_at=datetime(2026, 3, 29, 12, 11, tzinfo=UTC),
            ),
        ]

        with patch.object(socketio, "emit") as emit_mock:
            outcome = run_phase_settlement(
                room=started.room,
                game=started.game,
                snapshot=started.snapshot,
                turn_inputs=turn_inputs,
                recovery_repository=self.recovery_repository,
                socketio=socketio,
                phase_duration_seconds=180,
                settled_at=datetime(2026, 3, 29, 12, 12, tzinfo=UTC),
            )

        self.assertFalse(outcome.is_game_finished)
        event_names = [call.args[0] for call in emit_mock.call_args_list]
        self.assertGreaterEqual(len(event_names), 2)
        self.assertEqual(event_names[0], SocketEventName.GAME_PHASE_SETTLED.value)
        self.assertEqual(event_names[1], SocketEventName.GAME_PHASE_STARTED.value)
        self.assertEqual(outcome.updated_snapshot.phase, GamePhase.MARKET)
        self.assertEqual(outcome.updated_snapshot.round_no, 1)

        persisted_snapshot_payload = self.recovery_repository.snapshots.get(outcome.updated_snapshot.snapshot_id)
        self.assertIsNotNone(persisted_snapshot_payload)
        assert persisted_snapshot_payload is not None
        self.assertEqual(persisted_snapshot_payload["phase"], GamePhase.MARKET)
        self.assertEqual(persisted_snapshot_payload["phaseWorkspace"]["phase"], GamePhase.MARKET)
        self.assertEqual(persisted_snapshot_payload["lastSettlementWorkspace"]["settledPhase"], GamePhase.DECISION)
        self.assertEqual(
            persisted_snapshot_payload["lastSettlementWorkspace"]["autoSubmittedPlayerIds"],
            ["player-2", "player-3", "player-4", "player-5"],
        )
        self.assertEqual(len(persisted_snapshot_payload["ranking"]), 5)

        restored = restore_socket_session(
            auth={"sessionId": sessions_by_player["player-1"].session_id},
            recovery_repository=self.recovery_repository,
        )
        self.assertEqual(restored["game"].current_phase, GamePhase.MARKET)
        self.assertEqual(restored["snapshot"].snapshot_id, outcome.updated_snapshot.snapshot_id)
        self.assertEqual(restored["snapshot"].phase, GamePhase.MARKET)

    def test_phase_settlement_starts_next_phase_with_bots_already_submitted(self) -> None:
        created_at = datetime(2026, 3, 29, 12, 0, tzinfo=UTC)
        room = create_room(room_code="ROOM42", host_player_id="player-1", host_nickname="Player 1")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        mark_member_ready(room, "player-1", True)
        fill_bots(room, actor_player_id="player-1")
        self.recovery_repository.rooms.save(room.to_payload())
        host_session = create_session(
            nickname="Player 1",
            room_code=room.room_code,
            selected_country=CountryCode.BRITAIN,
            now=created_at,
            player_id="player-1",
            session_id="session-1",
        )
        self.recovery_repository.sessions.save(host_session.to_payload())
        with patch.object(socketio, "emit"):
            started = attempt_start_game(
                room=room,
                sessions=[host_session],
                recovery_repository=self.recovery_repository,
                socketio=socketio,
                phase_deadline_at=datetime(2026, 3, 29, 13, 0, tzinfo=UTC),
            )
        self.assertIsNotNone(started)
        assert started is not None

        with patch.object(socketio, "emit") as emit_mock:
            outcome = run_phase_settlement(
                room=started.room,
                game=started.game,
                snapshot=started.snapshot,
                turn_inputs=[
                    build_player_turn_input(
                        game_id=started.game.game_id,
                        round_no=started.snapshot.round_no,
                        phase=started.snapshot.phase,
                        player_id="player-1",
                        payload=build_decision_payload(),
                        submitted_at=datetime(2026, 3, 29, 12, 10, tzinfo=UTC),
                    )
                ],
                recovery_repository=self.recovery_repository,
                socketio=socketio,
                phase_duration_seconds=180,
                settled_at=datetime(2026, 3, 29, 12, 12, tzinfo=UTC),
            )

        self.assertFalse(outcome.is_game_finished)
        phase_started_payload = emit_mock.call_args_list[1].args[1]["payload"]
        self.assertEqual(phase_started_payload["game"]["currentPhase"], GamePhase.MARKET)
        self.assertEqual(phase_started_payload["submissionStatusByPlayerId"]["player-1"], "pending")
        submitted_bot_count = sum(
            1
            for player_id, status in phase_started_payload["submissionStatusByPlayerId"].items()
            if player_id != "player-1" and status == "submitted"
        )
        self.assertEqual(submitted_bot_count, 4)

        restored = restore_socket_session(
            auth={"sessionId": host_session.session_id},
            recovery_repository=self.recovery_repository,
        )
        self.assertEqual(restored["game"].current_phase, GamePhase.MARKET)
        self.assertEqual(restored["snapshot"].snapshot_id, outcome.updated_snapshot.snapshot_id)
        self.assertEqual(restored["snapshot"].phase, GamePhase.MARKET)

    def test_final_settlement_broadcasts_finished_payload_and_cleans_process_state(self) -> None:
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
                phase_deadline_at=datetime(2026, 3, 29, 13, 0, tzinfo=UTC),
            )
        self.assertIsNotNone(started)
        assert started is not None

        started.game.current_round = started.game.total_rounds
        started.game.current_phase = GamePhase.SETTLEMENT
        started.snapshot.round_no = started.game.total_rounds
        started.snapshot.phase = GamePhase.SETTLEMENT
        started.snapshot.phase_deadline_at = datetime(2026, 3, 29, 12, 20, tzinfo=UTC)

        for index, player_state in enumerate(started.snapshot.player_states, start=1):
            player_state.national_income = 0
            player_state.cumulative_national_income = 100 - (index * 10)
            player_state.budget_pools = {
                "domesticMarket": 10,
                "factory": 10,
                "governmentFiscal": 10 + index,
            }

        self.recovery_repository.games.save(started.game.to_payload())
        self.recovery_repository.snapshots.save(started.snapshot.to_payload())
        old_snapshot_id = started.snapshot.snapshot_id

        with patch.object(socketio, "emit") as emit_mock:
            outcome = run_phase_settlement(
                room=started.room,
                game=started.game,
                snapshot=started.snapshot,
                turn_inputs=[],
                recovery_repository=self.recovery_repository,
                socketio=socketio,
                phase_duration_seconds=180,
                settled_at=datetime(2026, 3, 29, 12, 21, tzinfo=UTC),
            )

        self.assertTrue(outcome.is_game_finished)
        self.assertEqual(
            [call.args[0] for call in emit_mock.call_args_list],
            [SocketEventName.GAME_PHASE_SETTLED.value, SocketEventName.GAME_FINISHED.value],
        )

        finished_payload = emit_mock.call_args_list[1].args[1]["payload"]
        self.assertEqual(set(finished_payload.keys()), {"game", "snapshot", "finalRanking", "finalLogs"})
        self.assertEqual(
            [entry["playerId"] for entry in finished_payload["finalRanking"]],
            ["player-1", "player-2", "player-3", "player-4", "player-5"],
        )
        self.assertGreaterEqual(len(finished_payload["finalLogs"]), 1)

        persisted_game = self.recovery_repository.games.get(started.game.game_id)
        self.assertTrue(persisted_game["isFinished"])
        self.assertEqual(self.recovery_repository.rooms.get(started.room.room_code)["status"].value, "finished")
        self.assertIsNone(self.recovery_repository.snapshots.get(old_snapshot_id))
        self.assertEqual(
            self.recovery_repository.turn_inputs.list_for_phase(
                started.game.game_id,
                started.snapshot.round_no,
                started.snapshot.phase,
            ),
            [],
        )
        active_state = self.recovery_repository.load_active_state()
        self.assertEqual(active_state["rooms"], [])
        self.assertEqual(active_state["games"], [])
        self.assertEqual(active_state["snapshots"], [])

    def test_settlement_phase_advances_to_next_round_decision_and_updates_budget_workspace(self) -> None:
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
                phase_deadline_at=datetime(2026, 3, 29, 13, 0, tzinfo=UTC),
            )
        self.assertIsNotNone(started)
        assert started is not None

        started.game.current_round = 2
        started.game.current_phase = GamePhase.SETTLEMENT
        started.snapshot.round_no = 2
        started.snapshot.phase = GamePhase.SETTLEMENT
        started.snapshot.phase_deadline_at = datetime(2026, 3, 29, 12, 20, tzinfo=UTC)
        player_state = next(player for player in started.snapshot.player_states if player.player_id == "player-1")
        player_state.national_income = 10
        player_state.cumulative_national_income = 20
        player_state.budget_pools = {"domesticMarket": 5, "factory": 5, "governmentFiscal": 5}
        player_state.base_admin_capacity = 3
        player_state.administration_capacity = 2
        player_state.active_policies = ["raise_commercial_tax"]
        player_state.income_allocation_ratio = {
            "domesticMarket": 5.0,
            "factory": 2.0,
            "governmentFiscal": 3.0,
        }

        with patch.object(socketio, "emit") as emit_mock:
            outcome = run_phase_settlement(
                room=started.room,
                game=started.game,
                snapshot=started.snapshot,
                turn_inputs=[],
                recovery_repository=self.recovery_repository,
                socketio=socketio,
                phase_duration_seconds=180,
                settled_at=datetime(2026, 3, 29, 12, 21, tzinfo=UTC),
            )

        self.assertFalse(outcome.is_game_finished)
        self.assertEqual(outcome.updated_snapshot.phase, GamePhase.DECISION)
        self.assertEqual(outcome.updated_snapshot.round_no, 3)
        updated_player = next(player for player in outcome.updated_snapshot.player_states if player.player_id == "player-1")
        self.assertEqual(updated_player.cumulative_national_income, 30)
        # The round's active policy still affected this settlement's split, but
        # it is cleared before the next decision phase is hydrated.
        self.assertEqual(updated_player.budget_pools, {"domesticMarket": 10, "factory": 7, "governmentFiscal": 8})
        self.assertEqual(updated_player.active_policies, [])
        self.assertEqual(updated_player.administration_capacity, 3)
        self.assertEqual(updated_player.income_allocation_ratio["factory"], 3.0)
        self.assertEqual(updated_player.income_allocation_ratio["governmentFiscal"], 2.0)

        phase_started_payload = emit_mock.call_args_list[1].args[1]["payload"]
        self.assertEqual(phase_started_payload["snapshot"]["phaseWorkspace"]["phase"], GamePhase.DECISION)
        self.assertEqual(phase_started_payload["snapshot"]["lastSettlementWorkspace"]["settledPhase"], GamePhase.SETTLEMENT)
        player_workspace = phase_started_payload["snapshot"]["phaseWorkspace"]["players"]["player-1"]
        self.assertEqual(player_workspace["governmentReforms"]["administrationCapacity"], 3)
        self.assertEqual(player_workspace["governmentReforms"]["activePolicies"], [])
        self.assertFalse(
            next(
                policy
                for policy in player_workspace["governmentReforms"]["availablePolicies"]
                if policy["policyId"] == "raise_commercial_tax"
            )["isActive"]
        )


if __name__ == "__main__":
    unittest.main()
