from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from traceback import print_exc
from typing import TypedDict

from flask_socketio import SocketIO

from app.contracts.enums import GamePhase, SocketEventName
from app.contracts.socket import socket_envelope
from app.modules.game_state.models import GameSnapshot
from app.modules.game_state.phase_deadline import deadline_has_passed, remaining_seconds_until_deadline
from app.modules.persistence import RecoveryRepository, connect_database, initialize_database
from app.modules.settlement.submission_application import SubmissionApplicationService


PHASE_TIMEOUT_POLL_INTERVAL_SECONDS = 5
_started_phase_timeout_runner_keys: set[int] = set()


class PhaseTimerPayload(TypedDict):
    phase: GamePhase
    deadlineAt: str
    remainingSeconds: int


def build_phase_timer_payload(*, snapshot: GameSnapshot, now) -> PhaseTimerPayload:
    deadline_at = snapshot.phase_deadline_at
    if deadline_at is None:
        raise ValueError("Phase timer payload requires snapshot.phase_deadline_at to be set.")

    return {
        "phase": snapshot.phase,
        "deadlineAt": deadline_at.isoformat(),
        "remainingSeconds": remaining_seconds_until_deadline(deadline_at=deadline_at, now=now),
    }


def build_phase_timer_broadcast(*, room_code: str, game_id: str, snapshot: GameSnapshot, now):
    payload = build_phase_timer_payload(snapshot=snapshot, now=now)
    return (
        SocketEventName.GAME_PHASE_TIMER,
        socket_envelope(room_code=room_code, game_id=game_id, payload=payload),
    )


@dataclass(slots=True)
class PhaseTimeoutOrchestrator:
    database_path: str
    socketio: SocketIO
    phase_duration_seconds: int

    def run_once(self, *, now: datetime | None = None, connection: sqlite3.Connection | None = None) -> int:
        triggered_at = now or datetime.now(UTC)
        own_connection = connection is None
        if own_connection:
            connection = connect_database(self.database_path)
            initialize_database(connection)
        try:
            recovery_repository = RecoveryRepository(connection)
            submission_application = SubmissionApplicationService(connection)
            processed = 0

            for game_payload, snapshot_payload in recovery_repository.load_games_with_active_deadlines():
                snapshot = GameSnapshot.from_payload(snapshot_payload)
                if not deadline_has_passed(deadline_at=snapshot.phase_deadline_at, now=triggered_at):
                    continue

                result = submission_application.advance_timeout_phase(
                    game_id=game_payload["gameId"],
                    expected_snapshot_id=snapshot.snapshot_id,
                    triggered_at=triggered_at,
                    phase_duration_seconds=self.phase_duration_seconds,
                    socketio=self.socketio,
                )
                if result is not None and result.settlement_outcome is not None:
                    processed += 1

            return processed
        finally:
            if own_connection:
                connection.close()

    def run_forever(self) -> None:
        import sys
        print("[PhaseTimer] run_forever started, polling every %ds" % PHASE_TIMEOUT_POLL_INTERVAL_SECONDS, flush=True)
        connection = connect_database(self.database_path)
        initialize_database(connection)
        try:
            while True:
                try:
                    processed = self.run_once(connection=connection)
                    if processed > 0:
                        print(f"[PhaseTimer] Processed {processed} phase timeout(s)", file=sys.stderr, flush=True)
                except Exception:
                    print("[PhaseTimer] ERROR in run_once:", file=sys.stderr, flush=True)
                    print_exc(file=sys.stderr)
                    # Reconnect on error in case connection is stale
                    try:
                        connection.close()
                    except Exception:
                        pass
                    connection = connect_database(self.database_path)
                    initialize_database(connection)
                self.socketio.sleep(PHASE_TIMEOUT_POLL_INTERVAL_SECONDS)
        finally:
            try:
                connection.close()
            except Exception:
                pass


def start_phase_timeout_runner(*, socketio: SocketIO, database_path: str, phase_duration_seconds: int) -> PhaseTimeoutOrchestrator:
    socketio_key = id(socketio)
    orchestrator = PhaseTimeoutOrchestrator(
        database_path=database_path,
        socketio=socketio,
        phase_duration_seconds=phase_duration_seconds,
    )
    if socketio_key in _started_phase_timeout_runner_keys:
        return orchestrator

    print(f"[PhaseTimer] Starting background task (socketio_key={socketio_key}, phase_duration={phase_duration_seconds}s)", flush=True)
    socketio.start_background_task(orchestrator.run_forever)
    _started_phase_timeout_runner_keys.add(socketio_key)
    return orchestrator
