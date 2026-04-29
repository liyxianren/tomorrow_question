"""M4 tests: workspace phase1Economy block exposes computed preview fields.

Verifies that decision/market/settlement workspaces enrich the phase1Economy
block with productionModes metadata, demand/price preview, and 5:3:2 pool delta
so that the frontend has everything needed without recomputing locally.
"""
from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.workspaces import (
    build_decision_player_workspace,
    build_market_player_workspace,
    build_settlement_player_workspace,
)
from app.modules.rules.phase1_economy import (
    allocate_revenue_to_pools,
    calculate_domestic_demand,
    calculate_domestic_price,
    calculate_equilibrium_price,
)


def _build_snapshot():
    game = create_game(room_code="ROOM01", game_id="game-m4-enrich")
    return create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-m4-enrich",
        player_assignments={
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        },
    )


def _get_player(snapshot, player_id):
    return next(p for p in snapshot.player_states if p.player_id == player_id)


class DecisionWorkspaceProductionModesTests(unittest.TestCase):
    def test_production_modes_has_five_entries_in_order(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")

        workspace = build_decision_player_workspace(snapshot, britain)
        modes = workspace["phase1Economy"]["productionModes"]

        self.assertEqual(len(modes), 5)
        self.assertEqual(
            [m["mode"] for m in modes],
            ["idle", "handicraft", "mechanized", "steam", "electrified"],
        )

    @unittest.skip("Phase 3 migration: old tech tree behavior, to be rewritten in Task 3-4")
    def test_production_modes_carry_metadata(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")

        workspace = build_decision_player_workspace(snapshot, britain)
        modes = {m["mode"]: m for m in workspace["phase1Economy"]["productionModes"]}

        handicraft = modes["handicraft"]
        self.assertEqual(handicraft["outputRatio"], 1)
        self.assertEqual(handicraft["demandCoefficient"], 2)
        self.assertIsNone(handicraft["requiredTech"])
        self.assertTrue(handicraft["isAvailable"])

        mechanized = modes["mechanized"]
        self.assertEqual(mechanized["outputRatio"], 2)
        self.assertEqual(mechanized["demandCoefficient"], 3)
        self.assertEqual(mechanized["requiredTech"], "spinning_jenny")
        self.assertFalse(mechanized["isAvailable"])

        steam = modes["steam"]
        self.assertEqual(steam["outputRatio"], 4)
        self.assertEqual(steam["requiredTech"], "steam_engine")
        self.assertFalse(steam["isAvailable"])

        electrified = modes["electrified"]
        self.assertEqual(electrified["outputRatio"], 8)
        self.assertEqual(electrified["demandCoefficient"], 5)
        self.assertEqual(electrified["requiredTech"], "electrification")
        self.assertFalse(electrified["isAvailable"])

    def test_production_mode_becomes_available_after_tech_unlock(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.unlocked_techs = ["spinning_jenny"]

        workspace = build_decision_player_workspace(snapshot, britain)
        modes = {m["mode"]: m for m in workspace["phase1Economy"]["productionModes"]}

        self.assertTrue(modes["mechanized"]["isAvailable"])
        self.assertFalse(modes["steam"]["isAvailable"])

    def test_production_mode_currentCapacity_mirrors_phase1_state(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode["mechanized"] = 3
        britain.phase1_economy.capacity_by_mode["handicraft"] = 5

        workspace = build_decision_player_workspace(snapshot, britain)
        modes = {m["mode"]: m for m in workspace["phase1Economy"]["productionModes"]}

        self.assertEqual(modes["mechanized"]["currentCapacity"], 3)
        self.assertEqual(modes["handicraft"]["currentCapacity"], 5)


class DecisionWorkspaceMarketPreviewTests(unittest.TestCase):
    def test_domestic_demand_matches_pure_function(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode["handicraft"] = 4
        britain.phase1_economy.capacity_by_mode["mechanized"] = 2

        workspace = build_decision_player_workspace(snapshot, britain)
        phase1 = workspace["phase1Economy"]

        expected = int(calculate_domestic_demand(britain.phase1_economy.capacity_by_mode))
        self.assertEqual(phase1["domesticDemand"], expected)

    def test_equilibrium_price_uses_consumption_pool_and_demand(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode["handicraft"] = 4
        britain.budget_pools["domesticMarket"] = 40

        workspace = build_decision_player_workspace(snapshot, britain)
        phase1 = workspace["phase1Economy"]

        demand = calculate_domestic_demand(britain.phase1_economy.capacity_by_mode)
        expected = float(calculate_equilibrium_price(consumption_pool=40, demand=demand))
        self.assertAlmostEqual(phase1["equilibriumPrice"], expected, places=6)

    def test_domestic_price_preview_changes_with_inventory(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode["handicraft"] = 4
        britain.budget_pools["domesticMarket"] = 40

        # Shortage scenario: supply < demand
        britain.phase1_economy.goods_inventory = 2
        workspace_short = build_decision_player_workspace(snapshot, britain)
        price_short = workspace_short["phase1Economy"]["domesticPricePreview"]

        # Surplus scenario: supply > demand
        britain.phase1_economy.goods_inventory = 100
        workspace_surplus = build_decision_player_workspace(snapshot, britain)
        price_surplus = workspace_surplus["phase1Economy"]["domesticPricePreview"]

        # Shortage drives price up above equilibrium; surplus drives it down (clamped at min=1)
        self.assertGreater(price_short, price_surplus)
        self.assertGreaterEqual(price_surplus, 1.0)

    def test_zero_capacity_yields_zero_demand_and_min_price(self) -> None:
        snapshot = _build_snapshot()
        russia = _get_player(snapshot, "player-5")
        for mode in russia.phase1_economy.capacity_by_mode:
            russia.phase1_economy.capacity_by_mode[mode] = 0
        russia.phase1_economy.goods_inventory = 0

        workspace = build_decision_player_workspace(snapshot, russia)
        phase1 = workspace["phase1Economy"]

        self.assertEqual(phase1["domesticDemand"], 0)
        self.assertEqual(phase1["equilibriumPrice"], 0.0)
        # When demand=0 the price floor is the minimum.
        self.assertEqual(phase1["domesticPricePreview"], 1.0)

    def test_investment_pool_mirrors_factory_budget(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.budget_pools["factory"] = 77

        workspace = build_decision_player_workspace(snapshot, britain)
        self.assertEqual(workspace["phase1Economy"]["investmentPool"], 77)


class MarketWorkspaceEnrichmentTests(unittest.TestCase):
    def test_market_workspace_has_same_enriched_fields(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.MARKET
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode["handicraft"] = 3
        britain.phase1_economy.goods_inventory = 5
        britain.budget_pools["domesticMarket"] = 30

        workspace = build_market_player_workspace(snapshot, britain)
        phase1 = workspace["phase1Economy"]

        self.assertIn("productionModes", phase1)
        self.assertEqual(len(phase1["productionModes"]), 5)
        self.assertIn("domesticDemand", phase1)
        self.assertIn("equilibriumPrice", phase1)
        self.assertIn("domesticPricePreview", phase1)

        demand = calculate_domestic_demand(britain.phase1_economy.capacity_by_mode)
        equilibrium = calculate_equilibrium_price(consumption_pool=30, demand=demand)
        expected_price = calculate_domestic_price(
            equilibrium_price=equilibrium,
            supply=5,
            demand=demand,
        )
        self.assertEqual(phase1["domesticDemand"], int(demand))
        self.assertAlmostEqual(phase1["equilibriumPrice"], float(equilibrium), places=6)
        self.assertAlmostEqual(phase1["domesticPricePreview"], float(expected_price), places=6)

    def test_market_workspace_phase1_goods_available_is_alias_for_inventory(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.MARKET
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.goods_inventory = 9

        workspace = build_market_player_workspace(snapshot, britain)
        phase1 = workspace["phase1Economy"]

        self.assertEqual(phase1["phase1GoodsAvailable"], 9)
        self.assertEqual(phase1["phase1GoodsAvailable"], phase1["goodsInventory"])


class SettlementWorkspacePoolDeltaPreviewTests(unittest.TestCase):
    def test_pool_delta_preview_splits_5_3_2(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.SETTLEMENT
        britain = _get_player(snapshot, "player-1")
        britain.national_income = 100

        workspace = build_settlement_player_workspace(snapshot, britain)
        delta = workspace["phase1Economy"]["poolDeltaPreview"]

        self.assertAlmostEqual(delta["consumption"], 50.0, places=6)
        self.assertAlmostEqual(delta["investment"], 30.0, places=6)
        self.assertAlmostEqual(delta["fiscal"], 20.0, places=6)

    def test_pool_delta_preview_matches_pure_function(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.SETTLEMENT
        britain = _get_player(snapshot, "player-1")
        britain.national_income = 73

        workspace = build_settlement_player_workspace(snapshot, britain)
        delta = workspace["phase1Economy"]["poolDeltaPreview"]

        expected = allocate_revenue_to_pools(73)
        self.assertAlmostEqual(delta["consumption"], float(expected.consumption), places=6)
        self.assertAlmostEqual(delta["investment"], float(expected.investment), places=6)
        self.assertAlmostEqual(delta["fiscal"], float(expected.fiscal), places=6)

    def test_zero_income_yields_zero_pool_delta(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.SETTLEMENT
        britain = _get_player(snapshot, "player-1")
        britain.national_income = 0

        workspace = build_settlement_player_workspace(snapshot, britain)
        delta = workspace["phase1Economy"]["poolDeltaPreview"]

        self.assertEqual(delta["consumption"], 0.0)
        self.assertEqual(delta["investment"], 0.0)
        self.assertEqual(delta["fiscal"], 0.0)

    def test_consumption_pool_exposes_domestic_market_budget(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.SETTLEMENT
        britain = _get_player(snapshot, "player-1")
        britain.budget_pools["domesticMarket"] = 25

        workspace = build_settlement_player_workspace(snapshot, britain)
        self.assertEqual(workspace["phase1Economy"]["consumptionPool"], 25)


if __name__ == "__main__":
    unittest.main()
