from __future__ import annotations

from dataclasses import dataclass, field

from app.contracts.enums import ConnectionStatus, CountryCode, RoomStatus
from app.contracts.models import RoomMemberPayload, RoomPayload


ROOM_CAPACITY = len(CountryCode)


def build_empty_country_slots() -> dict[str, str | None]:
    return {country.value: None for country in CountryCode}


@dataclass(slots=True)
class RoomMember:
    player_id: str
    nickname: str
    selected_country: CountryCode | None = None
    connection_status: ConnectionStatus = ConnectionStatus.ONLINE
    is_ready: bool = False
    member_type: str = "human"
    bot_profile_key: str | None = None

    def to_payload(self) -> RoomMemberPayload:
        return {
            "playerId": self.player_id,
            "nickname": self.nickname,
            "selectedCountry": self.selected_country,
            "connectionStatus": self.connection_status,
            "isReady": self.is_ready,
            "memberType": self.member_type,
            "botProfileKey": self.bot_profile_key,
        }

    @classmethod
    def from_payload(cls, payload: RoomMemberPayload) -> "RoomMember":
        return cls(
            player_id=payload["playerId"],
            nickname=payload["nickname"],
            selected_country=payload["selectedCountry"],
            connection_status=payload["connectionStatus"],
            is_ready=bool(payload["isReady"]),
            member_type=str(payload.get("memberType") or "human"),
            bot_profile_key=payload.get("botProfileKey"),
        )


@dataclass(slots=True)
class Room:
    room_code: str
    host_player_id: str
    members: list[RoomMember] = field(default_factory=list)
    status: RoomStatus = RoomStatus.WAITING
    current_game_id: str | None = None
    last_activity_at: str | None = None

    @property
    def member_player_ids(self) -> list[str]:
        return [member.player_id for member in self.members]

    @property
    def country_slots(self) -> dict[str, str | None]:
        slots = build_empty_country_slots()
        for member in self.members:
            if member.selected_country is not None:
                slots[member.selected_country.value] = member.player_id
        return slots

    def get_member(self, player_id: str) -> RoomMember | None:
        for member in self.members:
            if member.player_id == player_id:
                return member
        return None

    def has_member(self, player_id: str) -> bool:
        return self.get_member(player_id) is not None

    def is_full(self) -> bool:
        return len(self.members) >= ROOM_CAPACITY

    def all_members_ready(self) -> bool:
        return len(self.members) == ROOM_CAPACITY and all(member.is_ready for member in self.members)

    def all_members_have_country(self) -> bool:
        return len(self.members) == ROOM_CAPACITY and all(member.selected_country is not None for member in self.members)

    def to_payload(self) -> RoomPayload:
        return {
            "roomCode": self.room_code,
            "status": self.status,
            "hostPlayerId": self.host_player_id,
            "memberPlayerIds": self.member_player_ids,
            "members": [member.to_payload() for member in self.members],
            "countrySlots": self.country_slots,
            "currentGameId": self.current_game_id,
            "lastActivityAt": self.last_activity_at,
        }

    @classmethod
    def from_payload(cls, payload: RoomPayload) -> "Room":
        return cls(
            room_code=payload["roomCode"],
            host_player_id=payload["hostPlayerId"],
            members=[RoomMember.from_payload(member) for member in payload["members"]],
            status=payload["status"],
            current_game_id=payload["currentGameId"],
            last_activity_at=payload.get("lastActivityAt"),
        )
