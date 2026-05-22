from __future__ import annotations

from app.contracts.enums import RegionAccessLevel
from app.modules.balance_config import get_balance_config
from app.modules.game_state.effects import get_effect_bonus


def resolve_domestic_market_capacity(player_state) -> int:
    from app.modules.rules.phase1_economy import calculate_effective_domestic_capacity

    balance = get_balance_config()
    return int(
        calculate_effective_domestic_capacity(
            player_state.phase1_economy.capacity_by_mode,
            balance.production.demand_coefficients,
            capacity_bonus=get_effect_bonus(player_state, "domesticMarketCapacityBonus"),
        )
    )


def resolve_overseas_market_capacity(player_state) -> int:
    balance = get_balance_config()
    base = balance.global_config.base_overseas_capacity
    return max(
        0,
        base
        + get_effect_bonus(player_state, "overseasMarketCapacityBonus"),
    )


def region_lock_reason(
    access_level: RegionAccessLevel,
    *,
    region_id: str = "",
    established_diplomacy: list[str] | None = None,
    route_blocked: bool = False,
) -> str | None:
    """Return a machine-readable lock reason for a region, or None if accessible.

    Possible reasons (vocabulary mirrored on the frontend):
      - "route_blocked": route to the region is naval-blockaded by another player
    """
    del access_level, region_id, established_diplomacy
    if route_blocked:
        return "route_blocked"
    return None


def is_region_accessible(
    access_level: RegionAccessLevel,
    *,
    region_id: str = "",
    established_diplomacy: list[str] | None = None,
    route_blocked: bool = False,
    **_ignored: object,
) -> bool:
    return region_lock_reason(
        access_level,
        region_id=region_id,
        established_diplomacy=established_diplomacy,
        route_blocked=route_blocked,
    ) is None
