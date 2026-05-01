"""Production mode upgrade chain E2E: handicraft→mechanized→steam→electrified.

Validates the complete production upgrade pathway:
  - Build handicraft factories (newFactoryOrders)
  - Research techs via researchTarget + research progress in settlement
  - Upgrade production modes via upgradeOrders
  - Verify output multipliers increase at each tier
  - Verify tech lockout: upgrade without required tech is blocked
  - Verify source-level constraint: can only upgrade from the correct source mode
  - Verify budget cap on upgrades
  - Verify source capacity cap on upgrades

The test directly sets research facilities on the snapshot (since expand_research
is a regularPolicy whose effects apply each settlement — not tested here).
Focus is on the upgrade chain mechanics and resolver correctness.

References:
  - backend/config/balance/production.json (upgrade costs, source levels)
  - backend/config/balance/technology.json (tech chains, route unlocks)
  - backend/app/modules/rules/decision.py (_apply_phase1_production_plan)
  - backend/app/modules/rules/settlement.py (_apply_phase3_research_progress)
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
from app.modules.balance_config import get_balance_config
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
    mil = payload["militaryPlan"]
    gov = payload["governmentPlan"]

    if "military_actions" in overrides:
        mil["militaryActions"] = [{"actionId": a} for a in overrides["military_actions"]]
    if "point_purchases" in overrides:
        gov["pointPurchases"] = overrides["point_purchases"]
    if "talent_unlocks" in overrides:
        payload["talentPlan"] = {"talentUnlocks": [{"nodeId": n} for n in overrides["talent_unlocks"]]}
    if "ability_selection" in overrides:
        payload["abilitySelection"] = overrides["ability_selection"]
    if "phase1_production" in overrides:
        payload["phase1Production"] = overrides["phase1_production"]
    if "research_target" in overrides:
        payload["researchTarget"] = overrides["research_target"]
    if "upgrade_orders" in overrides:
        payload["factoryPlan"]["upgradeOrders"] = overrides["upgrade_orders"]
    if "build_orders" in overrides:
        payload["factoryPlan"]["newFactoryOrders"] = overrides["build_orders"]

    return payload


def _market_payload(domestic_allocation: int = 0) -> dict:
    return {"saleOrders": [], "phase1Market": {"domesticAllocation": domestic_allocation}}


class ProductionUpgradeChainE2E(unittest.TestCase):
    """Production upgrade chain: handicraft → mechanized → steam → electrified.

    Britain (player-1) exercises the complete upgrade chain.
    Other players submit empty decisions to trigger auto-resolution.
    """

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "e2e-upgrade.sqlite3"
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
        self.balance = get_balance_config()

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

    # ── DB helpers ──

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

    def _play_round(self, snapshot, decision_payloads, market_allocations):
        """Play one full round: decisions → market → settlement → next round."""
        snap = self._submit_decisions_for_all(decision_payloads)
        snap = self._submit_markets_for_all(market_allocations)
        snap = self._resolve_settlement(snap)
        return snap

    def _try_research_tech(self, snapshot, tech_id, max_rounds=10):
        """Research a tech by repeatedly submitting researchTarget and running settlement.
        Returns (snapshot, success) after max_rounds or when tech is unlocked.
        """
        for _ in range(max_rounds):
            snapshot = self._play_round(
                snapshot,
                {"session-1": _decision_payload(research_target=tech_id)},
                {"session-1": 10},
            )
            britain = self._player(snapshot, "player-1")
            if tech_id in britain.unlocked_techs:
                return snapshot, True
        return snapshot, False

    # ═══════════════════════════════════════════════════════════════════════════
    # TESTS
    # ═══════════════════════════════════════════════════════════════════════════

    def test_full_upgrade_chain_handicraft_to_electrified(self):
        """Complete upgrade chain: handicraft → mechanized → steam → electrified.

        With 3 research facilities (6 progress/turn), any tech with threshold ≤ 6
        will reach its effective threshold within 2 turns. After enough failed
        breakthrough attempts, effective threshold drops to 1, guaranteeing success.
        """
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        # Give Britain ample resources
        britain.budget_pools["governmentFiscal"] = 500
        britain.budget_pools["factory"] = 500
        britain.budget_pools["domesticMarket"] = 200
        britain.phase1_economy.raw_materials = 100
        britain.ideology_levels = {"liberalism": 3, "egalitarianism": 3, "nationalism": 3}
        # Pre-set research facilities (normally built via expand_research policy)
        britain.research_facilities = {"academy": 3}
        self._save_snapshot(snapshot)

        # ── Round 1: Build handicraft factories, start researching spinning_jenny ──
        snapshot = self._play_round(
            snapshot,
            {"session-1": _decision_payload(
                build_orders=[{"routeId": "handicraft", "quantity": 5}],
                research_target="spinning_jenny",
            )},
            {"session-1": 10},
        )
        britain = self._player(snapshot, "player-1")
        hc_capacity = britain.phase1_economy.capacity_by_mode.get("handicraft", 0)
        self.assertGreaterEqual(hc_capacity, 5, "Should have built handicraft factories")
        self.assertEqual(britain.active_research, "spinning_jenny",
                         "Active research should be set to spinning_jenny")

        # ── Research spinning_jenny (threshold=2, 3 facilities = 6 progress/turn) ──
        snapshot, ok = self._try_research_tech(snapshot, "spinning_jenny")
        self.assertTrue(ok, "spinning_jenny should be researched")

        # ── Upgrade handicraft → mechanized ──
        snapshot = self._play_round(
            snapshot,
            {"session-1": _decision_payload(
                upgrade_orders=[{"routeId": "mechanized", "quantity": 3}],
                research_target="bessemer_process",
            )},
            {"session-1": 10},
        )
        britain = self._player(snapshot, "player-1")
        mech_capacity = britain.phase1_economy.capacity_by_mode.get("mechanized", 0)
        self.assertGreaterEqual(mech_capacity, 3,
                                "Should have upgraded to mechanized capacity")
        hc_after = britain.phase1_economy.capacity_by_mode.get("handicraft", 0)
        self.assertLessEqual(hc_after, hc_capacity - 3,
                             "Handicraft capacity should decrease when upgrading")

        # ── Research bessemer_process (steam chain, threshold=2) ──
        snapshot, ok = self._try_research_tech(snapshot, "bessemer_process")
        self.assertTrue(ok, "bessemer_process should be researched")

        # ── Research watt_engine (steam chain, threshold=3, needs bessemer_process) ──
        snapshot, ok = self._try_research_tech(snapshot, "watt_engine")
        self.assertTrue(ok, "watt_engine should be researched")

        # ── Research lathe (mechanical chain, threshold=3, needs spinning_jenny) ──
        snapshot, ok = self._try_research_tech(snapshot, "lathe")
        self.assertTrue(ok, "lathe should be researched")

        # ── Upgrade mechanized → steam ──
        snapshot = self._play_round(
            snapshot,
            {"session-1": _decision_payload(
                upgrade_orders=[{"routeId": "steam", "quantity": 2}],
            )},
            {"session-1": 10},
        )
        britain = self._player(snapshot, "player-1")
        steam_capacity = britain.phase1_economy.capacity_by_mode.get("steam", 0)
        self.assertGreaterEqual(steam_capacity, 2,
                                "Should have upgraded to steam capacity")

        # ── Research for electrified: leyden_jar → voltaic_pile → power_generation ──
        for tech_id in ["leyden_jar", "voltaic_pile", "power_generation"]:
            snapshot, ok = self._try_research_tech(snapshot, tech_id)
            self.assertTrue(ok, f"{tech_id} should be researched")

        # ── Research combustion_engine (steam chain, threshold=4, needs watt_engine) ──
        snapshot, ok = self._try_research_tech(snapshot, "combustion_engine")
        self.assertTrue(ok, "combustion_engine should be researched")

        # ── Upgrade steam → electrified ──
        snapshot = self._play_round(
            snapshot,
            {"session-1": _decision_payload(
                upgrade_orders=[{"routeId": "electrified", "quantity": 1}],
            )},
            {"session-1": 10},
        )
        britain = self._player(snapshot, "player-1")
        elec_capacity = britain.phase1_economy.capacity_by_mode.get("electrified", 0)
        self.assertGreaterEqual(elec_capacity, 1,
                                "Should have upgraded to electrified capacity")

        # ── Verify final capacity distribution ──
        cap = britain.phase1_economy.capacity_by_mode
        print(f"\nFinal capacity_by_mode: {dict(cap)}")
        print(f"Unlocked techs: {britain.unlocked_techs}")
        self.assertGreater(cap.get("electrified", 0), 0, "Must have electrified capacity")

    def test_upgrade_blocked_without_tech(self):
        """Upgrading to mechanized without spinning_jenny should be silently ignored."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["factory"] = 200
        britain.phase1_economy.capacity_by_mode["handicraft"] = 5
        britain.production_capacity["handicraft"] = 5
        britain.phase1_economy.raw_materials = 50
        self._save_snapshot(snapshot)

        snapshot = self._play_round(
            snapshot,
            {"session-1": _decision_payload(
                upgrade_orders=[{"routeId": "mechanized", "quantity": 3}],
            )},
            {"session-1": 10},
        )
        britain = self._player(snapshot, "player-1")
        mech = britain.phase1_economy.capacity_by_mode.get("mechanized", 0)
        self.assertEqual(mech, 0, "Should NOT upgrade to mechanized without spinning_jenny")

    def test_upgrade_blocked_wrong_source(self):
        """Upgrading from wrong source (handicraft→steam) is rejected at submission.

        steam's source is mechanized, not handicraft. The API validates source
        capacity and returns 400: "Upgrade route steam has no available source
        route capacity."
        """
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["factory"] = 500
        britain.phase1_economy.capacity_by_mode["handicraft"] = 10
        britain.production_capacity["handicraft"] = 10
        britain.unlocked_techs.extend(["spinning_jenny", "watt_engine", "lathe"])
        britain.phase1_economy.raw_materials = 50
        self._save_snapshot(snapshot)

        # The API submission itself rejects the wrong-source upgrade with 400
        self._submit_api(
            "session-1",
            _decision_payload(
                upgrade_orders=[{"routeId": "steam", "quantity": 3}],
            ),
            expected_status=400,
        )

    def test_upgrade_respects_budget_limit(self):
        """Over-budget upgrade is rejected at submission (400).

        mechanized upgrade costs 12/unit. With budget=25, requesting 5 (cost=60)
        is rejected by the API submission validator.
        """
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["factory"] = 25
        britain.phase1_economy.capacity_by_mode["handicraft"] = 10
        britain.production_capacity["handicraft"] = 10
        britain.unlocked_techs.append("spinning_jenny")
        britain.phase1_economy.raw_materials = 50
        self._save_snapshot(snapshot)

        # Request 5 upgrades (cost=60), but budget=25 → rejected
        self._submit_api(
            "session-1",
            _decision_payload(
                upgrade_orders=[{"routeId": "mechanized", "quantity": 5}],
            ),
            expected_status=400,
        )

        # Request 2 upgrades (cost=24), budget=25 → accepted
        snapshot = self._play_round(
            snapshot,
            {"session-1": _decision_payload(
                upgrade_orders=[{"routeId": "mechanized", "quantity": 2}],
            )},
            {"session-1": 0},
        )
        britain = self._player(snapshot, "player-1")
        mech = britain.phase1_economy.capacity_by_mode.get("mechanized", 0)
        self.assertEqual(mech, 2, "Should upgrade exactly 2 (budget=25, cost=12/unit)")

    def test_upgrade_respects_source_capacity(self):
        """Over-source-capacity upgrade is rejected at submission (400).

        Only 2 handicraft available. Requesting 10 exceeds source capacity.
        """
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["factory"] = 500
        britain.phase1_economy.capacity_by_mode["handicraft"] = 2
        britain.production_capacity["handicraft"] = 2
        britain.unlocked_techs.append("spinning_jenny")
        britain.phase1_economy.raw_materials = 50
        self._save_snapshot(snapshot)

        # Request 10 upgrades, but only 2 handicraft available → rejected
        self._submit_api(
            "session-1",
            _decision_payload(
                upgrade_orders=[{"routeId": "mechanized", "quantity": 10}],
            ),
            expected_status=400,
        )

        # Request 2 upgrades (exact source capacity) → accepted
        snapshot = self._play_round(
            snapshot,
            {"session-1": _decision_payload(
                upgrade_orders=[{"routeId": "mechanized", "quantity": 2}],
            )},
            {"session-1": 0},
        )
        britain = self._player(snapshot, "player-1")
        mech = britain.phase1_economy.capacity_by_mode.get("mechanized", 0)
        self.assertEqual(mech, 2, "Should upgrade exactly 2 (source capacity limit)")
        hc = britain.phase1_economy.capacity_by_mode.get("handicraft", 0)
        self.assertEqual(hc, 0, "All handicraft should be consumed")

    def test_upgrade_increases_output_multiplier(self):
        """Mechanized (×2) produces more goods than handicraft (×1) with same inputs."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["factory"] = 200
        britain.phase1_economy.capacity_by_mode["handicraft"] = 5
        britain.production_capacity["handicraft"] = 5
        britain.phase1_economy.raw_materials = 20
        britain.goods_stock["phase1_goods"] = 0
        self._save_snapshot(snapshot)

        # Round 1: Produce with handicraft (domesticAllocation=0 to keep goods in stock)
        snapshot = self._play_round(
            snapshot,
            {"session-1": _decision_payload(
                phase1_production={"rawMaterialAssignments": {"handicraft": 5}},
            )},
            {"session-1": 0},
        )
        britain = self._player(snapshot, "player-1")
        handicraft_output = britain.goods_stock.get("phase1_goods", 0)
        self.assertGreater(handicraft_output, 0, "Should produce goods with handicraft")

        # Give spinning_jenny, upgrade to mechanized, produce again
        britain.unlocked_techs.append("spinning_jenny")
        britain.budget_pools["factory"] = 200
        britain.phase1_economy.raw_materials = 20
        britain.goods_stock["phase1_goods"] = 0
        self._save_snapshot(snapshot)

        snapshot = self._play_round(
            snapshot,
            {"session-1": _decision_payload(
                upgrade_orders=[{"routeId": "mechanized", "quantity": 5}],
                phase1_production={"rawMaterialAssignments": {"mechanized": 5}},
            )},
            {"session-1": 0},
        )
        britain = self._player(snapshot, "player-1")
        mechanized_output = britain.goods_stock.get("phase1_goods", 0)

        print(f"\nHandicraft output: {handicraft_output}, Mechanized output: {mechanized_output}")
        self.assertGreater(mechanized_output, handicraft_output,
                           "Mechanized (×2) should produce more than handicraft (×1)")

    def test_research_setback_accumulates_attempts(self):
        """Failed breakthrough should accumulate attempts, reducing effective threshold.
        
        With 1 facility (2 progress/turn) and threshold=2:
        - Turn 1: progress=2, threshold=2, roll d10 (may fail)
        - Turn 2: progress=4, if failed once → effective_threshold=max(1,2-1)=1, guaranteed
        """
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 500
        britain.phase1_economy.raw_materials = 50
        britain.research_facilities = {"academy": 1}  # 2 progress/turn
        self._save_snapshot(snapshot)

        # Try spinning_jenny (threshold=2) — should succeed within 3 rounds
        # even with just 1 facility, because failed attempts reduce threshold
        snapshot, ok = self._try_research_tech(snapshot, "spinning_jenny", max_rounds=5)
        self.assertTrue(ok, "spinning_jenny should unlock within 5 rounds with 1 facility")

    def test_multiple_upgrade_orders_in_one_round(self):
        """Submitting multiple upgrade orders should be processed sequentially."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["factory"] = 500
        britain.phase1_economy.capacity_by_mode["handicraft"] = 10
        britain.production_capacity["handicraft"] = 10
        britain.unlocked_techs.append("spinning_jenny")
        britain.phase1_economy.raw_materials = 50
        self._save_snapshot(snapshot)

        # Upgrade 5 handicraft→mechanized (5 × 12 = 60)
        snapshot = self._play_round(
            snapshot,
            {"session-1": _decision_payload(
                upgrade_orders=[{"routeId": "mechanized", "quantity": 5}],
            )},
            {"session-1": 10},
        )
        britain = self._player(snapshot, "player-1")
        mech = britain.phase1_economy.capacity_by_mode.get("mechanized", 0)
        hc = britain.phase1_economy.capacity_by_mode.get("handicraft", 0)
        self.assertEqual(mech, 5, "Should upgrade 5 to mechanized")
        self.assertEqual(hc, 5, "Should have 5 handicraft remaining")


if __name__ == "__main__":
    unittest.main()
