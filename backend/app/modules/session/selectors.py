from __future__ import annotations

from app.contracts.models import PlayerSessionPayload

from .models import PlayerSession


def session_to_payload(session: PlayerSession) -> PlayerSessionPayload:
    return session.to_payload()
