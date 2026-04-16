from __future__ import annotations

import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import GamePhase, SocketEventName
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.phase_deadline import assign_phase_deadline
from app.modules.realtime.phase_timer import build_phase_timer_broadcast, build_phase_timer_payload


class PhaseTimerTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
