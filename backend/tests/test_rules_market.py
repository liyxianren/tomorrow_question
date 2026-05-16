from __future__ import annotations

import sys
import unittest
from pathlib import Path
from decimal import Decimal


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus, RegionAccessLevel
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.effects import apply_effects
from app.modules.game_state.models import GameSnapshot, PlayerState, RegionState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.rules.market import resolve_market_phase
from app.modules.rules.phase1_economy import calculate_domestic_price, calculate_equilibrium_price


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
    snapshot.phase = GamePhase.MARKET
    return snapshot


def get_player(snapshot: GameSnapshot, player_id: str) -> PlayerState:
    return next(player for player in snapshot.player_states if player.player_id == player_id)


def get_region(snapshot: GameSnapshot, region_id: str) -> RegionState:
    return next(region for region in snapshot.region_states if region.region_id == region_id)


def build_turn_input(player_id: str, payload: dict[str, object]) -> PlayerTurnInput:
    return PlayerTurnInput(
        game_id="game-1",
        round_no=1,
        phase=GamePhase.MARKET,
        player_id=player_id,
        submission_status=PlayerSubmissionStatus.SUBMITTED,
        payload=payload,
        submitted_at=None,
        is_timeout_generated=False,
    )


class MarketRulesTests(unittest.TestCase):
    def test_phase1_domestic_price_uses_submitted_domestic_allocation(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0,
            "handicraft": 4,
            "mechanized": 0,
            "steam": 0,
            "electrified": 0,
        }
        britain.phase1_economy.goods_inventory = 5
        britain.goods_stock = {"phase1_goods": 5}
        britain.budget_pools = {"domesticMarket": 12, "factory": 0, "governmentFiscal": 0}

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {"saleOrders": [], "phase1Market": {"domesticAllocation": 3}},
                )
            ],
        )

        updated = get_player(resolution.updated_snapshot, "player-1")
        expected_equilibrium = calculate_equilibrium_price(
            demand=Decimal(4),
        )
        expected_final = calculate_domestic_price(
            equilibrium_price=expected_equilibrium,
            supply=Decimal(3),
            demand=Decimal(4),
            minimum_price=1,
        )
        self.assertAlmostEqual(
            updated.phase1_economy.market_metrics["finalPrice"],
            float(expected_final),
            places=6,
        )
        self.assertEqual(updated.domestic_sales_revenue, int(Decimal(3) * expected_final))
        self.assertEqual(updated.phase1_economy.goods_inventory, 2)

    def test_phase1_domestic_price_bonus_applies_to_actual_sale_price(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0,
            "handicraft": 3,
            "mechanized": 0,
            "steam": 0,
            "electrified": 0,
        }
        britain.phase1_economy.goods_inventory = 3
        britain.goods_stock = {"phase1_goods": 3}
        britain.budget_pools = {"domesticMarket": 24, "factory": 0, "governmentFiscal": 0}
        apply_effects(britain, {"domesticPriceBonusDelta": 2})

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {"saleOrders": [], "phase1Market": {"domesticAllocation": 3}},
                )
            ],
        )

        updated = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.phase1_economy.market_metrics["finalPrice"], 5.0)
        self.assertEqual(updated.domestic_sales_revenue, 15)

    def test_phase1_overseas_price_bonus_applies_to_external_sales(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0,
            "handicraft": 3,
            "mechanized": 0,
            "steam": 0,
            "electrified": 0,
        }
        britain.phase1_economy.goods_inventory = 1
        britain.goods_stock = {"phase1_goods": 1}
        britain.budget_pools = {"domesticMarket": 24, "factory": 0, "governmentFiscal": 0}
        britain.established_diplomacy = ["asia_pacific"]
        apply_effects(britain, {"overseasPriceBonusDelta": 2})

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {
                        "saleOrders": [],
                        "phase1Market": {
                            "domesticAllocation": 0,
                            "externalAllocations": [{"marketId": "asia_pacific", "quantity": 1}],
                        },
                    },
                )
            ],
        )

        updated = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.overseas_sales_revenue, 5)

    def test_external_competition_win_grants_extra_capacity_and_price(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.capacity_by_mode = {
            "idle": 0,
            "handicraft": 3,
            "mechanized": 0,
            "steam": 0,
            "electrified": 0,
        }
        britain.phase1_economy.goods_inventory = 13
        britain.goods_stock = {"phase1_goods": 13}
        britain.budget_pools = {"domesticMarket": 24, "factory": 0, "governmentFiscal": 0}
        britain.established_diplomacy = ["asia_pacific"]
        britain.army = {"infantry": 1, "artillery": 0}

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {
                        "saleOrders": [],
                        "phase1Market": {
                            "domesticAllocation": 0,
                            "externalAllocations": [{"marketId": "asia_pacific", "quantity": 13}],
                            "externalCompetitionDeployments": [
                                {"marketId": "asia_pacific", "infantry": 1, "artillery": 0}
                            ],
                        },
                    },
                )
            ],
        )

        updated = get_player(resolution.updated_snapshot, "player-1")
        region = get_region(resolution.updated_snapshot, "asia_pacific")
        self.assertEqual(updated.army["infantry"], 0)
        self.assertEqual(updated.overseas_sales_revenue, 117)
        self.assertEqual(updated.phase1_economy.goods_inventory, 0)
        self.assertIsNone(region.controller)
        self.assertEqual(region.access_level, RegionAccessLevel.CONCESSION)

    def test_external_competition_highest_power_wins_and_loser_keeps_army(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        france = get_player(snapshot, "player-2")
        for player in (britain, france):
            player.phase1_economy.capacity_by_mode = {
                "idle": 0,
                "handicraft": 3,
                "mechanized": 0,
                "steam": 0,
                "electrified": 0,
            }
            player.phase1_economy.goods_inventory = 13
            player.goods_stock = {"phase1_goods": 13}
            player.budget_pools = {"domesticMarket": 24, "factory": 0, "governmentFiscal": 0}
            player.established_diplomacy = ["africa"]
        britain.army = {"infantry": 0, "artillery": 1}
        france.army = {"infantry": 1, "artillery": 0}

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {
                        "saleOrders": [],
                        "phase1Market": {
                            "domesticAllocation": 0,
                            "externalAllocations": [{"marketId": "africa", "quantity": 13}],
                            "externalCompetitionDeployments": [
                                {"marketId": "africa", "infantry": 0, "artillery": 1}
                            ],
                        },
                    },
                ),
                build_turn_input(
                    "player-2",
                    {
                        "saleOrders": [],
                        "phase1Market": {
                            "domesticAllocation": 0,
                            "externalAllocations": [{"marketId": "africa", "quantity": 13}],
                            "externalCompetitionDeployments": [
                                {"marketId": "africa", "infantry": 1, "artillery": 0}
                            ],
                        },
                    },
                ),
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        updated_france = get_player(resolution.updated_snapshot, "player-2")
        self.assertEqual(updated_britain.army["artillery"], 0)
        self.assertEqual(updated_france.army["infantry"], 1)
        self.assertEqual(updated_britain.overseas_sales_revenue, 130)
        self.assertEqual(updated_france.overseas_sales_revenue, 45)

    def test_external_competition_tie_has_no_winner_or_army_loss(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        france = get_player(snapshot, "player-2")
        for player in (britain, france):
            player.phase1_economy.capacity_by_mode = {
                "idle": 0,
                "handicraft": 3,
                "mechanized": 0,
                "steam": 0,
                "electrified": 0,
            }
            player.phase1_economy.goods_inventory = 13
            player.goods_stock = {"phase1_goods": 13}
            player.budget_pools = {"domesticMarket": 24, "factory": 0, "governmentFiscal": 0}
            player.established_diplomacy = ["africa"]
            player.army = {"infantry": 1, "artillery": 0}

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {
                        "saleOrders": [],
                        "phase1Market": {
                            "domesticAllocation": 0,
                            "externalAllocations": [{"marketId": "africa", "quantity": 13}],
                            "externalCompetitionDeployments": [
                                {"marketId": "africa", "infantry": 1, "artillery": 0}
                            ],
                        },
                    },
                ),
                build_turn_input(
                    "player-2",
                    {
                        "saleOrders": [],
                        "phase1Market": {
                            "domesticAllocation": 0,
                            "externalAllocations": [{"marketId": "africa", "quantity": 13}],
                            "externalCompetitionDeployments": [
                                {"marketId": "africa", "infantry": 1, "artillery": 0}
                            ],
                        },
                    },
                ),
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        updated_france = get_player(resolution.updated_snapshot, "player-2")
        self.assertEqual(updated_britain.army["infantry"], 1)
        self.assertEqual(updated_france.army["infantry"], 1)
        self.assertEqual(updated_britain.overseas_sales_revenue, 45)
        self.assertEqual(updated_france.overseas_sales_revenue, 45)
