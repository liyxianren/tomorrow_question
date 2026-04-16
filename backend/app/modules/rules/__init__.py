"""Rules module boundary: pure game rule calculations without transport concerns."""

from .common import (
    PHASE_INPUT_FIELDS,
    RuleResolution,
    clone_snapshot,
    default_decision_submission_payload,
    default_market_submission_payload,
    index_turn_inputs,
)
from .decision import resolve_decision_phase
from .market import resolve_market_phase
from .settlement import resolve_settlement_phase

__all__ = [
    "RuleResolution",
    "PHASE_INPUT_FIELDS",
    "clone_snapshot",
    "default_decision_submission_payload",
    "default_market_submission_payload",
    "index_turn_inputs",
    "resolve_decision_phase",
    "resolve_market_phase",
    "resolve_settlement_phase",
]
