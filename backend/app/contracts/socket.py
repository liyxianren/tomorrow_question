from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


def socket_envelope(
    *,
    room_code: str,
    payload: dict[str, Any],
    game_id: str | None = None,
) -> dict[str, Any]:
    return {
        "roomCode": room_code,
        "gameId": game_id,
        "serverTime": datetime.now(UTC).isoformat(),
        "payload": payload,
    }
