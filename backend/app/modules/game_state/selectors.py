from __future__ import annotations

from app.contracts.models import GamePayload, GameSnapshotPayload

from .models import Game, GameSnapshot


def game_to_payload(game: Game) -> GamePayload:
    return game.to_payload()


def snapshot_to_payload(snapshot: GameSnapshot) -> GameSnapshotPayload:
    return snapshot.to_payload()
