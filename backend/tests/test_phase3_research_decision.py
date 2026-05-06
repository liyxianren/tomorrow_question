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


def empty_military_plan() -> dict[str, object]:
    return {
        "unlockColonization": False,
        "militaryActions": [],
        "diplomacyActions": [],
        "colonizationActions": [],
    }


def build_turn_input(player_id: str, research_target: object) -> PlayerTurnInput:
    payload: dict[str, object] = {
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
            "techResearch": [],
        },
        "militaryPlan": empty_military_plan(),
        "researchTarget": research_target,
    }
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


class Phase3ResearchDecisionTests(unittest.TestCase):
    def test_set_valid_first_tech_in_chain(self) -> None:
        snapshot = build_snapshot()
        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", "spinning_jenny")],
        )
        britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(britain.active_research, "spinning_jenny")

    def test_set_valid_second_tech_when_prerequisite_unlocked(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.unlocked_techs.append("spinning_jenny")

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", "lathe")],
        )
        updated = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.active_research, "lathe")

    def test_invalid_target_not_in_any_chain_keeps_active_research_none(self) -> None:
        snapshot = build_snapshot()
        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", "nonexistent_tech")],
        )
        britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertIsNone(britain.active_research)

    def test_target_with_unmet_prerequisite_keeps_active_research_none(self) -> None:
        snapshot = build_snapshot()
        # lathe requires spinning_jenny; do not unlock it.
        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", "lathe")],
        )
        britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertIsNone(britain.active_research)

    def test_target_none_is_noop(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.active_research = None

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", None)],
        )
        updated = get_player(resolution.updated_snapshot, "player-1")
        self.assertIsNone(updated.active_research)

    def test_switching_targets_changes_active_research(self) -> None:
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.active_research = "spinning_jenny"
        britain.research_progress = {"spinning_jenny": 2}
        britain.unlocked_techs.append("spinning_jenny")

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input("player-1", "lathe")],
        )
        updated = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.active_research, "lathe")
        # Old progress is preserved on the dict (settlement-phase logic decides what to do with it).
        self.assertEqual(updated.research_progress.get("spinning_jenny"), 2)


if __name__ == "__main__":
    unittest.main()
