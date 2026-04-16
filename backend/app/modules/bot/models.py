from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.modules.game_state.models import GameSnapshot
from app.modules.game_state.phase_state import PhaseSubmissionState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.room.models import Room, RoomMember


@dataclass(slots=True)
class BotPlanningContext:
    room: Room
    room_member: RoomMember
    snapshot: GameSnapshot
    player_workspace: dict[str, Any]


@dataclass(slots=True)
class BotSubmissionBatch:
    snapshot: GameSnapshot
    generated_inputs: list[PlayerTurnInput] = field(default_factory=list)
    phase_state: PhaseSubmissionState | None = None
    submitted_at: datetime | None = None
