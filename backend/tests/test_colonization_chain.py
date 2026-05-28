"""5.27 simplified colonization regression tests."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, PlayerState, RegionState
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


def payload(colonization_actions: list[dict[str, str]]) -> dict[str, object]:
    return {
        "factoryPlan": {
            "productionOrders": [],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
            "rawMaterialPurchaseQuantity": 0,
            "factoryActions": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {"pointPurchases": [], "strategySelections": [], "techResearch": []},
        "militaryPlan": {
            "unlockColonization": False,
            "militaryActions": [],
            "colonizationActions": colonization_actions,
            "navalDeployment": {},
            "regionBlockades": {},
            "conquestActions": [],
            "lootingActions": [],
        },
        "talentPlan": {"talentUnlocks": []},
    }


class SimplifiedColonizationTests(unittest.TestCase):
    def test_colonize_accessible_overseas_region_with_three_army(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.army = {"army": 3}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", payload([{"regionId": "americas"}]))],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertEqual(americas.controller, "britain")
        self.assertEqual(updated_britain.army["army"], 0)

    def test_legacy_target_region_id_is_normalized_by_rule_layer(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.army = {"army": 3}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", payload([{"targetRegionId": "africa"}]))],
        )

        africa = get_region(resolution.updated_snapshot, "africa")
        self.assertEqual(africa.controller, "britain")

    def test_europe_is_not_colonizable(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.army = {"army": 3}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", payload([{"regionId": "europe"}]))],
        )

        europe = get_region(resolution.updated_snapshot, "europe")
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertIsNone(europe.controller)
        self.assertEqual(updated_britain.army["army"], 3)

    def test_already_controlled_region_cannot_be_recolonized(self) -> None:
        snapshot = build_snapshot()
        africa = get_region(snapshot, "africa")
        africa.controller = "france"
        britain = get_player(snapshot, "player-1")
        britain.army = {"army": 3}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", payload([{"regionId": "africa"}]))],
        )

        updated_africa = get_region(resolution.updated_snapshot, "africa")
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_africa.controller, "france")
        self.assertEqual(updated_britain.army["army"], 3)

    def test_multiple_colonizations_consume_three_army_each(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.army = {"army": 6}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    payload([{"regionId": "americas"}, {"regionId": "africa"}]),
                )
            ],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(get_region(resolution.updated_snapshot, "americas").controller, "britain")
        self.assertEqual(get_region(resolution.updated_snapshot, "africa").controller, "britain")
        self.assertEqual(updated_britain.army["army"], 0)


if __name__ == "__main__":
    unittest.main()
