from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.contracts.enums import ConnectionStatus, ErrorCode, RoomStatus
from app.modules.persistence import RecoveryRepository, RoomRepository, SessionRepository
from app.modules.room.models import Room
from app.modules.room.service import set_member_connection_status, touch_room

from .models import PlayerSession
from .service import SessionError, connect_session


WAITING_ROOM_DELETE_AFTER_SECONDS = 900


@dataclass(slots=True)
class SessionApplicationService:
    connection: sqlite3.Connection
    sessions: SessionRepository = field(init=False)
    rooms: RoomRepository = field(init=False)
    recovery: RecoveryRepository = field(init=False)

    def __post_init__(self) -> None:
        self.sessions = SessionRepository(self.connection)
        self.rooms = RoomRepository(self.connection)
        self.recovery = RecoveryRepository(self.connection)

    def restore_session_context(self, session_id: str | None, *, include_details: bool = True) -> dict[str, object]:
        session = self.require_session(session_id)
        self._prune_inactive_waiting_rooms()

        if session.room_code is None:
            return {"session": session.to_payload()}

        room_payload = self.rooms.get(session.room_code)
        if room_payload is None:
            raise SessionError(ErrorCode.RECOVERY_NOT_AVAILABLE, "Session recovery context is no longer available.")

        room = Room.from_payload(room_payload)
        if not room.has_member(session.player_id):
            raise SessionError(ErrorCode.RECOVERY_NOT_AVAILABLE, "Session recovery context is no longer available.")

        set_member_connection_status(room, session.player_id, ConnectionStatus.ONLINE)
        if room.status in {RoomStatus.WAITING, RoomStatus.READYING}:
            touch_room(room)
        self.rooms.save(room.to_payload())

        if not include_details:
            context: dict[str, object] = {"session": session.to_payload(), "room": room.to_payload()}
            if room.current_game_id:
                try:
                    active_game = self.recovery.games.get(room.current_game_id)
                except ValueError:
                    active_game = None
                if active_game is not None:
                    context["activeGame"] = active_game
            return context

        restored = self.recovery.get_room_context(session.room_code)
        if restored is None:
            raise SessionError(ErrorCode.RECOVERY_NOT_AVAILABLE, "Session recovery context is no longer available.")

        context: dict[str, object] = {"session": session.to_payload(), "room": restored["room"]}
        if "activeGame" in restored:
            context["activeGame"] = restored["activeGame"]
        if "activeSnapshot" in restored:
            context["activeSnapshot"] = restored["activeSnapshot"]
        if "activeTurnInputs" in restored:
            context["activeTurnInputs"] = restored["activeTurnInputs"]
        if "gameLogs" in restored:
            context["gameLogs"] = restored["gameLogs"]
        return context

    def require_session(self, session_id: str | None) -> PlayerSession:
        if session_id is None or not session_id.strip():
            raise SessionError(ErrorCode.INVALID_SESSION, "Session could not be found.")

        session_payload = self.sessions.get(session_id)
        if session_payload is None:
            raise SessionError(ErrorCode.INVALID_SESSION, "Session could not be found.")

        session = PlayerSession.from_payload(session_payload)
        connect_session(session)
        self.sessions.save(session.to_payload())
        return session

    def _prune_inactive_waiting_rooms(self) -> None:
        delete_before = (datetime.now(timezone.utc) - timedelta(seconds=WAITING_ROOM_DELETE_AFTER_SECONDS)).isoformat()
        self.rooms.delete_inactive_waiting(delete_before)
