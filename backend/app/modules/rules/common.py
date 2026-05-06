from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.contracts.models import GameLogPayload
from app.modules.game_state.models import GameSnapshot
from app.modules.game_state.turn_input import PlayerTurnInput

POINT_PURCHASE_COSTS: dict[str, int] = {"tech": 2, "military": 6}

PHASE_INPUT_FIELDS: dict[str, tuple[str, ...]] = {
    "decision": (
        "factoryPlan",
        "domesticMarketPlan",
        "governmentPlan",
        "militaryPlan",
    ),
    "market": ("saleOrders",),
    "settlement": (),
}


@dataclass(slots=True)
class RuleResolution:
    updated_snapshot: GameSnapshot
    generated_logs: list[GameLogPayload] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)


def clone_snapshot(snapshot: GameSnapshot) -> GameSnapshot:
    return GameSnapshot.from_payload(snapshot.to_payload())


def index_turn_inputs(turn_inputs: list[PlayerTurnInput]) -> dict[str, PlayerTurnInput]:
    return {turn_input.player_id: turn_input for turn_input in turn_inputs}


def default_decision_submission_payload() -> dict[str, Any]:
    return {
        "factoryPlan": {
            "productionOrders": [],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
            "factoryActions": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {
            "adminPurchases": 0,
        },
        "militaryPlan": {
            "militaryActions": [],
            "diplomacyActions": [],
        },
        "talentPlan": {"talentUnlocks": []},
    }


def default_market_submission_payload() -> dict[str, Any]:
    return {"saleOrders": []}
