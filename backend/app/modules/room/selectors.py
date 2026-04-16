from __future__ import annotations

from app.contracts.models import RoomPayload

from .models import Room


def room_to_payload(room: Room) -> RoomPayload:
    return room.to_payload()
