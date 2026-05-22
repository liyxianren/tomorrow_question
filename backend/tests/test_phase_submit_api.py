from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app
from app.config import Settings
from app.contracts.enums import ConnectionStatus, CountryCode, ErrorCode, GamePhase, PlayerSubmissionStatus
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.phase_deadline import (
    register_phase_deadline_change_listener,
    unregister_phase_deadline_change_listener,
)
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


FAR_FUTURE = datetime(2099, 3, 29, 12, 10, tzinfo=UTC)
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
    round_no: int = 1,
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
    production_orders: list[dict[str, object]] | None = None,
    expansion_orders: list[dict[str, object]] | None = None,
    upgrade_orders: list[dict[str, object]] | None = None,
    new_factory_orders: list[dict[str, object]] | None = None,
    domestic_action_ids: list[str] | None = None,
    point_purchases: list[dict[str, object]] | None = None,
    strategy_action_ids: list[str] | None = None,
    tech_research: list[dict[str, object]] | None = None,
    military_action_ids: list[str] | None = None,
    diplomacy_action_ids: list[str] | None = None,
    unlock_colonization: bool = False,
    colonization_actions: list[dict[str, object]] | None = None,
    ability_selection: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "factoryPlan": {
            "productionOrders": list(production_orders or []),
            "expansionOrders": list(expansion_orders or []),
            "upgradeOrders": list(upgrade_orders or []),
            "newFactoryOrders": list(new_factory_orders or []),
        },
        "domesticMarketPlan": {
            "domesticMarketActions": [
                {"actionId": action_id} for action_id in (domestic_action_ids or [])
            ]
        },
        "governmentPlan": {
            "pointPurchases": list(point_purchases or []),
            "strategySelections": [
                {"actionId": action_id} for action_id in (strategy_action_ids or [])
            ],
            "techResearch": list(tech_research or []),
        },
        "militaryPlan": {
            "unlockColonization": unlock_colonization,
            "militaryActions": [{"actionId": action_id} for action_id in (military_action_ids or [])],
            "diplomacyActions": [{"actionId": action_id} for action_id in (diplomacy_action_ids or [])],
            "colonizationActions": list(colonization_actions or []),
        },
        "abilitySelection": dict(ability_selection or {}),
    }


def build_market_payload(*, sale_orders: list[dict[str, object]] | None = None) -> dict[str, object]:
    return {
        "saleOrders": list(sale_orders or []),
    }


class PhaseSubmitApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "submit-api.sqlite3"
        self.frontend_dist = Path(self.temp_dir.name) / "frontend-dist"
        settings = Settings(
            app_env="test",
            secret_key="test-secret",
            host="127.0.0.1",
            port=5000,
            database_path=str(self.database_path),
            frontend_dist=str(self.frontend_dist),
            socketio_async_mode="threading",
            cors_allowed_origins=["http://localhost:5173"],
            debug=False,
        )
        self.app = create_app(settings)
        self.app.config["PHASE_DURATION_SECONDS"] = 5
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def seed_active_game(self, *, deadline_at: datetime = FAR_FUTURE) -> None:
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
            phase_deadline_at=deadline_at,
        )
        start_game(room, game.game_id)

        connection = connect_database(self.database_path)
        initialize_database(connection)
        RoomRepository(connection).save(room_to_payload(room))
        GameRepository(connection).save(game.to_payload())
        SnapshotRepository(connection).save(snapshot.to_payload())
        for session in sessions:
            SessionRepository(connection).save(session_to_payload(session))
        connection.close()

    def persist_turn_inputs(self, *, phase: GamePhase, player_ids: list[str], round_no: int = 1, payload: dict[str, object] | None = None) -> None:
        connection = connect_database(self.database_path)
        initialize_database(connection)
        repository = PlayerTurnInputRepository(connection)
        for player_id in player_ids:
            repository.save(
                build_turn_input_payload(
                    player_id=player_id,
                    phase=phase,
                    round_no=round_no,
                    payload=payload,
                )
            )
        connection.close()

    def update_player_phase1_economy(self, player_id: str, updates: dict[str, object]) -> None:
        connection = connect_database(self.database_path)
        initialize_database(connection)
        repository = SnapshotRepository(connection)
        snapshot = repository.get("snapshot-1")
        self.assertIsNotNone(snapshot)
        player_payload = snapshot["nationalStateByPlayer"][player_id]
        phase1_economy = dict(player_payload.get("phase1Economy") or {})
        phase1_economy.update(updates)
        player_payload["phase1Economy"] = phase1_economy
        repository.save(snapshot)
        connection.close()

    def test_submit_decision_returns_confirmation_and_persists_turn_input(self) -> None:
        self.seed_active_game()

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": build_decision_payload(
                    production_orders=[{"goodsId": "phase1_goods", "quantity": 2}],
                    point_purchases=[{"pointType": "tech", "quantity": 1}],
                    tech_research=[{"techId": "textile_tech"}],
                    military_action_ids=["recruit_army"],
                    ability_selection={"abilityId": "workshop_of_the_world"},
                )
            },
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["phase"], GamePhase.DECISION.value)
        self.assertFalse(payload["data"]["allSubmitted"])
        self.assertEqual(payload["data"]["submission"]["playerId"], "player-1")
        self.assertEqual(payload["data"]["submissionStatus"]["player-1"], PlayerSubmissionStatus.SUBMITTED.value)

        connection = connect_database(self.database_path)
        initialize_database(connection)
        persisted = PlayerTurnInputRepository(connection).get("game-1", 1, GamePhase.DECISION, "player-1")
        connection.close()

        self.assertIsNotNone(persisted)
        self.assertEqual(
            persisted["payload"]["factoryPlan"]["productionOrders"],
            [{"goodsId": "phase1_goods", "quantity": 2}],
        )
        self.assertEqual(
            persisted["payload"]["domesticMarketPlan"]["domesticMarketActions"],
            [],
        )
        self.assertEqual(
            persisted["payload"]["governmentPlan"]["techResearch"],
            [{"techId": "textile_tech"}],
        )
        self.assertEqual(
            persisted["payload"]["militaryPlan"]["militaryActions"],
            [{"actionId": "recruit_army"}],
        )
        self.assertEqual(
            persisted["payload"]["abilitySelection"],
            {"abilityId": "workshop_of_the_world"},
        )

    def test_submit_decision_rejects_removed_domestic_market_action(self) -> None:
        self.seed_active_game()

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": build_decision_payload(
                    domestic_action_ids=["market_fair"],
                )
            },
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.INVALID_SUBMISSION.value)
        self.assertIn("Unknown domesticMarket action", payload["error"]["message"])

    def test_submit_decision_accepts_fleet_build_from_government_policy_allowance(self) -> None:
        self.seed_active_game()

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": build_decision_payload(
                    military_action_ids=["build_fleet"],
                )
            },
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])

    def test_last_decision_submit_advances_to_market(self) -> None:
        self.seed_active_game()
        self.persist_turn_inputs(
            phase=GamePhase.DECISION,
            player_ids=["player-2", "player-3", "player-4", "player-5"],
            payload=build_decision_payload(),
        )

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": build_decision_payload()},
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["data"]["allSubmitted"])

        connection = connect_database(self.database_path)
        initialize_database(connection)
        game_payload = GameRepository(connection).get("game-1")
        snapshot_payload = SnapshotRepository(connection).get(game_payload["activeSnapshotId"])
        connection.close()

        self.assertEqual(game_payload["currentPhase"], GamePhase.MARKET)
        self.assertEqual(snapshot_payload["phase"], GamePhase.MARKET)

    def test_last_market_submit_advances_to_system_settlement(self) -> None:
        self.seed_active_game()
        self.persist_turn_inputs(
            phase=GamePhase.DECISION,
            player_ids=["player-2", "player-3", "player-4", "player-5"],
            payload=build_decision_payload(),
        )

        self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": build_decision_payload()},
            headers={"X-Session-Id": "session-1"},
        )

        self.persist_turn_inputs(
            phase=GamePhase.MARKET,
            player_ids=["player-2", "player-3", "player-4", "player-5"],
            payload=build_market_payload(),
        )

        deadline_notifications: list[None] = []

        def record_deadline_notification() -> None:
            deadline_notifications.append(None)

        register_phase_deadline_change_listener(record_deadline_notification)
        try:
            response = self.client.post(
                "/api/v1/games/game-1/phases/market/submit",
                json={"payload": build_market_payload()},
                headers={"X-Session-Id": "session-1"},
            )
        finally:
            unregister_phase_deadline_change_listener(record_deadline_notification)

        self.assertEqual(response.status_code, 200)
        connection = connect_database(self.database_path)
        initialize_database(connection)
        game_payload = GameRepository(connection).get("game-1")
        snapshot_payload = SnapshotRepository(connection).get(game_payload["activeSnapshotId"])
        connection.close()

        self.assertEqual(game_payload["currentPhase"], GamePhase.SETTLEMENT)
        self.assertEqual(snapshot_payload["phase"], GamePhase.SETTLEMENT)
        self.assertEqual(len(deadline_notifications), 1)

    def test_submit_rejects_system_settlement(self) -> None:
        self.seed_active_game()
        self.persist_turn_inputs(
            phase=GamePhase.DECISION,
            player_ids=["player-2", "player-3", "player-4", "player-5"],
            payload=build_decision_payload(),
        )
        self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": build_decision_payload()},
            headers={"X-Session-Id": "session-1"},
        )
        self.persist_turn_inputs(
            phase=GamePhase.MARKET,
            player_ids=["player-2", "player-3", "player-4", "player-5"],
            payload=build_market_payload(),
        )
        self.client.post(
            "/api/v1/games/game-1/phases/market/submit",
            json={"payload": build_market_payload()},
            headers={"X-Session-Id": "session-1"},
        )

        response = self.client.post(
            "/api/v1/games/game-1/phases/settlement/submit",
            json={"payload": {}},
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 409)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.PHASE_MISMATCH.value)

    @unittest.skip("Phase 5 cleanup: unified goods removed per-goods tech gating")
    def test_submit_decision_rejects_goods_without_required_technology(self) -> None:
        self.seed_active_game()

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": build_decision_payload(production_orders=[{"goodsId": "steel", "quantity": 1}])},
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.INVALID_SUBMISSION.value)
        self.assertIn("required technology", payload["error"]["message"])

    @unittest.skip("Phase 3 migration: old tech tree behavior, to be rewritten in Task 3-4")
    def test_submit_decision_rejects_goods_without_country_access(self) -> None:
        self.seed_active_game()

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": build_decision_payload(production_orders=[{"goodsId": "grain", "quantity": 1}])},
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.INVALID_SUBMISSION.value)
        self.assertIn("country access", payload["error"]["message"])

    @unittest.skip("Phase 3 migration: old tech tree behavior, to be rewritten in Task 3-4")
    def test_submit_decision_rejects_upgrade_before_route_technology_is_unlocked(self) -> None:
        self.seed_active_game()

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": build_decision_payload(
                    upgrade_orders=[{"routeId": "mechanized", "quantity": 1}],
                )
            },
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.INVALID_SUBMISSION.value)
        self.assertIn("route technology", payload["error"]["message"])

    @unittest.skip("Phase 3 migration: old tech tree behavior, to be rewritten in Task 3-4")
    def test_submit_decision_rejects_locked_government_action_without_required_tech(self) -> None:
        self.seed_active_game()

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": build_decision_payload(
                    strategy_action_ids=["removed_government_strategy"],
                )
            },
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.INVALID_SUBMISSION.value)
        self.assertIn("required technology", payload["error"]["message"])

    @unittest.skip("2.0: shared route capacity validation for productionOrders removed; handled by phase1Production rules")
    def test_submit_decision_rejects_shared_route_capacity_overflow(self) -> None:
        self.seed_active_game()

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": build_decision_payload(
                    production_orders=[
                        {"goodsId": "phase1_goods", "quantity": 3},
                        {"goodsId": "phase1_goods", "quantity": 3},
                    ]
                )
            },
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.INVALID_SUBMISSION.value)
        self.assertIn("shared route capacity", payload["error"]["message"])

    def test_submit_decision_rejects_new_factory_for_locked_route(self) -> None:
        self.seed_active_game()

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": build_decision_payload(
                    new_factory_orders=[{"routeId": "mechanized", "quantity": 1}]
                )
            },
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.INVALID_SUBMISSION.value)
        self.assertIn("requires route technology", payload["error"]["message"])

    def test_submit_decision_ignores_legacy_expansion_counter_for_direct_expansion(self) -> None:
        self.seed_active_game()
        self.update_player_phase1_economy(
            "player-1",
            {"factoryExpansionUsedByMode": {"handicraft": 4}},
        )

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": build_decision_payload(
                    expansion_orders=[{"routeId": "handicraft", "quantity": 1}]
                )
            },
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])

    def test_submit_decision_ignores_legacy_expansion_counter_for_upgrade(self) -> None:
        self.seed_active_game()
        self.update_player_phase1_economy(
            "player-1",
            {"factoryExpansionUsedByMode": {"handicraft": 4}},
        )

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": build_decision_payload(
                    upgrade_orders=[{"routeId": "handicraft", "quantity": 1}]
                )
            },
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])


if __name__ == "__main__":
    unittest.main()
