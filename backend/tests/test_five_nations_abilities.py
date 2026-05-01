#!/usr/bin/env python3
"""
Five Nations Differentiation Tests — 明日之问

Tests each country's unique national ability:
1. Britain (workshop_of_the_world): productionOutputMultiplier=2
2. France (code_napoleon): resetIdeologiesTo=3, targetIdeologyDelta=3
3. Prussia (krupp_steel): free mechanized→steam upgrade (qty=2)
4. Austria (ausgleich_1867): domesticMarketCapacityDelta=3, overseasMarketCapacityDelta=2
5. Russia (emancipation_reform): convert idle→handicraft, egalitarianism+2

Also tests:
- Consumption pool drain (40%) at settlement
- Colonization full chain (unlock → diplomacy → colonize → looting)
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import PlayerState
from app.modules.rules.decision import resolve_decision_phase
from app.modules.rules.settlement import resolve_settlement_phase
from app.modules.game_state.turn_input import PlayerTurnInput


def build_snapshot(*, round_no: int = 1) -> "GameSnapshot":
    game = create_game(room_code="ROOM-AB", game_id="game-abilities")
    snapshot = create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-abilities",
        player_assignments={
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        },
    )
    snapshot.round_no = round_no
    snapshot.phase = GamePhase.DECISION
    return snapshot


def get_player(snapshot, player_id: str) -> PlayerState:
    return next(p for p in snapshot.player_states if p.player_id == player_id)


def make_turn(player_id: str, payload: dict) -> PlayerTurnInput:
    return PlayerTurnInput(
        game_id="game-abilities",
        round_no=1,
        phase=GamePhase.DECISION,
        player_id=player_id,
        submission_status=PlayerSubmissionStatus.SUBMITTED,
        payload=payload,
        submitted_at=None,
        is_timeout_generated=False,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. BRITAIN — workshop_of_the_world (productionOutputMultiplier=2)
# ─────────────────────────────────────────────────────────────────────────────
class BritainAbilityTest(unittest.TestCase):
    """Britain's 'Workshop of the World' doubles production output for one turn."""

    def test_workshop_of_the_world_doubles_output(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        # Give britain some raw materials and handicraft capacity to produce
        britain.phase1_economy.raw_materials = 10
        britain.budget_pools["factory"] = 50

        turn = make_turn("player-1", {
            "abilitySelection": {"abilityId": "workshop_of_the_world"},
            "phase1Production": {
                "rawMaterialAssignments": {"handicraft": 8},
            },
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_britain = get_player(result.updated_snapshot, "player-1")

        # Handicraft ratio is 1:1, so 8 raw → 8 goods, doubled → 16
        self.assertEqual(updated_britain.phase1_economy.goods_inventory, 16)
        self.assertIn("workshop_of_the_world", updated_britain.used_abilities)

    def test_workshop_of_the_world_cannot_be_used_twice(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.used_abilities = ["workshop_of_the_world"]
        britain.phase1_economy.raw_materials = 10

        turn = make_turn("player-1", {
            "abilitySelection": {"abilityId": "workshop_of_the_world"},
            "phase1Production": {"rawMaterialAssignments": {"handicraft": 5}},
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_britain = get_player(result.updated_snapshot, "player-1")

        # Should NOT be doubled since ability was already used
        self.assertEqual(updated_britain.phase1_economy.goods_inventory, 5)

    def test_workshop_wrong_ability_id_ignored(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 10

        turn = make_turn("player-1", {
            "abilitySelection": {"abilityId": "wrong_id"},
            "phase1Production": {"rawMaterialAssignments": {"handicraft": 5}},
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_britain = get_player(result.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.phase1_economy.goods_inventory, 5)


# ─────────────────────────────────────────────────────────────────────────────
# 2. FRANCE — code_napoleon (resetIdeologiesTo=3, targetIdeologyDelta=3)
# ─────────────────────────────────────────────────────────────────────────────
class FranceAbilityTest(unittest.TestCase):
    """France's 'Code Napoleon' resets all ideologies to 3, then +3 one target."""

    def test_code_napoleon_resets_and_boosts_target(self) -> None:
        snapshot = build_snapshot()
        france = get_player(snapshot, "player-2")
        # Set non-default ideologies to test reset
        france.ideology_levels = {"liberalism": 1, "egalitarianism": 5, "nationalism": 0}

        turn = make_turn("player-2", {
            "abilitySelection": {
                "abilityId": "code_napoleon",
                "targetIdeology": "liberalism",
            },
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_france = get_player(result.updated_snapshot, "player-2")

        # All reset to 3, then liberalism +3 = 6
        self.assertEqual(updated_france.ideology_levels["liberalism"], 6)
        self.assertEqual(updated_france.ideology_levels["egalitarianism"], 3)
        self.assertEqual(updated_france.ideology_levels["nationalism"], 3)
        self.assertIn("code_napoleon", updated_france.used_abilities)

    def test_code_napoleon_with_different_target(self) -> None:
        snapshot = build_snapshot()
        france = get_player(snapshot, "player-2")
        france.ideology_levels = {"liberalism": 2, "egalitarianism": 2, "nationalism": 2}

        turn = make_turn("player-2", {
            "abilitySelection": {
                "abilityId": "code_napoleon",
                "targetIdeology": "nationalism",
            },
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_france = get_player(result.updated_snapshot, "player-2")

        self.assertEqual(updated_france.ideology_levels["nationalism"], 6)
        self.assertEqual(updated_france.ideology_levels["liberalism"], 3)
        self.assertEqual(updated_france.ideology_levels["egalitarianism"], 3)


# ─────────────────────────────────────────────────────────────────────────────
# 3. PRUSSIA — krupp_steel (free mechanized→steam upgrade, qty=2)
# ─────────────────────────────────────────────────────────────────────────────
class PrussiaAbilityTest(unittest.TestCase):
    """Prussia's 'Krupp Steel' upgrades mechanized capacity to steam for free."""

    def test_krupp_steel_upgrades_mechanized_to_steam(self) -> None:
        snapshot = build_snapshot()
        prussia = get_player(snapshot, "player-3")
        # Prussia starts with 1 mechanized, give more for testing
        prussia.production_capacity["mechanized"] = 3
        prussia.phase1_economy.capacity_by_mode["mechanized"] = 3

        turn = make_turn("player-3", {
            "abilitySelection": {"abilityId": "krupp_steel"},
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_prussia = get_player(result.updated_snapshot, "player-3")

        # Should upgrade min(2, 3)=2 mechanized → steam
        self.assertEqual(updated_prussia.production_capacity["mechanized"], 1)
        self.assertEqual(updated_prussia.production_capacity["steam"], 2)
        self.assertIn("krupp_steel", updated_prussia.used_abilities)

    def test_krupp_steel_limited_by_available_mechanized(self) -> None:
        snapshot = build_snapshot()
        prussia = get_player(snapshot, "player-3")
        prussia.production_capacity["mechanized"] = 1
        prussia.phase1_economy.capacity_by_mode["mechanized"] = 1

        turn = make_turn("player-3", {
            "abilitySelection": {"abilityId": "krupp_steel"},
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_prussia = get_player(result.updated_snapshot, "player-3")

        # Only 1 available, so upgrades 1
        self.assertEqual(updated_prussia.production_capacity["mechanized"], 0)
        self.assertEqual(updated_prussia.production_capacity["steam"], 1)


# ─────────────────────────────────────────────────────────────────────────────
# 4. AUSTRIA — ausgleich_1867 (domestic+3, overseas+2)
# ─────────────────────────────────────────────────────────────────────────────
class AustriaAbilityTest(unittest.TestCase):
    """Austria's 'Ausgleich 1867' boosts domestic & overseas market capacity."""

    def test_ausgleich_boosts_market_capacities(self) -> None:
        snapshot = build_snapshot()
        austria = get_player(snapshot, "player-4")

        turn = make_turn("player-4", {
            "abilitySelection": {"abilityId": "ausgleich_1867"},
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_austria = get_player(result.updated_snapshot, "player-4")

        # Check temporary effects
        dom_bonus = updated_austria.temporary_effects.get("domesticMarketCapacityBonus", 0)
        ovs_bonus = updated_austria.temporary_effects.get("overseasMarketCapacityBonus", 0)
        self.assertEqual(dom_bonus, 3)
        self.assertEqual(ovs_bonus, 2)
        self.assertIn("ausgleich_1867", updated_austria.used_abilities)


# ─────────────────────────────────────────────────────────────────────────────
# 5. RUSSIA — emancipation_reform (convert idle→handicraft, egalitarianism+2)
# ─────────────────────────────────────────────────────────────────────────────
class RussiaAbilityTest(unittest.TestCase):
    """Russia's 'Emancipation Reform' converts idle capacity & boosts egalitarianism."""

    def test_emancipation_converts_idle_and_boosts_egalitarianism(self) -> None:
        snapshot = build_snapshot()
        russia = get_player(snapshot, "player-5")
        # Give Russia some idle capacity
        russia.production_capacity["idle"] = 5

        turn = make_turn("player-5", {
            "abilitySelection": {"abilityId": "emancipation_reform"},
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_russia = get_player(result.updated_snapshot, "player-5")

        # idle=5 → 0, handicraft += 5 (initial handicraft was 8)
        self.assertEqual(updated_russia.production_capacity["idle"], 0)
        self.assertEqual(updated_russia.production_capacity["handicraft"], 13)
        # egalitarianism was 1, +2 = 3
        self.assertEqual(updated_russia.ideology_levels["egalitarianism"], 3)
        self.assertIn("emancipation_reform", updated_russia.used_abilities)

    def test_emancipation_with_no_idle_is_harmless(self) -> None:
        snapshot = build_snapshot()
        russia = get_player(snapshot, "player-5")
        russia.production_capacity["idle"] = 0
        original_handicraft = int(russia.production_capacity.get("handicraft", 0))

        turn = make_turn("player-5", {
            "abilitySelection": {"abilityId": "emancipation_reform"},
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_russia = get_player(result.updated_snapshot, "player-5")

        # No idle to convert, handicraft unchanged
        self.assertEqual(updated_russia.production_capacity["handicraft"], original_handicraft)
        # But egalitarianism still gets +2
        self.assertEqual(updated_russia.ideology_levels["egalitarianism"], 3)


# ─────────────────────────────────────────────────────────────────────────────
# CROSS-COUNTRY: Abilities only work for the right country
# ─────────────────────────────────────────────────────────────────────────────
class AbilityOwnershipTest(unittest.TestCase):
    """A country cannot activate another country's ability."""

    def test_britain_cannot_use_france_ability(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        original_ideologies = dict(britain.ideology_levels)

        turn = make_turn("player-1", {
            "abilitySelection": {"abilityId": "code_napoleon", "targetIdeology": "liberalism"},
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_britain = get_player(result.updated_snapshot, "player-1")

        # Britain's ability lookup returns workshop_of_the_world, not code_napoleon
        # So code_napoleon should NOT match and ideologies should be unchanged
        self.assertEqual(updated_britain.ideology_levels, original_ideologies)
        self.assertNotIn("code_napoleon", updated_britain.used_abilities)

    def test_france_cannot_use_russia_ability(self) -> None:
        snapshot = build_snapshot()
        france = get_player(snapshot, "player-2")
        france.production_capacity["idle"] = 5

        turn = make_turn("player-2", {
            "abilitySelection": {"abilityId": "emancipation_reform"},
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_france = get_player(result.updated_snapshot, "player-2")

        # idle should remain untouched
        self.assertEqual(updated_france.production_capacity["idle"], 5)
        self.assertNotIn("emancipation_reform", updated_france.used_abilities)


# ─────────────────────────────────────────────────────────────────────────────
# CONSUMPTION POOL DRAIN (40%) — settlement
# ─────────────────────────────────────────────────────────────────────────────
class ConsumptionPoolDrainTest(unittest.TestCase):
    """Settlement drains 40% of the domesticMarket (consumption) pool."""

    def test_consumption_pool_drains_40_percent(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools["domesticMarket"] = 100
        britain.budget_pools["factory"] = 50
        britain.budget_pools["governmentFiscal"] = 30
        britain.national_income = 0  # No income this round

        result = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated_britain = get_player(result.updated_snapshot, "player-1")

        # 100 * (1 - 0.4) = 60
        self.assertEqual(updated_britain.budget_pools["domesticMarket"], 60)

    def test_consumption_pool_drain_with_income(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools["domesticMarket"] = 50
        britain.budget_pools["factory"] = 20
        britain.budget_pools["governmentFiscal"] = 10
        britain.national_income = 100  # 5:3:2 split → 50:30:20

        factory_before = int(britain.budget_pools["factory"])

        result = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated_britain = get_player(result.updated_snapshot, "player-1")

        # domesticMarket = (50 + 50) * 0.6 = 60
        self.assertEqual(updated_britain.budget_pools["domesticMarket"], 60)
        # factory should have received income (>= 20 + 30 from allocation)
        self.assertGreaterEqual(updated_britain.budget_pools["factory"], factory_before + 30)
        # governmentFiscal should have received income
        self.assertGreaterEqual(updated_britain.budget_pools["governmentFiscal"], 10 + 20)

    def test_consumption_pool_zero_remains_zero(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools["domesticMarket"] = 0
        britain.national_income = 0

        result = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated_britain = get_player(result.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.budget_pools["domesticMarket"], 0)


# ─────────────────────────────────────────────────────────────────────────────
# COLONIZATION FULL CHAIN
# ─────────────────────────────────────────────────────────────────────────────
class ColonizationChainTest(unittest.TestCase):
    """Test colonization: unlock → diplomacy → colonize → loot → settlement."""

    def test_full_colonization_chain(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        # Set up for colonization
        britain.budget_pools["governmentFiscal"] = 100
        britain.military_points = 5
        # Britain starts with diplomacy in asia_pacific

        # Round 1: Unlock colonization + establish diplomacy in americas
        turn1 = make_turn("player-1", {
            "militaryPlan": {
                "unlockColonization": True,
                "diplomacyActions": [
                    {"actionId": "establish_americas"},
                ],
            },
        })

        result1 = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn1])
        updated_britain1 = get_player(result1.updated_snapshot, "player-1")

        self.assertTrue(updated_britain1.colonization_unlocked)
        self.assertIn("americas", updated_britain1.established_diplomacy)

        # Round 2: Colonize americas
        result1.updated_snapshot.round_no = 2
        turn2 = make_turn("player-1", {
            "militaryPlan": {
                "colonizationActions": [
                    {"targetRegionId": "americas"},
                ],
            },
        })

        result2 = resolve_decision_phase(
            snapshot=result1.updated_snapshot, turn_inputs=[turn2]
        )
        updated_britain2 = get_player(result2.updated_snapshot, "player-1")
        americas_region = next(
            r for r in result2.updated_snapshot.region_states if r.region_id == "americas"
        )

        self.assertEqual(americas_region.controller, "britain")
        # 2 military points spent (colonizationMilitaryPointCost)
        self.assertEqual(updated_britain2.military_points, 3)

        # Round 3: Loot the colony
        result2.updated_snapshot.round_no = 3
        turn3 = make_turn("player-1", {
            "militaryPlan": {
                "lootingActions": [
                    {"regionId": "americas", "resourceType": "cotton"},
                ],
            },
        })

        result3 = resolve_decision_phase(
            snapshot=result2.updated_snapshot, turn_inputs=[turn3]
        )
        updated_britain3 = get_player(result3.updated_snapshot, "player-1")

        # Should have gained raw materials from looting
        # (initial 25 - consumed + looted)
        self.assertIn("americas", result3.updated_snapshot.looted_regions_this_turn)

    def test_colonization_requires_diplomacy(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.colonization_unlocked = True
        britain.military_points = 5
        # No diplomacy with americas

        turn = make_turn("player-1", {
            "militaryPlan": {
                "colonizationActions": [
                    {"targetRegionId": "americas"},
                ],
            },
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        americas_region = next(
            r for r in result.updated_snapshot.region_states if r.region_id == "americas"
        )

        # Should NOT be colonized (no diplomacy)
        self.assertIsNone(americas_region.controller)

    def test_colonization_requires_unlock(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.colonization_unlocked = False
        britain.established_diplomacy = ["americas"]
        britain.military_points = 5

        turn = make_turn("player-1", {
            "militaryPlan": {
                "colonizationActions": [
                    {"targetRegionId": "americas"},
                ],
            },
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        americas_region = next(
            r for r in result.updated_snapshot.region_states if r.region_id == "americas"
        )

        self.assertIsNone(americas_region.controller)

    def test_colonization_deducts_military_points(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.colonization_unlocked = True
        britain.established_diplomacy = ["americas"]
        britain.military_points = 3

        turn = make_turn("player-1", {
            "militaryPlan": {
                "colonizationActions": [
                    {"targetRegionId": "americas"},
                ],
            },
        })

        result = resolve_decision_phase(snapshot=snapshot, turn_inputs=[turn])
        updated_britain = get_player(result.updated_snapshot, "player-1")

        # colonizationMilitaryPointCost=2, so 3-2=1
        self.assertEqual(updated_britain.military_points, 1)


# ─────────────────────────────────────────────────────────────────────────────
# COLONY INCOME at settlement
# ─────────────────────────────────────────────────────────────────────────────
class ColonyIncomeTest(unittest.TestCase):
    """Colonies contribute income at settlement time."""

    def test_colony_adds_income_to_national_income(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.national_income = 0
        britain.budget_pools["domesticMarket"] = 0
        britain.budget_pools["factory"] = 0
        britain.budget_pools["governmentFiscal"] = 0

        # Give britain control of americas
        americas = next(r for r in snapshot.region_states if r.region_id == "americas")
        americas.controller = "britain"

        result = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        summary = result.summary

        # Colony income should appear in the summary
        britain_card = next(
            card for card in summary["summaryCards"] if card["playerId"] == "player-1"
        )
        self.assertGreater(britain_card["colonyIncome"], 0)


if __name__ == "__main__":
    unittest.main()
