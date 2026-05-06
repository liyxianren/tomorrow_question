from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.contracts.enums import ConnectionStatus, CountryCode, ErrorCode, RoomStatus
from app.modules.persistence import RecoveryRepository, RoomRepository, SessionRepository
from app.modules.session.models import PlayerSession
from app.modules.session.service import bind_session_to_room, connect_session, create_session, set_selected_country

from .models import ROOM_CAPACITY, Room
from .service import (
    RoomError,
    add_member,
    assign_country,
    create_room,
    fill_bots,
    generate_room_code,
    mark_member_ready,
    remove_bot,
    remove_member,
    set_member_connection_status,
    touch_room,
)


WAITING_ROOM_HIDE_AFTER_SECONDS = 180
WAITING_ROOM_DELETE_AFTER_SECONDS = 900


@dataclass(slots=True)
class RoomApplicationService:
    connection: sqlite3.Connection
    rooms: RoomRepository = field(init=False)
    sessions: SessionRepository = field(init=False)
    recovery: RecoveryRepository = field(init=False)

    def __post_init__(self) -> None:
        self.rooms = RoomRepository(self.connection)
        self.sessions = SessionRepository(self.connection)
        self.recovery = RecoveryRepository(self.connection)

    def create_room_context(self, nickname: str) -> dict[str, object]:
        self._prune_inactive_waiting_rooms()
        session = create_session(nickname=nickname)
        room = create_room(
            room_code=generate_room_code(self._load_existing_room_codes()),
            host_player_id=session.player_id,
            host_nickname=nickname,
        )
        bind_session_to_room(session, room.room_code)

        self.rooms.save(room.to_payload())
        self.sessions.save(session.to_payload())

        return {
            "session": session.to_payload(),
            "room": room.to_payload(),
        }

    def join_room_context(self, room_code: str, nickname: str, session_id: str | None = None) -> dict[str, object]:
        self._prune_inactive_waiting_rooms()
        room = self._require_room(room_code)

        restored_context = self._restore_joining_session(room=room, session_id=session_id)
        if restored_context is not None:
            return restored_context

        session = create_session(nickname=nickname, room_code=room.room_code)

        add_member(room, session.player_id, nickname, ConnectionStatus.ONLINE)

        self.rooms.save(room.to_payload())
        self.sessions.save(session.to_payload())

        return self._build_joined_context(session=session, room_code=room.room_code)

    def leave_room_context(self, room_code: str, session_id: str | None) -> dict[str, object]:
        self._prune_inactive_waiting_rooms()
        room = self._require_room(room_code)
        session = self._require_session(session_id)

        if session.room_code != room.room_code or not room.has_member(session.player_id):
            raise RoomError(ErrorCode.NOT_ROOM_MEMBER, "Player is not a member of this room.")
        if room.status not in {RoomStatus.WAITING, RoomStatus.READYING}:
            raise RoomError(ErrorCode.ROOM_ALREADY_IN_GAME, "Room members cannot leave after the game has started.")

        if session.player_id == room.host_player_id:
            for session_payload in self.sessions.list_by_room(room.room_code):
                room_session = PlayerSession.from_payload(session_payload)
                bind_session_to_room(room_session, None)
                self.sessions.save(room_session.to_payload(), commit=False)
            self.rooms.delete(room.room_code, commit=False)
            self.connection.commit()
            return {
                "roomCode": room.room_code,
                "disbanded": True,
                "removedPlayerId": session.player_id,
            }

        removed_member = remove_member(room, session.player_id)
        bind_session_to_room(session, None)
        self.rooms.save(room.to_payload(), commit=False)
        self.sessions.save(session.to_payload(), commit=False)
        self.connection.commit()

        return {
            "roomCode": room.room_code,
            "disbanded": False,
            "removedPlayerId": removed_member.player_id,
            "room": room.to_payload(),
        }

    def _restore_joining_session(self, *, room: Room, session_id: str | None) -> dict[str, object] | None:
        if session_id is None or not session_id.strip():
            return None

        session_payload = self.sessions.get(session_id)
        if session_payload is None:
            return None

        session = PlayerSession.from_payload(session_payload)
        if session.room_code != room.room_code or not room.has_member(session.player_id):
            return None

        connect_session(session)
        bind_session_to_room(session, room.room_code)
        set_member_connection_status(room, session.player_id, ConnectionStatus.ONLINE)
        if room.status in {RoomStatus.WAITING, RoomStatus.READYING}:
            touch_room(room)

        self.rooms.save(room.to_payload())
        self.sessions.save(session.to_payload())
        return self._build_joined_context(session=session, room_code=room.room_code)

    def _build_joined_context(self, *, session: PlayerSession, room_code: str) -> dict[str, object]:
        joined = self.recovery.get_room_context(room_code)
        if joined is None:
            raise RoomError(ErrorCode.ROOM_NOT_FOUND, "Room could not be found.")

        context: dict[str, object] = {"session": session.to_payload(), "room": joined["room"]}
        if "activeGame" in joined:
            context["activeGame"] = joined["activeGame"]
        if "activeSnapshot" in joined:
            context["activeSnapshot"] = joined["activeSnapshot"]
        return context

    def select_country(self, room_code: str, session_id: str | None, selected_country: CountryCode | None) -> dict[str, object]:
        self._prune_inactive_waiting_rooms()
        room = self._require_room(room_code)
        session = self._require_session(session_id)

        member = assign_country(room, session.player_id, selected_country)
        set_member_connection_status(room, session.player_id, ConnectionStatus.ONLINE)
        bind_session_to_room(session, room.room_code)
        set_selected_country(session, selected_country)

        self.rooms.save(room.to_payload())
        self.sessions.save(session.to_payload())

        return {
            "playerId": member.player_id,
            "selectedCountry": member.selected_country,
        }

    def set_ready(self, room_code: str, session_id: str | None, is_ready: bool) -> dict[str, object]:
        self._prune_inactive_waiting_rooms()
        room = self._require_room(room_code)
        session = self._require_session(session_id)

        member = mark_member_ready(room, session.player_id, is_ready)
        set_member_connection_status(room, session.player_id, ConnectionStatus.ONLINE)
        bind_session_to_room(session, room.room_code)

        self.rooms.save(room.to_payload())
        self.sessions.save(session.to_payload())

        return {
            "playerId": member.player_id,
            "isReady": member.is_ready,
        }

    def fill_room_with_bots(self, room_code: str, session_id: str | None) -> dict[str, object]:
        self._prune_inactive_waiting_rooms()
        room = self._require_room(room_code)
        session = self._require_session(session_id)

        added_bots = fill_bots(room, actor_player_id=session.player_id)
        set_member_connection_status(room, session.player_id, ConnectionStatus.ONLINE)
        bind_session_to_room(session, room.room_code)

        self.rooms.save(room.to_payload())
        self.sessions.save(session.to_payload())

        return {
            "room": room.to_payload(),
            "addedBotPlayerIds": [member.player_id for member in added_bots],
        }

    def remove_room_bot(self, room_code: str, session_id: str | None, bot_player_id: str) -> dict[str, object]:
        self._prune_inactive_waiting_rooms()
        room = self._require_room(room_code)
        session = self._require_session(session_id)

        removed_bot = remove_bot(room, actor_player_id=session.player_id, bot_player_id=bot_player_id)
        set_member_connection_status(room, session.player_id, ConnectionStatus.ONLINE)
        bind_session_to_room(session, room.room_code)

        self.rooms.save(room.to_payload())
        self.sessions.save(session.to_payload())

        return {
            "room": room.to_payload(),
            "removedBotPlayerId": removed_bot.player_id,
        }

    def get_room_context(self, room_code: str) -> dict[str, object]:
        self._prune_inactive_waiting_rooms()
        context = self.recovery.get_room_context(room_code)
        if context is None:
            raise RoomError(ErrorCode.ROOM_NOT_FOUND, "Room could not be found.")

        room = Room.from_payload(context["room"])
        if room.status in {RoomStatus.WAITING, RoomStatus.READYING}:
            touch_room(room)
            self.rooms.save(room.to_payload())
            context["room"] = room.to_payload()

        payload: dict[str, object] = {"room": context["room"]}
        if "activeGame" in context:
            payload["activeGame"] = context["activeGame"]
        if "activeSnapshot" in context:
            payload["activeSnapshot"] = context["activeSnapshot"]
        return payload

    def list_waiting_rooms(self) -> list[dict[str, object]]:
        self._prune_inactive_waiting_rooms()
        visible_after = _utc_cutoff_iso(WAITING_ROOM_HIDE_AFTER_SECONDS)
        waiting_rooms = self.rooms.list_waiting_visible(visible_after)
        cards = [self._to_waiting_room_card(room_payload) for room_payload in waiting_rooms]
        cards.sort(
            key=lambda card: (
                not bool(card["isJoinable"]),
                -int(card["memberCount"]),
                -int(card["selectedCountriesCount"]),
                -int(card["readyCount"]),
            )
        )
        return cards

    def _load_existing_room_codes(self) -> set[str]:
        rows = self.connection.execute("SELECT room_code FROM rooms").fetchall()
        return {row[0] for row in rows}

    def _require_room(self, room_code: str) -> Room:
        room_payload = self.rooms.get(room_code)
        if room_payload is None:
            raise RoomError(ErrorCode.ROOM_NOT_FOUND, "Room could not be found.")
        return Room.from_payload(room_payload)

    def _require_session(self, session_id: str | None) -> PlayerSession:
        if session_id is None or not session_id.strip():
            raise RoomError(ErrorCode.INVALID_SESSION, "Session could not be found.")

        session_payload = self.sessions.get(session_id)
        if session_payload is None:
            raise RoomError(ErrorCode.INVALID_SESSION, "Session could not be found.")

        session = PlayerSession.from_payload(session_payload)
        connect_session(session)
        return session

    def _to_waiting_room_card(self, room_payload: dict[str, object]) -> dict[str, object]:
        members = room_payload.get("members")
        if not isinstance(members, list):
            members = []

        ready_count = 0
        selected_countries_count = 0
        host_nickname = ""
        host_player_id = room_payload.get("hostPlayerId")
        member_summaries: list[dict[str, object]] = []

        for member in members:
            if not isinstance(member, dict):
                continue
            if member.get("isReady"):
                ready_count += 1
            selected_country = member.get("selectedCountry")
            if selected_country is not None:
                selected_countries_count += 1
            nickname = member.get("nickname")
            member_summaries.append(
                {
                    "nickname": nickname if isinstance(nickname, str) else "",
                    "selectedCountry": selected_country if isinstance(selected_country, str) else None,
                    "isReady": bool(member.get("isReady")),
                    "memberType": str(member.get("memberType") or "human"),
                }
            )
            if not host_nickname and member.get("playerId") == host_player_id:
                host_nickname = nickname if isinstance(nickname, str) else ""

        status = room_payload.get("status")
        member_count = len(members)
        available_seat_count = max(ROOM_CAPACITY - member_count, 0)
        has_active_game = bool(room_payload.get("currentGameId"))
        status_value = status.value if isinstance(status, RoomStatus) else str(status or "")
        return {
            "roomCode": room_payload.get("roomCode", ""),
            "hostNickname": host_nickname,
            "memberCount": member_count,
            "maxPlayers": ROOM_CAPACITY,
            "availableSeatCount": available_seat_count,
            "status": status_value,
            "readyCount": ready_count,
            "selectedCountriesCount": selected_countries_count,
            "hasActiveGame": has_active_game,
            "isJoinable": status_value == RoomStatus.WAITING.value and not has_active_game and available_seat_count > 0,
            "lastActivityAt": room_payload.get("lastActivityAt"),
            "members": member_summaries,
        }

    def _prune_inactive_waiting_rooms(self) -> None:
        delete_before = _utc_cutoff_iso(WAITING_ROOM_DELETE_AFTER_SECONDS)
        self.rooms.delete_inactive_waiting(delete_before)


def _utc_cutoff_iso(seconds: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()
