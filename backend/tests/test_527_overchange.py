from __future__ import annotations

import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, ErrorCode, GamePhase
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, PlayerState, RegionState
from app.modules.game_state.phase_deadline import assign_phase_deadline
from app.modules.game_state.phase_state import PhaseSubmissionState
from app.modules.game_state.workspaces import build_decision_player_workspace
from app.modules.room.service import create_room
from app.modules.rules.colonization import colony_raw_material_yield
from app.modules.rules.decision import _apply_military_plan
from app.modules.settlement.phase_submission import PhaseSubmissionError, PhaseSubmissionService


def build_snapshot() -> tuple[object, GameSnapshot]:
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
    return game, snapshot


def get_player(snapshot: GameSnapshot, player_id: str) -> PlayerState:
    return next(player for player in snapshot.player_states if player.player_id == player_id)


def get_region(snapshot: GameSnapshot, region_id: str) -> RegionState:
    return next(region for region in snapshot.region_states if region.region_id == region_id)


def build_room():
    room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
    room.members.extend(
        [
            room.members[0].__class__(player_id="player-2", nickname="Linus"),
            room.members[0].__class__(player_id="player-3", nickname="Grace"),
            room.members[0].__class__(player_id="player-4", nickname="Margaret"),
            room.members[0].__class__(player_id="player-5", nickname="Donald"),
        ]
    )
    return room


def empty_decision_payload() -> dict[str, object]:
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
            "militaryActions": [],
            "colonizationActions": [],
            "navalDeployment": {},
            "regionBlockades": {},
        },
        "talentPlan": {"talentUnlocks": []},
    }


class Overchange527Tests(unittest.TestCase):
    def test_workspace_colonization_options_use_resource_limit_formula(self) -> None:
        _, snapshot = build_snapshot()
        player = get_player(snapshot, "player-1")
        player.army = {"army": 3}

        workspace = build_decision_player_workspace(snapshot, player)
        options = {
            option["regionId"]: option
            for option in workspace["militaryWorkspace"]["colonizationOptions"]
        }

        self.assertEqual(options["americas"]["rawMaterialsPerTurn"], 3)
        self.assertEqual(options["africa"]["rawMaterialsPerTurn"], 2)
        self.assertEqual(options["middle_east"]["rawMaterialsPerTurn"], 2)
        self.assertEqual(options["asia_pacific"]["rawMaterialsPerTurn"], 2)
        self.assertFalse(options["europe"]["isColonizable"])
        self.assertFalse(options["europe"]["canColonize"])
        self.assertEqual(options["europe"]["rawMaterialsPerTurn"], 0)

    def test_colonization_consumes_three_army_and_sets_controller(self) -> None:
        _, snapshot = build_snapshot()
        player = get_player(snapshot, "player-1")
        player.army = {"army": 3}
        africa = get_region(snapshot, "africa")

        _apply_military_plan(
            player,
            {"militaryActions": [], "colonizationActions": [{"regionId": "africa"}]},
            get_balance_config(),
            snapshot,
        )

        self.assertEqual(player.army["army"], 0)
        self.assertEqual(africa.controller, "britain")
        self.assertEqual(colony_raw_material_yield(africa), 2)

    def test_colonization_rejects_europe_and_already_controlled_region(self) -> None:
        _, snapshot = build_snapshot()
        player = get_player(snapshot, "player-1")
        player.army = {"army": 6}
        europe = get_region(snapshot, "europe")
        africa = get_region(snapshot, "africa")
        africa.controller = "france"

        _apply_military_plan(
            player,
            {
                "militaryActions": [],
                "colonizationActions": [{"regionId": "europe"}, {"regionId": "africa"}],
            },
            get_balance_config(),
            snapshot,
        )

        self.assertIsNone(europe.controller)
        self.assertEqual(africa.controller, "france")
        self.assertEqual(player.army["army"], 6)

    def test_submission_allows_colonization_when_recruitment_reaches_three_army(self) -> None:
        game, snapshot = build_snapshot()
        player = get_player(snapshot, "player-1")
        player.army = {"army": 2}
        player.budget_pools["governmentFiscal"] = 100
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 5, 27, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )
        payload = empty_decision_payload()
        payload["militaryPlan"]["militaryActions"] = [{"actionId": "recruit_army"}]
        payload["militaryPlan"]["colonizationActions"] = [{"regionId": "americas"}]

        result = PhaseSubmissionService().submit(
            room=build_room(),
            game=game,
            snapshot=snapshot,
            phase_state=PhaseSubmissionState.from_snapshot(snapshot),
            player_id="player-1",
            requested_phase=GamePhase.DECISION,
            payload=payload,
            submitted_at=datetime(2026, 5, 27, 12, 1, tzinfo=UTC),
        )

        self.assertEqual(
            result.player_turn_input.payload["militaryPlan"]["colonizationActions"],
            [{"regionId": "americas"}],
        )

    def test_submission_rejects_non_colonizable_region(self) -> None:
        game, snapshot = build_snapshot()
        player = get_player(snapshot, "player-1")
        player.army = {"army": 3}
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 5, 27, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )
        payload = empty_decision_payload()
        payload["militaryPlan"]["colonizationActions"] = [{"regionId": "europe"}]

        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=build_room(),
                game=game,
                snapshot=snapshot,
                phase_state=PhaseSubmissionState.from_snapshot(snapshot),
                player_id="player-1",
                requested_phase=GamePhase.DECISION,
                payload=payload,
                submitted_at=datetime(2026, 5, 27, 12, 1, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.INVALID_SUBMISSION)


if __name__ == "__main__":
    unittest.main()
