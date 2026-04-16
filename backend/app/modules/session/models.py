from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.contracts.enums import ConnectionStatus, CountryCode
from app.contracts.models import PlayerSessionPayload


@dataclass(slots=True)
class PlayerSession:
    player_id: str
    session_id: str
    nickname: str
    room_code: str | None = None
    selected_country: CountryCode | None = None
    connection_status: ConnectionStatus = ConnectionStatus.ONLINE
    last_seen_at: datetime | None = None

    def to_payload(self) -> PlayerSessionPayload:
        return {
            "playerId": self.player_id,
            "sessionId": self.session_id,
            "nickname": self.nickname,
            "roomCode": self.room_code,
            "selectedCountry": self.selected_country,
            "connectionStatus": self.connection_status,
            "lastSeenAt": self.last_seen_at.isoformat() if self.last_seen_at is not None else None,
        }

    @classmethod
    def from_payload(cls, payload: PlayerSessionPayload) -> "PlayerSession":
        return cls(
            player_id=payload["playerId"],
            session_id=payload["sessionId"],
            nickname=payload["nickname"],
            room_code=payload["roomCode"],
            selected_country=payload["selectedCountry"],
            connection_status=payload["connectionStatus"],
            last_seen_at=_parse_datetime(payload["lastSeenAt"]),
        )


def _parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))
