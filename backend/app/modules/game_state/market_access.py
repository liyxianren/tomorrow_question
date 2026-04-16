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


def is_region_accessible(
    access_level: RegionAccessLevel,
    military_points: int,
    *,
    region_id: str = "",
    established_diplomacy: list[str] | None = None,
) -> bool:
    if access_level == RegionAccessLevel.OPEN:
        return True
    if established_diplomacy and region_id in established_diplomacy:
        return True
    # CONCESSION 和 COLONY 区域必须先建交才能进入
    return False
