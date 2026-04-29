from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus, RegionAccessLevel
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, PlayerState, RegionState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.rules.decision import resolve_decision_phase
from app.modules.rules.settlement import _apply_independence_progression


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


def get_region(snapshot: GameSnapshot, region_id: str) -> RegionState:
    return next(region for region in snapshot.region_states if region.region_id == region_id)


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


def looting_payload(actions: list[dict[str, object]]) -> dict[str, object]:
    return {
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
            "militaryActions": [],
            "diplomacyActions": [],
            "colonizationActions": [],
            "navalDeployment": {},
            "conquestActions": [],
            "lootingActions": actions,
        },
    }


def setup_owned_colony(
    snapshot: GameSnapshot,
    *,
    region_id: str = "americas",
    controller: str = "britain",
    access_level: RegionAccessLevel = RegionAccessLevel.COLONY,
    resource_limit: dict[str, int] | None = None,
) -> RegionState:
    region = get_region(snapshot, region_id)
    region.controller = controller
    region.access_level = access_level
    if resource_limit is not None:
        region.resource_limit = dict(resource_limit)
    return region


class LootingHappyPathTests(unittest.TestCase):
    def test_loot_from_own_colony_transfers_one_unit(self) -> None:
        snapshot = build_snapshot()
        setup_owned_colony(snapshot, resource_limit={"cotton": 4})
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 0

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                looting_payload([{"regionId": "americas", "resourceType": "cotton"}]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(americas.resource_limit.get("cotton"), 3)
        self.assertEqual(updated_britain.phase1_economy.raw_materials, 1)
        self.assertIn("americas", resolution.updated_snapshot.looted_regions_this_turn)


class LootingValidationTests(unittest.TestCase):
    def test_loot_from_concession_rejected(self) -> None:
        snapshot = build_snapshot()
        setup_owned_colony(
            snapshot,
            access_level=RegionAccessLevel.CONCESSION,
            resource_limit={"cotton": 4},
        )
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 0

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                looting_payload([{"regionId": "americas", "resourceType": "cotton"}]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(americas.resource_limit.get("cotton"), 4)
        self.assertEqual(updated_britain.phase1_economy.raw_materials, 0)
        self.assertNotIn("americas", resolution.updated_snapshot.looted_regions_this_turn)

    def test_loot_from_uncontrolled_region_rejected(self) -> None:
        snapshot = build_snapshot()
        americas = get_region(snapshot, "americas")
        americas.controller = None
        americas.access_level = RegionAccessLevel.COLONY
        americas.resource_limit = {"cotton": 4}
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 0

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                looting_payload([{"regionId": "americas", "resourceType": "cotton"}]),
            )],
        )

        americas_after = get_region(resolution.updated_snapshot, "americas")
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(americas_after.resource_limit.get("cotton"), 4)
        self.assertEqual(updated_britain.phase1_economy.raw_materials, 0)

    def test_loot_from_other_players_colony_rejected(self) -> None:
        snapshot = build_snapshot()
        setup_owned_colony(snapshot, controller="france", resource_limit={"cotton": 4})
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 0

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                looting_payload([{"regionId": "americas", "resourceType": "cotton"}]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(americas.resource_limit.get("cotton"), 4)
        self.assertEqual(updated_britain.phase1_economy.raw_materials, 0)

    def test_loot_when_resource_limit_zero_rejected(self) -> None:
        snapshot = build_snapshot()
        setup_owned_colony(snapshot, resource_limit={"cotton": 0})
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 0

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                looting_payload([{"regionId": "americas", "resourceType": "cotton"}]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(americas.resource_limit.get("cotton"), 0)
        self.assertEqual(updated_britain.phase1_economy.raw_materials, 0)
        self.assertNotIn("americas", resolution.updated_snapshot.looted_regions_this_turn)


class LootingIndependenceIntegrationTests(unittest.TestCase):
    def test_looted_region_receives_independence_penalty(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        americas = get_region(snapshot, "americas")
        americas.controller = "britain"
        americas.access_level = RegionAccessLevel.COLONY
        americas.independence = 0
        americas.garrison = {}
        americas.market_supply = {"cotton": 10}
        americas.resource_limit = {"cotton": 10}

        snapshot.looted_regions_this_turn = {"americas"}

        _apply_independence_progression(
            snapshot,
            balance,
            looted_regions=set(snapshot.looted_regions_this_turn),
        )

        americas_after = get_region(snapshot, "americas")
        self.assertEqual(americas_after.independence, 2)


class LootingPerColonyLimitTests(unittest.TestCase):
    def test_multiple_looting_actions_same_colony_only_first_succeeds(self) -> None:
        snapshot = build_snapshot()
        setup_owned_colony(snapshot, resource_limit={"cotton": 4, "grain": 4})
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 0

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                looting_payload([
                    {"regionId": "americas", "resourceType": "cotton"},
                    {"regionId": "americas", "resourceType": "grain"},
                ]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(americas.resource_limit.get("cotton"), 3)
        self.assertEqual(americas.resource_limit.get("grain"), 4)
        self.assertEqual(updated_britain.phase1_economy.raw_materials, 1)


class LootingPersistenceTests(unittest.TestCase):
    def test_resource_limit_decrement_persists_across_turns(self) -> None:
        snapshot = build_snapshot()
        setup_owned_colony(snapshot, resource_limit={"cotton": 4})
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 0

        first = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                looting_payload([{"regionId": "americas", "resourceType": "cotton"}]),
            )],
        )

        first_americas = get_region(first.updated_snapshot, "americas")
        self.assertEqual(first_americas.resource_limit.get("cotton"), 3)

        # Simulate a fresh turn — looted_regions_this_turn was reset by settlement.
        next_snapshot = first.updated_snapshot
        next_snapshot.looted_regions_this_turn = set()

        second = resolve_decision_phase(
            snapshot=next_snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                looting_payload([{"regionId": "americas", "resourceType": "cotton"}]),
            )],
        )

        second_americas = get_region(second.updated_snapshot, "americas")
        updated_britain = get_player(second.updated_snapshot, "player-1")
        self.assertEqual(second_americas.resource_limit.get("cotton"), 2)
        self.assertEqual(updated_britain.phase1_economy.raw_materials, 2)


if __name__ == "__main__":
    unittest.main()
