from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus, RegionAccessLevel
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, PlayerState, RegionState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.rules.market import resolve_market_phase


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
    def test_market_writes_domestic_overseas_and_national_income(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        europe = get_region(snapshot, "europe")
        europe.access_level = RegionAccessLevel.OPEN
        britain.goods_stock = {"steel": 3, "grain": 2}
        britain.budget_pools = {"domesticMarket": 15, "factory": 10, "governmentFiscal": 12}
        britain.military_points = 2
        britain.income_summary["domesticMarketCapacity"] = 3
        britain.income_summary["overseasMarketCapacity"] = 2

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {
                        "saleOrders": [
                            {"goodsId": "grain", "market": "domestic", "quantity": 2},
                            {"goodsId": "steel", "market": "overseas", "regionId": "europe", "quantity": 2},
                        ]
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        # grain domestic: 2 × 4 = 8, steel overseas europe: 2 × 11 = 22
        self.assertEqual(updated_britain.domestic_sales_revenue, 8)
        self.assertEqual(updated_britain.overseas_sales_revenue, 22)
        self.assertEqual(
            updated_britain.national_income,
            updated_britain.domestic_sales_revenue + updated_britain.overseas_sales_revenue,
        )
        self.assertEqual(updated_britain.national_income, 30)
        self.assertEqual(updated_britain.goods_stock["grain"], 0)
        self.assertEqual(updated_britain.goods_stock["steel"], 1)

    def test_concession_region_is_accessible_after_diplomacy_even_without_military_points(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.goods_stock = {"cotton": 2}
        britain.military_points = 0
        britain.established_diplomacy = ["africa"]
        britain.income_summary["overseasMarketCapacity"] = 2
        britain.navy = {"fleets": 1}

        resolution = resolve_market_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {
                        "saleOrders": [
                            {"goodsId": "cotton", "market": "overseas", "regionId": "africa", "quantity": 1},
                            {"goodsId": "cotton", "market": "overseas", "regionId": "middle_east", "quantity": 1},
                        ]
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        africa = get_region(resolution.updated_snapshot, "africa")
        middle_east = get_region(resolution.updated_snapshot, "middle_east")

        self.assertEqual(updated_britain.goods_stock["cotton"], 1)
        self.assertEqual(africa.market_supply["cotton"], 1)
        self.assertEqual(middle_east.market_supply.get("cotton", 0), 0)
