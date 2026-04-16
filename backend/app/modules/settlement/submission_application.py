from __future__ import annotations

import sqlite3
from contextlib import contextmanager, nullcontext
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Callable, Iterator
from uuid import uuid4

from flask_socketio import SocketIO

from app.contracts.enums import ErrorCode, GamePhase, PlayerSubmissionStatus
from app.contracts.models import GameLogPayload
from app.modules.balance_config import get_balance_config
from app.modules.bot import auto_submit_bot_turns
from app.modules.game_state.models import Game, GameSnapshot
from app.modules.game_state.phase_state import PhaseSubmissionState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.game_state.workspaces import hydrate_snapshot_workspaces
from app.modules.persistence import (
    GameLogRepository,
    GameRepository,
    PlayerTurnInputRepository,
    RecoveryRepository,
    RoomRepository,
    SessionRepository,
    SnapshotRepository,
)
from app.modules.realtime import (
    emit_game_finished,
    emit_game_phase_settled,
    emit_game_phase_started,
)
from app.modules.room.models import Room
from app.modules.room.service import finish_room
from app.modules.rules import resolve_decision_phase, resolve_market_phase, resolve_settlement_phase
from app.modules.rules.common import RuleResolution
from app.modules.session.models import PlayerSession
from app.modules.session.service import SessionError, connect_session

from .contracts import SettlementOutcome
from .final_result import build_final_ranking
from .phase_submission import PhaseSubmissionError, PhaseSubmissionService


SettlementRunner = Callable[..., SettlementOutcome]


@contextmanager
def _sqlite_write_transaction(connection: sqlite3.Connection) -> Iterator[None]:
    connection.execute("BEGIN IMMEDIATE")
    try:
        yield
    except Exception:
        if connection.in_transaction:
            connection.rollback()
        raise
    else:
        connection.commit()


@dataclass(slots=True)
class SubmissionApplicationError(Exception):
    error_code: ErrorCode
    message: str

    def __str__(self) -> str:
        return self.message


@dataclass(slots=True)
class SubmitPhaseResult:
    submission: PlayerTurnInput
    phase_state: PhaseSubmissionState
    settlement_outcome: SettlementOutcome | None = None

    def to_payload(self) -> dict[str, object]:
        return {
            "submission": self.submission.to_payload(),
            "submissionStatus": {
                player_id: status.value
                for player_id, status in self.phase_state.submission_status_by_player_id.items()
            },
            "phase": self.phase_state.phase.value,
            "roundNo": self.phase_state.round_no,
            "allSubmitted": self.phase_state.all_players_submitted,
            "settlementTriggered": self.settlement_outcome is not None,
        }


@dataclass(slots=True)
class TimeoutAdvanceResult:
    generated_inputs: list[PlayerTurnInput]
    phase_state: PhaseSubmissionState
    settlement_outcome: SettlementOutcome | None = None


@dataclass(slots=True)
class SubmissionApplicationService:
    connection: sqlite3.Connection
    recovery: RecoveryRepository = field(init=False)
    sessions: SessionRepository = field(init=False)
    rooms: RoomRepository = field(init=False)
    games: GameRepository = field(init=False)
    snapshots: SnapshotRepository = field(init=False)
    turn_inputs: PlayerTurnInputRepository = field(init=False)
    game_logs: GameLogRepository = field(init=False)
    phase_submission: PhaseSubmissionService = field(init=False, default_factory=PhaseSubmissionService)
    settlement_runner: SettlementRunner = field(init=False)

    def __post_init__(self) -> None:
        self.recovery = RecoveryRepository(self.connection)
        self.sessions = SessionRepository(self.connection)
        self.rooms = RoomRepository(self.connection)
        self.games = GameRepository(self.connection)
        self.snapshots = SnapshotRepository(self.connection)
        self.turn_inputs = PlayerTurnInputRepository(self.connection)
        self.game_logs = GameLogRepository(self.connection)
        self.settlement_runner = run_phase_settlement

    def submit(
        self,
        *,
        game_id: str,
        requested_phase: GamePhase | None,
        session_id: str | None,
        payload: dict[str, object],
        submitted_at: datetime,
        phase_duration_seconds: int,
        socketio: SocketIO,
    ) -> SubmitPhaseResult:
        if requested_phase is None:
            raise PhaseSubmissionError(
                ErrorCode.PHASE_MISMATCH,
                "Submission phase does not match the active game phase.",
            )

        with _sqlite_write_transaction(self.connection):
            session = self._require_session(session_id, now=submitted_at)
            game = self._require_game(game_id)
            room = self._require_room(game.room_code)
            snapshot = self._require_active_snapshot(game)
            phase_state = self._rebuild_phase_state(snapshot)

            result = self.phase_submission.submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=phase_state,
                player_id=session.player_id,
                requested_phase=requested_phase,
                payload=payload,
                submitted_at=submitted_at,
            )

            self.turn_inputs.save(result.player_turn_input.to_payload(), commit=False)
            settlement_outcome: SettlementOutcome | None = None
            if result.updated_phase_state.all_players_submitted:
                settlement_outcome = self.settlement_runner(
                    room=room,
                    game=game,
                    snapshot=snapshot,
                    turn_inputs=list(result.updated_phase_state.submissions_by_player_id.values()),
                    recovery_repository=self.recovery,
                    socketio=socketio,
                    phase_duration_seconds=phase_duration_seconds,
                    settled_at=submitted_at,
                    manage_transaction=False,
                    emit_events=False,
                )

        if settlement_outcome is not None:
            _emit_settlement_events(
                socketio=socketio,
                room=room,
                outcome=settlement_outcome,
            )
        return SubmitPhaseResult(
            submission=result.player_turn_input,
            phase_state=result.updated_phase_state,
            settlement_outcome=settlement_outcome,
        )

    def advance_timeout_phase(
        self,
        *,
        game_id: str,
        expected_snapshot_id: str,
        triggered_at: datetime,
        phase_duration_seconds: int,
        socketio: SocketIO,
    ) -> TimeoutAdvanceResult | None:
        with _sqlite_write_transaction(self.connection):
            game = self._require_game(game_id)
            if game.active_snapshot_id != expected_snapshot_id:
                return None

            snapshot = self._require_active_snapshot(game)
            if snapshot.snapshot_id != expected_snapshot_id:
                return None

            room = self._require_room(game.room_code)
            # 只有结算阶段允许超时自动推进，决策/出售阶段必须等玩家手动提交
            if snapshot.phase != GamePhase.SETTLEMENT:
                return None
            if snapshot.phase == GamePhase.SETTLEMENT:
                phase_state = PhaseSubmissionState.from_snapshot(snapshot)
                settlement_outcome = self.settlement_runner(
                    room=room,
                    game=game,
                    snapshot=snapshot,
                    turn_inputs=[],
                    recovery_repository=self.recovery,
                    socketio=socketio,
                    phase_duration_seconds=phase_duration_seconds,
                    settled_at=triggered_at,
                    manage_transaction=False,
                    emit_events=False,
                )
                timeout_result = TimeoutAdvanceResult(
                    generated_inputs=[],
                    phase_state=phase_state,
                    settlement_outcome=settlement_outcome,
                )
            else:
                timeout_result = self.phase_submission.auto_submit_timeouts(
                    snapshot=snapshot,
                    phase_state=self._rebuild_phase_state(snapshot),
                    triggered_at=triggered_at,
                )
                if not timeout_result.generated_inputs and not timeout_result.updated_phase_state.all_players_submitted:
                    return None

                for turn_input in timeout_result.generated_inputs:
                    self.turn_inputs.save(turn_input.to_payload(), commit=False)

                settlement_outcome: SettlementOutcome | None = None
                if timeout_result.updated_phase_state.all_players_submitted:
                    settlement_outcome = self.settlement_runner(
                        room=room,
                        game=game,
                        snapshot=snapshot,
                        turn_inputs=list(timeout_result.updated_phase_state.submissions_by_player_id.values()),
                        recovery_repository=self.recovery,
                        socketio=socketio,
                        phase_duration_seconds=phase_duration_seconds,
                        settled_at=triggered_at,
                        manage_transaction=False,
                        emit_events=False,
                    )
                timeout_result = TimeoutAdvanceResult(
                    generated_inputs=timeout_result.generated_inputs,
                    phase_state=timeout_result.updated_phase_state,
                    settlement_outcome=settlement_outcome,
                )

        if timeout_result.settlement_outcome is not None:
            _emit_settlement_events(
                socketio=socketio,
                room=room,
                outcome=timeout_result.settlement_outcome,
            )
        return timeout_result

    def _require_session(self, session_id: str | None, *, now: datetime) -> PlayerSession:
        if session_id is None or not session_id.strip():
            raise SessionError(ErrorCode.INVALID_SESSION, "Session could not be found.")

        payload = self.sessions.get(session_id)
        if payload is None:
            raise SessionError(ErrorCode.INVALID_SESSION, "Session could not be found.")

        session = PlayerSession.from_payload(payload)
        connect_session(session, now=now)
        self.sessions.save(session.to_payload(), commit=False)
        return session

    def _require_game(self, game_id: str) -> Game:
        payload = self.games.get(game_id)
        if payload is None:
            raise SubmissionApplicationError(ErrorCode.GAME_NOT_FOUND, "Game could not be found.")
        return Game.from_payload(payload)

    def _require_room(self, room_code: str) -> Room:
        payload = self.rooms.get(room_code)
        if payload is None:
            raise SubmissionApplicationError(ErrorCode.GAME_NOT_FOUND, "Game room could not be found.")
        return Room.from_payload(payload)

    def _require_active_snapshot(self, game: Game) -> GameSnapshot:
        if game.active_snapshot_id is None:
            raise SubmissionApplicationError(ErrorCode.GAME_NOT_FOUND, "Game snapshot could not be found.")

        payload = self.snapshots.get(game.active_snapshot_id)
        if payload is None:
            raise SubmissionApplicationError(ErrorCode.GAME_NOT_FOUND, "Game snapshot could not be found.")
        try:
            return GameSnapshot.from_payload(payload)
        except ValueError as exc:
            raise SubmissionApplicationError(
                ErrorCode.RECOVERY_NOT_AVAILABLE,
                str(exc),
            ) from exc

    def _rebuild_phase_state(self, snapshot: GameSnapshot) -> PhaseSubmissionState:
        state = PhaseSubmissionState.from_snapshot(snapshot)
        if snapshot.phase == GamePhase.SETTLEMENT:
            return state
        for payload in self.turn_inputs.list_for_phase(snapshot.game_id, snapshot.round_no, snapshot.phase):
            state = state.with_submission(PlayerTurnInput.from_payload(payload))
        return state


def run_phase_settlement(
    *,
    room: Room,
    game: Game,
    snapshot: GameSnapshot,
    turn_inputs: list[PlayerTurnInput],
    recovery_repository: RecoveryRepository,
    socketio: SocketIO,
    phase_duration_seconds: int,
    settled_at: datetime,
    manage_transaction: bool = True,
    emit_events: bool = True,
) -> SettlementOutcome:
    connection = recovery_repository.games.connection
    transaction_context = _sqlite_write_transaction(connection) if manage_transaction else nullcontext()

    with transaction_context:
        resolution = _resolve_phase(snapshot=snapshot, turn_inputs=turn_inputs)
        updated_snapshot = resolution.updated_snapshot
        updated_snapshot.snapshot_id = uuid4().hex
        updated_snapshot.last_settlement_summary = dict(resolution.summary)
        updated_snapshot.ranking = _build_ranking(updated_snapshot=updated_snapshot)

        next_phase, next_round, is_game_finished = _advance_phase(
            current_phase=snapshot.phase,
            current_round=snapshot.round_no,
            total_rounds=game.total_rounds,
        )
        if not is_game_finished:
            updated_snapshot.phase = next_phase
            updated_snapshot.round_no = next_round
            updated_snapshot.phase_deadline_at = _resolve_next_phase_deadline_at(
                settled_at=settled_at,
                phase_duration_seconds=phase_duration_seconds,
                next_phase=next_phase,
            )
        else:
            updated_snapshot.phase = snapshot.phase
            updated_snapshot.round_no = snapshot.round_no
            updated_snapshot.phase_deadline_at = None

        auto_submitted_player_ids = [
            turn_input.player_id
            for turn_input in turn_inputs
            if turn_input.is_timeout_generated
        ]
        hydrate_snapshot_workspaces(
            updated_snapshot,
            previous_snapshot=snapshot,
            settled_phase=snapshot.phase,
            auto_submitted_player_ids=auto_submitted_player_ids,
            submission_status_by_player_id=(
                {
                    player_id: PlayerSubmissionStatus.PENDING
                    for player_id in [player.player_id for player in updated_snapshot.player_states]
                }
                if updated_snapshot.phase != GamePhase.SETTLEMENT and not is_game_finished
                else None
            ),
        )

        game.is_finished = is_game_finished
        game.set_active_snapshot(updated_snapshot)
        recovery_repository.games.save(game.to_payload(), commit=False)
        recovery_repository.snapshots.save(updated_snapshot.to_payload(), commit=False)

        persisted_logs = _build_persisted_logs(
            settled_snapshot=snapshot,
            updated_snapshot=updated_snapshot,
            generated_logs=resolution.generated_logs,
            settled_at=settled_at,
        )
        if is_game_finished:
            recovery_repository.game_logs.delete_for_game(game.game_id, commit=False)
        for log in persisted_logs:
            recovery_repository.game_logs.save(log, commit=False)

        final_ranking = build_final_ranking(snapshot=updated_snapshot, room=room)
        next_phase_submission_status_by_player_id: dict[str, str] = {}

        if not is_game_finished and updated_snapshot.phase != GamePhase.SETTLEMENT:
            bot_batch = auto_submit_bot_turns(
                room=room,
                snapshot=updated_snapshot,
                recovery_repository=recovery_repository,
                submitted_at=settled_at,
                commit=False,
            )
            if bot_batch.phase_state is not None:
                next_phase_submission_status_by_player_id = {
                    player_id: status.value
                    for player_id, status in bot_batch.phase_state.submission_status_by_player_id.items()
                }

        if is_game_finished:
            finish_room(room)
            recovery_repository.rooms.save(room.to_payload(), commit=False)
            recovery_repository.turn_inputs.delete_for_game(game.game_id, commit=False)
            recovery_repository.snapshots.delete_for_game_except(game.game_id, updated_snapshot.snapshot_id, commit=False)

        outcome = SettlementOutcome(
            updated_game=game,
            updated_snapshot=updated_snapshot,
            generated_logs=list(persisted_logs),
            auto_submitted_player_ids=auto_submitted_player_ids,
            next_phase_submission_status_by_player_id=next_phase_submission_status_by_player_id,
            next_phase=None if is_game_finished else next_phase,
            next_deadline_at=None if is_game_finished else updated_snapshot.phase_deadline_at,
            is_game_finished=is_game_finished,
            final_ranking=final_ranking if is_game_finished else [],
        )

    if emit_events:
        _emit_settlement_events(
            socketio=socketio,
            room=room,
            outcome=outcome,
        )
    return outcome


def _resolve_phase(*, snapshot: GameSnapshot, turn_inputs: list[PlayerTurnInput]) -> RuleResolution:
    if snapshot.phase == GamePhase.DECISION:
        return resolve_decision_phase(snapshot=snapshot, turn_inputs=turn_inputs)
    if snapshot.phase == GamePhase.MARKET:
        return resolve_market_phase(snapshot=snapshot, turn_inputs=turn_inputs)
    if snapshot.phase == GamePhase.SETTLEMENT:
        return resolve_settlement_phase(snapshot=snapshot, turn_inputs=turn_inputs)
    raise SubmissionApplicationError(ErrorCode.PHASE_MISMATCH, "Submission phase does not match the active game phase.")


def _advance_phase(*, current_phase: GamePhase, current_round: int, total_rounds: int) -> tuple[GamePhase, int, bool]:
    if current_phase == GamePhase.DECISION:
        return GamePhase.MARKET, current_round, False
    if current_phase == GamePhase.MARKET:
        return GamePhase.SETTLEMENT, current_round, False
    if current_phase == GamePhase.SETTLEMENT:
        if current_round >= total_rounds:
            return GamePhase.SETTLEMENT, current_round, True
        return GamePhase.DECISION, current_round + 1, False
    return GamePhase.DECISION, current_round + 1, False


def _emit_settlement_events(
    *,
    socketio: SocketIO,
    room: Room,
    outcome: SettlementOutcome,
) -> None:
    game = outcome.updated_game
    snapshot = outcome.updated_snapshot
    if game is None or snapshot is None:
        return

    emit_game_phase_settled(
        socketio=socketio,
        room=room,
        game=game,
        snapshot=snapshot,
        logs=list(outcome.generated_logs),
        auto_submitted_player_ids=list(outcome.auto_submitted_player_ids),
    )
    if outcome.is_game_finished:
        emit_game_finished(
            socketio=socketio,
            room=room,
            game=game,
            snapshot=snapshot,
            final_ranking=list(outcome.final_ranking),
            final_logs=list(outcome.generated_logs),
        )
        return

    emit_game_phase_started(
        socketio=socketio,
        room=room,
        game=game,
        snapshot=snapshot,
        submission_status_by_player_id=(
            outcome.next_phase_submission_status_by_player_id
            if outcome.next_phase_submission_status_by_player_id
            else _build_pending_submission_status(snapshot)
        ),
    )


def _build_pending_submission_status(snapshot: GameSnapshot) -> dict[str, str]:
    if snapshot.phase == GamePhase.SETTLEMENT:
        return {}
    return {
        player_state.player_id: PlayerSubmissionStatus.PENDING.value
        for player_state in snapshot.player_states
    }


def _resolve_next_phase_deadline_at(
    *,
    settled_at: datetime,
    phase_duration_seconds: int,
    next_phase: GamePhase,
) -> datetime | None:
    if next_phase == GamePhase.SETTLEMENT:
        # 结算阶段：展示结果 15 秒后自动推进到下一回合
        return settled_at + timedelta(seconds=max(1, int(phase_duration_seconds)))
    # 决策/出售阶段：无 deadline，等玩家手动提交
    return None


def _build_persisted_logs(
    *,
    settled_snapshot: GameSnapshot,
    updated_snapshot: GameSnapshot,
    generated_logs: list[GameLogPayload],
    settled_at: datetime,
) -> list[GameLogPayload]:
    created_at = settled_at.astimezone(UTC).isoformat()
    persisted_logs: list[GameLogPayload] = [
        _normalize_log(log, created_at=created_at)
        for log in generated_logs
    ]
    persisted_logs.append(
        {
            "gameId": settled_snapshot.game_id,
            "roundNo": settled_snapshot.round_no,
            "phase": settled_snapshot.phase,
            "kind": "settlement.phase_resolved",
            "message": f"{settled_snapshot.phase.value} settled.",
            "details": {
                "settledPhase": settled_snapshot.phase.value,
                "resultingSnapshotId": updated_snapshot.snapshot_id,
                "resultingRoundNo": updated_snapshot.round_no,
                "resultingPhase": updated_snapshot.phase.value,
                "ranking": deepcopy(updated_snapshot.ranking),
            },
            "createdAt": created_at,
        }
    )
    return persisted_logs


def _normalize_log(log: GameLogPayload, *, created_at: str) -> GameLogPayload:
    return {
        "gameId": log["gameId"],
        "roundNo": log["roundNo"],
        "phase": log["phase"],
        "kind": log["kind"],
        "message": log["message"],
        "details": dict(log["details"]),
        "createdAt": log.get("createdAt") or created_at,
    }


def _build_ranking(*, updated_snapshot: GameSnapshot) -> list[dict[str, Any]]:
    ranking_tie_break_order = get_balance_config().global_config.ranking_tie_break_order
    tie_break_by_player_id = {
        player_state.player_id: _build_tie_break_entry(
            snapshot=updated_snapshot,
            player_id=player_state.player_id,
        )
        for player_state in updated_snapshot.player_states
    }
    ordered_players = sorted(
        updated_snapshot.player_states,
        key=lambda item: _build_ranking_sort_key(
            player_id=item.player_id,
            cumulative_national_income=item.cumulative_national_income,
            tie_break_by_player_id=tie_break_by_player_id,
            ranking_tie_break_order=ranking_tie_break_order,
        ),
    )
    ranking: list[dict[str, Any]] = []
    for index, player_state in enumerate(ordered_players, start=1):
        ranking.append(
            {
                "rank": index,
                "playerId": player_state.player_id,
                "countryId": player_state.country,
                "cumulativeNationalIncome": int(player_state.cumulative_national_income),
                "tieBreak": dict(tie_break_by_player_id[player_state.player_id]),
            }
        )
    return ranking


def _build_tie_break_entry(*, snapshot: GameSnapshot, player_id: str) -> dict[str, int]:
    player_state = next(player for player in snapshot.player_states if player.player_id == player_id)
    return {
        "productionCapacity": _total_production_capacity(player_state),
        "controlledRegions": _controlled_region_count(snapshot, player_state.country.value) + int(player_state.controlled_regions_bonus),
        "budgetPoolsTotal": int(sum(int(value) for value in player_state.budget_pools.values())),
    }


def _build_ranking_sort_key(
    *,
    player_id: str,
    cumulative_national_income: int,
    tie_break_by_player_id: dict[str, dict[str, int]],
    ranking_tie_break_order: tuple[str, ...],
) -> tuple[int | str, ...]:
    tie_break_values = tie_break_by_player_id[player_id]
    return (
        -int(cumulative_national_income),
        *(-int(tie_break_values.get(key, 0)) for key in ranking_tie_break_order),
        player_id,
    )


def _total_production_capacity(player_state) -> int:
    return sum(int(value) for value in player_state.production_capacity.values()) + sum(
        int(value) for value in player_state.pending_production_capacity.values()
    )


def _controlled_region_count(snapshot: GameSnapshot, country: str) -> int:
    return sum(1 for region in snapshot.region_states if region.controller == country)


__all__ = [
    "SubmissionApplicationError",
    "SubmissionApplicationService",
    "SubmitPhaseResult",
    "TimeoutAdvanceResult",
    "run_phase_settlement",
    "SessionError",
]
