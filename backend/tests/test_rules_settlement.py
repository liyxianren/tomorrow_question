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
from app.modules.rules.colonization import colony_raw_material_yield
from app.modules.rules.decision import _apply_policy_plan
from app.modules.rules.settlement import resolve_settlement_phase


def build_snapshot() -> GameSnapshot:
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
    return snapshot


def get_player(snapshot: GameSnapshot, player_id: str) -> PlayerState:
    return next(player for player in snapshot.player_states if player.player_id == player_id)


class SettlementRulesTests(unittest.TestCase):
    def test_settlement_allocates_national_income_back_into_budget_pools(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.domestic_sales_revenue = 7
        britain.overseas_sales_revenue = 5
        britain.national_income = 12
        britain.cumulative_national_income = 20
        britain.budget_pools = {"domesticMarket": 8, "factory": 9, "governmentFiscal": 11}

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated_britain = get_player(resolution.updated_snapshot, "player-1")

        # Default 3:3:4 split: 12 -> domestic 3, factory 3, government 6.
        self.assertEqual(updated_britain.budget_pools["domesticMarket"], 11)
        self.assertEqual(updated_britain.budget_pools["factory"], 12)
        self.assertEqual(updated_britain.budget_pools["governmentFiscal"], 17)
        self.assertEqual(updated_britain.national_income, 0)
        self.assertEqual(updated_britain.domestic_sales_revenue, 0)
        self.assertEqual(updated_britain.overseas_sales_revenue, 0)

    def test_settlement_adds_colony_raw_materials_for_next_round(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.national_income = 12
        britain.cumulative_national_income = 20
        britain.budget_pools = {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0}
        starting_raw_materials = int(britain.phase1_economy.raw_materials)
        americas = next(region for region in snapshot.region_states if region.region_id == "americas")
        americas.controller = britain.country.value

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        summary_card = next(card for card in resolution.summary["summaryCards"] if card["playerId"] == "player-1")
        generated_log = next(log for log in resolution.generated_logs if log["details"]["playerId"] == "player-1")

        # Colonies now return raw materials for the next round, not direct income.
        self.assertEqual(updated_britain.cumulative_national_income, 32)
        self.assertEqual(updated_britain.budget_pools, {"domesticMarket": 3, "factory": 3, "governmentFiscal": 6})
        self.assertEqual(
            updated_britain.phase1_economy.raw_materials,
            starting_raw_materials + 2 + colony_raw_material_yield(americas),
        )
        self.assertEqual(summary_card["colonyIncome"], 0)
        self.assertEqual(generated_log["details"]["colonyIncome"], 0)

    def test_settlement_uses_current_income_allocation_ratio(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.national_income = 16
        britain.cumulative_national_income = 20
        britain.budget_pools = {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0}
        britain.income_allocation_ratio = {
            "domesticMarket": 6.0,
            "factory": 3.0,
            "governmentFiscal": 1.0,
        }

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        summary_card = next(card for card in resolution.summary["summaryCards"] if card["playerId"] == "player-1")

        # Full ratio 6:3:1 of 16 -> domestic=9, factory=4, government gets the remainder 3.
        self.assertEqual(summary_card["budgetAllocation"], {"domesticMarket": 9, "factory": 4, "governmentFiscal": 3})
        self.assertEqual(updated_britain.budget_pools, {"domesticMarket": 9, "factory": 4, "governmentFiscal": 3})

    def test_activated_tax_policy_affects_this_settlement_and_consumes_admin_point(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.national_income = 16
        britain.budget_pools = {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0}
        britain.administration_capacity = 1
        britain.base_admin_capacity = 1
        britain.ideology_levels = {"liberalism": 0, "egalitarianism": 9, "nationalism": 0}

        _apply_policy_plan(
            britain,
            {"activatePolicies": ["lower_commercial_tax"]},
            get_balance_config(),
        )
        self.assertEqual(britain.income_allocation_ratio["factory"], 4.0)
        self.assertEqual(britain.income_allocation_ratio["governmentFiscal"], 3.0)

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated_britain = get_player(resolution.updated_snapshot, "player-1")

        self.assertNotIn("lower_commercial_tax", updated_britain.active_policies)
        # 政策在结算后清理，下回合恢复基础行政力。
        self.assertEqual(updated_britain.administration_capacity, 1)
        # ratio 3:4:3 of 16 → domestic=4, factory=6, gov=6.
        self.assertEqual(updated_britain.budget_pools, {"domesticMarket": 4, "factory": 6, "governmentFiscal": 6})
        self.assertEqual(updated_britain.income_allocation_ratio["domesticMarket"], 3.0)
        self.assertEqual(updated_britain.income_allocation_ratio["factory"], 3.0)
        self.assertEqual(updated_britain.income_allocation_ratio["governmentFiscal"], 4.0)


if __name__ == "__main__":
    unittest.main()
