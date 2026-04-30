from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.rules.common import (
    PHASE_INPUT_FIELDS,
    default_decision_submission_payload,
    default_market_submission_payload,
)
from app.modules.rules.decision import resolve_decision_phase


def _build_snapshot():
    game = create_game(room_code="ROOM01", game_id="game-1")
    return create_initial_snapshot(
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


class LegacyPhaseFreezeTests(unittest.TestCase):
    def test_initial_snapshot_starts_at_decision_phase(self) -> None:
        snapshot = _build_snapshot()

        self.assertEqual(snapshot.phase, GamePhase.DECISION)
        self.assertEqual([phase.value for phase in GamePhase], ["decision", "market", "settlement"])
        self.assertFalse(hasattr(GamePhase, "PRODUCTION"))
        self.assertFalse(hasattr(GamePhase, "MILITARY"))
        self.assertFalse(hasattr(GamePhase, "POLITICS"))

    def test_runtime_accepts_player_input_only_in_decision_and_market(self) -> None:
        self.assertEqual(set(PHASE_INPUT_FIELDS), {GamePhase.DECISION, GamePhase.MARKET, GamePhase.SETTLEMENT})
        self.assertEqual(PHASE_INPUT_FIELDS[GamePhase.DECISION], ("factoryPlan", "domesticMarketPlan", "governmentPlan", "militaryPlan"))
        self.assertEqual(PHASE_INPUT_FIELDS[GamePhase.MARKET], ("saleOrders",))
        self.assertEqual(PHASE_INPUT_FIELDS[GamePhase.SETTLEMENT], ())

    def test_decision_and_market_timeout_payloads_are_typed(self) -> None:
        decision_payload = default_decision_submission_payload()
        market_payload = default_market_submission_payload()

        self.assertEqual(
            set(decision_payload["factoryPlan"].keys()),
            {"productionOrders", "expansionOrders", "upgradeOrders", "newFactoryOrders"},
        )
        self.assertIn("adminPurchases", decision_payload["governmentPlan"])
        self.assertEqual(decision_payload["militaryPlan"]["militaryActions"], [])
        self.assertEqual(decision_payload["militaryPlan"]["diplomacyActions"], [])
        self.assertEqual(market_payload, {"saleOrders": []})

    def test_military_plan_applies_effects_and_diplomacy(self) -> None:
        snapshot = _build_snapshot()
        player = next(state for state in snapshot.player_states if state.player_id == "player-1")
        player.budget_pools["governmentFiscal"] = 30

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[
                PlayerTurnInput(
                    game_id=snapshot.game_id,
                    round_no=snapshot.round_no,
                    phase=snapshot.phase,
                    player_id="player-1",
                    submission_status=PlayerSubmissionStatus.SUBMITTED,
                    payload={
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
                        "militaryPlan": {
                            "unlockColonization": False,
                            "militaryActions": [{"actionId": "recruit_infantry"}],
                            "diplomacyActions": [{"actionId": "establish_africa"}],
                            "colonizationActions": [],
                        },
                    },
                    submitted_at=None,
                    is_timeout_generated=False,
                )
            ],
        )

        updated = next(state for state in resolution.updated_snapshot.player_states if state.player_id == "player-1")
        self.assertGreaterEqual(updated.military_points, 2)
        self.assertIn("africa", updated.established_diplomacy)


if __name__ == "__main__":
    unittest.main()
