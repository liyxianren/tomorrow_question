from __future__ import annotations

from typing import Any

from app.modules.balance_config import get_balance_config
from app.modules.game_state.models import DEFAULT_PHASE1_CAPACITY_BY_MODE, DEFAULT_TEMPORARY_EFFECTS


TEMPORARY_EFFECT_SPECS: dict[str, tuple[str, str, int]] = {
    "domesticMarketCapacityDelta": ("domesticMarketCapacityBonus", "domesticMarketCapacity", 0),
    "domesticPriceBonusDelta": ("domesticPriceBonus", "domesticPriceBonus", 0),
    "overseasMarketCapacityDelta": ("overseasMarketCapacityBonus", "overseasMarketCapacity", 0),
}

PERMANENT_MARKET_CAP_EFFECT_SPECS: dict[str, str] = {
    "domesticMarketCapacityDelta": "domesticMarketCapacityBonus",
    "overseasMarketCapacityDelta": "overseasMarketCapacityBonus",
}

PERMANENT_CAP_EFFECT_KEYS = frozenset(
    {
        "administrationCapacityDelta",
        "armyCapDelta",
        "domesticMarketCapacityDelta",
        "handicraftCapacityDelta",
        "overseasMarketCapacityDelta",
        "productionCapacityDelta",
    }
)


def split_permanent_capacity_effects(effects: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(effects, dict):
        return {}, {}
    permanent: dict[str, Any] = {}
    transient: dict[str, Any] = {}
    for key, value in effects.items():
        if key in PERMANENT_CAP_EFFECT_KEYS:
            permanent[key] = value
        else:
            transient[key] = value
    return permanent, transient


def apply_permanent_capacity_effects(player_state, effects: dict[str, Any]) -> None:
    if not isinstance(effects, dict):
        return

    for effect_key, permanent_key in PERMANENT_MARKET_CAP_EFFECT_SPECS.items():
        if effect_key not in effects:
            continue
        current = int(player_state.permanent_effects.get(permanent_key, 0))
        player_state.permanent_effects[permanent_key] = current + int(effects[effect_key])

    if "administrationCapacityDelta" in effects:
        delta = int(effects["administrationCapacityDelta"])
        player_state.base_admin_capacity = max(0, int(player_state.base_admin_capacity) + delta)
        player_state.administration_capacity = max(0, int(player_state.administration_capacity) + delta)

    if "armyCapDelta" in effects:
        player_state.army_cap = max(0, int(player_state.army_cap) + int(effects["armyCapDelta"]))

    if "handicraftCapacityDelta" in effects:
        _apply_production_capacity_delta(player_state, {"handicraft": int(effects["handicraftCapacityDelta"])})

    production_capacity_delta = effects.get("productionCapacityDelta")
    if isinstance(production_capacity_delta, dict):
        _apply_production_capacity_delta(player_state, production_capacity_delta)


def reset_temporary_effects(player_state) -> None:
    player_state.temporary_effects = dict(DEFAULT_TEMPORARY_EFFECTS)
    for _, legacy_key, default_value in TEMPORARY_EFFECT_SPECS.values():
        player_state.income_summary[legacy_key] = default_value


def apply_effects(player_state, effects: dict[str, Any]) -> None:
    for effect_key, (temporary_key, legacy_key, default_value) in TEMPORARY_EFFECT_SPECS.items():
        if effect_key not in effects:
            continue
        next_value = int(player_state.temporary_effects.get(temporary_key, default_value)) + int(effects[effect_key])
        player_state.temporary_effects[temporary_key] = next_value
        player_state.income_summary[legacy_key] = next_value

    if "productionOutputMultiplier" in effects:
        current_value = int(player_state.temporary_effects.get("productionOutputMultiplier", 1))
        multiplier = max(1, int(effects["productionOutputMultiplier"]))
        player_state.temporary_effects["productionOutputMultiplier"] = max(1, current_value * multiplier)

    if "phase1ProductionRawCapacityDelta" in effects:
        current_value = int(player_state.temporary_effects.get("phase1ProductionRawCapacityDelta", 0))
        player_state.temporary_effects["phase1ProductionRawCapacityDelta"] = (
            current_value + int(effects["phase1ProductionRawCapacityDelta"])
        )

    if "administrationCapacityDelta" in effects:
        delta = int(effects["administrationCapacityDelta"])
        player_state.base_admin_capacity = max(0, int(player_state.base_admin_capacity) + delta)
        player_state.administration_capacity = max(0, int(player_state.administration_capacity) + delta)

    if "rawMaterialsDelta" in effects:
        player_state.phase1_economy.raw_materials = max(
            0,
            int(player_state.phase1_economy.raw_materials) + int(effects["rawMaterialsDelta"]),
        )

    army_delta = effects.get("armyDelta")
    if isinstance(army_delta, dict):
        for key, value in army_delta.items():
            player_state.army[str(key)] = int(player_state.army.get(str(key), 0)) + int(value)

    navy_delta = effects.get("navyDelta")
    if isinstance(navy_delta, dict):
        for key, value in navy_delta.items():
            player_state.navy[str(key)] = int(player_state.navy.get(str(key), 0)) + int(value)

    ideology_delta = effects.get("ideologyLevelDelta") or effects.get("ideologyDelta")
    if isinstance(ideology_delta, dict):
        balance = get_balance_config().politics
        for key, value in ideology_delta.items():
            ideology_key = str(key)
            current = int(player_state.ideology_levels.get(ideology_key, 0))
            player_state.ideology_levels[ideology_key] = max(
                balance.ideology_min,
                min(balance.ideology_max, current + int(value)),
            )


    if "handicraftCapacityDelta" in effects:
        _apply_production_capacity_delta(player_state, {"handicraft": int(effects["handicraftCapacityDelta"])})

    if "techPointsDelta" in effects:
        player_state.tech_points = max(0, int(player_state.tech_points) + int(effects["techPointsDelta"]))

    research_facility_delta = effects.get("researchFacilityDelta")
    if isinstance(research_facility_delta, dict):
        for key, value in research_facility_delta.items():
            player_state.research_facilities[str(key)] = max(
                0,
                int(player_state.research_facilities.get(str(key), 0)) + int(value),
            )

    _apply_budget_delta(player_state, effects, "domesticMarketBudgetDelta", "domesticMarket")
    _apply_budget_delta(player_state, effects, "factoryBudgetDelta", "factory")
    _apply_budget_delta(player_state, effects, "governmentFiscalBudgetDelta", "governmentFiscal")
    _apply_budget_delta(player_state, effects, "governmentFiscalDelta", "governmentFiscal")


def get_talent_effect_total(player_state, effect_key: str) -> int:
    talent_tree = get_balance_config().research_actions.talent_tree
    total = 0
    for node_id in player_state.unlocked_talents:
        node = talent_tree.nodes.get(node_id)
        if node is None:
            continue
        value = node.permanent_effects.get(effect_key, 0)
        if isinstance(value, (int, float)):
            total += int(value)
    return total


def get_raw_materials_per_turn(player_state, balance=None) -> int:
    balance_config = balance or get_balance_config()
    country_config = balance_config.countries.get(player_state.country.value)
    base = (
        int(country_config.raw_materials_per_turn)
        if country_config is not None
        else int(balance_config.global_config.raw_materials_per_turn)
    )
    return max(0, base + get_talent_effect_total(player_state, "rawMaterialsPerTurnDelta"))


def get_effect_bonus(player_state, temporary_key: str) -> int:
    default_value = int(DEFAULT_TEMPORARY_EFFECTS.get(temporary_key, 0))
    current_value = int(player_state.temporary_effects.get(temporary_key, default_value))
    if current_value == default_value:
        for _, (candidate_key, legacy_key, _) in TEMPORARY_EFFECT_SPECS.items():
            if candidate_key == temporary_key:
                current_value = int(player_state.income_summary.get(legacy_key, default_value))
                break
    current_value += int(player_state.permanent_effects.get(temporary_key, 0))
    current_value += _milestone_effect_bonus(player_state, temporary_key)
    current_value += _talent_effect_bonus(player_state, temporary_key)
    return current_value


def get_production_output_multiplier(player_state) -> int:
    return max(1, int(player_state.temporary_effects.get("productionOutputMultiplier", 1)))


def _apply_budget_delta(player_state, effects: dict[str, Any], effect_key: str, budget_key: str) -> None:
    if effect_key not in effects:
        return
    player_state.budget_pools[budget_key] = max(
        0,
        int(player_state.budget_pools.get(budget_key, 0)) + int(effects[effect_key]),
    )


def _apply_production_capacity_delta(player_state, capacity_delta: dict[str, Any]) -> None:
    for raw_key, raw_delta in capacity_delta.items():
        delta = int(raw_delta)
        if str(raw_key) == "all":
            target_keys = {
                key
                for key in (
                    set(DEFAULT_PHASE1_CAPACITY_BY_MODE)
                    | set(player_state.production_capacity)
                    | set(player_state.phase1_economy.capacity_by_mode)
                )
                if key != "idle"
            }
        else:
            target_keys = {str(raw_key)}
        for cap_key in target_keys:
            _apply_single_production_capacity_delta(player_state, cap_key, delta)


def _apply_single_production_capacity_delta(player_state, cap_key: str, delta: int) -> None:
    current = int(
        player_state.production_capacity.get(
            cap_key,
            player_state.phase1_economy.capacity_by_mode.get(cap_key, 0),
        )
    )
    if cap_key == "idle":
        next_capacity = max(0, current + delta)
        _set_production_capacity(player_state, cap_key, next_capacity)
        return

    if delta > 0:
        country_config = get_balance_config().countries.get(player_state.country.value)
        total_cap = int(country_config.factory_total_cap) if country_config else 0
        idle_current = int(
            player_state.production_capacity.get(
                "idle",
                player_state.phase1_economy.capacity_by_mode.get("idle", 0),
            )
        )
        type_room = max(0, total_cap - current) if total_cap > 0 else delta
        applied = min(delta, type_room, max(0, idle_current))
        if applied <= 0:
            return
        _set_production_capacity(player_state, cap_key, current + applied)
        _set_production_capacity(player_state, "idle", idle_current - applied)
        return

    if delta < 0:
        applied = min(current, abs(delta))
        if applied <= 0:
            return
        idle_current = int(
            player_state.production_capacity.get(
                "idle",
                player_state.phase1_economy.capacity_by_mode.get("idle", 0),
            )
        )
        _set_production_capacity(player_state, cap_key, current - applied)
        _set_production_capacity(player_state, "idle", idle_current + applied)


def _set_production_capacity(player_state, cap_key: str, value: int) -> None:
    next_value = max(0, int(value))
    player_state.production_capacity[cap_key] = next_value
    player_state.phase1_economy.capacity_by_mode[cap_key] = next_value


def _milestone_effect_bonus(player_state, temporary_key: str) -> int:
    effect_key = {
        "domesticMarketCapacityBonus": "domesticMarketCapacityDelta",
        "domesticPriceBonus": "domesticPriceBonusDelta",
        "overseasMarketCapacityBonus": "overseasMarketCapacityDelta",
    }.get(temporary_key)
    if effect_key is None:
        return 0

    total = 0
    for ideology_milestones in get_balance_config().politics.milestones.values():
        for milestone in ideology_milestones.values():
            if milestone.label in player_state.reforms:
                total += int(milestone.effects.get(effect_key, 0))
    return total


def _talent_effect_bonus(player_state, temporary_key: str) -> int:
    effect_key = {
        "domesticMarketCapacityBonus": "domesticMarketCapacityDelta",
        "domesticPriceBonus": "domesticPriceBonusDelta",
        "overseasMarketCapacityBonus": "overseasMarketCapacityDelta",
    }.get(temporary_key)
    if effect_key is None:
        return 0

    talent_tree = get_balance_config().research_actions.talent_tree
    total = 0
    for node_id in player_state.unlocked_talents:
        node = talent_tree.nodes.get(node_id)
        if node is not None:
            total += int(node.permanent_effects.get(effect_key, 0))
    return total
