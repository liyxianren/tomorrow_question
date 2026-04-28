"""M3-real E2E integration test: HTTP API → service → store → resolver.

Closes the gap left by unit tests by exercising the full chain end-to-end:
phase-1 production / market / settlement payloads enter through the public
HTTP submission endpoint, flow through ``PhaseSubmissionService`` (normalize +
validate), persist into the ``turn_inputs`` table, are loaded back as
``PlayerTurnInput`` records, and finally drive the rule resolvers
(``resolve_decision_phase`` / ``resolve_market_phase`` /
``resolve_settlement_phase``). The asserts target ``PlayerState.phase1_economy``
to confirm the unified phase-1 pipeline survived every hop.

References:
- backend/app/modules/settlement/phase_submission.py (normalize)
- backend/app/modules/rules/decision.py
- backend/app/modules/rules/market.py
- backend/app/modules/rules/settlement.py
- docs/2.0迁移前逻辑推演与计划.md §6
"""
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
from app.contracts.enums import (
    ConnectionStatus,
    CountryCode,
    GamePhase,
)
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot
from app.modules.game_state.turn_input import PlayerTurnInput
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
from app.modules.room.service import (
    add_member,
    assign_country,
    create_room,
    mark_member_ready,
    start_game,
)
from app.modules.rules.decision import resolve_decision_phase
from app.modules.rules.market import resolve_market_phase
from app.modules.rules.settlement import resolve_settlement_phase
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


def _empty_decision_payload() -> dict[str, object]:
    return {
        "factoryPlan": {
            "productionOrders": [],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {
            "pointPurchases": [],
            "strategySelections": [],
            "techResearch": [],
        },
        "militaryPlan": {
            "unlockColonization": False,
            "militaryActions": [],
            "diplomacyActions": [],
            "colonizationActions": [],
        },
    }


def _decision_payload_with_phase1_production(phase1_production: object) -> dict[str, object]:
    payload = _empty_decision_payload()
    payload["phase1Production"] = phase1_production
    return payload


def _market_payload_with_phase1(phase1_market: object) -> dict[str, object]:
    return {"saleOrders": [], "phase1Market": phase1_market}


class _Phase1ApiTestCase(unittest.TestCase):
    """Shared scaffolding: temp DB, Flask client, snapshot/turn-input helpers."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "phase1-e2e.sqlite3"
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

    def seed_active_game(self) -> None:
        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
        sessions = []
        for index, (player_id, session_id, nickname, country) in enumerate(PLAYER_FIXTURES, start=1):
            if index > 1:
                add_member(
                    room,
                    player_id=player_id,
                    nickname=nickname,
                    connection_status=ConnectionStatus.ONLINE,
                )
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
            player_assignments={
                player_id: country for player_id, _, _, country in PLAYER_FIXTURES
            },
            phase_deadline_at=FAR_FUTURE,
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

    # ---- DB helpers ----

    def _load_snapshot(self) -> GameSnapshot:
        connection = connect_database(self.database_path)
        initialize_database(connection)
        game_payload = GameRepository(connection).get("game-1")
        snapshot_payload = SnapshotRepository(connection).get(game_payload["activeSnapshotId"])
        connection.close()
        return GameSnapshot.from_payload(snapshot_payload)

    def _load_turn_inputs(
        self, *, phase: GamePhase, round_no: int = 1
    ) -> list[PlayerTurnInput]:
        connection = connect_database(self.database_path)
        initialize_database(connection)
        payloads = PlayerTurnInputRepository(connection).list_for_phase(
            "game-1", round_no, phase
        )
        connection.close()
        return [PlayerTurnInput.from_payload(payload) for payload in payloads]

    def _load_persisted_payload(
        self, *, phase: GamePhase, player_id: str, round_no: int = 1
    ) -> dict[str, object]:
        connection = connect_database(self.database_path)
        initialize_database(connection)
        record = PlayerTurnInputRepository(connection).get(
            "game-1", round_no, phase, player_id
        )
        connection.close()
        assert record is not None
        return dict(record["payload"])

    def _save_snapshot(self, snapshot: GameSnapshot) -> None:
        connection = connect_database(self.database_path)
        initialize_database(connection)
        SnapshotRepository(connection).save(snapshot.to_payload())
        connection.close()

    def _set_db_phase(self, phase: GamePhase) -> None:
        connection = connect_database(self.database_path)
        initialize_database(connection)
        games = GameRepository(connection)
        snapshots = SnapshotRepository(connection)
        game_payload = games.get("game-1")
        game_payload["currentPhase"] = phase
        games.save(game_payload)
        snapshot_payload = snapshots.get(game_payload["activeSnapshotId"])
        snapshot_payload["phase"] = phase
        snapshots.save(snapshot_payload)
        connection.close()

    def _seed_player_phase1_market_state(
        self,
        *,
        player_id: str,
        capacity_by_mode: dict[str, int],
        goods_inventory: int,
        production_capacity: dict[str, int],
        budget_pools: dict[str, int],
    ) -> None:
        """Write a clean phase-1 starting position into the DB snapshot."""
        connection = connect_database(self.database_path)
        initialize_database(connection)
        snapshots = SnapshotRepository(connection)
        snapshot_payload = snapshots.get("snapshot-1")
        player_payload = snapshot_payload["nationalStateByPlayer"][player_id]
        player_payload["phase1Economy"]["capacityByMode"] = dict(capacity_by_mode)
        player_payload["phase1Economy"]["goodsInventory"] = int(goods_inventory)
        player_payload["productionCapacity"] = dict(production_capacity)
        player_payload["budgetPools"] = dict(budget_pools)
        snapshots.save(snapshot_payload)
        connection.close()

    @staticmethod
    def _player(snapshot: GameSnapshot, player_id: str):
        return next(player for player in snapshot.player_states if player.player_id == player_id)


class Phase1DecisionE2ETests(_Phase1ApiTestCase):
    """phase1Production survives the API → store → resolver chain."""

    def test_full_decision_pipeline_phase1(self) -> None:
        self.seed_active_game()

        # Britain starts with handicraft capacity = 4; assign 4 raw materials.
        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": _decision_payload_with_phase1_production(
                    {"rawMaterialAssignments": {"handicraft": 4}}
                )
            },
            headers={"X-Session-Id": "session-1"},
        )
        self.assertEqual(response.status_code, 200, response.get_json())

        # Stored payload retains the phase-1 field after normalize + persist.
        persisted = self._load_persisted_payload(
            phase=GamePhase.DECISION, player_id="player-1"
        )
        self.assertEqual(
            persisted["phase1Production"]["rawMaterialAssignments"],
            {"handicraft": 4},
        )

        # Drive the resolver with the stored turn input.
        snapshot = self._load_snapshot()
        turn_inputs = self._load_turn_inputs(phase=GamePhase.DECISION)
        resolution = resolve_decision_phase(snapshot=snapshot, turn_inputs=turn_inputs)

        britain = self._player(resolution.updated_snapshot, "player-1")
        # 4 handicraft × ratio 1 = 4 unified goods.
        self.assertEqual(britain.phase1_economy.goods_inventory, 4)
        # Initial 30 raw materials, 4 consumed.
        self.assertEqual(britain.phase1_economy.raw_materials, 26)
        self.assertEqual(britain.goods_stock.get("phase1_goods"), 4)

    def test_decision_fallback_when_no_phase1_field(self) -> None:
        self.seed_active_game()

        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": _empty_decision_payload()},
            headers={"X-Session-Id": "session-1"},
        )
        self.assertEqual(response.status_code, 200, response.get_json())

        persisted = self._load_persisted_payload(
            phase=GamePhase.DECISION, player_id="player-1"
        )
        self.assertNotIn("phase1Production", persisted)

        snapshot = self._load_snapshot()
        turn_inputs = self._load_turn_inputs(phase=GamePhase.DECISION)
        resolution = resolve_decision_phase(snapshot=snapshot, turn_inputs=turn_inputs)

        britain = self._player(resolution.updated_snapshot, "player-1")
        # Legacy mirror runs in fallback path: phase1.capacity_by_mode reflects
        # legacy production_capacity, and no unified phase-1 goods bucket is
        # created (only the phase-1 path adds the "phase1_goods" stock key).
        self.assertEqual(
            britain.phase1_economy.capacity_by_mode,
            {mode: int(britain.production_capacity.get(mode, 0))
             for mode in britain.phase1_economy.capacity_by_mode},
        )
        self.assertNotIn("phase1_goods", britain.goods_stock)

    def test_decision_api_silently_drops_invalid_phase1_production(self) -> None:
        self.seed_active_game()

        # Non-dict phase1Production is silently dropped by the normalizer; the
        # legacy fallback path then runs.
        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": _decision_payload_with_phase1_production("not-a-dict")
            },
            headers={"X-Session-Id": "session-1"},
        )
        self.assertEqual(response.status_code, 200, response.get_json())

        persisted = self._load_persisted_payload(
            phase=GamePhase.DECISION, player_id="player-1"
        )
        self.assertNotIn("phase1Production", persisted)

        snapshot = self._load_snapshot()
        turn_inputs = self._load_turn_inputs(phase=GamePhase.DECISION)
        resolution = resolve_decision_phase(snapshot=snapshot, turn_inputs=turn_inputs)

        britain = self._player(resolution.updated_snapshot, "player-1")
        # Legacy fallback path runs (no phase-1 production), so the unified
        # "phase1_goods" stock bucket is never created.
        self.assertNotIn("phase1_goods", britain.goods_stock)


class Phase1MarketE2ETests(_Phase1ApiTestCase):
    """phase1Market survives the API → store → resolver chain."""

    def test_full_market_pipeline_phase1(self) -> None:
        self.seed_active_game()
        # Calibrate Britain so demand = supply = 8 and equilibrium price = 10.
        self._seed_player_phase1_market_state(
            player_id="player-1",
            capacity_by_mode={
                "idle": 0,
                "handicraft": 4,
                "mechanized": 0,
                "steam": 0,
                "electrified": 0,
            },  # demand = 4 × 2 = 8
            goods_inventory=8,  # supply = 8
            production_capacity={
                "idle": 0,
                "handicraft": 8,
                "mechanized": 0,
                "steam": 0,
                "electrified": 0,
            },  # domestic capacity = sum = 8
            budget_pools={
                "domesticMarket": 80,  # equilibrium = 80 / 8 = 10
                "factory": 0,
                "governmentFiscal": 0,
            },
        )
        self._set_db_phase(GamePhase.MARKET)

        response = self.client.post(
            "/api/v1/games/game-1/phases/market/submit",
            json={
                "payload": _market_payload_with_phase1({"domesticAllocation": 10})
            },
            headers={"X-Session-Id": "session-1"},
        )
        self.assertEqual(response.status_code, 200, response.get_json())

        persisted = self._load_persisted_payload(
            phase=GamePhase.MARKET, player_id="player-1"
        )
        self.assertEqual(persisted["phase1Market"]["domesticAllocation"], 10)

        snapshot = self._load_snapshot()
        turn_inputs = self._load_turn_inputs(phase=GamePhase.MARKET)
        resolution = resolve_market_phase(snapshot=snapshot, turn_inputs=turn_inputs)

        britain = self._player(resolution.updated_snapshot, "player-1")
        metrics = britain.phase1_economy.market_metrics
        self.assertEqual(metrics["demand"], 8.0)
        self.assertEqual(metrics["supply"], 8.0)
        self.assertEqual(metrics["equilibriumPrice"], 10.0)
        self.assertEqual(metrics["finalPrice"], 10.0)
        self.assertEqual(metrics["soldQuantity"], 8.0)
        self.assertEqual(metrics["unsoldQuantity"], 0.0)
        self.assertEqual(metrics["revenue"], 80.0)
        # Legacy aggregates also written by the phase-1 path.
        self.assertEqual(britain.domestic_sales_revenue, 80)
        self.assertEqual(britain.overseas_sales_revenue, 0)
        self.assertEqual(britain.national_income, 80)

    def test_market_fallback_when_no_phase1_field(self) -> None:
        self.seed_active_game()
        # Seed Britain with legacy stock so the legacy saleOrders pipeline has
        # something to work with.
        connection = connect_database(self.database_path)
        initialize_database(connection)
        snapshots = SnapshotRepository(connection)
        snapshot_payload = snapshots.get("snapshot-1")
        britain_payload = snapshot_payload["nationalStateByPlayer"]["player-1"]
        britain_payload["goodsStock"]["coal"] = 3
        britain_payload["budgetPools"]["domesticMarket"] = 15
        britain_payload["incomeSummary"]["domesticMarketCapacity"] = 3
        snapshots.save(snapshot_payload)
        connection.close()
        self._set_db_phase(GamePhase.MARKET)

        response = self.client.post(
            "/api/v1/games/game-1/phases/market/submit",
            json={
                "payload": {
                    "saleOrders": [
                        {"goodsId": "coal", "market": "domestic", "quantity": 3}
                    ]
                }
            },
            headers={"X-Session-Id": "session-1"},
        )
        self.assertEqual(response.status_code, 200, response.get_json())

        persisted = self._load_persisted_payload(
            phase=GamePhase.MARKET, player_id="player-1"
        )
        self.assertNotIn("phase1Market", persisted)
        self.assertEqual(
            persisted["saleOrders"],
            [{"goodsId": "coal", "market": "domestic", "quantity": 3}],
        )

        snapshot = self._load_snapshot()
        turn_inputs = self._load_turn_inputs(phase=GamePhase.MARKET)
        resolution = resolve_market_phase(snapshot=snapshot, turn_inputs=turn_inputs)

        britain = self._player(resolution.updated_snapshot, "player-1")
        # Legacy path resolved the saleOrders and produced revenue.
        self.assertGreater(britain.domestic_sales_revenue, 0)
        self.assertEqual(britain.overseas_sales_revenue, 0)
        self.assertEqual(
            britain.national_income,
            britain.domestic_sales_revenue + britain.overseas_sales_revenue,
        )
        # Mirror also writes phase1 metrics from the legacy outcome.
        self.assertEqual(
            britain.phase1_economy.market_metrics["revenue"],
            float(britain.national_income),
        )


class Phase1SettlementE2ETests(_Phase1ApiTestCase):
    """Decision + market + settlement chain with phase-1 fields applies 5:3:2 split."""

    def test_settlement_pipeline_phase1(self) -> None:
        self.seed_active_game()
        # Pre-position Prussia with a clean phase-1 calibration so the chained
        # math is easy to assert end-to-end.
        self._seed_player_phase1_market_state(
            player_id="player-3",
            capacity_by_mode={
                "idle": 0,
                "handicraft": 4,
                "mechanized": 0,
                "steam": 0,
                "electrified": 0,
            },  # demand = 8
            goods_inventory=0,
            production_capacity={
                "idle": 0,
                "handicraft": 4,
                "mechanized": 0,
                "steam": 0,
                "electrified": 0,
            },  # domestic capacity = 4
            budget_pools={
                "domesticMarket": 80,  # equilibrium = 80 / 8 = 10
                "factory": 0,
                "governmentFiscal": 0,
            },
        )

        # ---- Decision phase: produce 4 unified goods. ----
        response = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={
                "payload": _decision_payload_with_phase1_production(
                    {"rawMaterialAssignments": {"handicraft": 4}}
                )
            },
            headers={"X-Session-Id": "session-3"},
        )
        self.assertEqual(response.status_code, 200, response.get_json())

        snapshot = self._load_snapshot()
        decision_inputs = self._load_turn_inputs(phase=GamePhase.DECISION)
        decision_resolution = resolve_decision_phase(
            snapshot=snapshot, turn_inputs=decision_inputs
        )
        snapshot = decision_resolution.updated_snapshot
        prussia = self._player(snapshot, "player-3")
        self.assertEqual(prussia.phase1_economy.goods_inventory, 4)
        # Prussia initial 35 raw materials, 4 consumed by handicraft assignment.
        self.assertEqual(prussia.phase1_economy.raw_materials, 31)

        # Persist the resolved snapshot and advance to MARKET so the API
        # accepts the next submission.
        self._save_snapshot(snapshot)
        self._set_db_phase(GamePhase.MARKET)

        # ---- Market phase: sell all 4 goods. ----
        response = self.client.post(
            "/api/v1/games/game-1/phases/market/submit",
            json={
                "payload": _market_payload_with_phase1({"domesticAllocation": 4})
            },
            headers={"X-Session-Id": "session-3"},
        )
        self.assertEqual(response.status_code, 200, response.get_json())

        snapshot = self._load_snapshot()
        market_inputs = self._load_turn_inputs(phase=GamePhase.MARKET)
        market_resolution = resolve_market_phase(
            snapshot=snapshot, turn_inputs=market_inputs
        )
        snapshot = market_resolution.updated_snapshot
        prussia = self._player(snapshot, "player-3")
        # demand = 8, supply = 4, equilibrium = 10, shortage = (8-4)/8 = 0.5,
        # final_price = 10 * 1.5 = 15. sold = min(4, 4, 8, capacity 4) = 4.
        # revenue = 4 * 15 = 60.
        self.assertEqual(prussia.phase1_economy.market_metrics["finalPrice"], 15.0)
        self.assertEqual(prussia.phase1_economy.market_metrics["soldQuantity"], 4.0)
        self.assertEqual(prussia.national_income, 60)

        # ---- Settlement phase: 5:3:2 split applies. ----
        # Zero out Prussia's incidental state so the settlement assertion is
        # not perturbed by ideology milestones / colony income / pre-existing
        # budget balances. _is_phase1_economy_active still returns True
        # because raw_materials and market_metrics.revenue remain non-zero.
        prussia.budget_pools = {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0}
        prussia.reforms = []
        prussia.ideology_levels = {key: 0 for key in prussia.ideology_levels}
        snapshot.phase = GamePhase.SETTLEMENT

        settlement_resolution = resolve_settlement_phase(
            snapshot=snapshot, turn_inputs=[]
        )
        prussia = self._player(settlement_resolution.updated_snapshot, "player-3")
        # 60 → 50% / 30% / 20% = 30 / 18 / 12 into the legacy budget pools.
        self.assertEqual(prussia.budget_pools["domesticMarket"], 30)
        self.assertEqual(prussia.budget_pools["factory"], 18)
        self.assertEqual(prussia.budget_pools["governmentFiscal"], 12)
        # Sum of deltas equals national income.
        self.assertEqual(
            prussia.budget_pools["domesticMarket"]
            + prussia.budget_pools["factory"]
            + prussia.budget_pools["governmentFiscal"],
            60,
        )


if __name__ == "__main__":
    unittest.main()
