from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, PlayerState
from app.modules.rules.settlement import _apply_phase3_research_progress


def build_snapshot() -> GameSnapshot:
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


def get_player(snapshot: GameSnapshot, player_id: str) -> PlayerState:
    return next(player for player in snapshot.player_states if player.player_id == player_id)


class Phase3ResearchSettlementTests(unittest.TestCase):
    def test_progress_accumulates_from_facilities(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        britain = get_player(snapshot, "player-1")
        # voltaic_pile threshold=4, 1 facility, no prior progress -> progress = 1, no roll.
        britain.active_research = "voltaic_pile"
        britain.research_facilities = {"electrical": 1}

        _apply_phase3_research_progress(britain, snapshot, balance)

        self.assertEqual(britain.research_progress.get("voltaic_pile"), 1)
        self.assertNotIn("voltaic_pile", britain.unlocked_techs)

    def test_progress_below_threshold_returns_without_unlock(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        britain = get_player(snapshot, "player-1")
        # voltaic_pile threshold=3, prior progress 1 + 1 facility = 2 < 3.
        britain.active_research = "voltaic_pile"
        britain.research_progress = {"voltaic_pile": 1}
        britain.research_facilities = {"electrical": 1}

        with patch("app.modules.rules.settlement.random.randint") as mock_roll:
            _apply_phase3_research_progress(britain, snapshot, balance)
            mock_roll.assert_not_called()

        self.assertEqual(britain.research_progress.get("voltaic_pile"), 2)
        self.assertNotIn("voltaic_pile", britain.unlocked_techs)
        self.assertEqual(britain.breakthrough_attempts.get("voltaic_pile", 0), 0)

    def test_successful_breakthrough_unlocks_and_clears_progress(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        britain = get_player(snapshot, "player-1")
        # leyden_jar threshold=3, prior 2 + 1 facility = 3 >= 3.
        britain.active_research = "leyden_jar"
        britain.research_progress = {"leyden_jar": 2}
        britain.research_facilities = {"electrical": 1}

        with patch("app.modules.rules.settlement.random.randint", return_value=10):
            _apply_phase3_research_progress(britain, snapshot, balance)

        self.assertIn("leyden_jar", britain.unlocked_techs)
        self.assertEqual(britain.research_progress.get("leyden_jar"), 0)
        self.assertNotIn("leyden_jar", britain.breakthrough_attempts)

    def test_failed_breakthrough_keeps_progress_and_increments_attempts(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        britain = get_player(snapshot, "player-1")
        # leyden_jar threshold=3, prior 2 + 1 facility = 3 >= 3, roll fails.
        britain.active_research = "leyden_jar"
        britain.research_progress = {"leyden_jar": 2}
        britain.research_facilities = {"electrical": 1}

        with patch("app.modules.rules.settlement.random.randint", return_value=1):
            _apply_phase3_research_progress(britain, snapshot, balance)

        self.assertNotIn("leyden_jar", britain.unlocked_techs)
        self.assertEqual(britain.research_progress.get("leyden_jar"), 3)
        self.assertEqual(britain.breakthrough_attempts.get("leyden_jar"), 1)

    def test_soft_pity_lowers_effective_threshold(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        britain = get_player(snapshot, "player-1")
        # voltaic_pile threshold=4, attempts=2 -> effective=2.
        # progress 1 + 1 facility = 2 >= 2, roll=2 succeeds (2 >= 2).
        britain.active_research = "voltaic_pile"
        britain.research_progress = {"voltaic_pile": 1}
        britain.breakthrough_attempts = {"voltaic_pile": 2}
        britain.research_facilities = {"electrical": 1}

        with patch("app.modules.rules.settlement.random.randint", return_value=2):
            _apply_phase3_research_progress(britain, snapshot, balance)

        self.assertIn("voltaic_pile", britain.unlocked_techs)
        self.assertEqual(britain.research_progress.get("voltaic_pile"), 0)
        self.assertNotIn("voltaic_pile", britain.breakthrough_attempts)

    def test_direct_unlock_when_other_player_already_discovered(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        britain = get_player(snapshot, "player-1")
        france = get_player(snapshot, "player-2")
        # voltaic_pile threshold=3, France already unlocked it.
        france.unlocked_techs.append("voltaic_pile")
        # Britain accumulates progress=5+1=6 >= 2*3, direct-unlock without dice.
        britain.active_research = "voltaic_pile"
        britain.research_progress = {"voltaic_pile": 5}
        britain.research_facilities = {"electrical": 1}

        with patch("app.modules.rules.settlement.random.randint") as mock_roll:
            _apply_phase3_research_progress(britain, snapshot, balance)
            mock_roll.assert_not_called()

        self.assertIn("voltaic_pile", britain.unlocked_techs)
        # Direct-unlock consumes 2*threshold from total accumulated progress.
        self.assertEqual(britain.research_progress.get("voltaic_pile"), 0)
        self.assertNotIn("voltaic_pile", britain.breakthrough_attempts)

    def test_no_active_research_is_noop(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        britain = get_player(snapshot, "player-1")
        britain.active_research = None
        britain.research_facilities = {"electrical": 5}

        with patch("app.modules.rules.settlement.random.randint") as mock_roll:
            _apply_phase3_research_progress(britain, snapshot, balance)
            mock_roll.assert_not_called()

        self.assertEqual(britain.research_progress, {})
        self.assertEqual(britain.unlocked_techs, [])

    def test_multiple_facilities_increase_progress_by_total(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        britain = get_player(snapshot, "player-1")
        # power_generation threshold=5, 3 facilities -> progress 3 < 5, no roll.
        britain.active_research = "power_generation"
        britain.research_facilities = {"electrical": 1, "mechanical": 1, "steam": 1}

        with patch("app.modules.rules.settlement.random.randint") as mock_roll:
            _apply_phase3_research_progress(britain, snapshot, balance)
            mock_roll.assert_not_called()

        self.assertEqual(britain.research_progress.get("power_generation"), 3)
        self.assertNotIn("power_generation", britain.unlocked_techs)

    def test_max_pity_effective_threshold_one_guarantees_success(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        britain = get_player(snapshot, "player-1")
        # leyden_jar threshold=3, attempts=5 -> effective = max(1, 3-5) = 1.
        # progress 0 + 1 facility = 1 >= 1, roll=1 succeeds (1 >= 1).
        britain.active_research = "leyden_jar"
        britain.breakthrough_attempts = {"leyden_jar": 5}
        britain.research_facilities = {"electrical": 1}

        with patch("app.modules.rules.settlement.random.randint", return_value=1):
            _apply_phase3_research_progress(britain, snapshot, balance)

        self.assertIn("leyden_jar", britain.unlocked_techs)
        self.assertEqual(britain.research_progress.get("leyden_jar"), 0)
        self.assertNotIn("leyden_jar", britain.breakthrough_attempts)


if __name__ == "__main__":
    unittest.main()
