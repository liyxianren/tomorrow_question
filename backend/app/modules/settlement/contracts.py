from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.contracts.enums import GamePhase
from app.contracts.models import GameLogPayload
from app.modules.game_state.models import Game, GameSnapshot


@dataclass(slots=True)
class SettlementOutcome:
    updated_game: Game | None
    updated_snapshot: GameSnapshot | None
    generated_logs: list[GameLogPayload] = field(default_factory=list)
    auto_submitted_player_ids: list[str] = field(default_factory=list)
    next_phase_submission_status_by_player_id: dict[str, str] = field(default_factory=dict)
    next_phase: GamePhase | None = None
    next_deadline_at: datetime | None = None
    is_game_finished: bool = False
    final_ranking: list[dict[str, Any]] = field(default_factory=list)
