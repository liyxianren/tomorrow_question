"""Comprehensive 5-round E2E test: Colonization + Looting + Talents + Abilities + Economy.

Simulates a real multi-player game across 5 complete rounds, exercising:
  - Phase-1 production & market pipeline
  - Military colonization (unlock → diplomacy → colonize → loot)
  - Talent tree (point purchases → sequential unlocks → effects)
  - National abilities (Britain, France, Prussia)
  - Settlement income allocation & budget pool economics
  - Independence progression from looting

The test uses the API submission path exclusively. The API auto-resolves
each phase when all players submit, then advances to the next phase.
For settlement (no player input), we call resolve_settlement_phase directly.

References:
  - docs/plans/autopatch-progress.md
  - backend/app/modules/settlement/submission_application.py (auto-resolution)
  - backend/tests/test_e2e_verification.py (pattern)
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


class Comprehensive5RoundE2E(unittest.TestCase):
    """Full 5-round game covering colonization, looting, talents, abilities,
    production, market, and settlement in a single integrated flow.

    Player roles:
      - Britain (player-1): colonizer + looter + talent chain
      - France (player-2): ability user (code_napoleon) + talent tree
      - Prussia (player-3): ability user (krupp_steel) + production

    The API auto-resolves when all players submit, advancing to the next phase.
    For settlement (no player input needed), we call resolve_settlement_phase directly.
    """

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "e2e-comprehensive.sqlite3"
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
        """Submit decision payloads for specified sessions. Others get empty payloads.
        The API auto-resolves when all 5 players have submitted.
        Returns the post-resolution snapshot (now in MARKET phase).
        """
        submitted_sids = set()
        for sid, payload in decisions.items():
            self._submit_api(sid, payload)
            submitted_sids.add(sid)
        # Submit empty for the rest
        for _, sid, _, _ in PLAYER_FIXTURES:
            if sid not in submitted_sids:
                self._submit_api(sid, _empty_decision_payload())
        # Snapshot is now auto-resolved and in MARKET phase
        return self._load_snapshot()

    def _submit_markets_for_all(self, allocations: dict[str, int]):
        """Submit market payloads for specified sessions. Others get 0 allocation.
        The API auto-resolves when all 5 players have submitted.
        Returns the post-resolution snapshot (now in SETTLEMENT phase).
        """
        submitted_sids = set()
        for sid, alloc in allocations.items():
            self._submit_market_api(sid, _market_payload(alloc))
            submitted_sids.add(sid)
        for _, sid, _, _ in PLAYER_FIXTURES:
            if sid not in submitted_sids:
                self._submit_market_api(sid, _market_payload(0))
        return self._load_snapshot()

    def _resolve_settlement(self, snapshot: GameSnapshot) -> GameSnapshot:
        """Resolve settlement phase (no player input needed), advance to next round, and save.
        Updates both the snapshot AND the game record's activeSnapshotId.
        """
        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = resolution.updated_snapshot
        # Advance phase: SETTLEMENT → DECISION (next round)
        updated.round_no = snapshot.round_no + 1
        updated.phase = GamePhase.DECISION
        updated.looted_regions_this_turn = set()
        # Generate new snapshot ID and update game record (mirrors run_phase_settlement)
        from uuid import uuid4
        updated.snapshot_id = uuid4().hex
        conn = connect_database(self.db_path)
        initialize_database(conn)
        SnapshotRepository(conn).save(updated.to_payload())
        gp = GameRepository(conn).get("game-1")
        gp["activeSnapshotId"] = updated.snapshot_id
        gp["currentPhase"] = updated.phase.value  # Must also update Game.currentPhase
        GameRepository(conn).save(gp)
        conn.close()
        return updated

    def _override_snapshot(self, snapshot: GameSnapshot, fn):
        """Apply fn(snapshot) to modify the snapshot in-place, then save."""
        fn(snapshot)
        self._save_snapshot(snapshot)
        return snapshot

    # ═══════════════════════════════════════════════════════════════════════════
    # THE FULL 5-ROUND GAME
    # ═══════════════════════════════════════════════════════════════════════════

    def test_full_5_round_comprehensive(self):
        """Complete 5-round game exercising all major systems."""

        # ── Setup ──
        self.seed_active_game()
        snapshot = self._load_snapshot()

        # Give Britain extra resources for colonization path
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 100
        britain.military_points = 20
        britain.phase1_economy.raw_materials = 25

        # Give France tech points for talent unlocks
        france = self._player(snapshot, "player-2")
        france.ideology_levels = {"liberalism": 1, "egalitarianism": 5, "nationalism": 0}
        france.tech_points = 10

        # Give Prussia mechanized capacity for krupp_steel
        prussia = self._player(snapshot, "player-3")
        prussia.production_capacity["mechanized"] = 3
        prussia.phase1_economy.capacity_by_mode["mechanized"] = 3

        self._save_snapshot(snapshot)

        # ══════════════════════════════════════════════════════════════════════
        # ROUND 1: Production + Military + Colonization
        # ══════════════════════════════════════════════════════════════════════

        # Submit all 5 decisions → API auto-resolves → advances to MARKET
        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                military_actions=["recruit_infantry"],
                unlock_colonization=True,
                diplomacy_actions=["establish_americas"],
                colonization_actions=[{"targetRegionId": "americas"}],
                ability_selection={"abilityId": "workshop_of_the_world"},
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
            "session-2": _decision_payload(
                point_purchases=[{"pointType": "tech", "quantity": 3}],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
            "session-3": _decision_payload(
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
        })

        # Verify R1 Decision results (snapshot is now in MARKET phase)
        britain = self._player(snapshot, "player-1")
        self.assertTrue(britain.colonization_unlocked, "R1: Britain colonization unlocked")
        self.assertIn("americas", britain.established_diplomacy, "R1: Britain diplomacy established")
        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.controller, "britain", "R1: Americas colonized by Britain")
        self.assertEqual(americas.access_level, RegionAccessLevel.COLONY)
        self.assertEqual(britain.phase1_economy.goods_inventory, 8, "R1: Britain produced 8 goods (4×2 workshop)")
        self.assertIn("workshop_of_the_world", britain.used_abilities, "R1: Britain used workshop ability")

        france = self._player(snapshot, "player-2")
        self.assertGreater(france.tech_points, 10, "R1: France gained tech points from purchases")

        prussia = self._player(snapshot, "player-3")
        self.assertEqual(prussia.phase1_economy.goods_inventory, 4, "R1: Prussia produced 4 goods")

        cotton_initial = americas.resource_limit.get("cotton", 0)
        self.assertGreater(cotton_initial, 0, "R1: Americas has cotton")

        # Save Britain raw materials for later comparison
        britain_rm_after_r1_decision = britain.phase1_economy.raw_materials

        # ── R1 Market Phase: submit all 5 → auto-resolves → advances to SETTLEMENT ──
        snapshot = self._submit_markets_for_all({
            "session-1": 8,
            "session-2": 4,
            "session-3": 4,
        })

        britain = self._player(snapshot, "player-1")
        britain_revenue = britain.phase1_economy.market_metrics.get("revenue", 0)
        self.assertGreater(britain_revenue, 0, "R1: Britain earned revenue from sales")

        # ── R1 Settlement: resolve directly (no player input) ──
        snapshot = self._resolve_settlement(snapshot)

        britain = self._player(snapshot, "player-1")
        self.assertEqual(britain.national_income, 0, "R1 Settlement: income reset to 0")
        self.assertGreater(britain.phase1_economy.raw_materials, britain_rm_after_r1_decision,
                           "R1 Settlement: raw materials replenished")

        # ══════════════════════════════════════════════════════════════════════
        # ROUND 2: Looting + Talent Unlocks + Production
        # ══════════════════════════════════════════════════════════════════════

        # Give Britain more tech points for talent unlocks
        def _prep_r2(snap):
            brit = self._player(snap, "player-1")
            brit.tech_points = 10
        snapshot = self._override_snapshot(snapshot, _prep_r2)

        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
                talent_unlocks=["ind_basic_metallurgy", "ind_process_improvement"],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
            "session-2": _decision_payload(
                ability_selection={"abilityId": "code_napoleon", "targetIdeology": "liberalism"},
                talent_unlocks=["civ_market_research"],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
            "session-3": _decision_payload(
                ability_selection={"abilityId": "krupp_steel"},
                phase1_production={"rawMaterialAssignments": {"handicraft": 4, "mechanized": 2}},
            ),
        })

        # Verify R2 Decision
        britain = self._player(snapshot, "player-1")
        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.resource_limit.get("cotton", 0), cotton_initial - 1,
                         "R2: Cotton decreased by 1 from looting")
        self.assertIn("ind_basic_metallurgy", britain.unlocked_talents, "R2: Britain talent 1")
        self.assertIn("ind_process_improvement", britain.unlocked_talents, "R2: Britain talent 2")
        # ind_basic_metallurgy adds handicraftCapacityDelta +1
        self.assertGreater(britain.phase1_economy.capacity_by_mode.get("handicraft", 0), 8,
                           "R2: Britain handicraft increased from talent")

        france = self._player(snapshot, "player-2")
        self.assertEqual(france.ideology_levels["liberalism"], 6, "R2: France liberalism → 6 (code_napoleon)")
        self.assertEqual(france.ideology_levels["egalitarianism"], 3, "R2: France egalitarianism → 3")
        self.assertEqual(france.ideology_levels["nationalism"], 3, "R2: France nationalism → 3")
        self.assertIn("code_napoleon", france.used_abilities, "R2: France used code_napoleon")
        self.assertIn("civ_market_research", france.unlocked_talents, "R2: France talent")

        prussia = self._player(snapshot, "player-3")
        self.assertEqual(prussia.production_capacity["mechanized"], 1, "R2: Prussia mechanized → 1 (krupp)")
        self.assertIn("krupp_steel", prussia.used_abilities, "R2: Prussia used krupp_steel")

        # ── R2 Market + Settlement ──
        snapshot = self._submit_markets_for_all({
            "session-1": 4,
            "session-2": 4,
            "session-3": 6,
        })
        snapshot = self._resolve_settlement(snapshot)

        # ══════════════════════════════════════════════════════════════════════
        # ROUND 3: Second Loot + Deep Talent Chain + Production
        # ══════════════════════════════════════════════════════════════════════

        def _prep_r3(snap):
            brit = self._player(snap, "player-1")
            brit.tech_points = brit.tech_points + 5
        snapshot = self._override_snapshot(snapshot, _prep_r3)

        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
                talent_unlocks=["ind_standardization"],
                phase1_production={"rawMaterialAssignments": {"handicraft": 5}},
            ),
            "session-2": _decision_payload(
                talent_unlocks=["gov_fiscal_reform", "mil_military_theory"],
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
            "session-3": _decision_payload(
                phase1_production={"rawMaterialAssignments": {"handicraft": 4, "mechanized": 1}},
            ),
        })

        # Verify R3 Decision
        britain = self._player(snapshot, "player-1")
        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.resource_limit.get("cotton", 0), cotton_initial - 2,
                         "R3: Cotton decreased by 2 total")
        self.assertIn("ind_standardization", britain.unlocked_talents, "R3: Britain talent 3")
        # ind_standardization adds handicraftCapacityDelta +2
        # Total: 8 (base) + 1 (basic_metallurgy) + 2 (standardization) = 11
        self.assertEqual(britain.phase1_economy.capacity_by_mode.get("handicraft"), 11,
                         "R3: Britain handicraft = 8 + 1 + 2 = 11")

        france = self._player(snapshot, "player-2")
        self.assertIn("gov_fiscal_reform", france.unlocked_talents, "R3: France talent 2")
        self.assertIn("mil_military_theory", france.unlocked_talents, "R3: France talent 3")

        # ── R3 Market + Settlement ──
        snapshot = self._submit_markets_for_all({
            "session-1": 5,
            "session-2": 4,
            "session-3": 5,
        })
        snapshot = self._resolve_settlement(snapshot)

        # ══════════════════════════════════════════════════════════════════════
        # ROUND 4: Third Loot + Ability Cannot Reuse
        # ══════════════════════════════════════════════════════════════════════

        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
                ability_selection={"abilityId": "workshop_of_the_world"},  # Already used R1!
                phase1_production={"rawMaterialAssignments": {"handicraft": 6}},
            ),
            "session-2": _decision_payload(
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
            "session-3": _decision_payload(
                phase1_production={"rawMaterialAssignments": {"handicraft": 4, "mechanized": 1}},
            ),
        })

        # Verify R4
        britain = self._player(snapshot, "player-1")
        americas = self._region(snapshot, "americas")
        self.assertEqual(americas.resource_limit.get("cotton", 0), cotton_initial - 3,
                         "R4: Cotton decreased by 3 total")
        # workshop_of_the_world should NOT fire again (already used)
        self.assertEqual(britain.phase1_economy.goods_inventory, 6,
                         "R4: Britain produced 6 goods (ability NOT reused)")
        self.assertIn("workshop_of_the_world", britain.used_abilities)

        # ── R4 Market + Settlement ──
        snapshot = self._submit_markets_for_all({
            "session-1": 6,
            "session-2": 4,
            "session-3": 5,
        })
        snapshot = self._resolve_settlement(snapshot)

        # ══════════════════════════════════════════════════════════════════════
        # ROUND 5: Final Round — Verify Cumulative State
        # ══════════════════════════════════════════════════════════════════════

        snapshot = self._submit_decisions_for_all({
            "session-1": _decision_payload(
                phase1_production={"rawMaterialAssignments": {"handicraft": 8}},
            ),
            "session-2": _decision_payload(
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            ),
            "session-3": _decision_payload(
                phase1_production={"rawMaterialAssignments": {"handicraft": 4, "mechanized": 1}},
            ),
        })

        # ── R5 Market + Settlement ──
        snapshot = self._submit_markets_for_all({
            "session-1": 8,
            "session-2": 4,
            "session-3": 5,
        })
        snapshot = self._resolve_settlement(snapshot)

        # ══════════════════════════════════════════════════════════════════════
        # FINAL VERIFICATION: Cumulative state after 5 rounds
        # ══════════════════════════════════════════════════════════════════════

        britain = self._player(snapshot, "player-1")
        france = self._player(snapshot, "player-2")
        prussia = self._player(snapshot, "player-3")

        # Britain cumulative state
        self.assertTrue(britain.colonization_unlocked, "Final: Britain colonization unlocked")
        self.assertIn("americas", britain.established_diplomacy, "Final: Britain has americas diplomacy")
        # Colony may have revolted after 3 rounds of looting (expected behavior)
        americas = self._region(snapshot, "americas")
        if americas.controller == "britain":
            self.assertEqual(americas.access_level, RegionAccessLevel.COLONY, "Final: Colony still held")
        else:
            # Colony revolted — independence exceeded threshold (resets to 0 on revolt)
            self.assertIsNone(americas.controller, "Final: Colony lost after revolt")
            self.assertEqual(americas.independence, 0, "Final: Independence resets to 0 after revolt")
        self.assertIn("workshop_of_the_world", britain.used_abilities, "Final: Britain ability used")
        self.assertIn("ind_basic_metallurgy", britain.unlocked_talents, "Final: Talent 1")
        self.assertIn("ind_process_improvement", britain.unlocked_talents, "Final: Talent 2")
        self.assertIn("ind_standardization", britain.unlocked_talents, "Final: Talent 3")

        # Britain economy should be growing
        self.assertGreater(britain.cumulative_national_income, 0,
                           "Final: Britain has positive cumulative income")

        # Cotton should be reduced by 3 (3 rounds of looting) — check regardless of revolt
        americas_final = self._region(snapshot, "americas")
        cotton_final = americas_final.resource_limit.get("cotton", 0)
        self.assertEqual(cotton_final, cotton_initial - 3, "Final: Cotton reduced by 3 total")

        # France cumulative state
        self.assertIn("code_napoleon", france.used_abilities, "Final: France ability used")
        self.assertIn("civ_market_research", france.unlocked_talents, "Final: France talent 1")
        self.assertIn("gov_fiscal_reform", france.unlocked_talents, "Final: France talent 2")
        self.assertIn("mil_military_theory", france.unlocked_talents, "Final: France talent 3")

        # Prussia cumulative state
        self.assertIn("krupp_steel", prussia.used_abilities, "Final: Prussia ability used")
        self.assertEqual(prussia.production_capacity["mechanized"], 1,
                         "Final: Prussia mechanized = 1 (krupp converted to steam)")

        # All 5 players should have positive cumulative income
        for pid, _, _, _ in PLAYER_FIXTURES:
            ps = self._player(snapshot, pid)
            self.assertGreaterEqual(ps.cumulative_national_income, 0,
                                    f"Final: {ps.country.value} has non-negative cumulative income")


if __name__ == "__main__":
    unittest.main()
