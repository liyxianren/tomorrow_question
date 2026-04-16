from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

from app.modules.balance_config import get_balance_config
from app.modules.game_state.effects import get_effect_bonus

if TYPE_CHECKING:
    from app.modules.game_state.models import GameSnapshot, PlayerState, RegionState


ROUTE_DISPLAY_ORDER: tuple[str, ...] = ("handicraft", "mechanized", "steam", "electrified")
ROUTE_LABELS: dict[str, str] = {
    "handicraft": "手工业",
    "mechanized": "机械化",
    "steam": "蒸汽工业",
    "electrified": "电气工业",
}


def get_route_label(route_id: str) -> str:
    return ROUTE_LABELS.get(route_id, route_id)


def iter_visible_route_ids(player: PlayerState) -> list[str]:
    balance = get_balance_config()
    visible_routes: list[str] = []
    for route_id in ROUTE_DISPLAY_ORDER:
        if current_route_capacity(player, route_id) > 0:
            visible_routes.append(route_id)
            continue
        source_route = balance.production.upgrade_source_levels.get(route_id)
        if source_route and current_route_capacity(player, source_route) > 0:
            visible_routes.append(route_id)
            continue
        if route_id == "handicraft":
            visible_routes.append(route_id)

    return [route_id for route_id in ROUTE_DISPLAY_ORDER if route_id in visible_routes]


def current_route_capacity(player: PlayerState, route_id: str) -> int:
    return max(0, int(player.production_capacity.get(route_id, 0)))


def pending_route_capacity(player: PlayerState, route_id: str) -> int:
    return int(player.pending_production_capacity.get(route_id, 0))


def available_batches_this_round(player: PlayerState, route_id: str) -> int:
    return current_route_capacity(player, route_id)


def goods_config_by_id(goods_id: str):
    return get_balance_config().production.goods.get(goods_id)


def goods_ids_for_route(route_id: str) -> list[str]:
    balance = get_balance_config()
    return [
        goods_id
        for goods_id, config in balance.production.goods.items()
        if config.route_id == route_id
    ]


def route_locked_reason(player: PlayerState, route_id: str) -> str | None:
    if route_id == "handicraft" or current_route_capacity(player, route_id) > 0:
        return None
    tech = route_unlocking_tech(route_id)
    if tech is None or tech.tech_id in player.unlocked_techs:
        return None
    return f"需要研究「{tech.label}」"


def goods_locked_reason(player: PlayerState, route_id: str, goods_id: str | None = None) -> str | None:
    route_label = get_route_label(route_id)
    if goods_id:
        initial_goods = set(country_initial_goods(player))
        if goods_id in initial_goods:
            return None if current_route_capacity(player, route_id) > 0 else f"需要{route_label}产能"

        tech = goods_unlocking_tech(goods_id)
        if tech is not None and tech.tech_id not in player.unlocked_techs:
            return f"需要研究「{tech.label}」"
        if tech is None:
            return "该国无该商品生产资格"

    route_reason = route_locked_reason(player, route_id)
    if route_reason is not None:
        return route_reason
    if current_route_capacity(player, route_id) > 0:
        return None
    return f"需要{route_label}产能"


def action_locked_reason(player: PlayerState, action_id: str) -> str | None:
    tech = action_unlocking_tech(action_id)
    if tech is None or tech.tech_id in player.unlocked_techs:
        return None
    return f"需要研究「{tech.label}」"


def country_initial_goods(player: PlayerState) -> tuple[str, ...]:
    return get_balance_config().countries[player.country.value].initial_goods


def goods_unlocking_tech(goods_id: str):
    for tech in get_balance_config().technology.tech_tree.values():
        if goods_id in tech.unlocks_goods:
            return tech
    return None


def action_unlocking_tech(action_id: str):
    for tech in get_balance_config().technology.tech_tree.values():
        if action_id in tech.unlocks_actions:
            return tech
    return None


def route_unlocking_tech(route_id: str):
    tech_id = get_balance_config().technology.route_unlocks.get(route_id)
    if tech_id is None:
        return None
    return get_balance_config().technology.tech_tree.get(tech_id)


def is_tech_researchable(player: PlayerState, tech_id: str) -> bool:
    tech = get_balance_config().technology.tech_tree.get(tech_id)
    if tech is None or tech.tech_id in player.unlocked_techs:
        return False
    if any(prerequisite not in player.unlocked_techs for prerequisite in tech.prerequisites):
        return False
    # 检查对应预算池是否足够
    current_budget = int(player.budget_pools.get(tech.budget_pool, 0))
    return current_budget >= int(tech.budget_cost)


def is_route_available(player: PlayerState, route_id: str) -> bool:
    return route_locked_reason(player, route_id) is None


def is_action_unlocked(player: PlayerState, action_id: str) -> bool:
    return action_locked_reason(player, action_id) is None


def is_goods_unlocked(player: PlayerState, goods_id: str) -> bool:
    goods = goods_config_by_id(goods_id)
    if goods is None:
        return False
    return goods_locked_reason(player, goods.route_id, goods_id) is None


def production_option_max_quantity(player: PlayerState, goods_id: str) -> int:
    goods = goods_config_by_id(goods_id)
    if goods is None:
        return 0
    if goods_locked_reason(player, goods.route_id, goods_id):
        return 0
    budget = max(0, int(player.budget_pools.get("factory", 0)))
    if goods.unit_budget_cost <= 0:
        return 0
    return min(available_batches_this_round(player, goods.route_id), budget // goods.unit_budget_cost)


def expansion_option_max_quantity(player: PlayerState, route_id: str) -> int:
    balance = get_balance_config()
    unit_cost = int(balance.production.expansion_costs.get(route_id, 0))
    if unit_cost <= 0 or current_route_capacity(player, route_id) <= 0:
        return 0
    return max(0, int(player.budget_pools.get("factory", 0)) // unit_cost)


def upgrade_option_max_quantity(player: PlayerState, target_route_id: str) -> int:
    balance = get_balance_config()
    source_route_id = balance.production.upgrade_source_levels.get(target_route_id)
    unit_cost = int(balance.production.upgrade_costs.get(target_route_id, 0))
    if source_route_id is None or unit_cost <= 0:
        return 0
    if route_locked_reason(player, target_route_id) is not None:
        return 0
    source_capacity = current_route_capacity(player, source_route_id)
    if source_capacity <= 0:
        return 0
    return min(source_capacity, max(0, int(player.budget_pools.get("factory", 0)) // unit_cost))


def new_factory_option_max_quantity(player: PlayerState, route_id: str) -> int:
    balance = get_balance_config()
    unit_cost = int(balance.production.new_factory_costs.get(route_id, 0))
    if unit_cost <= 0:
        return 0
    return max(0, int(player.budget_pools.get("factory", 0)) // unit_cost)


def domestic_reference_price(player: PlayerState, goods_id: str, snapshot: "GameSnapshot" | None = None) -> int:
    goods = goods_config_by_id(goods_id)
    if goods is None:
        return 0
    adjustment = int(snapshot.market_price_adjustments.get(goods_id, 0)) if snapshot is not None else 0
    event_delta = _goods_event_price_delta(snapshot, goods_id, "domesticDelta")
    resolved = int(goods.domestic_reference_price) + adjustment + event_delta + get_effect_bonus(player, "domesticPriceBonus")
    return max(int(goods.price_floor), min(int(goods.price_ceiling), resolved))


def overseas_reference_price(
    player: PlayerState,
    goods_id: str,
    region_id: str,
    snapshot: "GameSnapshot" | None = None,
) -> int:
    balance = get_balance_config()
    goods = goods_config_by_id(goods_id)
    goods_premium = int(balance.market.region_goods_premiums.get(region_id, {}).get(goods_id, 0))
    premium = goods_premium + _region_event_price_delta(snapshot, region_id)
    adjustment = int(snapshot.market_price_adjustments.get(goods_id, 0)) if snapshot is not None else 0
    event_delta = _goods_event_price_delta(snapshot, goods_id, "overseasDelta")
    if goods is None:
        return max(1, premium + get_effect_bonus(player, "overseasPriceBonus"))
    resolved = int(goods.overseas_base_price) + adjustment + event_delta + premium + get_effect_bonus(player, "overseasPriceBonus")
    return max(1, min(int(goods.overseas_price_ceiling), resolved))


def overseas_reference_price_range(player: PlayerState, goods_id: str, snapshot: "GameSnapshot" | None = None) -> tuple[int, int]:
    balance = get_balance_config()
    region_ids = list(balance.market.region_goods_premiums.keys())
    if not region_ids:
        value = overseas_reference_price(player, goods_id, "", snapshot)
        return (value, value)
    prices = [overseas_reference_price(player, goods_id, rid, snapshot) for rid in region_ids]
    return (min(prices), max(prices))


def build_region_reference_prices(
    player: PlayerState,
    goods_id: str,
    region_states: list[RegionState],
    snapshot: "GameSnapshot" | None = None,
) -> list[dict[str, int | str]]:
    return [
        {
            "regionId": region.region_id,
            "label": region_label(region.region_id),
            "unitPrice": overseas_reference_price(player, goods_id, region.region_id, snapshot),
        }
        for region in region_states
        if goods_id in region.resource_limit
    ]


def route_capacity_usage_by_goods(orders: list[dict[str, int | str]]) -> dict[str, int]:
    usage: dict[str, int] = defaultdict(int)
    for order in orders:
        goods = goods_config_by_id(str(order.get("goodsId") or ""))
        if goods is None:
            continue
        usage[goods.route_id] += max(0, int(order.get("quantity", 0)))
    return dict(usage)


def region_label(region_id: str) -> str:
    return {
        "europe": "欧洲",
        "americas": "美洲",
        "africa": "非洲",
        "middle_east": "中东",
        "asia_pacific": "亚太",
    }.get(region_id, region_id)


def _goods_event_price_delta(snapshot: "GameSnapshot" | None, goods_id: str, delta_key: str) -> int:
    if snapshot is None:
        return 0
    total = 0
    for event in snapshot.active_events:
        effects = event.get("effects")
        if not isinstance(effects, dict):
            continue
        goods_overrides = effects.get("goodsPriceOverrides")
        if not isinstance(goods_overrides, dict):
            continue
        deltas = goods_overrides.get(goods_id)
        if isinstance(deltas, dict):
            total += int(deltas.get(delta_key, 0))
    return total


def _region_event_price_delta(snapshot: "GameSnapshot" | None, region_id: str) -> int:
    if snapshot is None:
        return 0
    total = 0
    for event in snapshot.active_events:
        effects = event.get("effects")
        if not isinstance(effects, dict):
            continue
        region_overrides = effects.get("regionPriceOverrides")
        if not isinstance(region_overrides, dict):
            continue
        total += int(region_overrides.get(region_id, 0))
    return total
