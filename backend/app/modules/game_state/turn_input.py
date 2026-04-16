from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.contracts.enums import GamePhase, PlayerSubmissionStatus
from app.contracts.models import PlayerTurnInputPayload


def _serialize_datetime(value: datetime | None) -> str | None:
    return None if value is None else value.isoformat()


def _parse_datetime(value: str | None) -> datetime | None:
    return None if value is None else datetime.fromisoformat(value)


@dataclass(slots=True)
class PlayerTurnInput:
    game_id: str
    round_no: int
    phase: GamePhase
    player_id: str
    submission_status: PlayerSubmissionStatus
    payload: dict[str, Any]
    submitted_at: datetime | None
    is_timeout_generated: bool

    def to_payload(self) -> PlayerTurnInputPayload:
        return {
            "gameId": self.game_id,
            "roundNo": self.round_no,
            "phase": self.phase,
            "playerId": self.player_id,
            "submissionStatus": self.submission_status,
            "payload": dict(self.payload),
            "submittedAt": _serialize_datetime(self.submitted_at),
            "isTimeoutGenerated": self.is_timeout_generated,
        }

    @classmethod
    def from_payload(cls, payload: PlayerTurnInputPayload) -> "PlayerTurnInput":
        return cls(
            game_id=payload["gameId"],
            round_no=int(payload["roundNo"]),
            phase=GamePhase(payload["phase"]),
            player_id=payload["playerId"],
            submission_status=PlayerSubmissionStatus(payload["submissionStatus"]),
            payload=dict(payload["payload"]),
            submitted_at=_parse_datetime(payload["submittedAt"]),
            is_timeout_generated=bool(payload["isTimeoutGenerated"]),
        )

