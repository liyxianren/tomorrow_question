"""Room module boundary.

Expected file ownership:
- models.py: Room, RoomMember, country slot and ready-state structures
- service.py: room lifecycle transitions and invariants
- selectors.py: room view mapping for API / socket payloads

Shared transport contracts are locked in app.contracts.models.
"""

from .models import ROOM_CAPACITY, Room, RoomMember, build_empty_country_slots
from .selectors import room_to_payload
from .service import (
    RoomError,
    add_member,
    assign_country,
    create_room,
    fill_bots,
    finish_room,
    generate_room_code,
    mark_member_ready,
    remove_bot,
    remove_member,
    refresh_room_status,
    room_can_start,
    set_member_connection_status,
    start_game,
)

__all__ = [
    "ROOM_CAPACITY",
    "Room",
    "RoomError",
    "RoomMember",
    "add_member",
    "assign_country",
    "build_empty_country_slots",
    "create_room",
    "fill_bots",
    "finish_room",
    "generate_room_code",
    "mark_member_ready",
    "remove_bot",
    "remove_member",
    "refresh_room_status",
    "room_can_start",
    "room_to_payload",
    "set_member_connection_status",
    "start_game",
]
