from __future__ import annotations

from app.contracts.enums import RegionAccessLevel
from app.modules.balance_config import get_balance_config
from app.modules.game_state.effects import get_effect_bonus


def resolve_domestic_market_capacity(player_state) -> int:
    return max(
        1,
        get_effect_bonus(player_state, "domesticMarketCapacityBonus")
        + sum(int(value) for value in player_state.production_capacity.values()),
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
      - "diplomacy_not_established": region requires diplomacy and the player has none
      - "route_blocked": route to the region is naval-blockaded by another player
    """
    if access_level != RegionAccessLevel.OPEN:
        if not established_diplomacy or region_id not in established_diplomacy:
            return "diplomacy_not_established"
    if route_blocked:
        return "route_blocked"
    return None


def is_region_accessible(
    access_level: RegionAccessLevel,
    *,
    region_id: str = "",
    established_diplomacy: list[str] | None = None,
) -> bool:
    return region_lock_reason(
        access_level,
        region_id=region_id,
        established_diplomacy=established_diplomacy,
    ) is None
