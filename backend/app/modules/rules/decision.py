from __future__ import annotations

from typing import Any

from app.modules.balance_config import get_balance_config
from app.modules.game_state.effects import apply_effects, get_production_output_multiplier
from app.modules.game_state.factory_economy import (
    action_locked_reason,
    current_route_capacity,
    goods_config_by_id,
    goods_locked_reason,
    route_locked_reason,
)
from app.modules.game_state.models import DEFAULT_PHASE1_CAPACITY_BY_MODE

from .common import RuleResolution, clone_snapshot, default_decision_submission_payload, index_turn_inputs
from .phase1_economy import (
    PRODUCTION_MODE_OUTPUT_RATIOS,
    calculate_production_output,
)


PHASE1_GOODS_KEY = "phase1_goods"


def resolve_decision_phase(*, snapshot, turn_inputs) -> RuleResolution:
    balance = get_balance_config()
    updated_snapshot = clone_snapshot(snapshot)
    turn_inputs_by_player_id = index_turn_inputs(turn_inputs)
    generated_logs: list[dict[str, Any]] = []
    summary_lines: list[str] = []

    for player_state in updated_snapshot.player_states:
        submitted = turn_inputs_by_player_id.get(player_state.player_id)
        payload = dict(submitted.payload) if submitted is not None else default_decision_submission_payload()
        domestic_before = int(player_state.budget_pools.get("domesticMarket", 0))
        factory_before = int(player_state.budget_pools.get("factory", 0))
        government_before = int(player_state.budget_pools.get("governmentFiscal", 0))

        _apply_active_event_effects(player_state, updated_snapshot.active_events)
        _apply_ability_selection(player_state, payload.get("abilitySelection"), balance)

        phase1_production = payload.get("phase1Production") or {}
        factory_spent = _apply_phase1_production_plan(player_state, phase1_production, balance)
        domestic_spent = _apply_domestic_market_plan(player_state, payload.get("domesticMarketPlan") or {}, balance)
        government_spent = _apply_government_plan(player_state, payload.get("governmentPlan") or {}, balance)
        military_spent = _apply_military_plan(player_state, payload.get("militaryPlan") or {}, balance, updated_snapshot)
        _apply_reform_plan(player_state, payload, balance)
        _apply_policy_plan(player_state, payload, balance)
        _apply_talent_plan(player_state, payload.get("talentPlan", {}), balance)
        _apply_tech_research(player_state, (payload.get("governmentPlan") or {}).get("techResearch") or [], balance)

        summary_lines.append(
            (
                f"{player_state.country.value} 决策完成：国内市场 {domestic_before}->{player_state.budget_pools['domesticMarket']}，"
                f"工厂 {factory_before}->{player_state.budget_pools['factory']}，"
                f"政府财政 {government_before}->{player_state.budget_pools['governmentFiscal']}。"
            )
        )
        generated_logs.append(
            {
                "gameId": updated_snapshot.game_id,
                "roundNo": updated_snapshot.round_no,
                "phase": updated_snapshot.phase,
                "kind": "decision.resolved",
                "message": f"{player_state.country.value} completed decision planning.",
                "details": {
                    "playerId": player_state.player_id,
                    "domesticMarketSpent": domestic_spent,
                    "factorySpent": factory_spent,
                    "governmentFiscalSpent": government_spent,
                    "militaryFiscalSpent": military_spent,
                    "techPoints": player_state.tech_points,
                    "militaryPoints": player_state.military_points,
                },
                "createdAt": None,
            }
        )

    return RuleResolution(
        updated_snapshot=updated_snapshot,
        generated_logs=generated_logs,
        summary={
            "settledPhase": snapshot.phase.value,
            "headline": "国家决策已完成，新的预算结构和卖货库存已经准备好。",
            "summaryLines": summary_lines,
        },
    )


def _apply_phase1_production_plan(player_state, phase1_production: dict[str, Any], balance) -> int:
    """Phase-1 unified production: build/upgrade capacity_by_mode, then turn raw materials into goods."""
    spent = 0
    remaining_budget = int(player_state.budget_pools.get("factory", 0))

    capacity_by_mode = player_state.phase1_economy.capacity_by_mode

    for order in phase1_production.get("buildOrders", []) or []:
        mode = str(order.get("mode") or "")
        quantity = max(0, int(order.get("quantity", 0)))
        if mode not in DEFAULT_PHASE1_CAPACITY_BY_MODE or quantity <= 0:
            continue
        if mode in balance.technology.route_unlocks:
            required_tech = balance.technology.route_unlocks[mode]
            if required_tech not in player_state.unlocked_techs:
                continue
        unit_cost = int(balance.production.new_factory_costs.get(mode, 0))
        if unit_cost <= 0:
            continue
        affordable = min(quantity, remaining_budget // unit_cost)
        if affordable <= 0:
            continue
        capacity_by_mode[mode] = int(capacity_by_mode.get(mode, 0)) + affordable
        player_state.production_capacity[mode] = (
            int(player_state.production_capacity.get(mode, 0)) + affordable
        )
        total_cost = affordable * unit_cost
        spent += total_cost
        remaining_budget -= total_cost

    for order in phase1_production.get("upgradeOrders", []) or []:
        source_mode = str(order.get("sourceMode") or "")
        target_mode = str(order.get("targetMode") or "")
        quantity = max(0, int(order.get("quantity", 0)))
        if source_mode not in DEFAULT_PHASE1_CAPACITY_BY_MODE:
            continue
        if target_mode not in DEFAULT_PHASE1_CAPACITY_BY_MODE:
            continue
        if target_mode in balance.technology.route_unlocks:
            required_tech = balance.technology.route_unlocks[target_mode]
            if required_tech not in player_state.unlocked_techs:
                continue
        unit_cost = int(balance.production.upgrade_costs.get(target_mode, 0))
        if unit_cost <= 0 or quantity <= 0:
            continue
        available_source = int(capacity_by_mode.get(source_mode, 0))
        affordable = min(quantity, available_source, remaining_budget // unit_cost)
        if affordable <= 0:
            continue
        capacity_by_mode[source_mode] = available_source - affordable
        capacity_by_mode[target_mode] = int(capacity_by_mode.get(target_mode, 0)) + affordable
        player_state.production_capacity[source_mode] = (
            int(player_state.production_capacity.get(source_mode, 0)) - affordable
        )
        player_state.production_capacity[target_mode] = (
            int(player_state.production_capacity.get(target_mode, 0)) + affordable
        )
        total_cost = affordable * unit_cost
        spent += total_cost
        remaining_budget -= total_cost

    raw_assignments_in = phase1_production.get("rawMaterialAssignments") or {}
    available_raw = max(0, int(player_state.phase1_economy.raw_materials))
    raw_assignments: dict[str, int] = {}
    for mode, raw_amount in raw_assignments_in.items():
        if mode not in PRODUCTION_MODE_OUTPUT_RATIOS:
            continue
        capped = min(
            max(0, int(raw_amount)),
            int(capacity_by_mode.get(mode, 0)),
            available_raw,
        )
        if capped > 0:
            raw_assignments[mode] = capped
            available_raw -= capped

    output_decimal = calculate_production_output(raw_assignments)
    output_int = int(output_decimal)
    raw_used = sum(raw_assignments.values())

    player_state.phase1_economy.goods_inventory = (
        int(player_state.phase1_economy.goods_inventory) + output_int
    )
    player_state.phase1_economy.raw_materials = max(
        0, int(player_state.phase1_economy.raw_materials) - raw_used
    )

    if output_int > 0:
        player_state.goods_stock[PHASE1_GOODS_KEY] = (
            int(player_state.goods_stock.get(PHASE1_GOODS_KEY, 0)) + output_int
        )

    player_state.budget_pools["factory"] = max(0, remaining_budget)
    return spent


def _apply_factory_plan(player_state, factory_plan: dict[str, Any], balance) -> int:
    spent = 0
    remaining_budget = int(player_state.budget_pools.get("factory", 0))
    remaining_route_capacity = {
        route_id: current_route_capacity(player_state, route_id)
        for route_id in balance.production.levels
        if route_id != "idle"
    }
    remaining_upgradeable_capacity = dict(remaining_route_capacity)

    for order in factory_plan.get("productionOrders", []):
        goods_id = str(order.get("goodsId"))
        goods = goods_config_by_id(goods_id)
        requested = max(0, int(order.get("quantity", 0)))
        if goods is None or requested <= 0:
            continue
        route_id = goods.route_id
        unit_cost = int(goods.unit_budget_cost)
        if goods_locked_reason(player_state, route_id, goods_id) is not None or unit_cost <= 0:
            continue
        quantity = min(
            requested,
            max(0, remaining_route_capacity.get(route_id, 0)),
            max(0, remaining_budget // unit_cost),
        )
        if quantity <= 0:
            continue
        route_multiplier = int(balance.production.output_multipliers.get(goods.route_id, 1))
        output_quantity = quantity * int(goods.unit_output) * route_multiplier
        output_quantity *= get_production_output_multiplier(player_state)
        player_state.goods_stock[goods_id] = int(player_state.goods_stock.get(goods_id, 0)) + output_quantity
        player_state.raw_material_usage[goods_id] = int(player_state.raw_material_usage.get(goods_id, 0)) + quantity
        remaining_route_capacity[route_id] = max(0, int(remaining_route_capacity.get(route_id, 0)) - quantity)
        spent += quantity * unit_cost
        remaining_budget -= quantity * unit_cost

    for order in factory_plan.get("expansionOrders", []):
        route_id = str(order.get("routeId"))
        unit_cost = int(balance.production.expansion_costs.get(route_id, 0))
        if current_route_capacity(player_state, route_id) <= 0:
            continue
        quantity = min(max(0, int(order.get("quantity", 0))), max(0, remaining_budget // max(1, unit_cost)))
        if unit_cost <= 0 or quantity <= 0:
            continue
        player_state.pending_production_capacity[route_id] = int(player_state.pending_production_capacity.get(route_id, 0)) + quantity
        total_cost = quantity * unit_cost
        spent += total_cost
        remaining_budget -= total_cost

    for order in factory_plan.get("upgradeOrders", []):
        route_id = str(order.get("routeId"))
        source_route = balance.production.upgrade_source_levels.get(route_id)
        unit_cost = int(balance.production.upgrade_costs.get(route_id, 0))
        quantity = max(0, int(order.get("quantity", 0)))
        if source_route is None or quantity <= 0:
            continue
        if route_locked_reason(player_state, route_id) is not None:
            continue
        upgradeable = min(
            quantity,
            max(0, remaining_upgradeable_capacity.get(source_route, 0)),
            max(0, remaining_budget // max(1, unit_cost)),
        )
        if upgradeable <= 0:
            continue
        remaining_upgradeable_capacity[source_route] = max(
            0,
            int(remaining_upgradeable_capacity.get(source_route, 0)) - upgradeable,
        )
        player_state.pending_production_capacity[source_route] = int(
            player_state.pending_production_capacity.get(source_route, 0)
        ) - upgradeable
        player_state.pending_production_capacity[route_id] = int(player_state.pending_production_capacity.get(route_id, 0)) + upgradeable
        total_cost = upgradeable * unit_cost
        spent += total_cost
        remaining_budget -= total_cost

    new_factory_capacity_delta = 2
    for order in factory_plan.get("newFactoryOrders", []):
        route_id = str(order.get("routeId"))
        if route_id != "handicraft" and route_locked_reason(player_state, route_id) is not None:
            continue
        unit_cost = int(balance.production.new_factory_costs.get(route_id, 0))
        quantity = min(max(0, int(order.get("quantity", 0))), max(0, remaining_budget // max(1, unit_cost)))
        if unit_cost <= 0 or quantity <= 0:
            continue
        player_state.pending_production_capacity[route_id] = int(player_state.pending_production_capacity.get(route_id, 0)) + (quantity * new_factory_capacity_delta)
        total_cost = quantity * unit_cost
        spent += total_cost
        remaining_budget -= total_cost

    player_state.budget_pools["factory"] = max(0, remaining_budget)
    return spent


def _apply_domestic_market_plan(player_state, domestic_plan: dict[str, Any], balance) -> int:
    spent = 0
    remaining_budget = int(player_state.budget_pools.get("domesticMarket", 0))
    for selection in domestic_plan.get("domesticMarketActions", []):
        action_id = str(selection.get("actionId"))
        action = balance.decision_actions.domestic_market_actions.get(action_id)
        if action is None or action_locked_reason(player_state, action_id) is not None or remaining_budget - spent < action.budget_pool_cost:
            continue
        spent += int(action.budget_pool_cost)
        apply_effects(player_state, action.effects)

    player_state.budget_pools["domesticMarket"] = max(0, remaining_budget - spent)
    return spent


def _apply_government_plan(player_state, government_plan: dict[str, Any], balance) -> int:
    spent = 0
    remaining_budget = int(player_state.budget_pools.get("governmentFiscal", 0))
    tech_cost = max(1, int(balance.technology.facility_cost // 5))
    military_cost = max(1, int(balance.military.army_unit_cost))

    for purchase in government_plan.get("pointPurchases", []):
        point_type = str(purchase.get("pointType"))
        quantity = max(0, int(purchase.get("quantity", 0)))
        unit_cost = tech_cost if point_type == "tech" else military_cost
        affordable = min(quantity, max(0, (remaining_budget - spent) // max(1, unit_cost)))
        if affordable <= 0:
            continue
        spent += affordable * unit_cost
        if point_type == "tech":
            player_state.tech_points += affordable
        else:
            player_state.military_points += affordable

    for selection in government_plan.get("strategySelections", []):
        action_id = str(selection.get("actionId"))
        action = balance.decision_actions.government_actions.get(action_id)
        if action is None:
            continue
        if action_locked_reason(player_state, action_id) is not None:
            continue
        if remaining_budget - spent < action.budget_pool_cost:
            continue
        if player_state.tech_points < action.tech_point_cost or player_state.military_points < action.military_point_cost:
            continue
        spent += int(action.budget_pool_cost)
        player_state.tech_points -= int(action.tech_point_cost)
        player_state.military_points -= int(action.military_point_cost)
        _apply_ratio_delta(player_state, action.ratio_delta)
        apply_effects(player_state, action.effects)
        if action_id not in player_state.policies:
            player_state.policies.append(action_id)

    player_state.budget_pools["governmentFiscal"] = max(0, remaining_budget - spent)
    return spent


def _apply_tech_research(player_state, tech_selections: list[dict[str, Any]], balance) -> None:
    for selection in tech_selections:
        tech_id = str(selection.get("techId") or "")
        tech = balance.technology.tech_tree.get(tech_id)
        if tech is None or tech_id in player_state.unlocked_techs:
            continue
        if any(prerequisite not in player_state.unlocked_techs for prerequisite in tech.prerequisites):
            continue
        # 从对应预算池扣除
        pool_key = tech.budget_pool
        current_budget = int(player_state.budget_pools.get(pool_key, 0))
        if current_budget < int(tech.budget_cost):
            continue
        player_state.budget_pools[pool_key] = current_budget - int(tech.budget_cost)
        player_state.unlocked_techs.append(tech_id)


def _apply_military_plan(player_state, military_plan: dict[str, Any], balance, snapshot=None) -> int:
    spent = 0
    remaining_budget = int(player_state.budget_pools.get("governmentFiscal", 0))

    for selection in military_plan.get("militaryActions", []):
        action_id = str(selection.get("actionId") or "")
        action = balance.military_actions.military_actions.get(action_id)
        if action is None:
            continue
        if remaining_budget < int(action.budget_pool_cost):
            continue
        remaining_budget -= int(action.budget_pool_cost)
        spent += int(action.budget_pool_cost)
        apply_effects(player_state, action.effects)

    for selection in military_plan.get("diplomacyActions", []):
        action_id = str(selection.get("actionId") or "")
        action = balance.military_actions.diplomacy_actions.get(action_id)
        if action is None:
            continue
        if action.target_region in player_state.established_diplomacy:
            continue
        if remaining_budget < int(action.budget_pool_cost):
            continue
        remaining_budget -= int(action.budget_pool_cost)
        spent += int(action.budget_pool_cost)
        player_state.established_diplomacy.append(action.target_region)

    unlock_colonization = bool(military_plan.get("unlockColonization", False))
    if unlock_colonization and not player_state.colonization_unlocked:
        unlock_cost = int(balance.military.colonization_unlock_cost)
        if remaining_budget >= unlock_cost:
            remaining_budget -= unlock_cost
            spent += unlock_cost
            player_state.colonization_unlocked = True

    if snapshot is not None and player_state.colonization_unlocked:
        max_colonizations = int(balance.military.max_colonizations_per_round)
        military_point_cost = int(balance.military.colonization_military_point_cost)
        selected_targets: set[str] = set()
        colonized_count = 0
        for selection in military_plan.get("colonizationActions", []):
            if colonized_count >= max_colonizations:
                break
            target_region_id = str(selection.get("targetRegionId") or "")
            if not target_region_id or target_region_id in selected_targets:
                continue
            selected_targets.add(target_region_id)
            if player_state.military_points < military_point_cost:
                continue
            if target_region_id not in player_state.established_diplomacy:
                continue
            region_blueprint = balance.regions.region_blueprints.get(target_region_id)
            if region_blueprint is None or not region_blueprint.colonizable:
                continue
            target_region = next(
                (region_state for region_state in snapshot.region_states if region_state.region_id == target_region_id),
                None,
            )
            if target_region is None or target_region.controller is not None:
                continue
            player_state.military_points -= military_point_cost
            target_region.controller = player_state.country.value
            colonized_count += 1

    player_state.budget_pools["governmentFiscal"] = max(0, remaining_budget)
    return spent


def _apply_talent_plan(player_state, talent_plan: dict[str, Any], balance) -> None:
    talent_tree = balance.research_actions.talent_tree
    for selection in talent_plan.get("talentUnlocks", []):
        node_id = str(selection.get("nodeId", ""))
        node = talent_tree.nodes.get(node_id)
        if node is None or node_id in player_state.unlocked_talents:
            continue
        branch = talent_tree.branches.get(node.branch)
        if branch is None:
            continue
        order = branch.unlock_order
        node_index = order.index(node_id) if node_id in order else -1
        if node_index < 0:
            continue
        if node_index > 0 and order[node_index - 1] not in player_state.unlocked_talents:
            continue
        if player_state.tech_points < node.tech_point_cost:
            continue
        player_state.tech_points -= node.tech_point_cost
        player_state.unlocked_talents.append(node_id)
        apply_effects(player_state, node.permanent_effects)


def _apply_ratio_delta(player_state, ratio_delta: dict[str, float]) -> None:
    for key, delta in ratio_delta.items():
        player_state.income_allocation_ratio[key] = max(
            0.0,
            float(player_state.income_allocation_ratio.get(key, 0.0)) + float(delta),
        )

def _apply_active_event_effects(player_state, active_events: list[dict[str, Any]]) -> None:
    for event in active_events:
        effects = event.get("effects")
        if isinstance(effects, dict):
            apply_effects(player_state, effects)


def _apply_ability_selection(player_state, selection: Any, balance) -> None:
    if not isinstance(selection, dict):
        return

    ability = balance.abilities.national_abilities.get(player_state.country.value)
    if ability is None:
        return

    ability_id = str(selection.get("abilityId") or "")
    if ability_id != ability.ability_id or ability_id in player_state.used_abilities:
        return

    effects = dict(ability.effects)
    if "resetIdeologiesTo" in effects:
        reset_value = int(effects["resetIdeologiesTo"])
        for ideology_key in tuple(player_state.ideology_levels):
            player_state.ideology_levels[ideology_key] = reset_value

    if "targetIdeologyDelta" in effects:
        target_ideology = str(selection.get("targetIdeology") or "")
        if target_ideology in player_state.ideology_levels:
            player_state.ideology_levels[target_ideology] = int(player_state.ideology_levels.get(target_ideology, 0)) + int(
                effects["targetIdeologyDelta"]
            )

    free_upgrade = effects.get("freeUpgradeCapacity")
    if isinstance(free_upgrade, dict):
        source_route_id = str(free_upgrade.get("sourceRouteId") or "")
        target_route_id = str(free_upgrade.get("targetRouteId") or "")
        quantity = min(
            max(0, int(free_upgrade.get("quantity", 0))),
            max(0, int(player_state.production_capacity.get(source_route_id, 0))),
        )
        if quantity > 0:
            player_state.production_capacity[source_route_id] = int(player_state.production_capacity.get(source_route_id, 0)) - quantity
            player_state.production_capacity[target_route_id] = int(player_state.production_capacity.get(target_route_id, 0)) + quantity

    if effects.get("convertIdleCapacityToHandicraft"):
        idle_capacity = max(0, int(player_state.production_capacity.get("idle", 0)))
        if idle_capacity > 0:
            player_state.production_capacity["idle"] = 0
            player_state.production_capacity["handicraft"] = int(player_state.production_capacity.get("handicraft", 0)) + idle_capacity

    apply_effects(player_state, effects)
    player_state.used_abilities.append(ability_id)


_REFORM_RATIO_KEY_ALIASES = {
    "consumption": "domesticMarket",
    "fiscal": "governmentFiscal",
}


def _normalize_reform_ratio_key(key: str) -> str:
    return _REFORM_RATIO_KEY_ALIASES.get(key, key)


def _apply_reform_or_policy_effects(player_state, effects: dict[str, Any]) -> None:
    if not isinstance(effects, dict):
        return

    ideology_delta = effects.get("ideologyDelta")
    if isinstance(ideology_delta, dict):
        for key, delta in ideology_delta.items():
            player_state.ideology_levels[key] = (
                int(player_state.ideology_levels.get(key, 0)) + int(delta)
            )

    ratio_delta = effects.get("ratioDelta")
    if isinstance(ratio_delta, dict):
        for raw_key, delta in ratio_delta.items():
            key = _normalize_reform_ratio_key(str(raw_key))
            player_state.income_allocation_ratio[key] = max(
                0.0,
                float(player_state.income_allocation_ratio.get(key, 0.0)) + float(delta),
            )

    ratio_override = effects.get("ratioOverride")
    if isinstance(ratio_override, dict):
        new_ratio: dict[str, float] = {}
        for raw_key, value in ratio_override.items():
            new_ratio[_normalize_reform_ratio_key(str(raw_key))] = float(value)
        player_state.income_allocation_ratio = new_ratio

    capacity_delta = effects.get("productionCapacityDelta")
    if isinstance(capacity_delta, dict):
        for raw_key, delta in capacity_delta.items():
            delta_int = int(delta)
            if raw_key == "all":
                for cap_key in list(player_state.production_capacity.keys()):
                    if cap_key == "idle":
                        continue
                    player_state.production_capacity[cap_key] = max(
                        0,
                        int(player_state.production_capacity.get(cap_key, 0)) + delta_int,
                    )
            else:
                player_state.production_capacity[raw_key] = max(
                    0,
                    int(player_state.production_capacity.get(raw_key, 0)) + delta_int,
                )

    military_delta = effects.get("militaryPointsDelta")
    if military_delta is not None:
        player_state.military_points = max(
            0, int(player_state.military_points) + int(military_delta)
        )

    research_facility_delta = effects.get("researchFacilityDelta")
    if isinstance(research_facility_delta, dict):
        for key, delta in research_facility_delta.items():
            player_state.research_facilities[key] = max(
                0, int(player_state.research_facilities.get(key, 0)) + int(delta)
            )

    admin_delta = effects.get("administrationCapacityDelta")
    if admin_delta is not None:
        player_state.administration_capacity = max(
            0, int(player_state.administration_capacity) + int(admin_delta)
        )

    fiscal_refund = effects.get("fiscalRefund")
    if fiscal_refund is not None:
        player_state.budget_pools["governmentFiscal"] = (
            int(player_state.budget_pools.get("governmentFiscal", 0)) + int(fiscal_refund)
        )


def _is_reform_path_blocked(player_state, balance, reform) -> bool:
    for done_id in player_state.completed_reforms:
        done = balance.reforms.reforms.get(done_id)
        if done is None:
            continue
        if reform.path in done.blocks_other_paths:
            return True
        if done.path in reform.blocks_other_paths:
            return True
    return False


def _apply_reform_plan(player_state, payload: dict[str, Any], balance) -> list[str]:
    enacted: list[str] = []
    requested = payload.get("reforms")
    if not isinstance(requested, list):
        return enacted

    for raw_reform_id in requested:
        reform_id = str(raw_reform_id or "")
        reform = balance.reforms.reforms.get(reform_id)
        if reform is None:
            continue
        if reform_id in player_state.completed_reforms:
            continue
        if int(player_state.administration_capacity) < int(reform.admin_cost):
            continue
        if _is_reform_path_blocked(player_state, balance, reform):
            continue

        player_state.administration_capacity = (
            int(player_state.administration_capacity) - int(reform.admin_cost)
        )
        player_state.completed_reforms.append(reform_id)
        _apply_reform_or_policy_effects(player_state, reform.effects)
        enacted.append(reform_id)

    return enacted


def _apply_policy_plan(player_state, payload: dict[str, Any], balance) -> list[str]:
    activated: list[str] = []

    deactivate_list = payload.get("deactivatePolicies")
    if isinstance(deactivate_list, list):
        for raw_id in deactivate_list:
            policy_id = str(raw_id or "")
            if policy_id in player_state.active_policies:
                player_state.active_policies.remove(policy_id)

    activate_list = payload.get("activatePolicies")
    if not isinstance(activate_list, list):
        return activated

    for raw_id in activate_list:
        policy_id = str(raw_id or "")
        policy = balance.reforms.regular_policies.get(policy_id)
        if policy is None:
            continue
        if policy_id in player_state.active_policies:
            continue
        if policy.requires_reform is not None and policy.requires_reform not in player_state.completed_reforms:
            continue
        if int(player_state.administration_capacity) < int(policy.admin_cost_per_turn):
            continue

        player_state.administration_capacity = (
            int(player_state.administration_capacity) - int(policy.admin_cost_per_turn)
        )
        player_state.active_policies.append(policy_id)
        activated.append(policy_id)

    return activated


def _mirror_phase1_economy_after_decision(player_state) -> None:
    player_state.phase1_economy.capacity_by_mode = {
        mode: int(player_state.production_capacity.get(mode, 0))
        for mode in DEFAULT_PHASE1_CAPACITY_BY_MODE
    }
    player_state.phase1_economy.goods_inventory = sum(
        int(amount) for amount in player_state.goods_stock.values()
    )
