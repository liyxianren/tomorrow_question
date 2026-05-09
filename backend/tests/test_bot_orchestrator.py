from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase
from app.modules.bot import auto_submit_bot_turns
from app.modules.bot.models import BotPlanningContext
from app.modules.bot.planner import plan_bot_payload
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.workspaces import hydrate_snapshot_workspaces
from app.modules.persistence import RecoveryRepository, connect_database, initialize_database
from app.modules.room.service import assign_country, create_room, fill_bots, mark_member_ready


class BotTurnOrchestratorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "bot-orchestrator.sqlite3"
        self.connection = connect_database(self.database_path)
        initialize_database(self.connection)
        self.recovery = RecoveryRepository(self.connection)

    def tearDown(self) -> None:
        self.connection.close()
        self.temp_dir.cleanup()

    def test_market_bot_uses_overseas_competition_for_overflow_inventory(self) -> None:
        room = create_room(room_code="ROOM42", host_player_id="player-1", host_nickname="Host")
        game = create_game(room_code=room.room_code, game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            player_assignments={
                "player-1": CountryCode.BRITAIN,
                "player-2": CountryCode.FRANCE,
                "player-3": CountryCode.PRUSSIA,
                "player-4": CountryCode.AUSTRIA,
                "player-5": CountryCode.RUSSIA,
            },
            snapshot_id="snapshot-1",
            phase_deadline_at=datetime(2026, 4, 6, 12, 0, tzinfo=UTC),
        )
        snapshot.phase = GamePhase.MARKET

        payload = plan_bot_payload(
            BotPlanningContext(
                room=room,
                room_member=room.members[0],
                snapshot=snapshot,
                player_workspace={
                    "sellableInventory": [],
                    "domesticMarketCapacity": 4,
                    "overseasMarketCapacity": 5,
                    "regionAccessStatus": [
                        {
                            "regionId": "middle_east",
                            "label": "中东",
                            "isAccessible": True,
                            "canCompete": True,
                            "competitionRewardCapacityBonus": 8,
                        }
                    ],
                    "overseasCompetition": {
                        "availableArmy": {"infantry": 1, "artillery": 0},
                        "rewardCapacityBonus": 8,
                        "rewardPriceBonus": 1,
                        "infantryPower": 1,
                        "artilleryPower": 2,
                        "minimumPower": 1,
                    },
                    "phase1Economy": {
                        "goodsInventory": 20,
                        "domesticDemand": 3,
                    },
                },
            )
        )

        self.assertEqual(payload["phase1Market"]["domesticAllocation"], 3)
        self.assertEqual(
            payload["phase1Market"]["externalCompetitionDeployments"],
            [{"marketId": "middle_east", "infantry": 1, "artillery": 0}],
        )
        self.assertEqual(
            payload["phase1Market"]["externalAllocations"],
            [{"marketId": "middle_east", "quantity": 13}],
        )

    def test_market_bot_payload_never_over_allocates_single_goods_stock(self) -> None:
        room = create_room(room_code="ROOM42", host_player_id="player-1", host_nickname="Host")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        mark_member_ready(room, "player-1", True)
        fill_bots(room, actor_player_id="player-1")

        game = create_game(room_code=room.room_code, game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            player_assignments={
                member.player_id: member.selected_country
                for member in room.members
                if member.selected_country is not None
            },
            snapshot_id="snapshot-1",
            phase_deadline_at=datetime(2026, 4, 6, 12, 0, tzinfo=UTC),
        )
        snapshot.phase = GamePhase.MARKET
        hydrate_snapshot_workspaces(snapshot)
        self.recovery.rooms.save(room.to_payload())
        self.recovery.games.save(game.to_payload())
        self.recovery.snapshots.save(snapshot.to_payload())

        batch = auto_submit_bot_turns(
            room=room,
            snapshot=snapshot,
            recovery_repository=self.recovery,
            submitted_at=datetime(2026, 4, 6, 11, 0, tzinfo=UTC),
            commit=True,
        )

        self.assertEqual(len(batch.generated_inputs), 4)
        for turn_input in batch.generated_inputs:
            player_workspace = snapshot.phase_workspace["players"][turn_input.player_id]
            inventory_by_goods = {
                item["goodsId"]: int(item["quantity"])
                for item in player_workspace["sellableInventory"]
            }
            sale_orders = turn_input.payload.get("saleOrders", [])

            allocated_by_goods: dict[str, int] = {}
            for order in sale_orders:
                goods_key = str(order["goodsId"])
                allocated_by_goods[goods_key] = allocated_by_goods.get(goods_key, 0) + int(order["quantity"])

            for goods_key, allocated_amount in allocated_by_goods.items():
                self.assertLessEqual(
                    allocated_amount,
                    int(inventory_by_goods.get(goods_key, 0)),
                    f"{turn_input.player_id} over-allocated {goods_key}",
                )

    def test_decision_bot_payload_uses_2_0_submission_contract(self) -> None:
        room = create_room(room_code="ROOM42", host_player_id="player-1", host_nickname="Host")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        mark_member_ready(room, "player-1", True)
        fill_bots(room, actor_player_id="player-1")

        game = create_game(room_code=room.room_code, game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            player_assignments={
                member.player_id: member.selected_country
                for member in room.members
                if member.selected_country is not None
            },
            snapshot_id="snapshot-1",
            phase_deadline_at=datetime(2026, 4, 6, 12, 0, tzinfo=UTC),
        )
        hydrate_snapshot_workspaces(snapshot)
        self.recovery.rooms.save(room.to_payload())
        self.recovery.games.save(game.to_payload())
        self.recovery.snapshots.save(snapshot.to_payload())

        batch = auto_submit_bot_turns(
            room=room,
            snapshot=snapshot,
            recovery_repository=self.recovery,
            submitted_at=datetime(2026, 4, 6, 11, 0, tzinfo=UTC),
            commit=True,
        )

        self.assertEqual(len(batch.generated_inputs), 4)
        for turn_input in batch.generated_inputs:
            self.assertEqual(
                set(turn_input.payload.keys()),
                {"factoryPlan", "domesticMarketPlan", "governmentPlan", "phase1Production", "researchTarget"},
            )
            self.assertIn("productionOrders", turn_input.payload["factoryPlan"])
            self.assertIn("domesticMarketActions", turn_input.payload["domesticMarketPlan"])
            self.assertIn("pointPurchases", turn_input.payload["governmentPlan"])
            self.assertIn("strategySelections", turn_input.payload["governmentPlan"])
            self.assertEqual(turn_input.payload["domesticMarketPlan"]["domesticMarketActions"], [])
            self.assertTrue(
                any(
                    selection.get("actionId") in {"expand_workshop", "market_fair", "rural_development"}
                    for selection in turn_input.payload["governmentPlan"]["strategySelections"]
                ),
                "bot should select market regulation through government strategySelections",
            )

    def test_settlement_phase_does_not_generate_bot_turn_inputs(self) -> None:
        room = create_room(room_code="ROOM42", host_player_id="player-1", host_nickname="Host")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        mark_member_ready(room, "player-1", True)
        fill_bots(room, actor_player_id="player-1")

        game = create_game(room_code=room.room_code, game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            player_assignments={
                member.player_id: member.selected_country
                for member in room.members
                if member.selected_country is not None
            },
            snapshot_id="snapshot-1",
            phase_deadline_at=datetime(2026, 4, 6, 12, 0, tzinfo=UTC),
        )
        snapshot.phase = GamePhase.SETTLEMENT
        hydrate_snapshot_workspaces(snapshot)
        self.recovery.rooms.save(room.to_payload())
        self.recovery.games.save(game.to_payload())
        self.recovery.snapshots.save(snapshot.to_payload())

        batch = auto_submit_bot_turns(
            room=room,
            snapshot=snapshot,
            recovery_repository=self.recovery,
            submitted_at=datetime(2026, 4, 6, 11, 0, tzinfo=UTC),
            commit=True,
        )

        self.assertEqual(batch.generated_inputs, [])
        self.assertEqual(
            self.recovery.turn_inputs.list_for_phase(game.game_id, snapshot.round_no, snapshot.phase),
            [],
        )


if __name__ == "__main__":
    unittest.main()
