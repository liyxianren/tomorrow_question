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

        # domesticMarket is frozen — gets 0 allocation, no drain.
        # factory_w=3, gov_w=3 of ratio 4:3:3 → factory gets 6, gov gets 6.
        self.assertEqual(updated_britain.budget_pools["domesticMarket"], 8)
        self.assertEqual(updated_britain.budget_pools["factory"], 15)
        self.assertEqual(updated_britain.budget_pools["governmentFiscal"], 17)
        self.assertEqual(updated_britain.national_income, 0)
        self.assertEqual(updated_britain.domestic_sales_revenue, 0)
        self.assertEqual(updated_britain.overseas_sales_revenue, 0)

    def test_settlement_adds_colony_income_to_national_income_before_ratio_allocation(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.national_income = 12
        britain.cumulative_national_income = 20
        britain.budget_pools = {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0}
        americas = next(region for region in snapshot.region_states if region.region_id == "americas")
        americas.controller = britain.country.value

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        summary_card = next(card for card in resolution.summary["summaryCards"] if card["playerId"] == "player-1")
        generated_log = next(log for log in resolution.generated_logs if log["details"]["playerId"] == "player-1")

        # National income 12 + colony income 5 = 17, split by factory_w:gov_w = 3:3 → 8 / 9.
        # domesticMarket frozen, no drain.
        self.assertEqual(updated_britain.cumulative_national_income, 37)
        self.assertEqual(updated_britain.budget_pools, {"domesticMarket": 0, "factory": 8, "governmentFiscal": 9})
        self.assertEqual(summary_card["colonyIncome"], 5)
        self.assertEqual(generated_log["details"]["colonyIncome"], 5)

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

        # domesticMarket frozen — factory_w:gov_w = 3:1 of 16 → factory=12, gov=4.
        self.assertEqual(summary_card["budgetAllocation"], {"domesticMarket": 0, "factory": 12, "governmentFiscal": 4})
        self.assertEqual(updated_britain.budget_pools, {"domesticMarket": 0, "factory": 12, "governmentFiscal": 4})

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
        self.assertEqual(britain.income_allocation_ratio["governmentFiscal"], 2.0)

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated_britain = get_player(resolution.updated_snapshot, "player-1")

        self.assertIn("lower_commercial_tax", updated_britain.active_policies)
        # 激活政策消耗了 1 行政点数
        self.assertEqual(updated_britain.administration_capacity, 0)
        # factory_w=4, gov_w=2 of 16 → factory=10, gov=6.
        self.assertEqual(updated_britain.budget_pools, {"domesticMarket": 0, "factory": 10, "governmentFiscal": 6})


if __name__ == "__main__":
    unittest.main()
