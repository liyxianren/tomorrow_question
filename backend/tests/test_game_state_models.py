from __future__ import annotations

import sys
import unittest
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase
from app.modules.game_state.factory import create_initial_snapshot
from app.modules.game_state.models import Game, GameSnapshot, PlayerState


class GameStateModelTests(unittest.TestCase):
    def test_game_payload_matches_three_phase_contract(self) -> None:
        game = Game(
            game_id="game-1",
            room_code="ROOM1",
            current_round=1,
            total_rounds=15,
            current_phase=GamePhase.DECISION,
            is_finished=False,
            active_snapshot_id="snapshot-1",
        )

        self.assertEqual(
            game.to_payload(),
            {
                "gameId": "game-1",
                "roomCode": "ROOM1",
                "currentRound": 1,
                "totalRounds": 15,
                "currentPhase": GamePhase.DECISION,
                "isFinished": False,
                "activeSnapshotId": "snapshot-1",
            },
        )

    def test_player_state_payload_serializes_new_economy_fields(self) -> None:
        player_state = PlayerState(
            player_id="player-a",
            country=CountryCode.BRITAIN,
            domestic_sales_revenue=7,
            overseas_sales_revenue=5,
            national_income=12,
            cumulative_national_income=24,
            income_allocation_ratio={"domesticMarket": 3.0, "factory": 3.0, "governmentFiscal": 4.0},
            budget_pools={"domesticMarket": 8, "factory": 9, "governmentFiscal": 12},
            tech_points=2,
            military_points=3,
            production_capacity={"handicraft": 2},
            pending_production_capacity={"mechanized": 1},
            goods_stock={"steel": 4},
            research={"steam_engine": 2},
            army={"infantry": 1},
            navy={"fleets": 1},
            income_summary={"nationalIncome": 12},
            established_diplomacy=["africa"],
            used_abilities=["workshop_of_the_world"],
            temporary_effects={
                "domesticMarketCapacityBonus": 2,
                "domesticPriceBonus": 1,
                "overseasMarketCapacityBonus": 0,
                "overseasPriceBonus": 0,
                "productionOutputMultiplier": 2,
            },
        )

        payload = player_state.to_payload()

        self.assertEqual(payload["domesticSalesRevenue"], 7)
        self.assertEqual(payload["overseasSalesRevenue"], 5)
        self.assertEqual(payload["nationalIncome"], 12)
        self.assertEqual(payload["cumulativeNationalIncome"], 24)
        self.assertEqual(payload["budgetPools"]["governmentFiscal"], 12)
        self.assertEqual(payload["techPoints"], 2)
        self.assertEqual(payload["militaryPoints"], 3)
        self.assertEqual(payload["establishedDiplomacy"], ["africa"])
        self.assertEqual(payload["usedAbilities"], ["workshop_of_the_world"])
        self.assertEqual(payload["temporaryEffects"]["productionOutputMultiplier"], 2)

    @unittest.skip("Phase 3 migration: old tech tree behavior, to be rewritten in Task 3-4")
    def test_initial_snapshot_factory_builds_first_round_decision_state(self) -> None:
        game = Game(game_id="game-1", room_code="ROOM1")

        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={
                "player-britain": CountryCode.BRITAIN,
                "player-france": CountryCode.FRANCE,
                "player-prussia": CountryCode.PRUSSIA,
                "player-austria": CountryCode.AUSTRIA,
                "player-russia": CountryCode.RUSSIA,
            },
            phase_deadline_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
        )

        payload = snapshot.to_payload()

        self.assertEqual(game.current_round, 1)
        self.assertEqual(game.current_phase, GamePhase.DECISION)
        self.assertEqual(snapshot.round_no, 1)
        self.assertEqual(snapshot.phase, GamePhase.DECISION)
        self.assertEqual(payload["round"], 1)
        self.assertEqual(payload["maxRounds"], 15)
        self.assertEqual(payload["rulesVersion"], "v2")
        self.assertEqual(payload["phaseWorkspace"]["phase"], GamePhase.DECISION)
        self.assertEqual(payload["ranking"], [])
        self.assertIsNone(payload["lastSettlementWorkspace"])
        self.assertEqual(set(payload["nationalStateByPlayer"].keys()), {"player-britain", "player-france", "player-prussia", "player-austria", "player-russia"})
        self.assertTrue(all("budgetPools" in player for player in payload["nationalStateByPlayer"].values()))
        britain_workspace = payload["phaseWorkspace"]["players"]["player-britain"]
        prussia_workspace = payload["phaseWorkspace"]["players"]["player-prussia"]
        locked_goods = {
            option["goodsId"]: option["lockedReason"]
            for option in britain_workspace["productionOptions"]
            if option.get("lockedReason")
        }
        steel_option = next(
            option for option in prussia_workspace["productionOptions"] if option["goodsId"] == "steel"
        )
        silk_option = next(
            option for option in prussia_workspace["productionOptions"] if option["goodsId"] == "silk"
        )
        self.assertEqual(
            [item["routeId"] for item in britain_workspace["routeSummaries"]],
            ["handicraft", "mechanized"],
        )
        self.assertEqual(locked_goods["grain"], "该国无该商品生产资格")
        self.assertEqual(locked_goods["steel"], "需要研究「珍妮纺织机」")
        self.assertEqual(locked_goods["oil"], "需要研究「蒸汽引擎」")
        self.assertEqual(steel_option["maxQuantity"], 1)
        self.assertIsNone(steel_option["lockedReason"])
        self.assertEqual(silk_option["lockedReason"], "需要研究「珍妮纺织机」")
        self.assertEqual(
            next(
                option for option in britain_workspace["productionOptions"] if option["goodsId"] == "grain"
            )["routeLabel"],
            "手工业",
        )
        self.assertEqual(
            britain_workspace["domesticMarketActions"][0]["lockedReason"],
            None,
        )
        self.assertEqual(
            next(
                action
                for action in britain_workspace["domesticMarketActions"]
                if action["actionId"] == "consumer_subsidy"
            )["lockedReason"],
            "需要研究「市场经济」",
        )
        self.assertEqual(
            next(
                action
                for action in britain_workspace["governmentActions"]["strategies"]
                if action["actionId"] == "industrial_policy"
            )["lockedReason"],
            "需要研究「行政改革」",
        )
        self.assertIn("militaryWorkspace", britain_workspace)
        self.assertIn("regionAccessStatus", britain_workspace["militaryWorkspace"])
        self.assertEqual(
            britain_workspace["militaryWorkspace"]["availableMilitaryActions"][0]["actionId"],
            "recruit_infantry",
        )
        self.assertIn("techTree", britain_workspace)
        # spinning_jenny costs 10 factory budget, Britain starts with 12 → canResearch=True
        self.assertEqual(
            next(node for node in britain_workspace["techTree"] if node["techId"] == "spinning_jenny")["canResearch"],
            True,
        )
        self.assertEqual(
            next(option for option in prussia_workspace["upgradeOptions"] if option["routeId"] == "steam")[
                "sourceRouteLabel"
            ],
            "机械化",
        )
        new_factory_route_ids = [item["routeId"] for item in britain_workspace["newFactoryOptions"]]
        self.assertIn("handicraft", new_factory_route_ids)
        self.assertIn("mechanized", new_factory_route_ids)
        self.assertIn("steam", new_factory_route_ids)
        # mechanized/steam/electrified should be locked until tech is researched
        mechanized_factory = next(item for item in britain_workspace["newFactoryOptions"] if item["routeId"] == "mechanized")
        self.assertIsNotNone(mechanized_factory["lockedReason"])

    def test_snapshot_payload_roundtrips_with_rules_version(self) -> None:
        snapshot = GameSnapshot(
            snapshot_id="snapshot-1",
            game_id="game-1",
            round_no=2,
            max_rounds=15,
            phase=GamePhase.MARKET,
            rules_version="v2",
            phase_deadline_at=datetime(2026, 3, 29, 10, 0, tzinfo=UTC),
            player_states=[
                PlayerState(
                    player_id="player-a",
                    country=CountryCode.BRITAIN,
                    domestic_sales_revenue=6,
                    overseas_sales_revenue=7,
                    national_income=13,
                    cumulative_national_income=25,
                    income_allocation_ratio={"domesticMarket": 3.0, "factory": 3.0, "governmentFiscal": 4.0},
                    budget_pools={"domesticMarket": 8, "factory": 8, "governmentFiscal": 9},
                    tech_points=1,
                    military_points=2,
                    production_capacity={"handicraft": 2},
                    pending_production_capacity={"mechanized": 1},
                    goods_stock={"steel": 4},
                    research={"steam_engine": 2},
                    army={"infantry": 1},
                    navy={"fleets": 1},
                    income_summary={"nationalIncome": 13},
                    established_diplomacy=["middle_east"],
                    used_abilities=["workshop_of_the_world"],
                    temporary_effects={
                        "domesticMarketCapacityBonus": 2,
                        "domesticPriceBonus": 1,
                        "overseasMarketCapacityBonus": 0,
                        "overseasPriceBonus": 0,
                        "productionOutputMultiplier": 2,
                    },
                )
            ],
            ranking=[{"rank": 1, "playerId": "player-a", "cumulativeNationalIncome": 25}],
            last_settlement_summary={"phase": "decision"},
            active_events=[
                {
                    "eventId": "grain_crisis",
                    "label": "粮食歉收",
                    "description": "粮食价格快速上涨。",
                    "effects": {"goodsPriceOverrides": {"grain": {"domesticDelta": 3}}},
                    "remainingRounds": 1,
                }
            ],
            market_price_adjustments={"grain": 1, "coal": -1},
            event_deck=["grain_crisis", "free_trade_wave"],
        )

        payload = snapshot.to_payload()
        restored = GameSnapshot.from_payload(payload)

        self.assertEqual(payload["rulesVersion"], "v2")
        self.assertEqual(
            payload["nationalStateByPlayer"]["player-a"]["establishedDiplomacy"],
            ["middle_east"],
        )
        self.assertEqual(restored.rules_version, "v2")
        self.assertEqual(restored.player_states[0].national_income, 13)
        self.assertEqual(restored.player_states[0].cumulative_national_income, 25)
        self.assertEqual(restored.player_states[0].established_diplomacy, ["middle_east"])
        self.assertEqual(payload["activeEvents"][0]["eventId"], "grain_crisis")
        self.assertEqual(payload["marketPriceAdjustments"]["grain"], 1)
        self.assertEqual(restored.active_events[0]["remainingRounds"], 1)
        self.assertEqual(restored.event_deck[1], "free_trade_wave")

    def test_snapshot_from_payload_rehydrates_stale_decision_workspace_shape(self) -> None:
        game = Game(game_id="game-1", room_code="ROOM1")
        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={
                "player-britain": CountryCode.BRITAIN,
                "player-france": CountryCode.FRANCE,
                "player-prussia": CountryCode.PRUSSIA,
                "player-austria": CountryCode.AUSTRIA,
                "player-russia": CountryCode.RUSSIA,
            },
            phase_deadline_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
        )

        payload = snapshot.to_payload()
        payload["phaseWorkspace"] = {
            "phase": GamePhase.DECISION,
            "phaseLabel": "国家决策",
            "submittedPlayerIds": [],
            "players": {
                "player-britain": {
                    "countryCode": "britain",
                    "countryLabel": "英国",
                    "budgetPools": {"domesticMarket": 12, "factory": 12, "governmentFiscal": 18},
                    "incomeAllocationRatio": {"domesticMarket": 3, "factory": 3, "governmentFiscal": 4},
                    "techPoints": 0,
                    "militaryPoints": 0,
                    "factoryActions": {
                        "productionOrders": [{"goodsId": "grain", "label": "粮食", "maxQuantity": 2}],
                        "expansionOrders": [],
                        "upgradeOrders": [],
                        "newFactoryOrders": [],
                    },
                    "domesticMarketActions": [],
                    "governmentActions": {
                        "pointPurchaseCosts": {"tech": 3, "military": 4},
                        "strategies": [],
                    },
                }
            },
        }

        restored = GameSnapshot.from_payload(payload)
        restored_workspace = restored.to_payload()["phaseWorkspace"]["players"]["player-britain"]

        self.assertIn("productionOptions", restored_workspace)
        self.assertIn("factoryActions", restored_workspace)
        self.assertTrue(isinstance(restored_workspace["productionOptions"], list))
        self.assertTrue(isinstance(restored_workspace["factoryActions"], list))


if __name__ == "__main__":
    unittest.main()
