"""M3 tests: phase-1 economy replaces the legacy goodsId-based pipeline.

These tests prove that ``decision``, ``market``, and ``settlement`` rule
resolvers switch to the new unified-goods, supply-demand, 5:3:2 pipeline
when the submission carries phase-1 fields, and fall back to the legacy
goodsId-based path when those fields are absent.

References:
- backend/app/modules/rules/decision.py
- backend/app/modules/rules/market.py
- backend/app/modules/rules/settlement.py
- backend/app/modules/rules/phase1_economy.py
- docs/2.0迁移前逻辑推演与计划.md §6.3-6.4
"""
from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus, RegionAccessLevel
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, PlayerState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.rules.decision import resolve_decision_phase
from app.modules.rules.market import resolve_market_phase
from app.modules.rules.phase1_economy import (
    calculate_domestic_demand,
    calculate_domestic_price,
    calculate_equilibrium_price,
    calculate_production_output,
)
from app.modules.rules.settlement import resolve_settlement_phase


def _build_snapshot(phase: GamePhase = GamePhase.DECISION) -> GameSnapshot:
    game = create_game(room_code="ROOM01", game_id="game-m3")
    snapshot = create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-m3",
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
        game_id="game-m3",
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


def _decision_payload(*, phase1_production: dict[str, object] | None = None) -> dict[str, object]:
    payload: dict[str, object] = {
        "factoryPlan": {
            "productionOrders": [],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {"pointPurchases": [], "strategySelections": [], "techResearch": []},
        "militaryPlan": _empty_military_plan(),
    }
    if phase1_production is not None:
        payload["phase1Production"] = phase1_production
    return payload


class DecisionPhase1ProductionTests(unittest.TestCase):
    """phase1Production submission drives production via calculate_production_output."""

    def test_phase1_production_writes_unified_goods_and_inventory(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        # Britain starts with handicraft=4 capacity; seed mechanized capacity directly.
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0,
            "handicraft": 4,
            "mechanized": 5,
            "steam": 0,
            "electrified": 0,
        }
        britain.phase1_economy.raw_materials = 30
        britain.budget_pools = {"domesticMarket": 0, "factory": 9, "governmentFiscal": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    _decision_payload(
                        phase1_production={
                            "rawMaterialAssignments": {"handicraft": 4, "mechanized": 5},
                        }
                    ),
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        expected_output = int(calculate_production_output({"handicraft": 4, "mechanized": 5}))
        self.assertEqual(expected_output, 14)  # 4*1 + 5*2 = 14
        self.assertEqual(updated.phase1_economy.goods_inventory, expected_output)
        # 9 raw materials consumed from initial 30 -> 21 remaining.
        self.assertEqual(updated.phase1_economy.raw_materials, 21)
        self.assertEqual(updated.budget_pools["factory"], 0)
        # Legacy goods_stock receives the unified bucket for frontend compat.
        self.assertEqual(updated.goods_stock.get("phase1_goods"), expected_output)

    def test_factory_overtime_shift_applies_ideology_delta(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 0, "factory": 10, "governmentFiscal": 0}
        britain.ideology_levels = {"liberalism": 0, "egalitarianism": 2, "nationalism": 0}

        payload = _decision_payload()
        payload["factoryPlan"]["factoryActions"] = [{"actionId": "factory_overtime_shift"}]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input("player-1", GamePhase.DECISION, payload)
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.temporary_effects["productionOutputMultiplier"], 2)
        self.assertEqual(updated.ideology_levels["egalitarianism"], 3)
        self.assertEqual(updated.budget_pools["factory"], 4)

    def test_factory_upgrade_moves_capacity_before_same_turn_production(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.production_capacity["handicraft"] = 2
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0,
            "handicraft": 2,
            "mechanized": 0,
            "steam": 0,
            "electrified": 0,
        }
        britain.phase1_economy.raw_materials = 10
        britain.budget_pools = {"domesticMarket": 0, "factory": 20, "governmentFiscal": 0}
        britain.unlocked_techs = ["spinning_jenny"]

        payload = _decision_payload(
            phase1_production={
                "rawMaterialAssignments": {"handicraft": 2, "mechanized": 1},
            }
        )
        payload["factoryPlan"]["upgradeOrders"] = [{"routeId": "mechanized", "quantity": 1}]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input("player-1", GamePhase.DECISION, payload)
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.production_capacity["handicraft"], 1)
        self.assertEqual(updated.production_capacity["mechanized"], 1)
        self.assertEqual(updated.phase1_economy.capacity_by_mode["handicraft"], 1)
        self.assertEqual(updated.phase1_economy.capacity_by_mode["mechanized"], 1)
        self.assertEqual(updated.phase1_economy.goods_inventory, 3)
        self.assertEqual(updated.budget_pools["factory"], 6)

    def test_phase1_production_caps_raw_materials_by_capacity(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0, "handicraft": 2, "mechanized": 0, "steam": 0, "electrified": 0,
        }
        britain.phase1_economy.raw_materials = 30
        britain.budget_pools = {"domesticMarket": 0, "factory": 2, "governmentFiscal": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    _decision_payload(
                        phase1_production={
                            "rawMaterialAssignments": {"handicraft": 999},  # over-allocate
                        }
                    ),
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        # 999 capped to capacity 2 -> 2 * 1 = 2 goods, raw materials 30 -> 28.
        self.assertEqual(updated.phase1_economy.goods_inventory, 2)
        self.assertEqual(updated.phase1_economy.raw_materials, 28)

    def test_phase1_production_caps_raw_materials_by_available_stock(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        # Plenty of capacity but only 5 raw materials in stock.
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0, "handicraft": 100, "mechanized": 0, "steam": 0, "electrified": 0,
        }
        britain.phase1_economy.raw_materials = 5
        britain.budget_pools = {"domesticMarket": 0, "factory": 5, "governmentFiscal": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    _decision_payload(
                        phase1_production={
                            "rawMaterialAssignments": {"handicraft": 50},
                        }
                    ),
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        # Available raw materials (5) caps the assignment regardless of capacity.
        self.assertEqual(updated.phase1_economy.goods_inventory, 5)
        self.assertEqual(updated.phase1_economy.raw_materials, 0)

    def test_phase1_production_caps_raw_materials_across_modes(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        # Total requested = 8 + 8 = 16; only 10 raw materials available.
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0, "handicraft": 8, "mechanized": 8, "steam": 0, "electrified": 0,
        }
        britain.phase1_economy.raw_materials = 10
        britain.budget_pools = {"domesticMarket": 0, "factory": 10, "governmentFiscal": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    _decision_payload(
                        phase1_production={
                            "rawMaterialAssignments": {"handicraft": 8, "mechanized": 8},
                        }
                    ),
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        # The constraint caps total consumption at 10 (initial stock).
        self.assertEqual(updated.phase1_economy.raw_materials, 0)
        # Iteration order is dict insertion: handicraft 8 used (8*1=8 goods),
        # then mechanized capped to remaining 2 (2*2=4 goods). Total = 12.
        self.assertEqual(updated.phase1_economy.goods_inventory, 12)

    def test_phase1_production_caps_raw_materials_by_factory_budget(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0, "handicraft": 8, "mechanized": 0, "steam": 0, "electrified": 0,
        }
        britain.phase1_economy.raw_materials = 8
        britain.budget_pools = {"domesticMarket": 0, "factory": 3, "governmentFiscal": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    _decision_payload(
                        phase1_production={
                            "rawMaterialAssignments": {"handicraft": 8},
                        }
                    ),
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.phase1_economy.goods_inventory, 3)
        self.assertEqual(updated.phase1_economy.raw_materials, 5)
        self.assertEqual(updated.budget_pools["factory"], 0)

    def test_phase1_build_orders_increment_capacity_and_deduct_factory_budget(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 0, "factory": 100, "governmentFiscal": 0}
        britain.unlocked_techs = ["spinning_jenny"]
        starting_handicraft = britain.phase1_economy.capacity_by_mode["handicraft"]
        starting_mechanized = britain.phase1_economy.capacity_by_mode["mechanized"]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    _decision_payload(
                        phase1_production={
                            "buildOrders": [
                                {"mode": "handicraft", "quantity": 2},  # 20 each = 40
                                {"mode": "mechanized", "quantity": 1},  # 40
                            ],
                        }
                    ),
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.phase1_economy.capacity_by_mode["handicraft"], starting_handicraft + 2)
        self.assertEqual(updated.phase1_economy.capacity_by_mode["mechanized"], starting_mechanized + 1)
        # Mirror also flows into legacy production_capacity for frontend compat.
        self.assertEqual(updated.production_capacity["handicraft"], starting_handicraft + 2)
        self.assertEqual(updated.production_capacity["mechanized"], starting_mechanized + 1)
        self.assertEqual(updated.budget_pools["factory"], 100 - 12 * 2 - 25)

    def test_factory_plan_new_factory_orders_add_pending_capacity_and_deduct_budget(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 0, "factory": 50, "governmentFiscal": 0}
        starting_handicraft = britain.phase1_economy.capacity_by_mode["handicraft"]

        payload = _decision_payload()
        payload["factoryPlan"]["newFactoryOrders"] = [{"routeId": "handicraft", "quantity": 1}]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[_build_turn_input("player-1", GamePhase.DECISION, payload)],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.phase1_economy.capacity_by_mode["handicraft"], starting_handicraft)
        self.assertEqual(updated.pending_production_capacity["handicraft"], 2)
        self.assertEqual(updated.budget_pools["factory"], 50 - 12)

    def test_factory_plan_new_factory_orders_allow_unlocked_advanced_route(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 0, "factory": 50, "governmentFiscal": 0}
        britain.unlocked_techs = ["spinning_jenny"]

        payload = _decision_payload()
        payload["factoryPlan"]["newFactoryOrders"] = [{"routeId": "mechanized", "quantity": 1}]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[_build_turn_input("player-1", GamePhase.DECISION, payload)],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.pending_production_capacity["mechanized"], 2)
        self.assertEqual(updated.budget_pools["factory"], 50 - 25)

    def test_factory_plan_expansion_orders_add_pending_capacity_and_deduct_budget(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 0, "factory": 20, "governmentFiscal": 0}

        payload = _decision_payload()
        payload["factoryPlan"]["expansionOrders"] = [{"routeId": "handicraft", "quantity": 2}]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[_build_turn_input("player-1", GamePhase.DECISION, payload)],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.pending_production_capacity["handicraft"], 2)
        self.assertEqual(updated.budget_pools["factory"], 20 - 3 * 2)

    def test_phase1_upgrade_orders_move_capacity_between_modes(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        # Start with 4 handicraft, 0 mechanized; upgrade 1 to mechanized for 20.
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0, "handicraft": 4, "mechanized": 0, "steam": 0, "electrified": 0,
        }
        britain.production_capacity = dict(britain.phase1_economy.capacity_by_mode)
        britain.budget_pools = {"domesticMarket": 0, "factory": 50, "governmentFiscal": 0}
        britain.unlocked_techs = ["spinning_jenny"]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    _decision_payload(
                        phase1_production={
                            "upgradeOrders": [
                                {"routeId": "mechanized", "quantity": 1},
                            ],
                        }
                    ),
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.phase1_economy.capacity_by_mode["handicraft"], 3)
        self.assertEqual(updated.phase1_economy.capacity_by_mode["mechanized"], 1)
        self.assertEqual(updated.production_capacity["handicraft"], 3)
        self.assertEqual(updated.production_capacity["mechanized"], 1)
        self.assertEqual(updated.budget_pools["factory"], 50 - 12)

    def test_phase1_production_skips_mirror_when_new_path_taken(self) -> None:
        # Direct write semantics: the new path should NOT subsequently overwrite
        # phase1.goods_inventory with sum(goods_stock) like the legacy mirror does.
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0, "handicraft": 1, "mechanized": 0, "steam": 0, "electrified": 0,
        }
        # Populate legacy goods_stock with non-phase1 goods. The mirror would have
        # summed these into phase1.goods_inventory; the new path must ignore them.
        britain.goods_stock = {"coal": 99}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    _decision_payload(
                        phase1_production={
                            "rawMaterialAssignments": {"handicraft": 1},
                        }
                    ),
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        # 1 handicraft -> 1 unified good. Legacy "coal" was NOT folded in.
        self.assertEqual(updated.phase1_economy.goods_inventory, 1)
        self.assertEqual(updated.goods_stock.get("coal"), 99)
        self.assertEqual(updated.goods_stock.get("phase1_goods"), 1)


class DecisionLegacyFallbackTests(unittest.TestCase):
    """Without phase1Production, decision.py keeps the legacy goodsId pipeline."""

    def test_legacy_production_orders_still_resolve_when_no_phase1_field(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 12, "factory": 12, "governmentFiscal": 18}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.DECISION,
                    _decision_payload(),  # no phase1Production
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        # Legacy mirror still runs in fallback path and reflects production_capacity.
        self.assertEqual(
            updated.phase1_economy.capacity_by_mode,
            {mode: int(updated.production_capacity.get(mode, 0))
             for mode in updated.phase1_economy.capacity_by_mode},
        )


class MarketPhase1Tests(unittest.TestCase):
    """phase1Market submission resolves the unified market by supply/demand."""

    def test_phase1_market_computes_demand_supply_and_final_price(self) -> None:
        snapshot = _build_snapshot(GamePhase.MARKET)
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0, "handicraft": 4, "mechanized": 0, "steam": 0, "electrified": 0,
        }
        britain.phase1_economy.goods_inventory = 5
        britain.budget_pools = {"domesticMarket": 12, "factory": 0, "governmentFiscal": 0}

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.MARKET,
                    {"saleOrders": [], "phase1Market": {"domesticAllocation": 5}},
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        expected_demand = calculate_domestic_demand(britain.phase1_economy.capacity_by_mode)
        expected_eq = calculate_equilibrium_price(consumption_pool=Decimal(12), demand=expected_demand)
        expected_final = calculate_domestic_price(
            equilibrium_price=expected_eq,
            supply=Decimal(4),
            demand=expected_demand,
            minimum_price=1,
        )
        metrics = updated.phase1_economy.market_metrics
        self.assertAlmostEqual(metrics["demand"], float(expected_demand), places=6)
        self.assertEqual(metrics["supply"], 5.0)
        self.assertAlmostEqual(metrics["finalPrice"], float(expected_final), places=6)

    def test_phase1_market_domestic_revenue_equals_sold_times_final_price(self) -> None:
        snapshot = _build_snapshot(GamePhase.MARKET)
        britain = _get_player(snapshot, "player-1")
        # Calibrate so equilibrium price is 10 and supply == demand == 8 -> final price 10.
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0, "handicraft": 8, "mechanized": 0, "steam": 0, "electrified": 0,
        }  # demand = 8 * 1 = 8
        britain.phase1_economy.goods_inventory = 8
        britain.budget_pools = {"domesticMarket": 80, "factory": 0, "governmentFiscal": 0}
        britain.income_summary["domesticMarketCapacity"] = 8  # avoid capacity-clipping the sale

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.MARKET,
                    {"saleOrders": [], "phase1Market": {"domesticAllocation": 8}},
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        # equilibrium = 80 / 8 = 10, capped to DEFAULT_MAXIMUM_DOMESTIC_PRICE (8);
        # supply = demand = 8 -> final_price = 8. 8 sold at 8 -> revenue 64.
        self.assertEqual(updated.domestic_sales_revenue, 64)
        self.assertEqual(updated.overseas_sales_revenue, 0)
        self.assertEqual(updated.national_income, 64)
        self.assertEqual(updated.phase1_economy.goods_inventory, 0)
        self.assertEqual(updated.phase1_economy.market_metrics["soldQuantity"], 8.0)
        self.assertEqual(updated.phase1_economy.market_metrics["unsoldQuantity"], 0.0)
        self.assertEqual(updated.phase1_economy.market_metrics["revenue"], 64.0)

    def test_phase1_market_external_allocation_uses_overseas_capacity_and_diplomacy(self) -> None:
        snapshot = _build_snapshot(GamePhase.MARKET)
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0, "handicraft": 8, "mechanized": 0, "steam": 0, "electrified": 0,
        }  # demand = 8 * 1 = 8
        britain.phase1_economy.goods_inventory = 8
        britain.budget_pools = {"domesticMarket": 80, "factory": 0, "governmentFiscal": 0}
        britain.income_summary["domesticMarketCapacity"] = 4
        britain.income_summary["overseasMarketCapacity"] = 4
        britain.military_points = 5
        # Open Europe so an overseas region resolves.
        europe = next(region for region in snapshot.region_states if region.region_id == "europe")
        europe.access_level = RegionAccessLevel.OPEN

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                _build_turn_input(
                    "player-1",
                    GamePhase.MARKET,
                    {
                        "saleOrders": [],
                        "phase1Market": {
                            "domesticAllocation": 4,
                            "externalAllocations": [{"marketId": "europe", "quantity": 4}],
                        },
                    },
                )
            ],
        )

        updated = _get_player(resolution.updated_snapshot, "player-1")
        # equilibrium = 80 / 8 = 10. Domestic shortage 4/8 keeps the final
        # price at 10 under the configured cap -> 4 sold at 10 = 40.
        # Overseas (Europe, multiplier 0.9): int(8 * 0.9) = 7, so 4 * 7 = 28.
        self.assertEqual(updated.domestic_sales_revenue, 40)
        self.assertEqual(updated.overseas_sales_revenue, 28)
        self.assertEqual(updated.national_income, 68)
        self.assertEqual(updated.phase1_economy.market_metrics["soldQuantity"], 8.0)


class SettlementPhase1Tests(unittest.TestCase):
    """Phase-1 settlement uses the player's current income allocation weights."""

    def test_settlement_splits_revenue_by_current_ratio_when_phase1_inventory_present(self) -> None:
        snapshot = _build_snapshot(GamePhase.SETTLEMENT)
        prussia = _get_player(snapshot, "player-3")
        # Mark phase-1 active by leaving non-zero goods_inventory (a real produced good).
        prussia.phase1_economy.goods_inventory = 5
        prussia.income_allocation_ratio = {"domesticMarket": 3.0, "factory": 3.0, "governmentFiscal": 4.0}
        prussia.budget_pools = {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0}
        prussia.national_income = 100
        prussia.reforms = []
        prussia.ideology_levels = {key: 0 for key in prussia.ideology_levels}

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])

        updated = _get_player(resolution.updated_snapshot, "player-3")
        # 3:3:4 of 100 -> 30 / 30 / 40, then domesticMarket drains by 40%.
        self.assertEqual(updated.budget_pools["domesticMarket"], 18)
        self.assertEqual(updated.budget_pools["factory"], 30)
        self.assertEqual(updated.budget_pools["governmentFiscal"], 40)

    def test_settlement_phase1_mirrors_current_income_allocation_ratio(self) -> None:
        snapshot = _build_snapshot(GamePhase.SETTLEMENT)
        prussia = _get_player(snapshot, "player-3")
        prussia.phase1_economy.goods_inventory = 3  # phase-1 active
        prussia.income_allocation_ratio = {"domesticMarket": 1.0, "factory": 1.0, "governmentFiscal": 8.0}
        prussia.national_income = 50

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])

        updated = _get_player(resolution.updated_snapshot, "player-3")
        self.assertAlmostEqual(updated.phase1_economy.income_allocation_ratio["consumption"], 0.1, places=6)
        self.assertAlmostEqual(updated.phase1_economy.income_allocation_ratio["investment"], 0.1, places=6)
        self.assertAlmostEqual(updated.phase1_economy.income_allocation_ratio["fiscal"], 0.8, places=6)

    def test_settlement_adds_per_turn_raw_material_income_when_phase1_active(self) -> None:
        snapshot = _build_snapshot(GamePhase.SETTLEMENT)
        prussia = _get_player(snapshot, "player-3")
        # Phase-1 active via non-zero goods_inventory; pin raw materials to a known starting value.
        prussia.phase1_economy.goods_inventory = 5
        prussia.phase1_economy.raw_materials = 12
        prussia.national_income = 100

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])

        updated = _get_player(resolution.updated_snapshot, "player-3")
        self.assertEqual(
            updated.phase1_economy.raw_materials,
            12 + 2,  # prussia rawMaterialsPerTurn = 2 from countries.json
        )

    def test_settlement_applies_pending_capacity_to_phase1_capacity(self) -> None:
        snapshot = _build_snapshot(GamePhase.SETTLEMENT)
        britain = _get_player(snapshot, "player-1")
        britain.pending_production_capacity["handicraft"] = 2
        starting_phase1_capacity = britain.phase1_economy.capacity_by_mode["handicraft"]
        starting_legacy_capacity = britain.production_capacity["handicraft"]

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])

        updated = _get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(
            updated.phase1_economy.capacity_by_mode["handicraft"],
            starting_phase1_capacity + 2,
        )
        self.assertEqual(
            updated.production_capacity["handicraft"],
            starting_legacy_capacity + 2,
        )
        self.assertEqual(updated.pending_production_capacity["handicraft"], 0)

if __name__ == "__main__":
    unittest.main()
