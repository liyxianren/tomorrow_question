from __future__ import annotations

from copy import deepcopy
from typing import Any


def calculate_market_regulation_allowance(domestic_market_budget: Any) -> int:
    """One-turn market-regulation authority derived from民间购买力.

    The value is intentionally not persisted. It restores the active decision
    bandwidth that used to live in the domestic-market action pool while keeping
    domesticMarket itself available as the demand/price baseline.
    """
    try:
        return max(0, int(domestic_market_budget or 0))
    except (TypeError, ValueError):
        return 0


def market_regulation_allowance(player_state: Any) -> int:
    return calculate_market_regulation_allowance(
        getattr(player_state, "budget_pools", {}).get("domesticMarket", 0)
    )


def decision_phase_budget_pools(player_state: Any) -> dict[str, int]:
    pools = deepcopy(getattr(player_state, "budget_pools", {}))
    base_government = max(0, int(pools.get("governmentFiscal", 0)))
    pools["governmentFiscal"] = base_government + market_regulation_allowance(player_state)
    return pools
