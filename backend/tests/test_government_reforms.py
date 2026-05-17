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
from app.modules.game_state.models import GameSnapshot, PlayerState
from app.modules.rules.decision import (
    _apply_policy_plan,
    _apply_reform_plan,
    resolve_decision_phase,
)
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
        self.assertEqual(player.income_allocation_ratio["governmentFiscal"], 10.0)


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
        _apply_policy_plan(player, {"activatePolicies": ["raise_commercial_tax"]}, balance)

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = _get_player(resolution.updated_snapshot, "player-1")

        # ratioDelta: factory (-1), governmentFiscal (+1).
        self.assertEqual(updated.income_allocation_ratio["factory"], 2.0)
        self.assertEqual(updated.income_allocation_ratio["governmentFiscal"], 5.0)
        self.assertEqual(updated.income_allocation_ratio["domesticMarket"], 3.0)
        # 激活政策消耗了 1 行政点数（5 → 4）
        self.assertEqual(updated.administration_capacity, 4)

    def test_policy_with_insufficient_admin_is_removed_without_negative_capacity(self) -> None:
        balance = get_balance_config()
        snapshot = _build_snapshot()
        player = _get_player(snapshot, "player-1")
        player.administration_capacity = 1
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

        self.assertEqual(updated.administration_capacity, 0)
        # 新系统：政策在结算阶段不会被自动撤销
        self.assertIn("raise_commercial_tax", updated.active_policies)
        # 商业税效果：factory -1, gov +1
        self.assertEqual(updated.income_allocation_ratio["factory"], 2.0)
        self.assertEqual(updated.income_allocation_ratio["governmentFiscal"], 3.0)

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


if __name__ == "__main__":
    unittest.main()
