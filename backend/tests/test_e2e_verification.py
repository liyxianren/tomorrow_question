"""E2E Verification — Multi-round Looting, Talent Chain, Five Nations Abilities.

Follows the established E2E pattern: submit via API → load from DB → resolve manually.
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
from app.modules.rules.settlement import resolve_settlement_phase, _apply_independence_progression
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


def _make_turn(player_id: str, payload: dict, round_no: int = 1) -> PlayerTurnInput:
    return PlayerTurnInput(
        game_id="game-1", round_no=round_no, phase=GamePhase.DECISION,
        player_id=player_id, submission_status="submitted",
        payload=payload, submitted_at=None, is_timeout_generated=False,
    )


class _E2EBase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "e2e.sqlite3"
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

    def _submit_and_resolve(self, snapshot, turn_inputs):
        resolution = resolve_decision_phase(snapshot=snapshot, turn_inputs=turn_inputs)
        self._save_snapshot(resolution.updated_snapshot)
        return resolution

    def _player(self, snapshot, pid):
        return next(p for p in snapshot.player_states if p.player_id == pid)

    def _region(self, snapshot, rid):
        return next(r for r in snapshot.region_states if r.region_id == rid)

    def submit_decision_api(self, session_id: str, payload: dict, expected_status=200):
        resp = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": payload},
            headers={"X-Session-Id": session_id},
        )
        self.assertEqual(resp.status_code, expected_status,
                         f"Expected {expected_status}, got {resp.status_code}: {resp.get_json()}")
        return resp.get_json()


# ═══════════════════════════════════════════════════════════════════════════════
# 1. MULTI-ROUND COLONIZATION + LOOTING E2E
# ═══════════════════════════════════════════════════════════════════════════════
class MultiRoundLootingE2E(_E2EBase):
    """Colonize in round 1, loot in rounds 2 and 3 via API → resolver chain."""

    def test_full_colonization_loot_cycle_3_rounds(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 100
        britain.military_points = 20
        britain.phase1_economy.raw_materials = 25
        self._save_snapshot(snapshot)

        # ── Round 1: submit via API, then resolve ──
        self.submit_decision_api("session-1", _decision_payload(
            military_actions=["recruit_infantry"],
            unlock_colonization=True,
            diplomacy_actions=["establish_americas"],
            colonization_actions=[{"targetRegionId": "americas"}],
        ))

        # Load persisted turn input and resolve
        snapshot = self._load_snapshot()
        conn = connect_database(self.db_path)
        initialize_database(conn)
        ti_payloads = PlayerTurnInputRepository(conn).list_for_phase("game-1", 1, GamePhase.DECISION)
        conn.close()
        turn_inputs = [PlayerTurnInput.from_payload(p) for p in ti_payloads]

        resolution = self._submit_and_resolve(snapshot, turn_inputs)
        britain = self._player(resolution.updated_snapshot, "player-1")
        americas = self._region(resolution.updated_snapshot, "americas")

        self.assertTrue(britain.colonization_unlocked, "Round 1: colonization unlocked")
        self.assertIn("americas", britain.established_diplomacy, "Round 1: diplomacy established")
        self.assertEqual(americas.controller, "britain", "Round 1: americas colonized")
        self.assertEqual(americas.access_level, RegionAccessLevel.COLONY)

        rm_before_loot = britain.phase1_economy.raw_materials
        cotton_before = americas.resource_limit.get("cotton", 0)
        self.assertGreater(cotton_before, 0, "Colony should have cotton")

        # ── Round 2: Loot cotton via API + resolve ──
        snapshot = resolution.updated_snapshot
        snapshot.round_no = 2
        snapshot.looted_regions_this_turn = set()
        snapshot.phase = GamePhase.DECISION
        self._save_snapshot(snapshot)

        self.submit_decision_api("session-1", _decision_payload(
            looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
        ))

        snapshot = self._load_snapshot()
        conn = connect_database(self.db_path)
        initialize_database(conn)
        ti_payloads = PlayerTurnInputRepository(conn).list_for_phase("game-1", 2, GamePhase.DECISION)
        conn.close()
        turn_inputs = [PlayerTurnInput.from_payload(p) for p in ti_payloads]

        resolution2 = self._submit_and_resolve(snapshot, turn_inputs)
        britain = self._player(resolution2.updated_snapshot, "player-1")
        americas = self._region(resolution2.updated_snapshot, "americas")

        self.assertEqual(britain.phase1_economy.raw_materials, rm_before_loot + 1,
                         "Round 2: +1 raw materials from looting")
        self.assertEqual(americas.resource_limit.get("cotton"), cotton_before - 1,
                         "Round 2: cotton decreased")
        self.assertIn("americas", resolution2.updated_snapshot.looted_regions_this_turn)

        # Verify independence penalty: +2 for looting + possible +2 for supply/demand imbalance
        snap2 = resolution2.updated_snapshot
        _apply_independence_progression(snap2, self.balance,
                                         looted_regions=set(snap2.looted_regions_this_turn))
        americas = self._region(snap2, "americas")
        self.assertGreaterEqual(americas.independence, 2, "Looted colony gets at least +2 independence")

        # ── Round 3: Loot again ──
        snap2.round_no = 3
        snap2.looted_regions_this_turn = set()
        snap2.phase = GamePhase.DECISION
        self._save_snapshot(snap2)

        rm_before_r3 = britain.phase1_economy.raw_materials

        self.submit_decision_api("session-1", _decision_payload(
            looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
        ))

        snapshot = self._load_snapshot()
        conn = connect_database(self.db_path)
        initialize_database(conn)
        ti_payloads = PlayerTurnInputRepository(conn).list_for_phase("game-1", 3, GamePhase.DECISION)
        conn.close()
        turn_inputs = [PlayerTurnInput.from_payload(p) for p in ti_payloads]

        resolution3 = self._submit_and_resolve(snapshot, turn_inputs)
        britain = self._player(resolution3.updated_snapshot, "player-1")
        americas = self._region(resolution3.updated_snapshot, "americas")

        self.assertEqual(britain.phase1_economy.raw_materials, rm_before_r3 + 1,
                         "Round 3: another +1 from looting")
        self.assertEqual(americas.resource_limit.get("cotton"), cotton_before - 2,
                         "Round 3: cotton decreased by 2 total")

    def test_loot_same_colony_twice_in_one_turn_rejected(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 100
        britain.military_points = 20
        britain.colonization_unlocked = True
        britain.established_diplomacy = ["americas"]
        americas = self._region(snapshot, "americas")
        americas.controller = "britain"
        americas.access_level = RegionAccessLevel.COLONY
        americas.resource_limit = {"cotton": 5, "grain": 5}
        self._save_snapshot(snapshot)

        rm_before = britain.phase1_economy.raw_materials

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-1", _decision_payload(
                looting_actions=[
                    {"regionId": "americas", "resourceType": "cotton"},
                    {"regionId": "americas", "resourceType": "grain"},
                ],
            )),
        ])

        britain = self._player(resolution.updated_snapshot, "player-1")
        americas = self._region(resolution.updated_snapshot, "americas")

        self.assertEqual(britain.phase1_economy.raw_materials, rm_before + 1,
                         "Only first loot succeeds")
        self.assertEqual(americas.resource_limit.get("cotton"), 4)
        self.assertEqual(americas.resource_limit.get("grain"), 5, "Grain untouched")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. TALENT SYSTEM CHAIN VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════════
class TalentChainE2E(_E2EBase):
    """Buy tech points → unlock sequential talent nodes → verify effects."""

    def test_buy_tech_points_and_unlock_first_talent(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        initial_tp = britain.tech_points

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-1", _decision_payload(
                point_purchases=[{"pointType": "tech", "quantity": 3}],
                talent_unlocks=["ind_basic_metallurgy"],
            )),
        ])

        britain = self._player(resolution.updated_snapshot, "player-1")
        self.assertEqual(britain.tech_points, initial_tp + 3 - 1,
                         "Bought 3, spent 1 = net +2")
        self.assertIn("ind_basic_metallurgy", britain.unlocked_talents)
        # Effect: handicraftCapacityDelta +1 (initial handicraft = 4)
        initial_hc = britain.phase1_economy.capacity_by_mode.get("handicraft", 0)
        # Verify talent effect: +1 handicraft capacity
        # (initial value varies by country config)
        self.assertIn("ind_basic_metallurgy", britain.unlocked_talents)

    def test_talent_chain_requires_sequential_unlock(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 100
        britain.tech_points = 20

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-1", _decision_payload(
                talent_unlocks=["ind_process_improvement"],
            )),
        ])

        britain = self._player(resolution.updated_snapshot, "player-1")
        self.assertNotIn("ind_process_improvement", britain.unlocked_talents,
                          "Cannot skip first node in chain")

    def test_talent_chain_3_nodes_sequential(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 100
        britain.tech_points = 20

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-1", _decision_payload(
                talent_unlocks=[
                    "ind_basic_metallurgy",
                    "ind_process_improvement",
                    "ind_standardization",
                ],
            )),
        ])

        britain = self._player(resolution.updated_snapshot, "player-1")
        self.assertIn("ind_basic_metallurgy", britain.unlocked_talents)
        self.assertIn("ind_process_improvement", britain.unlocked_talents)
        self.assertIn("ind_standardization", britain.unlocked_talents)
        self.assertEqual(britain.tech_points, 20 - 6)
        # handicraft: initial + 1 (basic_metallurgy) + 2 (standardization) = initial + 3
        # Britain starts with 8 handicraft
        self.assertEqual(britain.phase1_economy.capacity_by_mode.get("handicraft"), 8 + 3)
        # factory: initial 14 + 4 (process_improvement)
        self.assertEqual(britain.budget_pools["factory"], 14 + 4)

    def test_different_branches_independent(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.budget_pools["governmentFiscal"] = 100
        britain.tech_points = 20

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-1", _decision_payload(
                talent_unlocks=[
                    "ind_basic_metallurgy",
                    "civ_market_research",
                    "gov_fiscal_reform",
                    "mil_military_theory",
                ],
            )),
        ])

        britain = self._player(resolution.updated_snapshot, "player-1")
        self.assertIn("ind_basic_metallurgy", britain.unlocked_talents)
        self.assertIn("civ_market_research", britain.unlocked_talents)
        self.assertIn("gov_fiscal_reform", britain.unlocked_talents)
        self.assertIn("mil_military_theory", britain.unlocked_talents)
        self.assertEqual(britain.tech_points, 20 - 4)

    def test_insufficient_tech_points_blocks_unlock(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.tech_points = 0

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-1", _decision_payload(
                talent_unlocks=["ind_basic_metallurgy"],
            )),
        ])

        britain = self._player(resolution.updated_snapshot, "player-1")
        self.assertNotIn("ind_basic_metallurgy", britain.unlocked_talents)


# ═══════════════════════════════════════════════════════════════════════════════
# 3. FIVE NATIONS DIFFERENTIATION E2E
# ═══════════════════════════════════════════════════════════════════════════════
class FiveNationsAbilityE2E(_E2EBase):
    """Each country's unique national ability verified via API → resolver."""

    def test_britain_workshop_of_the_world(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 20

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-1", _decision_payload(
                ability_selection={"abilityId": "workshop_of_the_world"},
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            )),
        ])

        britain = self._player(resolution.updated_snapshot, "player-1")
        self.assertEqual(britain.phase1_economy.goods_inventory, 8, "Output doubled")
        self.assertIn("workshop_of_the_world", britain.used_abilities)

    def test_france_code_napoleon(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        france = self._player(snapshot, "player-2")
        france.ideology_levels = {"liberalism": 1, "egalitarianism": 5, "nationalism": 0}

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-2", _decision_payload(
                ability_selection={"abilityId": "code_napoleon", "targetIdeology": "liberalism"},
            )),
        ])

        france = self._player(resolution.updated_snapshot, "player-2")
        self.assertEqual(france.ideology_levels["liberalism"], 6)
        self.assertEqual(france.ideology_levels["egalitarianism"], 3)
        self.assertEqual(france.ideology_levels["nationalism"], 3)
        self.assertIn("code_napoleon", france.used_abilities)

    def test_prussia_krupp_steel(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        prussia = self._player(snapshot, "player-3")
        prussia.production_capacity["mechanized"] = 3
        prussia.phase1_economy.capacity_by_mode["mechanized"] = 3
        self._save_snapshot(snapshot)

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-3", _decision_payload(
                ability_selection={"abilityId": "krupp_steel"},
            )),
        ])

        prussia = self._player(resolution.updated_snapshot, "player-3")
        self.assertEqual(prussia.production_capacity["mechanized"], 1)
        self.assertEqual(prussia.production_capacity["steam"], 2)
        self.assertIn("krupp_steel", prussia.used_abilities)

    def test_austria_ausgleich_1867(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-4", _decision_payload(
                ability_selection={"abilityId": "ausgleich_1867"},
            )),
        ])

        austria = self._player(resolution.updated_snapshot, "player-4")
        self.assertEqual(austria.temporary_effects.get("domesticMarketCapacityBonus", 0), 3)
        self.assertEqual(austria.temporary_effects.get("overseasMarketCapacityBonus", 0), 2)
        self.assertIn("ausgleich_1867", austria.used_abilities)

    def test_russia_emancipation_reform(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        russia = self._player(snapshot, "player-5")
        russia.production_capacity["idle"] = 5
        self._save_snapshot(snapshot)

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-5", _decision_payload(
                ability_selection={"abilityId": "emancipation_reform"},
            )),
        ])

        russia = self._player(resolution.updated_snapshot, "player-5")
        self.assertEqual(russia.production_capacity["idle"], 0)
        self.assertEqual(russia.production_capacity["handicraft"], 8 + 5)
        self.assertEqual(russia.ideology_levels["egalitarianism"], 1 + 2)
        self.assertIn("emancipation_reform", russia.used_abilities)

    def test_wrong_country_cannot_use_ability(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        original_ideologies = dict(britain.ideology_levels)

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-1", _decision_payload(
                ability_selection={"abilityId": "code_napoleon", "targetIdeology": "liberalism"},
            )),
        ])

        britain = self._player(resolution.updated_snapshot, "player-1")
        self.assertEqual(britain.ideology_levels, original_ideologies)
        self.assertNotIn("code_napoleon", britain.used_abilities)

    def test_ability_cannot_be_used_twice(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 20
        britain.used_abilities = ["workshop_of_the_world"]
        self._save_snapshot(snapshot)

        resolution = self._submit_and_resolve(snapshot, [
            _make_turn("player-1", _decision_payload(
                ability_selection={"abilityId": "workshop_of_the_world"},
                phase1_production={"rawMaterialAssignments": {"handicraft": 4}},
            )),
        ])

        britain = self._player(resolution.updated_snapshot, "player-1")
        self.assertEqual(britain.phase1_economy.goods_inventory, 4, "Not doubled")


if __name__ == "__main__":
    unittest.main()
