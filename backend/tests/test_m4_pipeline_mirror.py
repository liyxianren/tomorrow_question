"""M4 tests: per-phase rule pipeline mirrors phase-1 economy state.

These tests prove that decision/market/settlement rule resolvers update
``player_state.phase1_economy`` to reflect the real per-round changes coming
out of legacy gameplay, without altering legacy field semantics.

References:
- backend/app/modules/rules/decision.py
- backend/app/modules/rules/market.py
- backend/app/modules/rules/settlement.py
- backend/app/modules/rules/phase1_economy.py
- docs/2.0迁移前逻辑推演与计划.md
"""
from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, PlayerState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.rules.decision import resolve_decision_phase
from app.modules.rules.market import resolve_market_phase
from app.modules.rules.phase1_economy import (
    calculate_domestic_demand,
    calculate_domestic_price,
    calculate_equilibrium_price,
)
from app.modules.rules.settlement import resolve_settlement_phase


def _build_snapshot(phase: GamePhase = GamePhase.DECISION) -> GameSnapshot:
    game = create_game(room_code="ROOM01", game_id="game-m4")
    snapshot = create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-m4",
        player_assignments={
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        },
    )
    snapshot.phase = phase
    return snapshot


def _get_player(snapshot: GameSnapshot, player_id: str) -> PlayerState:
    return next(player for player in snapshot.player_states if player.player_id == player_id)


def _build_turn_input(player_id: str, phase: GamePhase, payload: dict[str, object]) -> PlayerTurnInput:
    return PlayerTurnInput(
        game_id="game-m4",
        round_no=1,
        phase=phase,
        player_id=player_id,
        submission_status=PlayerSubmissionStatus.SUBMITTED,
        payload=payload,
        submitted_at=None,
        is_timeout_generated=False,
    )


def _empty_military_plan() -> dict[str, object]:
    return {
        "unlockColonization": False,
        "militaryActions": [],
        "diplomacyActions": [],
        "colonizationActions": [],
    }


class DecisionPhaseMirrorsPhase1EconomyTests(unittest.TestCase):
    def test_decision_mirrors_raw_material_usage_into_phase1_raw_materials(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.raw_material_usage = {"steel": 2, "cotton": 1}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    {
                        "factoryPlan": {
                            "productionOrders": [],
                            "expansionOrders": [],
                            "upgradeOrders": [],
                            "newFactoryOrders": [],
                        },
                        "domesticMarketPlan": {"domesticMarketActions": []},
                        "governmentPlan": {
                            "pointPurchases": [],
                            "strategySelections": [],
                            "techResearch": [],
                        },
                        "militaryPlan": _empty_military_plan(),
                    },
                )
            ],
        )

        updated_britain = _get_player(resolution.updated_snapshot, "player-1")
        # raw_materials is now seeded from country config (25) and preserved by the
        # mirror — it is no longer derived from legacy raw_material_usage.
        self.assertEqual(updated_britain.phase1_economy.raw_materials, 25)

    def test_decision_does_not_change_legacy_budget_or_national_income(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        original_pools = dict(britain.budget_pools)
        original_income = britain.national_income
        original_cumulative = britain.cumulative_national_income

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    {
                        "factoryPlan": {
                            "productionOrders": [],
                            "expansionOrders": [],
                            "upgradeOrders": [],
                            "newFactoryOrders": [],
                        },
                        "domesticMarketPlan": {"domesticMarketActions": []},
                        "governmentPlan": {
                            "pointPurchases": [],
                            "strategySelections": [],
                            "techResearch": [],
                        },
                        "militaryPlan": _empty_military_plan(),
                    },
                )
            ],
        )

        updated_britain = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.budget_pools, original_pools)
        self.assertEqual(updated_britain.national_income, original_income)
        self.assertEqual(updated_britain.cumulative_national_income, original_cumulative)


class MarketPhaseMirrorsPhase1EconomyTests(unittest.TestCase):
    def test_market_writes_phase1_market_metrics_with_demand_supply_and_prices(self) -> None:
        snapshot = _build_snapshot(GamePhase.MARKET)
        britain = _get_player(snapshot, "player-1")
        # Seed phase1_economy as if decision had just run.
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0,
            "handicraft": 4,
            "mechanized": 0,
            "steam": 0,
            "electrified": 0,
        }
        britain.phase1_economy.goods_inventory = 5
        britain.budget_pools = {"domesticMarket": 12, "factory": 14, "governmentFiscal": 22}
        britain.goods_stock = {"coal": 3, "cotton": 2}

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input("player-1", GamePhase.MARKET, {"saleOrders": []})
            ],
        )

        updated_britain = _get_player(resolution.updated_snapshot, "player-1")
        expected_demand = calculate_domestic_demand(britain.phase1_economy.capacity_by_mode)
        expected_equilibrium = calculate_equilibrium_price(
            consumption_pool=Decimal(12), demand=expected_demand
        )
        expected_final = calculate_domestic_price(
            equilibrium_price=expected_equilibrium,
            supply=Decimal(5),
            demand=expected_demand,
            minimum_price=1,
        )
        metrics = updated_britain.phase1_economy.market_metrics
        self.assertAlmostEqual(metrics["demand"], float(expected_demand), places=6)
        self.assertEqual(metrics["supply"], 5.0)
        self.assertAlmostEqual(metrics["equilibriumPrice"], float(expected_equilibrium), places=6)
        self.assertAlmostEqual(metrics["finalPrice"], float(expected_final), places=6)
        self.assertEqual(metrics["soldQuantity"], 0.0)
        self.assertEqual(metrics["unsoldQuantity"], 5.0)
        self.assertEqual(metrics["revenue"], 0.0)

    def test_market_does_not_change_legacy_goods_stock_outside_pipeline(self) -> None:
        snapshot = _build_snapshot(GamePhase.MARKET)
        britain = _get_player(snapshot, "player-1")
        britain.goods_stock = {"coal": 4}
        # No sale orders -> goods_stock should stay {"coal": 4}.

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input("player-1", GamePhase.MARKET, {"saleOrders": []})
            ],
        )

        updated_britain = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.goods_stock["coal"], 4)
        self.assertEqual(updated_britain.domestic_sales_revenue, 0)
        self.assertEqual(updated_britain.overseas_sales_revenue, 0)
        self.assertEqual(updated_britain.national_income, 0)


class SettlementPhaseMirrorsPhase1EconomyTests(unittest.TestCase):
    def test_settlement_does_not_overwrite_legacy_income_allocation_ratio(self) -> None:
        snapshot = _build_snapshot(GamePhase.SETTLEMENT)
        britain = _get_player(snapshot, "player-1")
        britain.income_allocation_ratio = {
            "domesticMarket": 2.5,
            "factory": 3.0,
            "governmentFiscal": 4.5,
        }
        britain.national_income = 50

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])

        updated_britain = _get_player(resolution.updated_snapshot, "player-1")
        # Legacy 3-key ratio is preserved by the settlement (still raw weights).
        self.assertEqual(updated_britain.income_allocation_ratio["domesticMarket"], 2.5)
        self.assertEqual(updated_britain.income_allocation_ratio["factory"], 3.0)
        self.assertEqual(updated_britain.income_allocation_ratio["governmentFiscal"], 4.5)

    def test_settlement_with_zero_total_ratio_keeps_phase1_default(self) -> None:
        snapshot = _build_snapshot(GamePhase.SETTLEMENT)
        britain = _get_player(snapshot, "player-1")
        britain.income_allocation_ratio = {
            "domesticMarket": 0.0,
            "factory": 0.0,
            "governmentFiscal": 0.0,
        }

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])

        updated_britain = _get_player(resolution.updated_snapshot, "player-1")
        # Untouched -> the default 5:3:2 split survives.
        self.assertEqual(updated_britain.phase1_economy.income_allocation_ratio["consumption"], 0.5)
        self.assertEqual(updated_britain.phase1_economy.income_allocation_ratio["investment"], 0.3)
        self.assertEqual(updated_britain.phase1_economy.income_allocation_ratio["fiscal"], 0.2)

if __name__ == "__main__":
    unittest.main()
