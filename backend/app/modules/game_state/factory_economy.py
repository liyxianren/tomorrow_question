from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

from app.modules.balance_config import get_balance_config
from app.modules.game_state.effects import get_effect_bonus

if TYPE_CHECKING:
    from app.modules.game_state.models import GameSnapshot, PlayerState, RegionState


ROUTE_DISPLAY_ORDER: tuple[str, ...] = ("handicraft", "mechanized", "steam", "electrified")
ROUTE_LABELS: dict[str, str] = {
    "idle": "闲置",
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


def factory_total_cap(player: PlayerState) -> int:
    country_config = get_balance_config().countries.get(player.country.value)
    if country_config is None or int(country_config.factory_total_cap) <= 0:
        return sum(
            max(0, int(player.phase1_economy.capacity_by_mode.get(mode, 0)))
            for mode in player.phase1_economy.capacity_by_mode
        )
    return int(country_config.factory_total_cap)


def factory_caps_by_mode(player: PlayerState) -> dict[str, int]:
    balance = get_balance_config()
    total_cap = factory_total_cap(player)
    return {
        mode: max(0, int(total_cap))
        for mode in balance.production.levels
        if mode != "idle"
    }


def enabled_factory_count(player: PlayerState) -> int:
    return sum(
        max(0, int(player.phase1_economy.capacity_by_mode.get(mode, 0)))
        for mode in player.phase1_economy.capacity_by_mode
        if mode != "idle"
    )


def idle_factory_capacity(player: PlayerState) -> int:
    configured_idle = max(0, int(player.phase1_economy.capacity_by_mode.get("idle", 0)))
    total_room = max(0, factory_total_cap(player) - enabled_factory_count(player))
    return min(configured_idle, total_room) if factory_total_cap(player) > 0 else configured_idle


def factory_mode_remaining_capacity(player: PlayerState, route_id: str) -> int:
    if route_id == "idle":
        return idle_factory_capacity(player)
    cap = factory_total_cap(player)
    if cap <= 0:
        return 0
    return max(0, cap - current_route_capacity(player, route_id))


def new_factory_available_quantity(player: PlayerState, route_id: str) -> int:
    if route_id == "idle":
        return 0
    return min(
        idle_factory_capacity(player),
        factory_mode_remaining_capacity(player, route_id),
    )


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
    return route_technology_locked_reason(player, route_id)


def route_technology_locked_reason(player: PlayerState, route_id: str) -> str | None:
    if route_id in ("idle", "handicraft"):
        return None
    required_techs = get_balance_config().technology.route_unlocks.get(route_id)
    if not required_techs:
        return None
    missing_techs = [tech_id for tech_id in required_techs if tech_id not in player.unlocked_techs]
    if not missing_techs:
        return None
    labels = "、".join(f"「{_technology_label(tech_id)}」" for tech_id in missing_techs)
    return f"需要研究{labels}"


def goods_locked_reason(player: PlayerState, route_id: str, goods_id: str | None = None) -> str | None:
    route_label = get_route_label(route_id)
    if goods_id:
        initial_goods = set(country_initial_goods(player))
        if goods_id in initial_goods:
            return None if current_route_capacity(player, route_id) > 0 else f"需要{route_label}产能"

        # Shim: chain-based research no longer maps tech → goods. Skip the tech gate entirely
        # so non-initial goods remain producible if route capacity is available (Tasks 3-4 restore proper gating).
        tech = goods_unlocking_tech(goods_id)
        if tech is not None and tech.tech_id not in player.unlocked_techs:
            return f"需要研究「{tech.label}」"

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
    # Shim: chain-based research has no per-goods unlocks (Tasks 3-4 will replace this).
    del goods_id
    return None


def action_unlocking_tech(action_id: str):
    # Shim: chain-based research has no per-action unlocks (Tasks 3-4 will replace this).
    del action_id
    return None


def route_unlocking_tech(route_id: str):
    required_techs = get_balance_config().technology.route_unlocks.get(route_id)
    if not required_techs:
        return None
    return _technology_config(required_techs[0])


def _technology_config(tech_id: str):
    for chain in get_balance_config().technology.chains.values():
        for tech in chain.techs:
            if tech.tech_id == tech_id:
                return tech
    return None


def _technology_label(tech_id: str) -> str:
    tech = _technology_config(tech_id)
    return tech.label if tech is not None else tech_id


def is_tech_researchable(player: PlayerState, tech_id: str) -> bool:
    # Shim: tech research is gated by chains now (Tasks 3-4 will replace this).
    del player, tech_id
    return False


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
    unit_cost = expansion_unit_budget_cost(player, route_id)
    if unit_cost <= 0:
        return 0
    return min(
        new_factory_available_quantity(player, route_id),
        max(0, int(player.budget_pools.get("factory", 0)) // unit_cost),
    )


def upgrade_option_max_quantity(player: PlayerState, target_route_id: str) -> int:
    balance = get_balance_config()
    source_route_id = balance.production.upgrade_source_levels.get(target_route_id)
    unit_cost = upgrade_unit_budget_cost(player, target_route_id)
    if source_route_id is None or unit_cost <= 0:
        return 0
    if route_technology_locked_reason(player, target_route_id) is not None:
        return 0
    source_capacity = current_route_capacity(player, source_route_id)
    if source_capacity <= 0:
        return 0
    return min(
        source_capacity,
        factory_mode_remaining_capacity(player, target_route_id),
        max(0, int(player.budget_pools.get("factory", 0)) // unit_cost),
    )


def new_factory_option_max_quantity(player: PlayerState, route_id: str) -> int:
    unit_cost = new_factory_unit_budget_cost(player, route_id)
    if unit_cost <= 0:
        return 0
    return min(
        new_factory_available_quantity(player, route_id),
        max(0, int(player.budget_pools.get("factory", 0)) // unit_cost),
    )


def expansion_unit_budget_cost(player: PlayerState, route_id: str) -> int:
    base_cost = int(get_balance_config().production.expansion_costs.get(route_id, 0))
    discount = _factory_discount_percent(player, "factoryExpansionCostReductionPercent")
    return _discounted_unit_cost(base_cost, discount)


def upgrade_unit_budget_cost(player: PlayerState, route_id: str) -> int:
    base_cost = int(get_balance_config().production.upgrade_costs.get(route_id, 0))
    discount = _factory_discount_percent(player, "factoryUpgradeCostReductionPercent")
    return _discounted_unit_cost(base_cost, discount)


def new_factory_unit_budget_cost(player: PlayerState, route_id: str) -> int:
    base_cost = int(get_balance_config().production.new_factory_costs.get(route_id, 0))
    discount = _factory_discount_percent(player, "newFactoryCostReductionPercent")
    return _discounted_unit_cost(base_cost, discount)


def _factory_discount_percent(player: PlayerState, effect_key: str) -> int:
    return max(0, min(90, get_effect_bonus(player, effect_key)))


def _discounted_unit_cost(base_cost: int, discount_percent: int) -> int:
    if base_cost <= 0:
        return 0
    if discount_percent <= 0:
        return base_cost
    return max(1, (base_cost * (100 - discount_percent) + 99) // 100)


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
    del player, goods_id, snapshot
    region = balance.regions.region_blueprints.get(region_id)
    if region is None:
        return 1
    return max(1, int(region.fixed_overseas_price))


def overseas_reference_price_range(player: PlayerState, goods_id: str, snapshot: "GameSnapshot" | None = None) -> tuple[int, int]:
    balance = get_balance_config()
    region_ids = list(balance.regions.region_blueprints.keys())
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
