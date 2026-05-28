"""政府改革与常规政策测试 (Packet 3).

These tests cover:
  - reform enactment and admin-capacity deduction
  - mutual exclusion between freedom/equality/national paths
  - policy activation, requires_reform gating, and deactivation
  - one-shot effects (ideology delta, ratio override) at enact time
  - per-round settlement effects (admin spending, ratio delta, permanent
    tech_points_per_turn, welfare transfer)
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.effects import get_effect_bonus, reset_temporary_effects
from app.modules.game_state.models import GameSnapshot, PlayerState
from app.modules.rules.decision import (
    _apply_government_plan,
    _apply_military_plan,
    _apply_policy_plan,
    _apply_reform_plan,
    resolve_decision_phase,
)
from app.modules.rules.settlement import _apply_active_policy_effects, resolve_settlement_phase


def _build_snapshot() -> GameSnapshot:
    game = create_game(room_code="ROOM01", game_id="game-1")
    snapshot = create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-1",
        player_assignments={
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        },
    )
    snapshot.phase = GamePhase.SETTLEMENT
    # Stay on the legacy (non phase-1) settlement branch so the ratio under
    # test reflects the player_state.income_allocation_ratio mutations.
    for player_state in snapshot.player_states:
        player_state.phase1_economy.raw_materials = 0
    return snapshot


def _get_player(snapshot: GameSnapshot, player_id: str) -> PlayerState:
    return next(player for player in snapshot.player_states if player.player_id == player_id)


class ReformEnactmentTests(unittest.TestCase):
    def test_enact_reform_deducts_admin_capacity(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 2

        enacted, _ = _apply_reform_plan(player, {"reforms": ["constitution"]}, balance)

        self.assertEqual(enacted, ["constitution"])
        self.assertEqual(player.administration_capacity, 0)
        self.assertIn("constitution", player.completed_reforms)

    def test_mutual_exclusion_planned_economy_blocks_freedom(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 8
        _apply_reform_plan(player, {"reforms": ["planned_economy"]}, balance)
        self.assertIn("planned_economy", player.completed_reforms)

        enacted, _ = _apply_reform_plan(player, {"reforms": ["constitution"]}, balance)

        self.assertEqual(enacted, [])
        self.assertNotIn("constitution", player.completed_reforms)

    def test_mutual_exclusion_secret_police_blocks_equality(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 8
        _apply_reform_plan(player, {"reforms": ["secret_police"]}, balance)
        self.assertIn("secret_police", player.completed_reforms)

        enacted, _ = _apply_reform_plan(player, {"reforms": ["social_relief"]}, balance)

        self.assertEqual(enacted, [])
        self.assertNotIn("social_relief", player.completed_reforms)

    def test_soviet_state_does_not_lock_route_but_resets_egalitarianism(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 8
        player.ideology_levels["egalitarianism"] = 8

        first, _ = _apply_reform_plan(player, {"reforms": ["soviet_state"]}, balance)
        second, _ = _apply_reform_plan(player, {"reforms": ["constitution"]}, balance)

        self.assertEqual(first, ["soviet_state"])
        self.assertEqual(second, ["constitution"])
        self.assertEqual(player.ideology_levels["egalitarianism"], 0)

    def test_fascist_state_does_not_lock_route_but_resets_nationalism_and_grants_military_bonus(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 12
        initial_army_cap = player.army_cap
        player.ideology_levels["nationalism"] = 8

        first, _ = _apply_reform_plan(player, {"reforms": ["fascist_state"]}, balance)
        second, _ = _apply_reform_plan(player, {"reforms": ["social_relief"]}, balance)

        self.assertEqual(first, ["fascist_state"])
        self.assertEqual(second, ["social_relief"])
        self.assertEqual(player.ideology_levels["nationalism"], 0)
        self.assertEqual(player.army_cap, initial_army_cap + 3)
        self.assertEqual(player.permanent_effects["overseasMarketCapacityBonus"], 2)

    def test_secret_police_locks_route_and_grants_terminal_control_effects(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 8
        player.ideology_levels = {"liberalism": 7, "egalitarianism": 6, "nationalism": 5}

        enacted, _ = _apply_reform_plan(player, {"reforms": ["secret_police"]}, balance)

        self.assertEqual(enacted, ["secret_police"])
        self.assertEqual(player.base_admin_capacity, 2)
        self.assertEqual(player.administration_capacity, 4)
        self.assertEqual(player.ideology_levels, {"liberalism": 4, "egalitarianism": 3, "nationalism": 2})

    def test_all_reforms_have_effect_unlock_or_route_lock(self) -> None:
        balance = get_balance_config()

        noops = [
            reform.reform_id
            for reform in balance.reforms.reforms.values()
            if not reform.effects and not reform.unlocks_policies and not reform.blocks_other_paths
        ]

        self.assertEqual(noops, [])

    def test_all_reforms_have_direct_configured_effect(self) -> None:
        balance = get_balance_config()

        missing_effects = [
            reform.reform_id
            for reform in balance.reforms.reforms.values()
            if not reform.effects
        ]

        self.assertEqual(missing_effects, [])

    def test_terminal_reforms_lock_expected_paths(self) -> None:
        balance = get_balance_config()

        self.assertEqual(
            set(balance.reforms.reforms["trust_system"].blocks_other_paths),
            {"equality", "national"},
        )
        self.assertEqual(
            set(balance.reforms.reforms["planned_economy"].blocks_other_paths),
            {"freedom", "national"},
        )
        self.assertEqual(
            set(balance.reforms.reforms["secret_police"].blocks_other_paths),
            {"freedom", "equality"},
        )
        self.assertEqual(balance.reforms.reforms["soviet_state"].blocks_other_paths, ())
        self.assertEqual(balance.reforms.reforms["fascist_state"].blocks_other_paths, ())

    def test_reform_ideology_effect(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 2
        # Pin ideology levels so the delta math is deterministic regardless of
        # what countries.json seeds for Britain.
        player.ideology_levels = {"liberalism": 5, "egalitarianism": 5, "nationalism": 5}

        _apply_reform_plan(player, {"reforms": ["constitution"]}, balance)

        self.assertEqual(player.ideology_levels["liberalism"], 4)
        self.assertEqual(player.ideology_levels["egalitarianism"], 4)
        self.assertEqual(player.ideology_levels["nationalism"], 4)

    def test_planned_economy_ratio_override(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 6

        _apply_reform_plan(player, {"reforms": ["planned_economy"]}, balance)

        self.assertIn("planned_economy", player.completed_reforms)
        self.assertEqual(player.income_allocation_ratio["domesticMarket"], 4.0)
        self.assertEqual(player.income_allocation_ratio["factory"], 1.0)
        self.assertEqual(player.income_allocation_ratio["governmentFiscal"], 5.0)


class PolicyActivationTests(unittest.TestCase):
    def test_activate_policy_deducts_admin(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 5
        player.income_allocation_ratio = {
            "domesticMarket": 5.0,
            "factory": 3.0,
            "governmentFiscal": 2.0,
        }

        activated = _apply_policy_plan(
            player, {"activatePolicies": ["raise_commercial_tax"]}, balance
        )

        self.assertEqual(activated, ["raise_commercial_tax"])
        # 激活政策消耗 1 行政点数
        self.assertEqual(player.administration_capacity, 4)
        self.assertIn("raise_commercial_tax", player.active_policies)
        self.assertEqual(player.income_allocation_ratio["factory"], 2.0)
        self.assertEqual(player.income_allocation_ratio["governmentFiscal"], 3.0)

    def test_deactivate_policy(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 5
        player.income_allocation_ratio = {
            "domesticMarket": 5.0,
            "factory": 3.0,
            "governmentFiscal": 2.0,
        }
        _apply_policy_plan(player, {"activatePolicies": ["raise_commercial_tax"]}, balance)
        self.assertIn("raise_commercial_tax", player.active_policies)
        self.assertEqual(player.income_allocation_ratio["factory"], 2.0)

        _apply_policy_plan(
            player, {"deactivatePolicies": ["raise_commercial_tax"]}, balance
        )

        self.assertNotIn("raise_commercial_tax", player.active_policies)
        self.assertEqual(player.income_allocation_ratio["factory"], 3.0)
        self.assertEqual(player.income_allocation_ratio["governmentFiscal"], 2.0)

    def test_activate_policy_respects_remaining_admin_points(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 1

        first = _apply_policy_plan(player, {"activatePolicies": ["raise_commercial_tax"]}, balance)
        second = _apply_policy_plan(player, {"activatePolicies": ["lower_commercial_tax"]}, balance)

        self.assertEqual(first, ["raise_commercial_tax"])
        self.assertEqual(second, [])
        self.assertEqual(player.active_policies, ["raise_commercial_tax"])

    def test_social_relief_unlocks_social_welfare_policy(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 2
        player.ideology_levels["egalitarianism"] = 4
        player.income_allocation_ratio = {
            "domesticMarket": 3.0,
            "factory": 3.0,
            "governmentFiscal": 4.0,
        }

        blocked = _apply_policy_plan(player, {"activatePolicies": ["social_welfare"]}, balance)
        player.completed_reforms.append("social_relief")
        activated = _apply_policy_plan(player, {"activatePolicies": ["social_welfare"]}, balance)

        self.assertEqual(blocked, [])
        self.assertEqual(activated, ["social_welfare"])
        _apply_active_policy_effects(player, balance)
        self.assertEqual(player.ideology_levels["egalitarianism"], 3)
        self.assertEqual(player.income_allocation_ratio["domesticMarket"], 3.5)
        self.assertEqual(player.income_allocation_ratio["governmentFiscal"], 3.5)

    def test_strike_negotiation_sets_half_production_multiplier(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.completed_reforms.append("labor_union")
        player.administration_capacity = 2
        player.ideology_levels["egalitarianism"] = 8

        activated = _apply_policy_plan(player, {"activatePolicies": ["strike_negotiation"]}, balance)

        self.assertEqual(activated, ["strike_negotiation"])
        self.assertEqual(player.temporary_effects["productionOutputMultiplier"], 0.5)
        _apply_active_policy_effects(player, balance)
        self.assertEqual(player.ideology_levels["egalitarianism"], 3)

    def test_total_mobilization_order_converts_non_idle_capacity_to_army(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.completed_reforms.append("total_mobilization")
        player.administration_capacity = 2
        player.army = {"army": 1}
        player.production_capacity = {"idle": 4, "handicraft": 4, "mechanized": 2}
        player.phase1_economy.capacity_by_mode.update(player.production_capacity)

        activated = _apply_policy_plan(player, {"activatePolicies": ["total_mobilization_order"]}, balance)

        self.assertEqual(activated, ["total_mobilization_order"])
        self.assertEqual(player.army["army"], 4)
        self.assertEqual(player.production_capacity["idle"], 4)
        self.assertEqual(player.production_capacity["handicraft"], 2)
        self.assertEqual(player.production_capacity["mechanized"], 1)
        _apply_active_policy_effects(player, balance)
        self.assertEqual(player.ideology_levels["egalitarianism"], 5)

    def test_secret_police_suppression_consumes_army_and_reduces_target_pressure(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.completed_reforms.append("secret_police")
        player.administration_capacity = 2
        player.army = {"army": 5}
        player.ideology_levels["liberalism"] = 8

        activated = _apply_policy_plan(player, {"activatePolicies": ["suppress_liberalism"]}, balance)

        self.assertEqual(activated, ["suppress_liberalism"])
        self.assertEqual(player.army["army"], 2)
        self.assertEqual(player.ideology_levels["liberalism"], 4)

class SettlementEffectsTests(unittest.TestCase):
    def test_tax_policy_ratio_effect(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 5
        player.base_admin_capacity = 5
        player.national_income = 70
        player.budget_pools = {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0}
        for region in snapshot.region_states:
            region.controller = None
        player.income_allocation_ratio = {
            "domesticMarket": 3.0,
            "factory": 3.0,
            "governmentFiscal": 4.0,
        }
        _apply_policy_plan(player, {"activatePolicies": ["raise_commercial_tax"]}, balance)

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        # ratioDelta affected this settlement's allocation: 3:2:5 of 70 -> 21 / 14 / 35.
        allocation = resolution.generated_logs[0]["details"]["budgetAllocation"]
        self.assertEqual(allocation["domesticMarket"], 21)
        self.assertEqual(allocation["factory"], 14)
        self.assertEqual(allocation["governmentFiscal"], 35)
        # After settlement, the policy expires before the next decision workspace is built.
        self.assertEqual(updated.active_policies, [])
        self.assertEqual(updated.administration_capacity, 5)
        self.assertEqual(updated.income_allocation_ratio["factory"], 3.0)
        self.assertEqual(updated.income_allocation_ratio["governmentFiscal"], 4.0)
        self.assertEqual(updated.income_allocation_ratio["domesticMarket"], 3.0)

    def test_policy_expiry_refreshes_admin_without_negative_capacity(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 1
        player.base_admin_capacity = 1
        player.income_allocation_ratio = {
            "domesticMarket": 5.0,
            "factory": 3.0,
            "governmentFiscal": 2.0,
        }
        _apply_policy_plan(player, {"activatePolicies": ["raise_commercial_tax"]}, balance)
        # 行政点数消耗后归零，但不影响政策在结算阶段生效
        player.administration_capacity = 0

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        self.assertEqual(updated.administration_capacity, 1)
        self.assertEqual(updated.active_policies, [])
        self.assertEqual(updated.income_allocation_ratio["factory"], 3.0)
        self.assertEqual(updated.income_allocation_ratio["governmentFiscal"], 2.0)

    def test_policy_ratio_effect_is_reversed_on_next_decision_round(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 5
        player.base_admin_capacity = 5
        player.income_allocation_ratio = {
            "domesticMarket": 5.0,
            "factory": 3.0,
            "governmentFiscal": 2.0,
        }

        _apply_policy_plan(player, {"activatePolicies": ["raise_commercial_tax"]}, balance)
        self.assertEqual(player.income_allocation_ratio["factory"], 2.0)
        self.assertEqual(player.income_allocation_ratio["governmentFiscal"], 3.0)

        resolution = resolve_decision_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        self.assertEqual(updated.active_policies, [])
        self.assertEqual(updated.administration_capacity, 5)
        self.assertEqual(updated.income_allocation_ratio["factory"], 3.0)
        self.assertEqual(updated.income_allocation_ratio["governmentFiscal"], 2.0)

    def test_permanent_reform_tech_points(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 2
        player.tech_points = 5
        _apply_reform_plan(player, {"reforms": ["compulsory_education"]}, balance)
        self.assertIn("compulsory_education", player.completed_reforms)

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        self.assertEqual(updated.tech_points, 6)

    def test_expand_army_policy_permanently_increases_army_cap_and_expires(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 2
        player.base_admin_capacity = 2
        player.budget_pools["governmentFiscal"] = 100
        initial_army_cap = int(player.army_cap)

        activated = _apply_policy_plan(player, {"activatePolicies": ["expand_army"]}, balance)

        self.assertEqual(activated, ["expand_army"])
        self.assertEqual(player.budget_pools["governmentFiscal"], 92)
        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        self.assertEqual(updated.army_cap, initial_army_cap + 1)
        self.assertEqual(updated.active_policies, [])
        self.assertEqual(updated.administration_capacity, 2)

    def test_private_research_policy_facility_bonus_is_one_round_only(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.completed_reforms = ["patent_system"]
        player.administration_capacity = 2
        player.base_admin_capacity = 2
        player.budget_pools["governmentFiscal"] = 100
        player.active_research = "spinning_jenny"
        player.research_progress = {"spinning_jenny": 0}
        player.research_facilities = {}

        activated = _apply_policy_plan(player, {"activatePolicies": ["private_research"]}, balance)

        self.assertEqual(activated, ["private_research"])
        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        self.assertEqual(updated.research_progress["spinning_jenny"], 1)
        self.assertEqual(updated.research_facilities.get("academy", 0), 0)
        self.assertEqual(updated.active_policies, [])

    def test_policy_ideology_delta_is_permanent_once(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 2
        player.base_admin_capacity = 2
        player.ideology_levels = {"liberalism": 2, "egalitarianism": 3, "nationalism": 1}
        player.national_income = 0

        activated = _apply_policy_plan(player, {"activatePolicies": ["raise_commercial_tax"]}, balance)

        self.assertEqual(activated, ["raise_commercial_tax"])
        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        # Natural low-domestic-demand progression adds +1 egalitarianism in
        # this setup; the policy's own +1 is a permanent one-time change.
        self.assertEqual(updated.ideology_levels["egalitarianism"], 5)
        self.assertEqual(updated.active_policies, [])
        self.assertEqual(updated.administration_capacity, 2)

    def test_build_fleet_no_longer_grants_market_capacity(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.budget_pools["governmentFiscal"] = 100
        initial_bonus = get_effect_bonus(player, "overseasMarketCapacityBonus")
        initial_fleets = int(player.navy.get("fleets", 0))

        spent = _apply_military_plan(
            player,
            {"militaryActions": [{"actionId": "build_fleet"}], "diplomacyActions": []},
            balance,
            snapshot,
        )

        self.assertEqual(spent, 8)
        self.assertEqual(int(player.navy.get("fleets", 0)), initial_fleets + 1)
        self.assertEqual(get_effect_bonus(player, "overseasMarketCapacityBonus"), initial_bonus)
        reset_temporary_effects(player)
        self.assertEqual(get_effect_bonus(player, "overseasMarketCapacityBonus"), initial_bonus)

    def test_trade_promotion_capacity_is_permanent_without_domestic_ratio_change(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 5
        player.base_admin_capacity = 5
        player.budget_pools["governmentFiscal"] = 100
        player.national_income = 70
        player.income_allocation_ratio = {
            "domesticMarket": 3.0,
            "factory": 3.0,
            "governmentFiscal": 4.0,
        }

        spent = _apply_government_plan(
            player,
            {"strategySelections": [{"actionId": "trade_promotion"}]},
            balance,
        )

        self.assertEqual(spent, 0)
        self.assertAlmostEqual(player.income_allocation_ratio["domesticMarket"], 3.0)
        self.assertEqual(get_effect_bonus(player, "domesticMarketCapacityBonus"), 0)
        self.assertEqual(get_effect_bonus(player, "overseasMarketCapacityBonus"), 2)
        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        self.assertEqual(updated.income_allocation_ratio["domesticMarket"], 3.0)
        self.assertEqual(updated.income_allocation_ratio["governmentFiscal"], 4.0)
        self.assertEqual(get_effect_bonus(updated, "domesticMarketCapacityBonus"), 0)
        self.assertEqual(get_effect_bonus(updated, "overseasMarketCapacityBonus"), 2)


if __name__ == "__main__":
    unittest.main()
