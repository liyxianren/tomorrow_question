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
        "militaryActions": [],
        "diplomacyActions": [],
    }


class DecisionRulesTests(unittest.TestCase):
    @unittest.skip("Phase 3 migration: old tech tree behavior, to be rewritten in Task 3-4")
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

    @unittest.skip("Phase 3 migration: old tech tree behavior, to be rewritten in Task 3-4")
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
                            "strategySelections": [{"actionId": "trade_promotion"}],
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

    def test_military_plan_spends_government_fiscal_for_actions(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 12, "factory": 12, "governmentFiscal": 18}
        starting_army = int(britain.army.get("army", 0))

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
                            "adminPurchases": 0,
                        },
                        "militaryPlan": {
                            "militaryActions": [
                                {"actionId": "build_fleet"},
                                {"actionId": "recruit_army"},
                            ],
                            "diplomacyActions": [],
                            "navalDeployment": {},
                            "conquestActions": [],
                            "lootingActions": [],
                        },
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.budget_pools["governmentFiscal"], 5)
        self.assertEqual(updated_britain.army.get("army", 0), starting_army + 1)
        self.assertEqual(updated_britain.navy.get("fleets", 0), britain.navy.get("fleets", 0) + 1)

    def test_government_plan_can_buy_admin_and_spend_it_same_round(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 12, "factory": 12, "governmentFiscal": 18}
        britain.administration_capacity = 0
        britain.base_admin_capacity = 0

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
                            "strategySelections": [{"actionId": "trade_promotion"}],
                            "adminPurchases": 1,
                        },
                        "militaryPlan": empty_military_plan(),
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.administration_capacity, 0)
        self.assertEqual(updated_britain.base_admin_capacity, 1)
        self.assertGreater(
            int(updated_britain.temporary_effects.get("governmentOverseasMarketCapacityBonus", 0)),
            0,
        )

    def test_reform_permanently_consumes_administration_capacity(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.administration_capacity = 3
        britain.base_admin_capacity = 3

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
                            "adminPurchases": 0,
                        },
                        "militaryPlan": empty_military_plan(),
                        "reforms": ["constitution"],
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertIn("constitution", updated_britain.completed_reforms)
        self.assertEqual(updated_britain.administration_capacity, 1)
        self.assertEqual(updated_britain.base_admin_capacity, 1)

    def test_build_fleet_costs_government_fiscal(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 12, "factory": 12, "governmentFiscal": 30}
        starting_fleets = int(britain.navy.get("fleets", 0))

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
                            "adminPurchases": 0,
                        },
                        "militaryPlan": {
                            "militaryActions": [{"actionId": "build_fleet"}],
                            "diplomacyActions": [],
                            "navalDeployment": {},
                            "conquestActions": [],
                            "lootingActions": [],
                        },
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.budget_pools["governmentFiscal"], 22)
        self.assertEqual(updated_britain.navy.get("fleets", 0), starting_fleets + 1)

    def test_military_plan_ignores_legacy_diplomacy_and_applies_military_effects(self) -> None:
        snapshot = build_snapshot()
        france = get_player(snapshot, "player-2")
        france.budget_pools = {"domesticMarket": 12, "factory": 12, "governmentFiscal": 20}
        starting_army = int(france.army.get("army", 0))

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
                                {"actionId": "recruit_army"},
                                {"actionId": "recruit_army"},
                            ],
                            "diplomacyActions": [{"actionId": "establish_americas"}],
                            "colonizationActions": [],
                        },
                    },
                )
            ],
        )

        updated_france = get_player(resolution.updated_snapshot, "player-2")
        self.assertEqual(updated_france.budget_pools["governmentFiscal"], 10)
        self.assertNotIn("americas", updated_france.established_diplomacy)
        self.assertEqual(updated_france.army.get("army", 0), starting_army + 2)

    def test_legacy_conquest_payload_is_ignored(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 12, "factory": 14, "governmentFiscal": 18}
        britain.army = {"infantry": 2, "artillery": 0}
        britain.established_diplomacy = ["americas"]

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
                            "militaryActions": [],
                            "diplomacyActions": [],
                            "conquestActions": [{"regionId": "americas", "infantry": 1, "artillery": 0}],
                        },
                    },
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        americas_region = next(region for region in resolution.updated_snapshot.region_states if region.region_id == "americas")

        self.assertEqual(updated_britain.army["infantry"], 2)
        self.assertNotEqual(americas_region.controller, updated_britain.country.value)


if __name__ == "__main__":
    unittest.main()
