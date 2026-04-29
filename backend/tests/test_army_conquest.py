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


def empty_payload(conquest_actions: list[dict[str, object]] | None = None) -> dict[str, object]:
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
            "conquestActions": conquest_actions or [],
        },
    }


class CaptureUnclaimedRegionTests(unittest.TestCase):
    def test_capture_unclaimed_region_with_sufficient_power(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.army = {"infantry": 3, "artillery": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                empty_payload(conquest_actions=[
                    {"regionId": "americas", "infantry": 1, "artillery": 0}
                ]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertEqual(americas.controller, "britain")

    def test_capture_unclaimed_region_insufficient_power_rejected(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.army = {"infantry": 0, "artillery": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                empty_payload(conquest_actions=[
                    {"regionId": "americas", "infantry": 1, "artillery": 0}
                ]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertIsNone(americas.controller)
        # Army not consumed.
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.army.get("infantry", 0), 0)


class CaptureColonyTests(unittest.TestCase):
    def test_capture_from_another_player_meets_two_times_garrison(self) -> None:
        snapshot = build_snapshot()
        # France pre-controls americas with 2 infantry garrison (power 2 → need 4 attack).
        americas = get_region(snapshot, "americas")
        americas.controller = "france"
        americas.garrison = {"infantry": 2, "artillery": 0}

        britain = get_player(snapshot, "player-1")
        britain.army = {"infantry": 4, "artillery": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                empty_payload(conquest_actions=[
                    {"regionId": "americas", "infantry": 4, "artillery": 0}
                ]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertEqual(americas.controller, "britain")
        self.assertEqual(americas.garrison, {"infantry": 4, "artillery": 0})

    def test_capture_from_another_player_insufficient_power_rejected(self) -> None:
        snapshot = build_snapshot()
        americas = get_region(snapshot, "americas")
        americas.controller = "france"
        americas.garrison = {"infantry": 2, "artillery": 0}

        britain = get_player(snapshot, "player-1")
        britain.army = {"infantry": 3, "artillery": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                empty_payload(conquest_actions=[
                    {"regionId": "americas", "infantry": 3, "artillery": 0}
                ]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertEqual(americas.controller, "france")
        self.assertEqual(americas.garrison, {"infantry": 2, "artillery": 0})
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.army.get("infantry", 0), 3)


class ArtilleryPowerTests(unittest.TestCase):
    def test_artillery_counts_as_two_infantry(self) -> None:
        snapshot = build_snapshot()
        # Defender has 2 infantry → garrison power 2 → need attack ≥ 4.
        americas = get_region(snapshot, "americas")
        americas.controller = "france"
        americas.garrison = {"infantry": 2, "artillery": 0}

        britain = get_player(snapshot, "player-1")
        britain.army = {"infantry": 0, "artillery": 2}  # power = 4

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                empty_payload(conquest_actions=[
                    {"regionId": "americas", "infantry": 0, "artillery": 2}
                ]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertEqual(americas.controller, "britain")
        self.assertEqual(americas.garrison, {"infantry": 0, "artillery": 2})


class ConflictResolutionTests(unittest.TestCase):
    def test_two_players_attack_same_region_higher_power_wins(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.army = {"infantry": 3, "artillery": 0}
        france = get_player(snapshot, "player-2")
        france.army = {"infantry": 5, "artillery": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    empty_payload(conquest_actions=[
                        {"regionId": "americas", "infantry": 3, "artillery": 0}
                    ]),
                ),
                build_turn_input(
                    "player-2",
                    empty_payload(conquest_actions=[
                        {"regionId": "americas", "infantry": 5, "artillery": 0}
                    ]),
                ),
            ],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertEqual(americas.controller, "france")
        # Britain's army not consumed (lost the conflict).
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.army.get("infantry", 0), 3)
        # France's army deducted.
        updated_france = get_player(resolution.updated_snapshot, "player-2")
        self.assertEqual(updated_france.army.get("infantry", 0), 0)

    def test_two_players_tie_nobody_wins(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.army = {"infantry": 3, "artillery": 0}
        france = get_player(snapshot, "player-2")
        france.army = {"infantry": 3, "artillery": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                build_turn_input(
                    "player-1",
                    empty_payload(conquest_actions=[
                        {"regionId": "americas", "infantry": 3, "artillery": 0}
                    ]),
                ),
                build_turn_input(
                    "player-2",
                    empty_payload(conquest_actions=[
                        {"regionId": "americas", "infantry": 3, "artillery": 0}
                    ]),
                ),
            ],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertIsNone(americas.controller)
        # Neither player's army is consumed.
        self.assertEqual(get_player(resolution.updated_snapshot, "player-1").army.get("infantry", 0), 3)
        self.assertEqual(get_player(resolution.updated_snapshot, "player-2").army.get("infantry", 0), 3)


class RouteBlockedConquestTests(unittest.TestCase):
    def test_route_blocked_rejects_conquest(self) -> None:
        snapshot = build_snapshot()
        # Block the route to americas: france controls north_atlantic and blockades it.
        north_atlantic = next(node for node in snapshot.ocean_node_states if node.node_id == "north_atlantic")
        north_atlantic.controller = "france"
        north_atlantic.is_blockaded = True

        britain = get_player(snapshot, "player-1")
        britain.army = {"infantry": 5, "artillery": 0}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                empty_payload(conquest_actions=[
                    {"regionId": "americas", "infantry": 5, "artillery": 0}
                ]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertIsNone(americas.controller)
        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.army.get("infantry", 0), 5)


class GarrisonAndArmyAfterCaptureTests(unittest.TestCase):
    def test_garrison_set_to_committed_army_after_capture(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.army = {"infantry": 4, "artillery": 2}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                empty_payload(conquest_actions=[
                    {"regionId": "americas", "infantry": 2, "artillery": 1}
                ]),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertEqual(americas.controller, "britain")
        self.assertEqual(americas.garrison, {"infantry": 2, "artillery": 1})

    def test_army_deducted_after_conquest(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.army = {"infantry": 4, "artillery": 2}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                empty_payload(conquest_actions=[
                    {"regionId": "americas", "infantry": 2, "artillery": 1}
                ]),
            )],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.army.get("infantry", 0), 2)
        self.assertEqual(updated_britain.army.get("artillery", 0), 1)


if __name__ == "__main__":
    unittest.main()
