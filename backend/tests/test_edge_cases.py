"""Edge-case E2E tests for resource depletion, talent tree max, multi-colonization, revolt reuse.

Covers scenarios from docs/plans/autopatch-progress.md "下一步 #3":
  - Colony resource exhaustion: loot until resource_limit hits 0
  - Talent tree full branch: unlock all 5 nodes in one branch
  - Simultaneous multi-region colonization across rounds (max 1 per round)
  - Colony revolt → re-colonization by same player
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app
from app.config import Settings
from app.contracts.enums import ConnectionStatus, CountryCode, GamePhase, RegionAccessLevel
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.persistence import (
    GameRepository, PlayerTurnInputRepository, RoomRepository,
    SessionRepository, SnapshotRepository, connect_database, initialize_database,
)
from app.modules.room.selectors import room_to_payload
from app.modules.room.service import (
    add_member, assign_country, create_room, mark_member_ready, start_game,
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

    if "unlock_colonization" in overrides:
        mil["unlockColonization"] = overrides["unlock_colonization"]
    if "military_actions" in overrides:
        mil["militaryActions"] = [{"actionId": a} for a in overrides["military_actions"]]
    if "diplomacy_actions" in overrides:
        mil["diplomacyActions"] = [{"actionId": a} for a in overrides["diplomacy_actions"]]
    if "colonization_actions" in overrides:
        mil["colonizationActions"] = overrides["colonization_actions"]
    if "looting_actions" in overrides:
        mil["lootingActions"] = overrides["looting_actions"]
    if "point_purchases" in overrides:
        gov["pointPurchases"] = overrides["point_purchases"]
    if "talent_unlocks" in overrides:
        payload["talentPlan"] = {"talentUnlocks": [{"nodeId": n} for n in overrides["talent_unlocks"]]}
    if "ability_selection" in overrides:
        payload["abilitySelection"] = overrides["ability_selection"]
    if "phase1_production" in overrides:
        payload["phase1Production"] = overrides["phase1_production"]

    return payload


def _market_payload(domestic_allocation: int = 0) -> dict:
    return {"saleOrders": [], "phase1Market": {"domesticAllocation": domestic_allocation}}


class EdgeCaseTestBase(unittest.TestCase):
    """Shared setup for all edge-case tests."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "edge-case.sqlite3"
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

    def _region(self, snapshot, rid):
        return next(r for r in snapshot.region_states if r.region_id == rid)

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

    def _override_snapshot(self, snapshot: GameSnapshot, fn):
        fn(snapshot)
        self._save_snapshot(snapshot)
        return snapshot

    def _advance_round(self, snapshot, decisions: dict[str, dict], market_allocs: dict[str, int]):
        """Complete one full round: decision → market → settlement → next round."""
        snapshot = self._submit_decisions_for_all(decisions)
        snapshot = self._submit_markets_for_all(market_allocs)
        snapshot = self._resolve_settlement(snapshot)
        return snapshot


class TestColonyResourceDepletion(EdgeCaseTestBase):
    """Loot a colony's resource from initial value down to 0, then attempt one more loot."""

    def test_loot_until_cotton_exhausted(self):
        """Loot cotton every round until resource_limit[cotton] == 0.
        
        Americas has cotton: 4 by default. After 4 rounds of looting, it should be 0.
        Round 5 attempt to loot should be rejected (no raw material gained).
        """
        self.seed_active_game()
        snapshot = self._load_snapshot()

        # Prepare Britain: give resources for colonization
        def _prep(snap):
            brit = self._player(snap, "player-1")
            brit.budget_pools["governmentFiscal"] = 100
            brit.military_points = 20
            brit.phase1_economy.raw_materials = 25
        snapshot = self._override_snapshot(snapshot, _prep)

        # R1: Unlock colonization + diplomacy + colonize Americas + production
        snapshot = self._advance_round(snapshot, {
            "session-1": _decision_payload(
                unlock_colonization=True,
                diplomacy_actions=["establish_americas"],
                colonization_actions=[{"targetRegionId": "americas"}],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        }, {"session-1": 8})

        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.controller, "britain", "R1: Americas colonized")
        cotton_initial = americas.resource_limit.get("cotton", 0)
        self.assertEqual(cotton_initial, 4, "R1: Americas cotton = 4")

        # R2-R5: Loot cotton each round
        for round_num in range(2, 6):
            snapshot = self._submit_decisions_for_all({
                "session-1": _decision_payload(
                    looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
                    phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
                ),
            })
            americas = self._region(snapshot, "americas")
            expected_cotton = cotton_initial - (round_num - 1)
            self.assertEqual(americas.resource_limit.get("cotton", 0), expected_cotton,
                             f"R{round_num}: Cotton = {expected_cotton}")

            snapshot = self._submit_markets_for_all({"session-1": 8})
            snapshot = self._resolve_settlement(snapshot)

        # After R5 settlement, cotton should be 0
        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.resource_limit.get("cotton", 0), 0,
                         "After R5: Cotton exhausted to 0")

        # R6: Attempt to loot exhausted resource — should be silently rejected
        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.resource_limit.get("cotton", 0), 0,
                         "After R5: Cotton exhausted to 0")

        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
                phase1_production={"rawMaterialAssignments": {"handicraft": 0}},
            ),
        })

        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.resource_limit.get("cotton", 0), 0,
                         "R6: Cotton still 0 (not negative)")
        # Looting exhausted resource should be a no-op: region NOT marked as looted
        self.assertNotIn("americas", snapshot.looted_regions_this_turn,
                         "R6: Americas was NOT looted (cotton exhausted)")


class TestTalentTreeFullBranch(EdgeCaseTestBase):
    """Unlock all 5 nodes in the industry branch sequentially."""

    def test_unlock_full_industry_branch(self):
        """Industry branch has 5 nodes costing 1+2+3+4+5 = 15 tech points total.
        Verify cumulative handicraftCapacityDelta and factoryBudgetDelta effects.
        """
        self.seed_active_game()
        snapshot = self._load_snapshot()

        # Give Britain tons of tech points
        def _prep(snap):
            brit = self._player(snap, "player-1")
            brit.tech_points = 50
        snapshot = self._override_snapshot(snapshot, _prep)

        base_handicraft = self._player(snapshot, "player-1").phase1_economy.capacity_by_mode.get("handicraft", 0)

        industry_nodes = [
            "ind_basic_metallurgy",      # cost 1, handicraftCapacityDelta +1
            "ind_process_improvement",   # cost 2, factoryBudgetDelta +4
            "ind_standardization",       # cost 3, handicraftCapacityDelta +2
            "ind_steam_mastery",         # cost 4, factoryBudgetDelta +6, handicraftCapacityDelta +1
            "ind_industrial_revolution", # cost 5, handicraftCapacityDelta +4, factoryBudgetDelta +8
        ]

        for i, node_id in enumerate(industry_nodes):
            snapshot = self._submit_decisions_for_all({
                "session-1": _decision_payload(
                    talent_unlocks=[node_id],
                    phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
                ),
            })

            britain = self._player(snapshot, "player-1")
            self.assertIn(node_id, britain.unlocked_talents,
                          f"R{i+1}: {node_id} unlocked")

            snapshot = self._submit_markets_for_all({"session-1": 8})
            snapshot = self._resolve_settlement(snapshot)

        # Final verification: all 5 nodes unlocked
        britain = self._player(snapshot, "player-1")
        for node_id in industry_nodes:
            self.assertIn(node_id, britain.unlocked_talents, f"Final: {node_id} in unlocked_talents")

        # Cumulative handicraft capacity: base + 1 + 2 + 1 + 4 = base + 8
        expected_handicraft = base_handicraft + 8
        actual_handicraft = britain.phase1_economy.capacity_by_mode.get("handicraft", 0)
        self.assertEqual(actual_handicraft, expected_handicraft,
                         f"Final: handicraft = {expected_handicraft} (base {base_handicraft} + 8)")

    def test_out_of_order_talent_unlock_rejected(self):
        """Trying to unlock ind_standardization (node 3) before ind_process_improvement (node 2)
        should fail — sequence must be respected.
        """
        self.seed_active_game()
        snapshot = self._load_snapshot()

        def _prep(snap):
            brit = self._player(snap, "player-1")
            brit.tech_points = 50
        snapshot = self._override_snapshot(snapshot, _prep)

        # Try to unlock node 3 without unlocking node 2 first
        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                talent_unlocks=["ind_standardization"],  # Skip nodes 1 & 2
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        })

        britain = self._player(snapshot, "player-1")
        self.assertNotIn("ind_standardization", britain.unlocked_talents,
                         "ind_standardization rejected without prerequisites")


class TestMultiRegionColonization(EdgeCaseTestBase):
    """Colonize multiple regions across rounds (max 1 per round enforced)."""

    def test_colonize_americas_then_africa_across_rounds(self):
        """Britain colonizes Americas in R1, Africa in R2 (requires different ocean node)."""
        self.seed_active_game()
        snapshot = self._load_snapshot()

        # Prepare Britain with lots of resources
        def _prep(snap):
            brit = self._player(snap, "player-1")
            brit.budget_pools["governmentFiscal"] = 200
            brit.military_points = 50
            brit.phase1_economy.raw_materials = 50
        snapshot = self._override_snapshot(snapshot, _prep)

        # R1: Unlock colonization + diplomacy Americas + colonize Americas
        snapshot = self._advance_round(snapshot, {
            "session-1": _decision_payload(
                unlock_colonization=True,
                diplomacy_actions=["establish_americas"],
                colonization_actions=[{"targetRegionId": "americas"}],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        }, {"session-1": 8})

        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.controller, "britain", "R1: Americas colonized")
        self.assertEqual(americas.access_level, RegionAccessLevel.COLONY)

        # R2: Diplomacy Africa + colonize Africa
        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                diplomacy_actions=["establish_africa"],
                colonization_actions=[{"targetRegionId": "africa"}],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        })

        britain = self._player(snapshot, "player-1")
        self.assertIn("africa", britain.established_diplomacy, "R2: Africa diplomacy established")

        africa = self._region(snapshot, "africa")
        self.assertEqual(africa.controller, "britain", "R2: Africa colonized")
        self.assertEqual(africa.access_level, RegionAccessLevel.COLONY)

        # Americas still held
        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.controller, "britain", "R2: Americas still held")

    def test_two_colonizations_in_same_round_only_first_succeeds(self):
        """maxColonizationsPerRound=1 means only the first colonization in a single
        round's submission is applied.
        """
        self.seed_active_game()
        snapshot = self._load_snapshot()

        def _prep(snap):
            brit = self._player(snap, "player-1")
            brit.budget_pools["governmentFiscal"] = 200
            brit.military_points = 50
            brit.phase1_economy.raw_materials = 50
            brit.established_diplomacy = list(brit.established_diplomacy) + ["americas", "africa"]
            brit.colonization_unlocked = True
        snapshot = self._override_snapshot(snapshot, _prep)

        # Try to colonize both Americas AND Africa in a single decision submission
        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                colonization_actions=[
                    {"targetRegionId": "americas"},
                    {"targetRegionId": "africa"},
                ],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        })

        americas = self._region(snapshot, "americas")
        africa = self._region(snapshot, "africa")

        # Only the first should succeed
        self.assertEqual(americas.controller, "britain", "Americas colonized (first action)")
        self.assertIsNone(africa.controller, "Africa NOT colonized (max 1 per round)")


class TestColonyRevoltAndRecolonize(EdgeCaseTestBase):
    """After a colony revolts, verify it can be re-colonized."""

    def test_revolt_then_recolonize(self):
        """Force high independence to trigger revolt, then re-colonize the same region."""
        self.seed_active_game()
        snapshot = self._load_snapshot()

        # Set up Americas as British colony with high independence near threshold
        def _prep(snap):
            brit = self._player(snap, "player-1")
            brit.budget_pools["governmentFiscal"] = 200
            brit.military_points = 50
            brit.phase1_economy.raw_materials = 50
            brit.colonization_unlocked = True
            brit.established_diplomacy = list(brit.established_diplomacy) + ["americas"]

            americas = self._region(snap, "americas")
            americas.controller = "britain"
            americas.access_level = RegionAccessLevel.COLONY
            americas.independence = 8  # Near threshold of 10
            americas.resource_limit = {"cotton": 4, "grain": 4, "oil": 2, "steel": 3}
            americas.market_supply = {"cotton": 1, "grain": 1}  # Severe imbalance → +2
        snapshot = self._override_snapshot(snapshot, _prep)

        # R1: Loot americas → independence += 2 (looting) + 2 (supply/demand imbalance) = 12 ≥ 10 → revolt
        snapshot = self._advance_round(snapshot, {
            "session-1": _decision_payload(
                looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        }, {"session-1": 8})

        americas = self._region(snapshot, "americas")
        # Colony should have revolted (independence 8 + 2 loot + 2 imbalance = 12 ≥ 10)
        self.assertIsNone(americas.controller, "R1: Americas revolted — controller cleared")
        self.assertEqual(americas.independence, 0, "R1: Independence resets to 0 after revolt")
        self.assertEqual(americas.access_level, RegionAccessLevel.CONCESSION,
                         "R1: Access level reverted to concession")

        # R2: Re-colonize Americas (diplomacy is still established)
        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                colonization_actions=[{"targetRegionId": "americas"}],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        })

        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.controller, "britain", "R2: Americas re-colonized")
        self.assertEqual(americas.access_level, RegionAccessLevel.COLONY, "R2: Access level = COLONY")


class TestIndependenceWithGarrison(EdgeCaseTestBase):
    """Garrison in a colony should reduce independence accumulation."""

    def test_garrison_prevents_revolt(self):
        """A garrison of 3 should keep independence from reaching threshold even with looting."""
        self.seed_active_game()
        snapshot = self._load_snapshot()

        def _prep(snap):
            brit = self._player(snap, "player-1")
            brit.budget_pools["governmentFiscal"] = 200
            brit.military_points = 50
            brit.phase1_economy.raw_materials = 50

            americas = self._region(snap, "americas")
            americas.controller = "britain"
            americas.access_level = RegionAccessLevel.COLONY
            americas.independence = 5
            americas.garrison = {"britain": 3}
            americas.resource_limit = {"cotton": 10, "grain": 10, "oil": 5, "steel": 5}
            americas.market_supply = {"cotton": 10, "grain": 10, "oil": 5, "steel": 5}  # balanced
        snapshot = self._override_snapshot(snapshot, _prep)

        # R1: Loot (independence delta: +2 looting - 3 garrison = -1 → net 4)
        snapshot = self._advance_round(snapshot, {
            "session-1": _decision_payload(
                looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        }, {"session-1": 8})

        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.controller, "britain", "R1: Colony held (garrison protected)")
        # With garrison of 3, looting penalty (+2) is more than offset, keeping independence below threshold
        self.assertLess(americas.independence, 10,
                        "R1: Independence stayed below revolt threshold thanks to garrison")


class TestTalentCrossBranchIndependence(EdgeCaseTestBase):
    """Unlocking talents in one branch should not affect another branch."""

    def test_cross_branch_independent_unlocks(self):
        """Unlock industry and military branches independently."""
        self.seed_active_game()
        snapshot = self._load_snapshot()

        def _prep(snap):
            brit = self._player(snap, "player-1")
            brit.tech_points = 50
        snapshot = self._override_snapshot(snapshot, _prep)

        # R1: Unlock industry node 1
        snapshot = self._advance_round(snapshot, {
            "session-1": _decision_payload(
                talent_unlocks=["ind_basic_metallurgy"],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        }, {"session-1": 8})

        britain = self._player(snapshot, "player-1")
        self.assertIn("ind_basic_metallurgy", britain.unlocked_talents)
        self.assertNotIn("mil_military_theory", britain.unlocked_talents)

        # R2: Unlock military node 1 (should work without unlocking more industry)
        snapshot = self._advance_round(snapshot, {
            "session-1": _decision_payload(
                talent_unlocks=["mil_military_theory"],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        }, {"session-1": 8})

        britain = self._player(snapshot, "player-1")
        self.assertIn("ind_basic_metallurgy", britain.unlocked_talents, "Industry still unlocked")
        self.assertIn("mil_military_theory", britain.unlocked_talents, "Military independently unlocked")

    def test_duplicate_talent_unlock_ignored(self):
        """Unlocking the same talent twice should not duplicate effects."""
        self.seed_active_game()
        snapshot = self._load_snapshot()

        def _prep(snap):
            brit = self._player(snap, "player-1")
            brit.tech_points = 50
        snapshot = self._override_snapshot(snapshot, _prep)

        # R1: Unlock ind_basic_metallurgy
        snapshot = self._advance_round(snapshot, {
            "session-1": _decision_payload(
                talent_unlocks=["ind_basic_metallurgy"],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        }, {"session-1": 8})

        britain = self._player(snapshot, "player-1")
        handicraft_after_r1 = britain.phase1_economy.capacity_by_mode.get("handicraft", 0)

        # R2: Try to unlock ind_basic_metallurgy again
        snapshot = self._advance_round(snapshot, {
            "session-1": _decision_payload(
                talent_unlocks=["ind_basic_metallurgy"],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        }, {"session-1": 8})

        britain = self._player(snapshot, "player-1")
        handicraft_after_r2 = britain.phase1_economy.capacity_by_mode.get("handicraft", 0)
        self.assertEqual(handicraft_after_r1, handicraft_after_r2,
                         "Duplicate unlock did not increase capacity further")


if __name__ == "__main__":
    unittest.main()


# ── Austria & Russia Ability Tests ──────────────────────────────────────


class TestAustriaAbility(EdgeCaseTestBase):
    """Austria's ausgleich_1867: +3 domesticMarketCapacity, +2 overseasMarketCapacity."""

    def test_austria_ausgleich_1867_effect(self):
        """Using ausgleich_1867 should boost domestic and overseas market capacity."""
        self.seed_active_game()
        snapshot = self._load_snapshot()

        austria = self._player(snapshot, "player-4")
        self.assertEqual(austria.country, CountryCode.AUSTRIA)
        initial_domestic = austria.income_summary.get("domesticMarketCapacity", 0)
        initial_overseas = austria.income_summary.get("overseasMarketCapacity", 0)

        # Use Austria's ability
        snapshot = self._submit_decisions_for_all({
            "session-4": _decision_payload(
                ability_selection={"abilityId": "ausgleich_1867"},
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        })

        austria = self._player(snapshot, "player-4")
        self.assertIn("ausgleich_1867", austria.used_abilities, "Austria ability used")
        self.assertEqual(austria.income_summary.get("domesticMarketCapacity", 0),
                         initial_domestic + 3, "Domestic capacity +3")
        self.assertEqual(austria.income_summary.get("overseasMarketCapacity", 0),
                         initial_overseas + 2, "Overseas capacity +2")

    def test_austria_ability_wrong_country_rejected(self):
        """Britain cannot use Austria's ability."""
        self.seed_active_game()
        snapshot = self._load_snapshot()

        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                ability_selection={"abilityId": "ausgleich_1867"},
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        })

        britain = self._player(snapshot, "player-1")
        self.assertNotIn("ausgleich_1867", britain.used_abilities,
                         "Britain cannot use Austria's ability")


class TestRussiaAbility(EdgeCaseTestBase):
    """Russia's emancipation_reform: convert idle→handicraft, egalitarianism+2."""

    def test_russia_emancipation_reform_effect(self):
        """With idle capacity, emancipation converts it to handicraft and boosts egalitarianism."""
        self.seed_active_game()
        snapshot = self._load_snapshot()

        # Give Russia some idle capacity for the ability to convert
        def _prep(snap):
            russia = self._player(snap, "player-5")
            russia.production_capacity["idle"] = 3
            russia.phase1_economy.capacity_by_mode["idle"] = 3
            russia.ideology_levels["egalitarianism"] = 1
        snapshot = self._override_snapshot(snapshot, _prep)

        russia = self._player(snapshot, "player-5")
        initial_handicraft = russia.production_capacity.get("handicraft", 0)
        initial_idle = russia.production_capacity.get("idle", 0)
        initial_egal = russia.ideology_levels.get("egalitarianism", 0)
        self.assertEqual(initial_idle, 3, "Pre: Russia has 3 idle capacity")

        # Use Russia's ability
        snapshot = self._submit_decisions_for_all({
            "session-5": _decision_payload(
                ability_selection={"abilityId": "emancipation_reform"},
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        })

        russia = self._player(snapshot, "player-5")
        self.assertIn("emancipation_reform", russia.used_abilities, "Russia ability used")
        # idle → handicraft: idle=0, handicraft += 3
        self.assertEqual(russia.production_capacity.get("idle", 0), 0, "Idle capacity = 0")
        self.assertEqual(russia.production_capacity.get("handicraft", 0),
                         initial_handicraft + 3, "Handicraft += idle (3)")
        # egalitarianism +2
        self.assertEqual(russia.ideology_levels.get("egalitarianism", 0),
                         initial_egal + 2, "Egalitarianism +2")

    def test_russia_ability_no_idle_capacity_still_boosts_ideology(self):
        """With 0 idle, emancipation still boosts egalitarianism but doesn't change capacity."""
        self.seed_active_game()
        snapshot = self._load_snapshot()

        russia = self._player(snapshot, "player-5")
        initial_handicraft = russia.production_capacity.get("handicraft", 0)
        initial_egal = russia.ideology_levels.get("egalitarianism", 0)

        snapshot = self._submit_decisions_for_all({
            "session-5": _decision_payload(
                ability_selection={"abilityId": "emancipation_reform"},
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        })

        russia = self._player(snapshot, "player-5")
        self.assertIn("emancipation_reform", russia.used_abilities)
        self.assertEqual(russia.production_capacity.get("handicraft", 0),
                         initial_handicraft, "Handicraft unchanged (no idle to convert)")
        self.assertEqual(russia.ideology_levels.get("egalitarianism", 0),
                         initial_egal + 2, "Egalitarianism +2 even with no idle")
