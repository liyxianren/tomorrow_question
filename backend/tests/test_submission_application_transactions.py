from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import Mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import ConnectionStatus, CountryCode, GamePhase, PlayerSubmissionStatus
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.persistence import (
    GameRepository,
    PlayerTurnInputRepository,
    RoomRepository,
    SessionRepository,
    SnapshotRepository,
    connect_database,
    initialize_database,
)
from app.modules.room.selectors import room_to_payload
from app.modules.room.service import add_member, assign_country, create_room, mark_member_ready, start_game
from app.modules.session.selectors import session_to_payload
from app.modules.session.service import create_session
from app.modules.settlement.submission_application import SubmissionApplicationService


PLAYER_FIXTURES = (
    ("player-1", "session-1", "Ada", CountryCode.BRITAIN),
    ("player-2", "session-2", "Linus", CountryCode.FRANCE),
    ("player-3", "session-3", "Grace", CountryCode.PRUSSIA),
    ("player-4", "session-4", "Margaret", CountryCode.AUSTRIA),
    ("player-5", "session-5", "Donald", CountryCode.RUSSIA),
)


def build_turn_input_payload(
    *,
    player_id: str,
    phase: GamePhase,
    round_no: int,
    payload: dict[str, object] | None = None,
    submission_status: PlayerSubmissionStatus = PlayerSubmissionStatus.SUBMITTED,
) -> dict[str, object]:
    return {
        "gameId": "game-1",
        "roundNo": round_no,
        "phase": phase,
        "playerId": player_id,
        "submissionStatus": submission_status,
        "payload": dict(payload or {}),
        "submittedAt": "2026-03-29T12:05:00+00:00",
        "isTimeoutGenerated": submission_status == PlayerSubmissionStatus.TIMEOUT_AUTO_SUBMITTED,
    }


def build_decision_payload(
    *,
    goods_id: str = "phase1_goods",
    quantity: int = 1,
    point_purchases: list[dict[str, object]] | None = None,
    talent_unlocks: list[str] | None = None,
) -> dict[str, object]:
    return {
        "factoryPlan": {
            "productionOrders": [{"goodsId": goods_id, "quantity": quantity}],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {
            "pointPurchases": list(point_purchases or []),
            "strategySelections": [],
            "adminPurchases": 0,
        },
        "militaryPlan": {
            "militaryActions": [],
            "diplomacyActions": [],
            "navalDeployment": {},
            "conquestActions": [],
            "lootingActions": [],
        },
        "talentPlan": {
            "talentUnlocks": [{"nodeId": node_id} for node_id in (talent_unlocks or [])],
        },
    }


def build_market_payload(*, goods_id: str = "phase1_goods", quantity: int = 1) -> dict[str, object]:
    return {
        "saleOrders": [{"goodsId": goods_id, "market": "domestic", "quantity": quantity}],
    }


class SubmissionApplicationTransactionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "submission-application.sqlite3"
        self.connection = connect_database(self.database_path)
        initialize_database(self.connection)
        self.service = SubmissionApplicationService(self.connection)
        self.socketio = Mock()
        self.rooms = RoomRepository(self.connection)
        self.games = GameRepository(self.connection)
        self.snapshots = SnapshotRepository(self.connection)
        self.sessions = SessionRepository(self.connection)
        self.turn_inputs = PlayerTurnInputRepository(self.connection)
        self.seed_active_game()

    def tearDown(self) -> None:
        self.connection.close()
        self.temp_dir.cleanup()

    def seed_active_game(self) -> None:
        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
        sessions = []

        for index, (player_id, session_id, nickname, country) in enumerate(PLAYER_FIXTURES, start=1):
            if index > 1:
                add_member(room, player_id=player_id, nickname=nickname, connection_status=ConnectionStatus.ONLINE)
            assign_country(room, player_id, country)
            mark_member_ready(room, player_id, True)
            sessions.append(
                create_session(
                    nickname=nickname,
                    room_code="ROOM01",
                    selected_country=country,
                    now=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
                    player_id=player_id,
                    session_id=session_id,
                )
            )

        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={player_id: country for player_id, _, _, country in PLAYER_FIXTURES},
            phase_deadline_at=datetime(2099, 3, 29, 12, 10, tzinfo=UTC),
        )
        start_game(room, game.game_id)

        self.rooms.save(room_to_payload(room))
        self.games.save(game.to_payload())
        self.snapshots.save(snapshot.to_payload())
        for session in sessions:
            self.sessions.save(session_to_payload(session))

    def persist_turn_inputs(self, *, phase: GamePhase, player_ids: list[str], round_no: int, payload: dict[str, object] | None = None) -> None:
        for player_id in player_ids:
            self.turn_inputs.save(
                build_turn_input_payload(
                    player_id=player_id,
                    phase=phase,
                    round_no=round_no,
                    payload=payload,
                )
            )

    def test_market_settlement_writes_national_income_and_system_settlement_advances_round(self) -> None:
        self.persist_turn_inputs(
            phase=GamePhase.DECISION,
            round_no=1,
            player_ids=["player-2", "player-3", "player-4", "player-5"],
            payload=build_decision_payload(),
        )

        self.service.submit(
            game_id="game-1",
            requested_phase=GamePhase.DECISION,
            session_id="session-1",
            payload=build_decision_payload(),
            submitted_at=datetime(2026, 3, 29, 12, 6, tzinfo=UTC),
            phase_duration_seconds=300,
            socketio=self.socketio,
        )

        self.persist_turn_inputs(
            phase=GamePhase.MARKET,
            round_no=1,
            player_ids=["player-2", "player-3", "player-4", "player-5"],
            payload=build_market_payload(),
        )
        self.service.submit(
            game_id="game-1",
            requested_phase=GamePhase.MARKET,
            session_id="session-1",
            payload=build_market_payload(),
            submitted_at=datetime(2026, 3, 29, 12, 7, tzinfo=UTC),
            phase_duration_seconds=300,
            socketio=self.socketio,
        )

        game_payload = self.games.get("game-1")
        settlement_snapshot_payload = self.snapshots.get(game_payload["activeSnapshotId"])
        self.assertEqual(game_payload["currentPhase"], GamePhase.SETTLEMENT)
        self.assertEqual(settlement_snapshot_payload["phase"], GamePhase.SETTLEMENT)
        self.assertTrue(
            any(
                player_state["nationalIncome"] >= 0
                for player_state in settlement_snapshot_payload["nationalStateByPlayer"].values()
            )
        )

        result = self.service.advance_timeout_phase(
            game_id="game-1",
            expected_snapshot_id=settlement_snapshot_payload["snapshotId"],
            triggered_at=datetime(2026, 3, 29, 12, 8, tzinfo=UTC),
            phase_duration_seconds=300,
            socketio=self.socketio,
        )

        self.assertIsNotNone(result)
        game_payload = self.games.get("game-1")
        next_snapshot_payload = self.snapshots.get(game_payload["activeSnapshotId"])
        self.assertEqual(game_payload["currentPhase"], GamePhase.DECISION)
        self.assertEqual(game_payload["currentRound"], 2)
        self.assertEqual(next_snapshot_payload["phase"], GamePhase.DECISION)
        self.assertTrue(
            any(
                player_state["cumulativeNationalIncome"] >= 0
                and sum(player_state["budgetPools"].values()) >= 0
                for player_state in next_snapshot_payload["nationalStateByPlayer"].values()
            )
        )

    def test_round_two_decision_workspace_retains_round_one_talent_unlock(self) -> None:
        game_payload = self.games.get("game-1")
        initial_snapshot_payload = self.snapshots.get(game_payload["activeSnapshotId"])
        initial_snapshot_payload["nationalStateByPlayer"]["player-1"]["budgetPools"]["governmentFiscal"] = 100
        initial_snapshot_payload["nationalStateByPlayer"]["player-1"]["techPoints"] = 5
        self.snapshots.save(initial_snapshot_payload)

        self.persist_turn_inputs(
            phase=GamePhase.DECISION,
            round_no=1,
            player_ids=["player-2", "player-3", "player-4", "player-5"],
            payload=build_decision_payload(),
        )

        self.service.submit(
            game_id="game-1",
            requested_phase=GamePhase.DECISION,
            session_id="session-1",
            payload=build_decision_payload(
                point_purchases=[{"pointType": "tech", "quantity": 1}],
                talent_unlocks=["ind_basic_metallurgy"],
            ),
            submitted_at=datetime(2026, 3, 29, 12, 6, tzinfo=UTC),
            phase_duration_seconds=300,
            socketio=self.socketio,
        )

        self.persist_turn_inputs(
            phase=GamePhase.MARKET,
            round_no=1,
            player_ids=["player-2", "player-3", "player-4", "player-5"],
            payload=build_market_payload(),
        )
        self.service.submit(
            game_id="game-1",
            requested_phase=GamePhase.MARKET,
            session_id="session-1",
            payload=build_market_payload(),
            submitted_at=datetime(2026, 3, 29, 12, 7, tzinfo=UTC),
            phase_duration_seconds=300,
            socketio=self.socketio,
        )

        game_payload = self.games.get("game-1")
        settlement_snapshot_payload = self.snapshots.get(game_payload["activeSnapshotId"])

        self.service.advance_timeout_phase(
            game_id="game-1",
            expected_snapshot_id=settlement_snapshot_payload["snapshotId"],
            triggered_at=datetime(2026, 3, 29, 12, 8, tzinfo=UTC),
            phase_duration_seconds=300,
            socketio=self.socketio,
        )

        game_payload = self.games.get("game-1")
        next_snapshot_payload = self.snapshots.get(game_payload["activeSnapshotId"])
        player_state = next_snapshot_payload["nationalStateByPlayer"]["player-1"]
        research_workspace = next_snapshot_payload["phaseWorkspace"]["players"]["player-1"]["researchWorkspace"]
        unlocked_node = next(
            node
            for branch in research_workspace["talentBranches"]
            for node in branch["nodes"]
            if node["nodeId"] == "ind_basic_metallurgy"
        )

        self.assertEqual(game_payload["currentPhase"], GamePhase.DECISION)
        self.assertEqual(game_payload["currentRound"], 2)
        self.assertEqual(player_state["unlockedTalents"], ["ind_basic_metallurgy"])
        self.assertEqual(research_workspace["unlockedTalentCount"], 1)
        self.assertTrue(unlocked_node["isUnlocked"])
        self.assertFalse(unlocked_node["canUnlock"])


if __name__ == "__main__":
    unittest.main()
