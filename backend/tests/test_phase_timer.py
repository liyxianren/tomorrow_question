from __future__ import annotations

import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import GamePhase, SocketEventName
from app import _should_start_phase_timeout_runner
from app.config import Settings
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.phase_deadline import (
    assign_phase_deadline,
    register_phase_deadline_change_listener,
    unregister_phase_deadline_change_listener,
)
from app.modules.realtime.phase_timer import (
    build_phase_timer_broadcast,
    build_phase_timer_payload,
    compute_next_wait_seconds,
)


class PhaseTimerTests(unittest.TestCase):
    def test_zero_phase_duration_still_starts_runner_outside_tests(self) -> None:
        settings = Settings(
            app_env="development",
            secret_key="test",
            host="127.0.0.1",
            port=5001,
            database_path=":memory:",
            frontend_dist="../frontend/dist",
            socketio_async_mode="threading",
            cors_allowed_origins=["http://127.0.0.1:5173"],
            debug=True,
        )

        with patch.dict("os.environ", {"PYTEST_CURRENT_TEST": ""}):
            self.assertTrue(_should_start_phase_timeout_runner(settings, 0))

    def test_build_phase_timer_payload_exposes_phase_deadline_and_remaining_seconds(self) -> None:
        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={
                "player-1": "britain",
                "player-2": "france",
                "player-3": "prussia",
                "player-4": "austria",
                "player-5": "russia",
            },
        )
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        payload = build_phase_timer_payload(
            snapshot=snapshot,
            now=datetime(2026, 3, 29, 12, 1, 15, tzinfo=UTC),
        )

        self.assertEqual(payload["phase"], GamePhase.DECISION)
        self.assertEqual(payload["deadlineAt"], "2026-03-29T12:02:00+00:00")
        self.assertEqual(payload["remainingSeconds"], 45)

    def test_build_phase_timer_payload_clamps_remaining_seconds_to_zero(self) -> None:
        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={
                "player-1": "britain",
                "player-2": "france",
                "player-3": "prussia",
                "player-4": "austria",
                "player-5": "russia",
            },
        )
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        payload = build_phase_timer_payload(
            snapshot=snapshot,
            now=datetime(2026, 3, 29, 12, 3, tzinfo=UTC),
        )

        self.assertEqual(payload["remainingSeconds"], 0)

    def test_build_phase_timer_broadcast_wraps_payload_in_socket_envelope(self) -> None:
        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={
                "player-1": "britain",
                "player-2": "france",
                "player-3": "prussia",
                "player-4": "austria",
                "player-5": "russia",
            },
        )
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        event_name, envelope = build_phase_timer_broadcast(
            room_code="ROOM01",
            game_id="game-1",
            snapshot=snapshot,
            now=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
        )

        self.assertEqual(event_name, SocketEventName.GAME_PHASE_TIMER)
        self.assertEqual(envelope["roomCode"], "ROOM01")
        self.assertEqual(envelope["gameId"], "game-1")
        self.assertEqual(envelope["payload"]["phase"], GamePhase.DECISION)


class ComputeNextWaitSecondsTests(unittest.TestCase):
    def test_returns_seconds_until_soonest_deadline(self) -> None:
        result = compute_next_wait_seconds(
            deadlines=[datetime(2026, 3, 29, 12, 0, 10, tzinfo=UTC)],
            now=datetime(2026, 3, 29, 12, 0, 0, tzinfo=UTC),
            fallback_seconds=30,
        )
        self.assertAlmostEqual(result, 10.0)

    def test_caps_at_fallback_when_deadline_far(self) -> None:
        result = compute_next_wait_seconds(
            deadlines=[datetime(2026, 3, 29, 12, 5, 0, tzinfo=UTC)],
            now=datetime(2026, 3, 29, 12, 0, 0, tzinfo=UTC),
            fallback_seconds=30,
        )
        self.assertEqual(result, 30.0)

    def test_returns_zero_for_passed_deadline(self) -> None:
        result = compute_next_wait_seconds(
            deadlines=[datetime(2026, 3, 29, 11, 59, 0, tzinfo=UTC)],
            now=datetime(2026, 3, 29, 12, 0, 0, tzinfo=UTC),
            fallback_seconds=30,
        )
        self.assertEqual(result, 0.0)

    def test_returns_fallback_when_no_deadlines(self) -> None:
        result = compute_next_wait_seconds(
            deadlines=[],
            now=datetime(2026, 3, 29, 12, 0, 0, tzinfo=UTC),
            fallback_seconds=30,
        )
        self.assertEqual(result, 30.0)

    def test_picks_soonest_among_multiple_deadlines(self) -> None:
        result = compute_next_wait_seconds(
            deadlines=[
                datetime(2026, 3, 29, 12, 0, 25, tzinfo=UTC),
                datetime(2026, 3, 29, 12, 0, 5, tzinfo=UTC),
                datetime(2026, 3, 29, 12, 0, 15, tzinfo=UTC),
            ],
            now=datetime(2026, 3, 29, 12, 0, 0, tzinfo=UTC),
            fallback_seconds=30,
        )
        self.assertAlmostEqual(result, 5.0)


class AssignPhaseDeadlineNotifiesListenersTests(unittest.TestCase):
    def test_listener_invoked_when_deadline_assigned(self) -> None:
        calls: list[None] = []

        def listener() -> None:
            calls.append(None)

        register_phase_deadline_change_listener(listener)
        try:
            game = create_game(room_code="ROOM01", game_id="game-1")
            snapshot = create_initial_snapshot(
                game=game,
                snapshot_id="snapshot-1",
                player_assignments={
                    "player-1": "britain",
                    "player-2": "france",
                    "player-3": "prussia",
                    "player-4": "austria",
                    "player-5": "russia",
                },
            )
            assign_phase_deadline(
                snapshot,
                started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
                duration=timedelta(minutes=2),
            )
        finally:
            unregister_phase_deadline_change_listener(listener)

        self.assertEqual(len(calls), 1)

    def test_unregister_stops_notifications(self) -> None:
        calls: list[None] = []

        def listener() -> None:
            calls.append(None)

        register_phase_deadline_change_listener(listener)
        unregister_phase_deadline_change_listener(listener)

        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={
                "player-1": "britain",
                "player-2": "france",
                "player-3": "prussia",
                "player-4": "austria",
                "player-5": "russia",
            },
        )
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
