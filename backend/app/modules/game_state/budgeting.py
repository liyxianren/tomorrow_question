from __future__ import annotations

from copy import deepcopy
from typing import Any


GOVERNMENT_POLICY_BUDGET_SUPPLEMENT = 8


def market_regulation_allowance(player_state: Any) -> int:
    return 0


def decision_phase_government_fiscal_budget(player_state: Any) -> int:
    return max(
        0,
        int(getattr(player_state, "budget_pools", {}).get("governmentFiscal", 0))
        + GOVERNMENT_POLICY_BUDGET_SUPPLEMENT,
    )


def decision_phase_budget_pools(player_state: Any) -> dict[str, int]:
    pools = deepcopy(getattr(player_state, "budget_pools", {}))
    pools["governmentFiscal"] = decision_phase_government_fiscal_budget(player_state)
    return pools
