from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

from app.contracts.enums import ConnectionStatus, CountryCode, ErrorCode, RoomStatus

from .models import ROOM_CAPACITY, Room, RoomMember


ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ROOM_CODE_LENGTH = 6


@dataclass(slots=True)
class RoomError(Exception):
    error_code: ErrorCode
    message: str

    def __str__(self) -> str:
        return self.message


def generate_room_code(existing_codes: Iterable[str] | None = None) -> str:
    existing = set(existing_codes or ())
    for _ in range(1024):
        room_code = "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(ROOM_CODE_LENGTH))
        if room_code not in existing:
            return room_code
    raise RuntimeError("Unable to generate a unique room code.")


def create_room(room_code: str, host_player_id: str, host_nickname: str) -> Room:
    room = Room(
        room_code=room_code,
        host_player_id=host_player_id,
        members=[RoomMember(player_id=host_player_id, nickname=host_nickname)],
        last_activity_at=utc_now_iso(),
    )
    return refresh_room_status(room)


def refresh_room_status(room: Room) -> Room:
    if room.status == RoomStatus.FINISHED:
        return room
    if room.current_game_id is not None:
        room.status = RoomStatus.IN_GAME
        return room
    room.status = RoomStatus.READYING if len(room.members) == ROOM_CAPACITY else RoomStatus.WAITING
    return room


def add_member(
    room: Room,
    player_id: str,
    nickname: str,
    connection_status: ConnectionStatus = ConnectionStatus.ONLINE,
) -> RoomMember:
    if room.status in {RoomStatus.IN_GAME, RoomStatus.FINISHED}:
        raise RoomError(ErrorCode.ROOM_ALREADY_IN_GAME, "Room is no longer accepting new members.")
    existing_member = room.get_member(player_id)
    if existing_member is not None:
        return existing_member
    if room.is_full():
        raise RoomError(ErrorCode.ROOM_FULL, "Room capacity is limited to five players.")

    member = RoomMember(
        player_id=player_id,
        nickname=nickname,
        connection_status=connection_status,
        member_type="human",
    )
    room.members.append(member)
    touch_room(room)
    refresh_room_status(room)
    return member


def assign_country(room: Room, player_id: str, country: CountryCode | None) -> RoomMember:
    member = require_member(room, player_id)

    if country is not None:
        occupying_player = room.country_slots[country.value]
        if occupying_player is not None and occupying_player != player_id:
            raise RoomError(ErrorCode.COUNTRY_TAKEN, f"Country '{country.value}' is already occupied.")

    member.selected_country = country
    member.is_ready = False
    touch_room(room)
    refresh_room_status(room)
    return member


def mark_member_ready(room: Room, player_id: str, is_ready: bool) -> RoomMember:
    if room.status in {RoomStatus.IN_GAME, RoomStatus.FINISHED}:
        raise RoomError(ErrorCode.ROOM_ALREADY_IN_GAME, "Room ready-state cannot change once the game has started.")

    member = require_member(room, player_id)
    if is_ready and member.selected_country is None:
        raise RoomError(ErrorCode.NOT_READYABLE, "A player must choose a country before becoming ready.")

    member.is_ready = is_ready
    touch_room(room)
    refresh_room_status(room)
    return member


def fill_bots(room: Room, *, actor_player_id: str, bot_profile_key: str = "default") -> list[RoomMember]:
    _require_host_bot_management(room=room, actor_player_id=actor_player_id)
    if room.is_full():
        return []

    remaining_countries = [
        country
        for country in CountryCode
        if room.country_slots[country.value] is None
    ]
    remaining_slots = ROOM_CAPACITY - len(room.members)
    if remaining_slots <= 0:
        return []

    added_members: list[RoomMember] = []
    for index in range(remaining_slots):
        bot_member = RoomMember(
            player_id=_generate_bot_player_id(room),
            nickname=f"AI {index + 1}",
            selected_country=remaining_countries[index] if index < len(remaining_countries) else None,
            connection_status=ConnectionStatus.ONLINE,
            is_ready=index < len(remaining_countries),
            member_type="bot",
            bot_profile_key=bot_profile_key,
        )
        room.members.append(bot_member)
        added_members.append(bot_member)

    touch_room(room)
    refresh_room_status(room)
    return added_members


def remove_bot(room: Room, *, actor_player_id: str, bot_player_id: str) -> RoomMember:
    _require_host_bot_management(room=room, actor_player_id=actor_player_id)
    bot_member = require_member(room, bot_player_id)
    if bot_member.member_type != "bot":
        raise RoomError(ErrorCode.ROOM_ACTION_FORBIDDEN, "Only AI seats can be removed with this action.")

    room.members = [member for member in room.members if member.player_id != bot_player_id]
    touch_room(room)
    refresh_room_status(room)
    return bot_member


def remove_member(room: Room, player_id: str) -> RoomMember:
    if room.status in {RoomStatus.IN_GAME, RoomStatus.FINISHED}:
        raise RoomError(ErrorCode.ROOM_ALREADY_IN_GAME, "Room members cannot leave after the game has started.")
    if player_id == room.host_player_id:
        raise RoomError(ErrorCode.ROOM_ACTION_FORBIDDEN, "The host must disband the room instead of leaving a seat.")

    member = require_member(room, player_id)
    room.members = [candidate for candidate in room.members if candidate.player_id != player_id]
    touch_room(room)
    refresh_room_status(room)
    return member


def set_member_connection_status(room: Room, player_id: str, connection_status: ConnectionStatus) -> RoomMember:
    member = require_member(room, player_id)
    member.connection_status = connection_status
    return member


def touch_room(room: Room, *, now: datetime | None = None) -> Room:
    room.last_activity_at = (now or datetime.now(timezone.utc)).isoformat()
    return room


def room_can_start(room: Room) -> bool:
    if room.status in {RoomStatus.IN_GAME, RoomStatus.FINISHED}:
        return False

    selected_countries = [member.selected_country for member in room.members]
    assigned_countries = [country for country in selected_countries if country is not None]
    return (
        len(room.members) == ROOM_CAPACITY
        and len(assigned_countries) == ROOM_CAPACITY
        and len({country.value for country in assigned_countries}) == ROOM_CAPACITY
        and all(member.is_ready for member in room.members)
    )


def start_game(room: Room, game_id: str) -> Room:
    if not room_can_start(room):
        raise RoomError(ErrorCode.NOT_READYABLE, "Room does not satisfy the start-game prerequisites.")

    room.current_game_id = game_id
    room.status = RoomStatus.IN_GAME
    touch_room(room)
    return room


def finish_room(room: Room) -> Room:
    room.status = RoomStatus.FINISHED
    touch_room(room)
    return room


def require_member(room: Room, player_id: str) -> RoomMember:
    member = room.get_member(player_id)
    if member is None:
        raise RoomError(ErrorCode.NOT_ROOM_MEMBER, "Player is not a member of this room.")
    return member


def _require_host_bot_management(*, room: Room, actor_player_id: str) -> None:
    if room.status not in {RoomStatus.WAITING, RoomStatus.READYING}:
        raise RoomError(ErrorCode.ROOM_ALREADY_IN_GAME, "AI seats can only be managed before the game starts.")
    if actor_player_id != room.host_player_id:
        raise RoomError(ErrorCode.ROOM_ACTION_FORBIDDEN, "Only the host can manage AI seats.")


def _generate_bot_player_id(room: Room) -> str:
    existing_ids = {member.player_id for member in room.members}
    next_index = 1
    while True:
        candidate = f"bot-{next_index}"
        if candidate not in existing_ids:
            return candidate
        next_index += 1


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
