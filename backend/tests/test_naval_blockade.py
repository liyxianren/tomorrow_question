from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, OceanNodeState, PlayerState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.rules.decision import resolve_decision_phase
from app.modules.rules.route_utils import check_route_accessible
from app.modules.rules.settlement import _resolve_naval_blockade


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


def get_node(snapshot: GameSnapshot, node_id: str) -> OceanNodeState:
    return next(node for node in snapshot.ocean_node_states if node.node_id == node_id)


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


def empty_payload(naval_deployment: dict[str, int] | None = None, diplomacy_actions: list[dict[str, str]] | None = None) -> dict[str, object]:
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
            "diplomacyActions": diplomacy_actions or [],
            "colonizationActions": [],
            "navalDeployment": naval_deployment or {},
        },
    }


class NavalDeploymentTests(unittest.TestCase):
    def test_deploy_fleets_updates_navy_by_country(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.navy = {"fleets": 3}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", empty_payload(naval_deployment={"north_atlantic": 2, "mediterranean": 1}))],
        )

        node_north = get_node(resolution.updated_snapshot, "north_atlantic")
        node_med = get_node(resolution.updated_snapshot, "mediterranean")
        self.assertEqual(node_north.navy_by_country.get("britain"), 2)
        self.assertEqual(node_med.navy_by_country.get("britain"), 1)

    def test_deploy_exceeds_total_fleets_is_rejected(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.navy = {"fleets": 2}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", empty_payload(naval_deployment={"north_atlantic": 2, "mediterranean": 1}))],
        )

        node_north = get_node(resolution.updated_snapshot, "north_atlantic")
        node_med = get_node(resolution.updated_snapshot, "mediterranean")
        self.assertEqual(node_north.navy_by_country.get("britain", 0), 0)
        self.assertEqual(node_med.navy_by_country.get("britain", 0), 0)

    def test_single_node_count_exceeds_total_fleets_is_rejected(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.navy = {"fleets": 2}

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", empty_payload(naval_deployment={"north_atlantic": 5}))],
        )

        node_north = get_node(resolution.updated_snapshot, "north_atlantic")
        self.assertEqual(node_north.navy_by_country.get("britain", 0), 0)


class NavalBlockadeResolutionTests(unittest.TestCase):
    def test_blockade_determined_when_clear_leader_meets_threshold(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        node = get_node(snapshot, "north_atlantic")
        node.navy_by_country = {"britain": 3, "france": 1}

        _resolve_naval_blockade(snapshot, balance)

        node = get_node(snapshot, "north_atlantic")
        self.assertEqual(node.controller, "britain")
        self.assertTrue(node.is_blockaded)

    def test_no_blockade_when_below_threshold(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        node = get_node(snapshot, "north_atlantic")
        node.navy_by_country = {"britain": 1, "france": 0}

        _resolve_naval_blockade(snapshot, balance)

        node = get_node(snapshot, "north_atlantic")
        self.assertIsNone(node.controller)
        self.assertFalse(node.is_blockaded)

    def test_no_blockade_when_top_two_are_tied(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        node = get_node(snapshot, "north_atlantic")
        node.navy_by_country = {"britain": 3, "france": 3}

        _resolve_naval_blockade(snapshot, balance)

        node = get_node(snapshot, "north_atlantic")
        self.assertIsNone(node.controller)
        self.assertFalse(node.is_blockaded)


class RouteAccessibilityTests(unittest.TestCase):
    def test_route_accessible_when_no_required_node_blockade(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()

        self.assertTrue(check_route_accessible("britain", "americas", snapshot, balance))

    def test_route_blocked_when_required_node_blockaded_by_other(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        node = get_node(snapshot, "north_atlantic")
        node.controller = "france"
        node.is_blockaded = True

        self.assertFalse(check_route_accessible("britain", "americas", snapshot, balance))
        self.assertTrue(check_route_accessible("france", "americas", snapshot, balance))

    def test_europe_always_accessible(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        for node in snapshot.ocean_node_states:
            node.controller = "france"
            node.is_blockaded = True

        self.assertTrue(check_route_accessible("britain", "europe", snapshot, balance))


class DiplomacyRouteGatingTests(unittest.TestCase):
    def test_diplomacy_blocked_when_route_inaccessible(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.budget_pools = {"domesticMarket": 12, "factory": 14, "governmentFiscal": 30}
        north_atlantic = get_node(snapshot, "north_atlantic")
        north_atlantic.controller = "france"
        north_atlantic.is_blockaded = True

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                empty_payload(diplomacy_actions=[{"actionId": "establish_americas"}]),
            )],
        )

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertNotIn("americas", updated_britain.established_diplomacy)
        # No budget consumed for the rejected diplomacy action.
        self.assertEqual(updated_britain.budget_pools["governmentFiscal"], 30)


if __name__ == "__main__":
    unittest.main()
