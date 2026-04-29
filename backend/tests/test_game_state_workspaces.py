from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode
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
        consumer_subsidy = next(
            action for action in workspace["domesticMarketActions"] if action["actionId"] == "consumer_subsidy"
        )
        spinning_jenny = next(node for node in workspace["techTree"] if node["techId"] == "spinning_jenny")

        self.assertEqual(workspace["activeEvents"][0]["eventId"], "grain_crisis")
        self.assertEqual(workspace["nationalAbility"]["abilityId"], "workshop_of_the_world")
        self.assertTrue(workspace["nationalAbility"]["isAvailable"])
        self.assertEqual(grain_option["priceAdjustment"], 1)
        self.assertEqual(grain_option["priceTrend"], "up")
        self.assertEqual(consumer_subsidy["lockedReason"], "需要研究「市场经济」")
        self.assertEqual(spinning_jenny["budgetPool"], "factory")
        self.assertEqual(spinning_jenny["budgetCost"], 7)
        self.assertFalse(spinning_jenny["isUnlocked"])
        self.assertIn("militaryWorkspace", workspace)
        self.assertEqual(workspace["militaryWorkspace"]["regionAccessStatus"][2]["regionId"], "africa")
        self.assertEqual(
            workspace["militaryWorkspace"]["availableDiplomacyActions"][0]["targetRegion"],
            "americas",
        )

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

    def test_market_workspace_marks_concession_region_accessible_after_diplomacy(self) -> None:
        snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")
        britain.established_diplomacy = ["africa"]
        britain.military_points = 0

        workspace = build_market_player_workspace(snapshot, britain)
        africa = next(item for item in workspace["regionAccessStatus"] if item["regionId"] == "africa")
        middle_east = next(item for item in workspace["regionAccessStatus"] if item["regionId"] == "middle_east")

        self.assertTrue(africa["isAccessible"])
        self.assertTrue(africa["isDiplomacyEstablished"])
        self.assertFalse(middle_east["isAccessible"])

    def test_market_workspace_only_exposes_overseas_prices_for_regions_that_accept_the_goods(self) -> None:
        snapshot = build_snapshot()
        russia = next(player for player in snapshot.player_states if player.player_id == "player-5")

        workspace = build_market_player_workspace(snapshot, russia)
        coal_inventory = next(item for item in workspace["sellableInventory"] if item["goodsId"] == "coal")
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
        americas = next(
            option for option in workspace["militaryWorkspace"]["colonizationOptions"] if option["regionId"] == "americas"
        )

        self.assertFalse(capability["isUnlocked"])
        self.assertEqual(capability["unlockCost"], 10)
        self.assertEqual(capability["militaryPointCost"], 3)
        self.assertEqual(capability["incomePerColonyPerRound"], 5)
        self.assertEqual(capability["maxColonizationsPerRound"], 1)
        self.assertNotIn("budgetCost", americas)
        self.assertEqual(americas["lockedReason"], "需先永久解锁殖民扩张")

    def test_decision_workspace_marks_region_colonizable_after_unlock_and_diplomacy(self) -> None:
        snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")
        britain.colonization_unlocked = True
        britain.established_diplomacy = ["americas"]
        britain.military_points = 3

        workspace = build_decision_player_workspace(snapshot, britain)
        americas = next(
            option for option in workspace["militaryWorkspace"]["colonizationOptions"] if option["regionId"] == "americas"
        )

        self.assertTrue(workspace["militaryWorkspace"]["colonizationCapability"]["isUnlocked"])
        self.assertTrue(americas["canColonize"])
        self.assertIsNone(americas["lockedReason"])


if __name__ == "__main__":
    unittest.main()
