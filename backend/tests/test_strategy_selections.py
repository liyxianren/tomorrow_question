"""E2E test for government strategy selections (strategySelections).

Verifies that government actions submitted via strategySelections in
governmentPlan are properly processed by the resolver (not silently dropped).

Bug fix: Previously, strategySelections were normalized by the submission
validator but never applied by _apply_government_plan in the resolver.

References:
  - backend/config/balance/decision_actions.json (governmentActions)
  - backend/app/modules/rules/decision.py (_apply_government_plan)
  - backend/app/modules/settlement/phase_submission.py (budget validation)
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
from app.contracts.enums import ConnectionStatus, CountryCode, GamePhase
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot
from app.modules.persistence import (
    GameRepository, RoomRepository,
    SessionRepository, SnapshotRepository, connect_database, initialize_database,
)
from app.modules.room.selectors import room_to_payload
from app.modules.room.service import (
    add_member, assign_country, create_room, mark_member_ready, start_game,
)
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


def _empty_decision_payload() -> dict:
    return {
        "factoryPlan": {
            "productionOrders": [],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {"pointPurchases": [], "strategySelections": [], "techResearch": []},
        "militaryPlan": {
            "unlockColonization": False,
            "militaryActions": [],
            "diplomacyActions": [],
            "colonizationActions": [],
            "navalDeployment": {},
            "conquestActions": [],
            "lootingActions": [],
        },
    }


def _decision_payload(**overrides) -> dict:
    payload = _empty_decision_payload()
    gov = payload["governmentPlan"]
    if "strategy_selections" in overrides:
        gov["strategySelections"] = [{"actionId": a} for a in overrides["strategy_selections"]]
    if "point_purchases" in overrides:
        gov["pointPurchases"] = overrides["point_purchases"]
    return payload


def _market_payload(domestic_allocation: int = 0) -> dict:
    return {"saleOrders": [], "phase1Market": {"domesticAllocation": domestic_allocation}}


class StrategySelectionsE2E(unittest.TestCase):
    """Government strategy selections (strategySelections) integration test."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "e2e-strategy.sqlite3"
        self.frontend_dist = Path(self.temp_dir.name) / "frontend-dist"
        settings = Settings(
            app_env="test", secret_key="test-secret", host="127.0.0.1", port=5000,
            database_path=str(self.db_path), frontend_dist=str(self.frontend_dist),
            socketio_async_mode="threading",
            cors_allowed_origins=["http://localhost:5173"], debug=False,
        )
        self.app = create_app(settings)
        self.app.config["PHASE_DURATION_SECONDS"] = 5
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def seed_active_game(self):
        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
        sessions = []
        for idx, (pid, sid, nick, country) in enumerate(PLAYER_FIXTURES, 1):
            if idx > 1:
                add_member(room, player_id=pid, nickname=nick, connection_status=ConnectionStatus.ONLINE)
            assign_country(room, pid, country)
            mark_member_ready(room, pid, True)
            sessions.append(create_session(
                nickname=nick, room_code="ROOM01", selected_country=country,
                now=datetime(2026, 3, 29, 12, 0, tzinfo=UTC), player_id=pid, session_id=sid,
            ))
        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game, snapshot_id="snapshot-1",
            player_assignments={pid: c for pid, _, _, c in PLAYER_FIXTURES},
            phase_deadline_at=FAR_FUTURE,
        )
        start_game(room, game.game_id)
        conn = connect_database(self.db_path)
        initialize_database(conn)
        RoomRepository(conn).save(room_to_payload(room))
        GameRepository(conn).save(game.to_payload())
        SnapshotRepository(conn).save(snapshot.to_payload())
        for s in sessions:
            SessionRepository(conn).save(session_to_payload(s))
        conn.close()

    def _load_snapshot(self) -> GameSnapshot:
        conn = connect_database(self.db_path)
        initialize_database(conn)
        gp = GameRepository(conn).get("game-1")
        sp = SnapshotRepository(conn).get(gp["activeSnapshotId"])
        conn.close()
        return GameSnapshot.from_payload(sp)

    def _save_snapshot(self, snapshot: GameSnapshot):
        conn = connect_database(self.db_path)
        initialize_database(conn)
        SnapshotRepository(conn).save(snapshot.to_payload())
        conn.close()

    def _submit_api(self, session_id: str, payload: dict, expected_status=200):
        resp = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": payload},
            headers={"X-Session-Id": session_id},
        )
        self.assertEqual(resp.status_code, expected_status,
                         f"Expected {expected_status}, got {resp.status_code}: {resp.get_json()}")
        return resp.get_json()

    def _submit_market_api(self, session_id: str, payload: dict, expected_status=200):
        resp = self.client.post(
            "/api/v1/games/game-1/phases/market/submit",
            json={"payload": payload},
            headers={"X-Session-Id": session_id},
        )
        self.assertEqual(resp.status_code, expected_status,
                         f"Expected {expected_status}, got {resp.status_code}: {resp.get_json()}")
        return resp.get_json()

    def _player(self, snapshot, pid):
        return next(p for p in snapshot.player_states if p.player_id == pid)

    def _submit_decisions_for_all(self, decisions: dict[str, dict]):
        submitted_sids = set()
        for sid, payload in decisions.items():
            self._submit_api(sid, payload)
            submitted_sids.add(sid)
        for _, sid, _, _ in PLAYER_FIXTURES:
            if sid not in submitted_sids:
                self._submit_api(sid, _empty_decision_payload())
        return self._load_snapshot()

    def _submit_markets_for_all(self, allocations: dict[str, int]):
        submitted_sids = set()
        for sid, alloc in allocations.items():
            self._submit_market_api(sid, _market_payload(alloc))
            submitted_sids.add(sid)
        for _, sid, _, _ in PLAYER_FIXTURES:
            if sid not in submitted_sids:
                self._submit_market_api(sid, _market_payload(0))
        return self._load_snapshot()

    def _resolve_settlement(self, snapshot: GameSnapshot) -> GameSnapshot:
        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = resolution.updated_snapshot
        updated.round_no = snapshot.round_no + 1
        updated.phase = GamePhase.DECISION
        updated.looted_regions_this_turn = set()
        from uuid import uuid4
        updated.snapshot_id = uuid4().hex
        conn = connect_database(self.db_path)
        initialize_database(conn)
        SnapshotRepository(conn).save(updated.to_payload())
        gp = GameRepository(conn).get("game-1")
        gp["activeSnapshotId"] = updated.snapshot_id
        gp["currentPhase"] = updated.phase.value
        GameRepository(conn).save(gp)
        conn.close()
        return updated

    def test_trade_agreement_applies_effects(self):
        """trade_agreement should increase overseas market capacity and price bonus."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 100
        self._save_snapshot(snapshot)

        snap = self._submit_decisions_for_all(
            {"session-1": _decision_payload(strategy_selections=["trade_agreement"])}
        )
        britain = self._player(snap, "player-1")
        overseas_capacity = britain.temporary_effects.get("overseasMarketCapacityBonus", 0)
        overseas_price = britain.temporary_effects.get("overseasPriceBonus", 0)
        self.assertGreaterEqual(overseas_capacity, 1,
                                "trade_agreement should increase overseas market capacity")
        self.assertGreaterEqual(overseas_price, 2,
                                "trade_agreement should increase overseas price bonus by 2")

    def test_domestic_stimulus_applies_ratio_delta(self):
        """domestic_stimulus should shift ratio toward domestic market."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 100
        original_ratio = dict(britain.income_allocation_ratio)
        self._save_snapshot(snapshot)

        snap = self._submit_decisions_for_all(
            {"session-1": _decision_payload(strategy_selections=["domestic_stimulus"])}
        )
        britain = self._player(snap, "player-1")
        # domestic_stimulus: domesticMarket +0.15, governmentFiscal -0.15
        self.assertGreater(
            britain.income_allocation_ratio.get("domesticMarket", 0),
            original_ratio.get("domesticMarket", 0),
            "domestic_stimulus should increase domesticMarket ratio"
        )

    def test_strategy_selection_deducts_budget(self):
        """Government actions should deduct from governmentFiscal budget."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 100
        self._save_snapshot(snapshot)

        snap = self._submit_decisions_for_all(
            {"session-1": _decision_payload(strategy_selections=["trade_agreement"])}
        )
        britain = self._player(snap, "player-1")
        # trade_agreement costs 6
        self.assertLess(britain.budget_pools["governmentFiscal"], 100,
                        "trade_agreement should deduct budget (cost=6)")

    def test_expand_research_builds_research_facility(self):
        """expand_research should spend fiscal budget and add one academy."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 100
        original_facilities = int(britain.research_facilities.get("academy", 0))
        self._save_snapshot(snapshot)

        snap = self._submit_decisions_for_all(
            {"session-1": _decision_payload(strategy_selections=["expand_research"])}
        )
        britain = self._player(snap, "player-1")
        self.assertEqual(
            britain.research_facilities.get("academy"),
            original_facilities + 1,
            "expand_research should add one academy research facility",
        )
        self.assertEqual(britain.budget_pools["governmentFiscal"], 94)

    def test_strategy_over_budget_rejected(self):
        """Strategy selection exceeding government budget should be rejected."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 3  # Not enough for trade_agreement (cost=6)
        self._save_snapshot(snapshot)

        self._submit_api(
            "session-1",
            _decision_payload(strategy_selections=["trade_agreement"]),
            expected_status=400,
        )


if __name__ == "__main__":
    unittest.main()
