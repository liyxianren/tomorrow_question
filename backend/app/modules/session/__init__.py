"""Session module boundary.

Expected file ownership:
- models.py: PlayerSession structures
- service.py: session allocation, recovery, reconnect semantics
- selectors.py: session payload mapping

Shared transport contracts are locked in app.contracts.models.
"""

from .models import PlayerSession
from .selectors import session_to_payload
from .service import (
    SessionError,
    bind_session_to_room,
    connect_session,
    create_session,
    disconnect_session,
    generate_player_id,
    generate_session_id,
    is_recoverable,
    restore_session,
    set_selected_country,
)

__all__ = [
    "PlayerSession",
    "SessionError",
    "bind_session_to_room",
    "connect_session",
    "create_session",
    "disconnect_session",
    "generate_player_id",
    "generate_session_id",
    "is_recoverable",
    "restore_session",
    "session_to_payload",
    "set_selected_country",
]
