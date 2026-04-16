"""Game state module boundary.

Expected file ownership:
- models.py: Game, GameSnapshot, PlayerState, RegionState, OceanNodeState
- factory.py: initial snapshot generation
- selectors.py: snapshot / game payload mapping

Shared transport contracts are locked in app.contracts.models.
"""

from .factory import create_game, create_initial_snapshot
from .models import Game, GameSnapshot, OceanNodeState, PlayerState, RegionState
from .selectors import game_to_payload, snapshot_to_payload

__all__ = [
    "Game",
    "GameSnapshot",
    "PlayerState",
    "RegionState",
    "OceanNodeState",
    "create_game",
    "create_initial_snapshot",
    "game_to_payload",
    "snapshot_to_payload",
]
