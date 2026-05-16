from __future__ import annotations

from copy import deepcopy
from typing import Any

FIXED_MARKET_REGULATION_ALLOWANCE = 5


def calculate_market_regulation_allowance(domestic_market_budget: Any) -> int:
    """One-turn market-regulation authority — now a fixed value.
    
    The consumption pool (domesticMarket) is frozen; market regulation
    allowance no longer derives from it.
    """
    return FIXED_MARKET_REGULATION_ALLOWANCE


def market_regulation_allowance(player_state: Any) -> int:
    return FIXED_MARKET_REGULATION_ALLOWANCE


def decision_phase_budget_pools(player_state: Any) -> dict[str, int]:
    pools = deepcopy(getattr(player_state, "budget_pools", {}))
    base_government = max(0, int(pools.get("governmentFiscal", 0)))
    pools["governmentFiscal"] = base_government + FIXED_MARKET_REGULATION_ALLOWANCE
    return pools
