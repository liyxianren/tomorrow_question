from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Mapping

from app.contracts.enums import ConnectionStatus, CountryCode, ErrorCode

from .models import PlayerSession


@dataclass(slots=True)
class SessionError(Exception):
    error_code: ErrorCode
    message: str

    def __str__(self) -> str:
        return self.message


def create_session(
    nickname: str,
    room_code: str | None = None,
    selected_country: CountryCode | None = None,
    *,
    now: datetime | None = None,
    player_id: str | None = None,
    session_id: str | None = None,
) -> PlayerSession:
    timestamp = now or utc_now()
    return PlayerSession(
        player_id=player_id or generate_player_id(),
        session_id=session_id or generate_session_id(),
        nickname=nickname,
        room_code=room_code,
        selected_country=selected_country,
        connection_status=ConnectionStatus.ONLINE,
        last_seen_at=timestamp,
    )


def generate_player_id() -> str:
    return f"player_{secrets.token_hex(8)}"


def generate_session_id() -> str:
    return f"session_{secrets.token_hex(16)}"


def bind_session_to_room(session: PlayerSession, room_code: str | None) -> PlayerSession:
    session.room_code = room_code
    return session


def set_selected_country(session: PlayerSession, country: CountryCode | None) -> PlayerSession:
    session.selected_country = country
    return session


def connect_session(session: PlayerSession, *, now: datetime | None = None) -> PlayerSession:
    session.connection_status = ConnectionStatus.ONLINE
    session.last_seen_at = now or utc_now()
    return session


def disconnect_session(session: PlayerSession, *, now: datetime | None = None) -> PlayerSession:
    session.connection_status = ConnectionStatus.OFFLINE_RECOVERABLE
    session.last_seen_at = now or utc_now()
    return session


def restore_session(
    session_id: str,
    sessions_by_id: Mapping[str, PlayerSession],
    active_room_codes: Iterable[str] | None = None,
    *,
    now: datetime | None = None,
) -> PlayerSession:
    session = sessions_by_id.get(session_id)
    if session is None:
        raise SessionError(ErrorCode.INVALID_SESSION, "Session could not be found.")
    if not is_recoverable(session, active_room_codes):
        raise SessionError(ErrorCode.RECOVERY_NOT_AVAILABLE, "Session recovery context is no longer available.")
    return connect_session(session, now=now)


def is_recoverable(session: PlayerSession, active_room_codes: Iterable[str] | None = None) -> bool:
    if session.connection_status not in {ConnectionStatus.ONLINE, ConnectionStatus.OFFLINE_RECOVERABLE}:
        return False
    if session.room_code is None or active_room_codes is None:
        return True
    return session.room_code in set(active_room_codes)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
