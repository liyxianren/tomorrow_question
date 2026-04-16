from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Sequence

from flask_socketio import SocketIO

from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import Game, GameSnapshot
from app.modules.persistence import RecoveryRepository
from app.modules.bot import auto_submit_bot_turns
from app.modules.realtime import emit_game_phase_started, emit_game_started
from app.modules.room.models import Room
from app.modules.room.service import room_can_start, start_game
from app.modules.session.models import PlayerSession

from .contracts import SettlementOutcome
from .final_result import FinalResultApplicationError, FinalResultApplicationService


@dataclass(slots=True)
class StartGameResult:
    room: Room
    game: Game
    snapshot: GameSnapshot


def attempt_start_game(
    *,
    room: Room,
    sessions: Sequence[PlayerSession],
    recovery_repository: RecoveryRepository,
    socketio: SocketIO,
    phase_deadline_at: datetime | None = None,
) -> StartGameResult | None:
    if not room_can_start(room):
        return None

    game = create_game(room_code=room.room_code)
    player_assignments = {
        member.player_id: member.selected_country
        for member in room.members
        if member.selected_country is not None
    }
    snapshot = create_initial_snapshot(
        game=game,
        player_assignments=player_assignments,
        phase_deadline_at=phase_deadline_at,
    )
    start_game(room, game.game_id)

    recovery_repository.rooms.save(room.to_payload())
    recovery_repository.games.save(game.to_payload())
    recovery_repository.snapshots.save(snapshot.to_payload())
    for session in sessions:
        recovery_repository.sessions.save(session.to_payload())

    bot_batch = auto_submit_bot_turns(
        room=room,
        snapshot=snapshot,
        recovery_repository=recovery_repository,
        commit=True,
    )
    emit_game_started(socketio=socketio, room=room, game=game, snapshot=snapshot)
    emit_game_phase_started(
        socketio=socketio,
        room=room,
        game=game,
        snapshot=snapshot,
        submission_status_by_player_id={
            player_id: status.value
            for player_id, status in bot_batch.phase_state.submission_status_by_player_id.items()
        }
        if bot_batch.phase_state is not None
        else None,
    )
    return StartGameResult(room=room, game=game, snapshot=snapshot)


__all__ = [
    "FinalResultApplicationError",
    "FinalResultApplicationService",
    "SettlementOutcome",
    "StartGameResult",
    "attempt_start_game",
]
