from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode
from app.modules.balance_config.loader import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.workspaces import build_decision_player_workspace, build_market_player_workspace


def build_snapshot():
    game = create_game(room_code="ROOM01", game_id="game-workspace")
    snapshot = create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-workspace",
        player_assignments={
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        },
    )
    return snapshot


class GameStateWorkspaceTests(unittest.TestCase):
    @unittest.skip("Phase 3 migration: old tech tree behavior, to be rewritten in Task 3-4")
    def test_decision_workspace_exposes_active_events_national_ability_and_price_trend(self) -> None:
        snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")
        snapshot.active_events = [
            {
                "eventId": "grain_crisis",
                "label": "粮食歉收",
                "description": "粮价大涨。",
                "effects": {
                    "goodsPriceOverrides": {
                        "grain": {"domesticDelta": 3, "overseasDelta": 2}
                    }
                },
                "remainingRounds": 1,
            }
        ]
        snapshot.market_price_adjustments = {"grain": 1}

        workspace = build_decision_player_workspace(snapshot, britain)
        grain_option = next(option for option in workspace["productionOptions"] if option["goodsId"] == "grain")
        spinning_jenny = next(node for node in workspace["techTree"] if node["techId"] == "spinning_jenny")

        self.assertEqual(workspace["activeEvents"][0]["eventId"], "grain_crisis")
        self.assertEqual(workspace["nationalAbility"]["abilityId"], "workshop_of_the_world")
        self.assertTrue(workspace["nationalAbility"]["isAvailable"])
        self.assertEqual(grain_option["priceAdjustment"], 1)
        self.assertEqual(grain_option["priceTrend"], "up")
        self.assertEqual(workspace["domesticMarketActions"], [])
        self.assertEqual(spinning_jenny["budgetPool"], "factory")
        self.assertEqual(spinning_jenny["budgetCost"], 7)
        self.assertFalse(spinning_jenny["isUnlocked"])
        self.assertIn("militaryWorkspace", workspace)
        self.assertEqual(workspace["militaryWorkspace"]["regionAccessStatus"][2]["regionId"], "africa")

    def test_market_workspace_exposes_price_trend_on_sellable_inventory(self) -> None:
        snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")
        britain.goods_stock["grain"] = 3
        snapshot.market_price_adjustments = {"grain": -1}

        workspace = build_market_player_workspace(snapshot, britain)
        grain_inventory = next(item for item in workspace["sellableInventory"] if item["goodsId"] == "grain")

        self.assertEqual(grain_inventory["priceAdjustment"], -1)
        self.assertEqual(grain_inventory["priceTrend"], "down")
        self.assertIn("regionAccessStatus", workspace)

    def test_decision_military_workspace_ocean_nodes_include_reachable_routes(self) -> None:
        snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")

        workspace = build_decision_player_workspace(snapshot, britain)
        ocean_nodes = workspace["militaryWorkspace"]["oceanNodes"]
        north_atlantic = next(node for node in ocean_nodes if node["nodeId"] == "north_atlantic")

        self.assertEqual(north_atlantic["reachableRoutes"], ["mediterranean", "pacific"])

    def test_market_workspace_marks_overseas_regions_accessible_by_default(self) -> None:
        snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")

        workspace = build_market_player_workspace(snapshot, britain)
        africa = next(item for item in workspace["regionAccessStatus"] if item["regionId"] == "africa")
        middle_east = next(item for item in workspace["regionAccessStatus"] if item["regionId"] == "middle_east")

        self.assertTrue(africa["isAccessible"])
        self.assertTrue(middle_east["isAccessible"])

    def test_market_workspace_exposes_government_market_policy_bonuses(self) -> None:
        snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")
        britain.temporary_effects.update(
            {
                "domesticMarketCapacityBonus": 2,
                "domesticPriceBonus": 2,
                "overseasMarketCapacityBonus": 2,
                "governmentDomesticMarketCapacityBonus": 2,
                "governmentDomesticPriceBonus": 2,
                "governmentOverseasMarketCapacityBonus": 2,
            }
        )

        workspace = build_market_player_workspace(snapshot, britain)
        phase1 = workspace["phase1Economy"]

        self.assertEqual(phase1["domesticMarketCapacityBonus"], 2)
        self.assertEqual(phase1["domesticPriceBonus"], 2)
        self.assertEqual(phase1["overseasMarketCapacityBonus"], 2)
        self.assertEqual(phase1["governmentDomesticMarketCapacityBonus"], 2)
        self.assertEqual(phase1["governmentDomesticPriceBonus"], 2)
        self.assertEqual(phase1["governmentOverseasMarketCapacityBonus"], 2)

    @unittest.skip("Sellable inventory test uses old multi-goods model; needs rewrite for phase1_goods economy")
    def test_market_workspace_only_exposes_overseas_prices_for_regions_that_accept_the_goods(self) -> None:
        snapshot = build_snapshot()
        russia = next(player for player in snapshot.player_states if player.player_id == "player-5")

        workspace = build_market_player_workspace(snapshot, russia)
        coal_inventory = next(item for item in workspace["sellableInventory"] if item["goodsId"] == "phase1_goods")
        grain_inventory = next(item for item in workspace["sellableInventory"] if item["goodsId"] == "grain")

        self.assertEqual(
            [item["regionId"] for item in coal_inventory["overseasReferencePrices"]],
            ["europe", "asia_pacific"],
        )
        self.assertEqual(
            [item["regionId"] for item in grain_inventory["overseasReferencePrices"]],
            ["europe", "americas", "middle_east"],
        )

    def test_decision_workspace_exposes_colonization_capability_and_unlock_gating(self) -> None:
        snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")

        workspace = build_decision_player_workspace(snapshot, britain)
        capability = workspace["militaryWorkspace"]["colonizationCapability"]

        self.assertFalse(capability["isUnlocked"])
        self.assertEqual(capability["unlockCost"], 0)
        self.assertEqual(capability["budgetCost"], 0)
        self.assertEqual(capability["incomePerColonyPerRound"], 0)
        self.assertEqual(capability["maxColonizationsPerRound"], 0)
        self.assertEqual(workspace["militaryWorkspace"]["colonizationOptions"], [])

    def test_tech_tree_marks_unlocked_techs_as_discovered(self) -> None:
        snapshot = build_snapshot()
        britain = next(p for p in snapshot.player_states if p.player_id == "player-1")
        balance = get_balance_config()
        first_chain = next(iter(balance.technology.chains.values()))
        first_tech_id = first_chain.techs[0].tech_id
        britain.unlocked_techs = [first_tech_id]

        workspace = build_decision_player_workspace(snapshot, britain)
        techs = [t for chain in workspace["techTree"]["chains"] for t in chain["techs"]]
        unlocked_tech = next(t for t in techs if t["techId"] == first_tech_id)
        other_tech = next(t for t in techs if t["techId"] != first_tech_id)

        self.assertTrue(unlocked_tech["isUnlocked"])
        self.assertTrue(unlocked_tech["isDiscovered"], "Unlocked techs should be discovered")
        self.assertFalse(other_tech["isUnlocked"])
        self.assertFalse(other_tech["isDiscovered"], "Locked techs should not be discovered")

    def test_tech_tree_marks_other_country_unlocks_as_discovered(self) -> None:
        snapshot = build_snapshot()
        britain = next(p for p in snapshot.player_states if p.player_id == "player-1")
        france = next(p for p in snapshot.player_states if p.player_id == "player-2")
        balance = get_balance_config()
        first_chain = next(iter(balance.technology.chains.values()))
        first_tech_id = first_chain.techs[0].tech_id
        france.unlocked_techs = [first_tech_id]

        workspace = build_decision_player_workspace(snapshot, britain)
        techs = [t for chain in workspace["techTree"]["chains"] for t in chain["techs"]]
        discovered_tech = next(t for t in techs if t["techId"] == first_tech_id)

        self.assertFalse(discovered_tech["isUnlocked"])
        self.assertTrue(discovered_tech["isDiscovered"], "Other-country unlocks should be visible as discovered")

    def test_decision_workspace_exposes_government_strategies(self) -> None:
        snapshot = build_snapshot()
        britain = next(p for p in snapshot.player_states if p.player_id == "player-1")

        workspace = build_decision_player_workspace(snapshot, britain)
        gov = workspace["governmentActions"]

        self.assertIn("strategies", gov)
        self.assertIn("pointPurchaseCosts", gov)
        self.assertGreater(len(gov["strategies"]), 0, "should expose at least one strategy")

        self.assertEqual(
            [strategy["actionId"] for strategy in gov["strategies"]],
            ["trade_promotion", "expand_research"],
        )
        trade_promotion = gov["strategies"][0]
        self.assertEqual(trade_promotion["label"], "贸易促进")
        self.assertEqual(trade_promotion["cost"], 0)
        self.assertTrue(trade_promotion["isMarketRegulation"])
        self.assertEqual(trade_promotion["effects"], {"overseasMarketCapacityDelta": 2})
        self.assertFalse(
            any(
                "domesticMarketCapacityDelta" in strategy["effects"]
                or "domesticPriceBonusDelta" in strategy["effects"]
                for strategy in gov["strategies"]
            )
        )

        self.assertEqual(gov["pointPurchaseCosts"], {"tech": 2})

    def test_decision_workspace_previews_active_event_effects(self) -> None:
        snapshot = build_snapshot()
        britain = next(p for p in snapshot.player_states if p.player_id == "player-1")
        britain.budget_pools["governmentFiscal"] = 10
        britain.tech_points = 0
        snapshot.active_events = [
            {
                "eventId": "test_event",
                "label": "测试事件",
                "effects": {
                    "governmentFiscalBudgetDelta": -2,
                    "domesticMarketCapacityDelta": 2,
                    "techPointsDelta": 1,
                },
            }
        ]

        workspace = build_decision_player_workspace(snapshot, britain)

        self.assertEqual(workspace["baseBudgetPools"]["governmentFiscal"], 8)
        self.assertEqual(workspace["marketRegulationAllowance"], 0)
        self.assertEqual(workspace["budgetPools"]["governmentFiscal"], 8)
        self.assertEqual(workspace["domesticMarketCapacity"], 26)
        self.assertEqual(workspace["techPoints"], 1)
        self.assertEqual(britain.budget_pools["governmentFiscal"], 10, "workspace preview must not mutate snapshot state")
        self.assertEqual(britain.tech_points, 0, "workspace preview must not consume event effects early")

    def test_decision_workspace_keeps_colonization_disabled_after_diplomacy(self) -> None:
        snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")
        britain.colonization_unlocked = True
        britain.established_diplomacy = ["americas"]

        workspace = build_decision_player_workspace(snapshot, britain)

        self.assertFalse(workspace["militaryWorkspace"]["colonizationCapability"]["isUnlocked"])
        self.assertEqual(workspace["militaryWorkspace"]["colonizationOptions"], [])


if __name__ == "__main__":
    unittest.main()
