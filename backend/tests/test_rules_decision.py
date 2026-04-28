from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, PlayerState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.rules.decision import resolve_decision_phase


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
    snapshot.phase = GamePhase.DECISION
    return snapshot


def get_player(snapshot: GameSnapshot, player_id: str) -> PlayerState:
    return next(player for player in snapshot.player_states if player.player_id == player_id)


def build_turn_input(player_id: str, payload: dict[str, object]) -> PlayerTurnInput:
    return PlayerTurnInput(
        game_id="game-1",
        round_no=1,
        phase=GamePhase.DECISION,
        player_id=player_id,
        submission_status=PlayerSubmissionStatus.SUBMITTED,
        payload=payload,
        submitted_at=None,
        is_timeout_generated=False,
    )


def empty_military_plan() -> dict[str, object]:
    return {
        "unlockColonization": False,
        "militaryActions": [],
        "diplomacyActions": [],
        "colonizationActions": [],
    }


class DecisionRulesTests(unittest.TestCase):
    def test_decision_consumes_separate_budget_pools_and_buys_points(self) -> None:
        snapshot = build_snapshot()
        prussia = get_player(snapshot, "player-3")
        prussia.budget_pools = {"domesticMarket": 12, "factory": 24, "governmentFiscal": 30}
        prussia.income_allocation_ratio = {"domesticMarket": 3.0, "factory": 3.0, "governmentFiscal": 4.0}
        prussia.unlocked_techs = ["admin_reform"]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-3",
                    {
                        "factoryPlan": {
                            "productionOrders": [{"goodsId": "steel", "quantity": 1}],
                            "expansionOrders": [{"routeId": "mechanized", "quantity": 1}],
                            "upgradeOrders": [],
                            "newFactoryOrders": [],
                        },
                        "domesticMarketPlan": {
                            "domesticMarketActions": [{"actionId": "market_fair"}],
                        },
                        "governmentPlan": {
                            "pointPurchases": [{"pointType": "tech", "quantity": 1}],
                            "strategySelections": [{"actionId": "expand_shipping_lines"}],
                        },
                        "militaryPlan": empty_military_plan(),
                    },
                )
            ],
        )

        updated_prussia = get_player(resolution.updated_snapshot, "player-3")
        self.assertEqual(updated_prussia.goods_stock["steel"], prussia.goods_stock.get("steel", 0) + 2)
        self.assertEqual(updated_prussia.pending_production_capacity["mechanized"], 1)
        self.assertLess(updated_prussia.budget_pools["factory"], 24)
        self.assertLess(updated_prussia.budget_pools["domesticMarket"], 12)
        self.assertLess(updated_prussia.budget_pools["governmentFiscal"], 18)
        self.assertEqual(updated_prussia.tech_points, prussia.tech_points + 1)
        self.assertGreater(updated_prussia.income_allocation_ratio["governmentFiscal"], 4.0)

    def test_upgrade_is_recorded_as_next_round_capacity_delta(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        # Factory budget covers 1 coal (cost 2) + 1 mechanized upgrade (cost 20) = 22.
        britain.budget_pools = {"domesticMarket": 12, "factory": 22, "governmentFiscal": 18}
        britain.unlocked_techs = ["spinning_jenny"]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {
                        "factoryPlan": {
                            "productionOrders": [{"goodsId": "coal", "quantity": 1}],
                            "expansionOrders": [],
                            "upgradeOrders": [{"routeId": "mechanized", "quantity": 1}],
                            "newFactoryOrders": [],
                        },
                        "domesticMarketPlan": {"domesticMarketActions": []},
                        "governmentPlan": {"pointPurchases": [], "strategySelections": []},
                        "militaryPlan": empty_military_plan(),
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.production_capacity["handicraft"], 4)
        self.assertEqual(updated_britain.pending_production_capacity["handicraft"], -1)
        self.assertEqual(updated_britain.pending_production_capacity["mechanized"], 1)
        self.assertEqual(updated_britain.goods_stock["coal"], britain.goods_stock.get("coal", 0) + 1)

    def test_government_plan_can_spend_newly_purchased_tech_points_on_multiple_research_unlocks(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 12, "factory": 30, "governmentFiscal": 30}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
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
                            "techResearch": [
                                {"techId": "spinning_jenny"},
                                {"techId": "steam_engine"},
                            ],
                        },
                        "militaryPlan": empty_military_plan(),
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.unlocked_techs, ["spinning_jenny", "steam_engine"])
        self.assertEqual(updated_britain.tech_points, 0)

    def test_government_strategy_can_grant_tech_points_that_are_spent_on_research_same_round(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 12, "factory": 12, "governmentFiscal": 30}
        britain.tech_points = 0
        britain.unlocked_techs = ["admin_reform"]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {
                        "factoryPlan": {
                            "productionOrders": [],
                            "expansionOrders": [],
                            "upgradeOrders": [],
                            "newFactoryOrders": [],
                        },
                        "domesticMarketPlan": {"domesticMarketActions": []},
                        "governmentPlan": {
                            "pointPurchases": [{"pointType": "tech", "quantity": 1}],
                            "strategySelections": [{"actionId": "industrial_policy"}],
                            "techResearch": [{"techId": "textile_tech"}],
                        },
                        "militaryPlan": empty_military_plan(),
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertIn("textile_tech", updated_britain.unlocked_techs)
        self.assertEqual(updated_britain.tech_points, 1)
        self.assertEqual(updated_britain.budget_pools["factory"], 8)

    def test_military_plan_uses_remaining_government_budget_after_government_plan(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 12, "factory": 12, "governmentFiscal": 18}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
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
                            "strategySelections": [{"actionId": "trade_agreement"}],
                            "techResearch": [],
                        },
                        "militaryPlan": {
                            "unlockColonization": False,
                            "militaryActions": [
                                {"actionId": "naval_drill"},
                                {"actionId": "recruit_infantry"},
                            ],
                            "diplomacyActions": [],
                            "colonizationActions": [],
                        },
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.budget_pools["governmentFiscal"], 2)
        self.assertEqual(updated_britain.military_points, britain.military_points + 2)

    def test_military_plan_establishes_diplomacy_and_applies_expedition_effects(self) -> None:
        snapshot = build_snapshot()
        france = get_player(snapshot, "player-2")
        france.budget_pools = {"domesticMarket": 12, "factory": 12, "governmentFiscal": 20}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-2",
                    {
                        "factoryPlan": {
                            "productionOrders": [],
                            "expansionOrders": [],
                            "upgradeOrders": [],
                            "newFactoryOrders": [],
                        },
                        "domesticMarketPlan": {"domesticMarketActions": []},
                        "governmentPlan": {"pointPurchases": [], "strategySelections": [], "techResearch": []},
                        "militaryPlan": {
                            "unlockColonization": False,
                            "militaryActions": [
                                {"actionId": "recruit_infantry"},
                                {"actionId": "recruit_infantry"},
                            ],
                            "diplomacyActions": [{"actionId": "establish_americas"}],
                            "colonizationActions": [],
                        },
                    },
                )
            ],
        )

        updated_france = get_player(resolution.updated_snapshot, "player-2")
        self.assertEqual(updated_france.budget_pools["governmentFiscal"], 7)
        self.assertIn("africa", updated_france.established_diplomacy)
        self.assertIn("americas", updated_france.established_diplomacy)
        self.assertEqual(updated_france.military_points, france.military_points + 2)

    def test_military_plan_can_unlock_and_colonize_after_same_round_diplomacy(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 12, "factory": 14, "governmentFiscal": 18}
        britain.military_points = 3
        britain.established_diplomacy = ["asia_pacific"]

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    {
                        "factoryPlan": {
                            "productionOrders": [],
                            "expansionOrders": [],
                            "upgradeOrders": [],
                            "newFactoryOrders": [],
                        },
                        "domesticMarketPlan": {"domesticMarketActions": []},
                        "governmentPlan": {"pointPurchases": [], "strategySelections": [], "techResearch": []},
                        "militaryPlan": {
                            "unlockColonization": True,
                            "militaryActions": [],
                            "diplomacyActions": [{"actionId": "establish_americas"}],
                            "colonizationActions": [{"targetRegionId": "americas"}],
                        },
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        americas = next(region for region in resolution.updated_snapshot.region_states if region.region_id == "americas")

        self.assertEqual(updated_britain.budget_pools["governmentFiscal"], 3)
        self.assertEqual(updated_britain.military_points, 0)
        self.assertTrue(updated_britain.colonization_unlocked)
        self.assertIn("americas", updated_britain.established_diplomacy)
        self.assertEqual(americas.controller, updated_britain.country.value)


if __name__ == "__main__":
    unittest.main()
