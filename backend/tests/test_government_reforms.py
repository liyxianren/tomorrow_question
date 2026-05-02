"""政府改革与常规政策测试 (Packet 3).

These tests cover:
  - reform enactment and admin-capacity deduction
  - mutual exclusion between freedom/equality/national paths
  - policy activation, requires_reform gating, and deactivation
  - one-shot effects (ideology delta, ratio override) at enact time
  - per-turn settlement effects (admin upkeep, ratio delta, permanent
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
from app.modules.game_state.models import GameSnapshot, PlayerState
from app.modules.rules.decision import _apply_policy_plan, _apply_reform_plan
from app.modules.rules.settlement import resolve_settlement_phase


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

    def test_mutual_exclusion_soviet_blocks_freedom(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        # First enact soviet_state (admin cost 6).
        player.administration_capacity = 8
        _apply_reform_plan(player, {"reforms": ["soviet_state"]}, balance)
        self.assertIn("soviet_state", player.completed_reforms)

        enacted, _ = _apply_reform_plan(player, {"reforms": ["constitution"]}, balance)

        self.assertEqual(enacted, [])
        self.assertNotIn("constitution", player.completed_reforms)

    def test_mutual_exclusion_fascist_blocks_equality(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 8
        _apply_reform_plan(player, {"reforms": ["fascist_state"]}, balance)
        self.assertIn("fascist_state", player.completed_reforms)

        enacted, _ = _apply_reform_plan(player, {"reforms": ["social_relief"]}, balance)

        self.assertEqual(enacted, [])
        self.assertNotIn("social_relief", player.completed_reforms)

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
        self.assertEqual(player.income_allocation_ratio["factory"], 0.0)
        self.assertEqual(player.income_allocation_ratio["domesticMarket"], 6.0)
        self.assertEqual(player.income_allocation_ratio["governmentFiscal"], 4.0)


class PolicyActivationTests(unittest.TestCase):
    def test_activate_policy_deducts_admin(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 5

        activated = _apply_policy_plan(
            player, {"activatePolicies": ["raise_consumption_tax"]}, balance
        )

        self.assertEqual(activated, ["raise_consumption_tax"])
        # admin_cost_per_turn is now deducted exclusively at settlement, not activation
        self.assertEqual(player.administration_capacity, 5)
        self.assertIn("raise_consumption_tax", player.active_policies)

    def test_policy_requires_reform(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 5
        # No stock_market reform → public_offering should be blocked.

        activated = _apply_policy_plan(
            player, {"activatePolicies": ["public_offering"]}, balance
        )

        self.assertEqual(activated, [])
        self.assertNotIn("public_offering", player.active_policies)
        self.assertEqual(player.administration_capacity, 5)

    def test_deactivate_policy(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 5
        _apply_policy_plan(player, {"activatePolicies": ["raise_consumption_tax"]}, balance)
        self.assertIn("raise_consumption_tax", player.active_policies)

        _apply_policy_plan(
            player, {"deactivatePolicies": ["raise_consumption_tax"]}, balance
        )

        self.assertNotIn("raise_consumption_tax", player.active_policies)


class SettlementEffectsTests(unittest.TestCase):
    def test_tax_policy_ratio_effect(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 5
        player.income_allocation_ratio = {
            "domesticMarket": 3.0,
            "factory": 3.0,
            "governmentFiscal": 4.0,
        }
        _apply_policy_plan(player, {"activatePolicies": ["raise_consumption_tax"]}, balance)

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        # ratioDelta is normalized: consumption→domesticMarket (-1), fiscal→governmentFiscal (+1).
        self.assertEqual(updated.income_allocation_ratio["domesticMarket"], 2.0)
        self.assertEqual(updated.income_allocation_ratio["governmentFiscal"], 5.0)
        self.assertEqual(updated.income_allocation_ratio["factory"], 3.0)
        # Admin upkeep deducts 1 only in settlement (no longer at activation).
        self.assertEqual(updated.administration_capacity, 4)

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

    def test_social_welfare_transfer(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 5
        player.budget_pools = {"domesticMarket": 0, "factory": 0, "governmentFiscal": 100}
        # No base_income floor and national_income=0 → no allocation delta this turn.
        player.income_allocation_ratio = {
            "domesticMarket": 3.0,
            "factory": 3.0,
            "governmentFiscal": 4.0,
        }
        _apply_reform_plan(player, {"reforms": ["social_relief"]}, balance)
        _apply_policy_plan(player, {"activatePolicies": ["social_welfare"]}, balance)
        self.assertIn("social_welfare", player.active_policies)

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        # national_income=0 → no pool delta from allocation.
        # fiscal pre-transfer = 100; transfer = int(100 * 0.1) = 10.
        self.assertEqual(updated.budget_pools["governmentFiscal"], 90)
        self.assertEqual(updated.budget_pools["domesticMarket"], 10)
        self.assertEqual(updated.budget_pools["factory"], 0)


if __name__ == "__main__":
    unittest.main()
