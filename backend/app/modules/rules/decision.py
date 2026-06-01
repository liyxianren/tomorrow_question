from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.modules.balance_config import get_balance_config
from app.modules.game_state.effects import (
    apply_effects,
    apply_permanent_capacity_effects,
    get_talent_effect_total,
    split_permanent_capacity_effects,
)
from app.modules.game_state.budgeting import decision_phase_government_fiscal_budget
from app.modules.game_state.factory_economy import (
    action_locked_reason,
    current_route_capacity,
    expansion_unit_budget_cost,
    factory_mode_remaining_capacity,
    idle_factory_capacity,
    new_factory_available_quantity,
    new_factory_unit_budget_cost,
    route_locked_reason,
    route_technology_locked_reason,
    upgrade_unit_budget_cost,
)
from app.modules.game_state.models import DEFAULT_PHASE1_CAPACITY_BY_MODE

from .common import (
    POINT_PURCHASE_COSTS,
    RuleResolution,
    clone_snapshot,
    default_decision_submission_payload,
    index_turn_inputs,
)
from .colonization import COLONIZATION_ARMY_COST, can_colonize_region
from .phase1_economy import (
    PRODUCTION_MODE_OUTPUT_RATIOS,
    calculate_production_output,
)
from .route_utils import resolve_naval_blockade


PHASE1_GOODS_KEY = "phase1_goods"
RESEARCH_FACILITY_ACTION_ID = "expand_research"
GOVERNMENT_MARKET_POLICY_EFFECT_KEYS = {
    "domesticMarketCapacityDelta": "governmentDomesticMarketCapacityBonus",
    "domesticPriceBonusDelta": "governmentDomesticPriceBonus",
    "overseasMarketCapacityDelta": "governmentOverseasMarketCapacityBonus",
}
PERMANENT_FACTORY_DISCOUNT_KEYS = (
    "factoryUpgradeCostReductionPercent",
    "factoryExpansionCostReductionPercent",
    "newFactoryCostReductionPercent",
)
IMMEDIATE_POLICY_EFFECT_KEYS = (
    "productionOutputMultiplier",
    "phase1ProductionRawCapacityDelta",
    "mobilizeCapacityToMilitary",
    "suppressIdeology",
)


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

        # ── 行政力每回合刷新；上一轮政策的临时比例效果在本轮重置 ──
        _reset_round_policy_state(player_state, balance)

        factory_plan = payload.get("factoryPlan") or {}
        domestic_spent = _apply_domestic_market_plan(player_state, payload.get("domesticMarketPlan") or {}, balance)
        government_spent = _apply_government_plan(
            player_state,
            payload.get("governmentPlan") or {},
            balance,
        )
        _apply_reform_plan(player_state, payload, balance)  # enacted, errors - errors silently logged above if needed
        _apply_policy_plan(player_state, payload, balance)

        phase1_production = payload.get("phase1Production") or {}
        upgrade_orders = (
            payload.get("factoryPlan", {}).get("upgradeOrders", [])
            or phase1_production.get("upgradeOrders", [])
            or []
        )
        expansion_orders = (
            payload.get("factoryPlan", {}).get("expansionOrders", [])
            or phase1_production.get("expansionOrders", [])
            or []
        )
        new_factory_orders = factory_plan.get("newFactoryOrders", []) or []
        factory_spent = _apply_factory_actions(player_state, factory_plan, balance)
        factory_spent += _apply_phase1_production_plan(
            player_state,
            phase1_production,
            balance,
            upgrade_orders,
            expansion_orders,
            new_factory_orders,
            raw_material_purchase_quantity=factory_plan.get("rawMaterialPurchaseQuantity", 0),
        )
        military_plan = payload.get("militaryPlan") or {}
        military_spent = _apply_military_plan(
            player_state,
            military_plan,
            balance,
            updated_snapshot,
        )
        _apply_talent_plan(player_state, payload.get("talentPlan", {}), balance)
        _apply_phase3_research_plan(player_state, payload, balance)


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
                    "armyCap": int(player_state.army_cap),
                },
                "createdAt": None,
            }
        )

    resolve_naval_blockade(updated_snapshot, balance)

    return RuleResolution(
        updated_snapshot=updated_snapshot,
        generated_logs=generated_logs,
        summary={
            "settledPhase": snapshot.phase.value,
            "headline": "国家决策已完成，新的预算结构和卖货库存已经准备好。",
            "summaryLines": summary_lines,
        },
    )


def _apply_phase1_production_plan(
    player_state,
    phase1_production: dict[str, Any],
    balance,
    upgrade_orders=None,
    expansion_orders=None,
    new_factory_orders=None,
    raw_material_purchase_quantity=0,
) -> int:
    """Phase-1 unified production: build/upgrade capacity_by_mode, then turn raw materials into goods."""
    spent = 0
    remaining_budget = int(player_state.budget_pools.get("factory", 0))

    capacity_by_mode = player_state.phase1_economy.capacity_by_mode
    source_remaining_for_upgrade = {
        mode: max(0, int(capacity_by_mode.get(mode, 0)))
        for mode in DEFAULT_PHASE1_CAPACITY_BY_MODE
    }

    def apply_direct_expansion(mode: str, quantity: int) -> None:
        capacity_by_mode["idle"] = max(0, int(capacity_by_mode.get("idle", 0)) - quantity)
        capacity_by_mode[mode] = int(capacity_by_mode.get(mode, 0)) + quantity
        source_remaining_for_upgrade["idle"] = max(
            0,
            int(source_remaining_for_upgrade.get("idle", 0)) - quantity,
        )
        player_state.production_capacity["idle"] = int(capacity_by_mode.get("idle", 0))
        player_state.production_capacity[mode] = int(capacity_by_mode.get(mode, 0))

    for order in phase1_production.get("buildOrders", []) or []:
        mode = str(order.get("mode") or "")
        quantity = max(0, int(order.get("quantity", 0)))
        if mode == "idle" or mode not in DEFAULT_PHASE1_CAPACITY_BY_MODE or quantity <= 0:
            continue
        if route_technology_locked_reason(player_state, mode) is not None:
            continue
        unit_cost = new_factory_unit_budget_cost(player_state, mode)
        if unit_cost <= 0:
            continue
        affordable = min(
            quantity,
            new_factory_available_quantity(player_state, mode),
            remaining_budget // unit_cost,
        )
        if affordable <= 0:
            continue
        apply_direct_expansion(mode, affordable)
        total_cost = affordable * unit_cost
        spent += total_cost
        remaining_budget -= total_cost

    for order in (upgrade_orders or []):
        route_id = str(order.get("routeId") or order.get("mode") or "")
        if not route_id:
            continue
        source_mode = str(balance.production.upgrade_source_levels.get(route_id) or "")
        target_mode = route_id
        quantity = max(0, int(order.get("quantity", 0)))
        if source_mode not in DEFAULT_PHASE1_CAPACITY_BY_MODE:
            continue
        if target_mode not in DEFAULT_PHASE1_CAPACITY_BY_MODE or target_mode == "idle":
            continue
        if route_technology_locked_reason(player_state, target_mode) is not None:
            continue
        unit_cost = upgrade_unit_budget_cost(player_state, target_mode)
        if unit_cost <= 0 or quantity <= 0:
            continue
        available_source = int(source_remaining_for_upgrade.get(source_mode, 0))
        target_room = factory_mode_remaining_capacity(player_state, target_mode)
        affordable = min(quantity, available_source, target_room, remaining_budget // unit_cost)
        if affordable <= 0:
            continue
        source_remaining_for_upgrade[source_mode] = available_source - affordable
        capacity_by_mode[source_mode] = (
            int(capacity_by_mode.get(source_mode, 0)) - affordable
        )
        capacity_by_mode[target_mode] = int(capacity_by_mode.get(target_mode, 0)) + affordable
        player_state.production_capacity[source_mode] = int(capacity_by_mode.get(source_mode, 0))
        player_state.production_capacity[target_mode] = int(capacity_by_mode.get(target_mode, 0))
        total_cost = affordable * unit_cost
        spent += total_cost
        remaining_budget -= total_cost

    for order in (new_factory_orders or []):
        route_id = str(order.get("routeId") or order.get("mode") or "")
        quantity = max(0, int(order.get("quantity", 0)))
        if route_id == "idle" or route_id not in DEFAULT_PHASE1_CAPACITY_BY_MODE or quantity <= 0:
            continue
        if route_technology_locked_reason(player_state, route_id) is not None:
            continue
        unit_cost = new_factory_unit_budget_cost(player_state, route_id)
        if unit_cost <= 0:
            continue
        affordable = min(quantity, new_factory_available_quantity(player_state, route_id), remaining_budget // unit_cost)
        if affordable <= 0:
            continue
        apply_direct_expansion(route_id, affordable)
        total_cost = affordable * unit_cost
        spent += total_cost
        remaining_budget -= total_cost

    for order in (expansion_orders or []):
        route = str(order.get("routeId") or order.get("route") or "")
        quantity = max(0, int(order.get("quantity", 0)))
        if not route or quantity <= 0:
            continue
        if route_technology_locked_reason(player_state, route) is not None:
            continue
        unit_cost = expansion_unit_budget_cost(player_state, route)
        if unit_cost <= 0:
            continue
        affordable = min(quantity, new_factory_available_quantity(player_state, route), remaining_budget // unit_cost)
        if affordable <= 0:
            continue
        apply_direct_expansion(route, affordable)
        total_cost = affordable * unit_cost
        spent += total_cost
        remaining_budget -= total_cost

    purchase_quantity = max(
        0,
        int(raw_material_purchase_quantity or phase1_production.get("rawMaterialPurchaseQuantity", 0) or 0),
    )
    purchase_unit_cost = _raw_material_purchase_unit_cost(balance)
    country_config = balance.countries.get(player_state.country.value)
    purchase_cap = int(country_config.material_purchase_cap_per_turn) if country_config is not None else 0
    affordable_purchase = (
        remaining_budget // purchase_unit_cost
        if purchase_unit_cost > 0
        else purchase_quantity
    )
    purchased_raw_materials = min(purchase_quantity, purchase_cap, affordable_purchase)
    if purchased_raw_materials > 0:
        player_state.phase1_economy.raw_materials = (
            int(player_state.phase1_economy.raw_materials) + purchased_raw_materials
        )
        purchase_spent = purchased_raw_materials * purchase_unit_cost
        spent += purchase_spent
        remaining_budget -= purchase_spent

    raw_assignments_in = phase1_production.get("rawMaterialAssignments") or {}
    available_raw = max(0, int(player_state.phase1_economy.raw_materials))
    production_unit_cost = _phase1_production_unit_budget_cost(balance)
    available_budget_units = (
        max(0, remaining_budget // production_unit_cost)
        if production_unit_cost > 0
        else available_raw
    )
    total_capacity_limit = max(
        0,
        sum(
            max(0, int(capacity_by_mode.get(mode, 0)))
            for mode, output_ratio in PRODUCTION_MODE_OUTPUT_RATIOS.items()
            if mode != "idle" and output_ratio > 0
        )
        + int(player_state.temporary_effects.get("phase1ProductionRawCapacityDelta", 0)),
    )
    raw_assignments: dict[str, int] = {}
    for mode, raw_amount in raw_assignments_in.items():
        if mode not in PRODUCTION_MODE_OUTPUT_RATIOS:
            continue
        capped = min(
            max(0, int(raw_amount)),
            int(capacity_by_mode.get(mode, 0)),
            available_raw,
            available_budget_units,
            total_capacity_limit,
        )
        if capped > 0:
            raw_assignments[mode] = capped
            available_raw -= capped
            if production_unit_cost > 0:
                available_budget_units -= capped
            total_capacity_limit -= capped

    output_decimal = calculate_production_output(raw_assignments)
    multiplier = float(player_state.temporary_effects.get("productionOutputMultiplier", 1))
    if abs(multiplier - 1.0) > 0.0001:
        output_decimal = output_decimal * Decimal(str(multiplier))
    output_bonus_percent = get_talent_effect_total(player_state, "phase1ProductionOutputBonusPercent")
    if output_bonus_percent > 0:
        output_decimal = output_decimal * Decimal(100 + output_bonus_percent) / Decimal(100)
    output_int = int(output_decimal)
    raw_used = sum(raw_assignments.values())
    production_spent = raw_used * production_unit_cost
    spent += production_spent
    remaining_budget -= production_spent

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


def _apply_factory_actions(player_state, factory_plan: dict[str, Any], balance) -> int:
    spent = 0
    selected_action_ids: set[str] = set()
    for selection in factory_plan.get("factoryActions", []) or []:
        action_id = str(selection.get("actionId") or "")
        if not action_id or action_id in selected_action_ids:
            continue
        selected_action_ids.add(action_id)
        action = balance.decision_actions.factory_actions.get(action_id)
        if action is None or action_locked_reason(player_state, action_id) is not None:
            continue
        cost = int(action.budget_pool_cost)
        if cost > int(player_state.budget_pools.get("factory", 0)):
            continue
        player_state.budget_pools["factory"] = max(0, int(player_state.budget_pools.get("factory", 0)) - cost)
        spent += cost
        _apply_decision_action_effects(player_state, action.effects)
        _apply_decision_action_ratio_delta_once(player_state, action.ratio_delta)
    return spent


def _phase1_production_unit_budget_cost(balance) -> int:
    goods = balance.production.goods.get(PHASE1_GOODS_KEY)
    if goods is None:
        return 1
    return max(0, int(goods.unit_budget_cost))


def _raw_material_purchase_unit_cost(balance) -> int:
    return max(0, int(getattr(balance.production, "raw_material_purchase_unit_cost", 1)))


def _apply_domestic_market_plan(player_state, domestic_plan: dict[str, Any], balance) -> int:
    spent = 0
    remaining_budget = int(player_state.budget_pools.get("domesticMarket", 0))
    for selection in domestic_plan.get("domesticMarketActions", []):
        action_id = str(selection.get("actionId"))
        action = balance.decision_actions.domestic_market_actions.get(action_id)
        if action is None or action_locked_reason(player_state, action_id) is not None or remaining_budget - spent < action.budget_pool_cost:
            continue
        spent += int(action.budget_pool_cost)
        _apply_decision_action_effects(player_state, action.effects)

    player_state.budget_pools["domesticMarket"] = max(0, remaining_budget - spent)
    return spent


def _resolve_government_strategy_action(balance, action_id: str):
    government_action = balance.decision_actions.government_actions.get(action_id)
    if government_action is not None:
        return government_action, False
    return None, False


def _apply_government_plan(player_state, government_plan: dict[str, Any], balance) -> int:
    """Phase-2 government plan: spend fiscal on points and strategy actions."""
    spent = 0
    available_budget = decision_phase_government_fiscal_budget(player_state)

    # Process point purchases (tech/military)
    admin_purchase_cost = int(balance.politics.administration_cost)
    admin_purchases = max(0, int(government_plan.get("adminPurchases", 0) or 0))
    if admin_purchase_cost >= 0 and admin_purchases > 0:
        affordable_admin = (
            admin_purchases
            if admin_purchase_cost == 0
            else min(admin_purchases, max(0, available_budget - spent) // admin_purchase_cost)
        )
        if affordable_admin > 0:
            spent += affordable_admin * admin_purchase_cost
            player_state.base_admin_capacity = int(player_state.base_admin_capacity) + affordable_admin
            player_state.administration_capacity = int(player_state.administration_capacity) + affordable_admin

    point_costs = POINT_PURCHASE_COSTS
    for purchase in government_plan.get("pointPurchases") or []:
        point_type = str(purchase.get("pointType", ""))
        quantity = max(0, int(purchase.get("quantity", 0)))
        if point_type not in point_costs or quantity <= 0:
            continue
        cost_per_point = point_costs[point_type]
        affordable = min(quantity, max(0, available_budget - spent) // cost_per_point)
        if affordable > 0:
            spent += affordable * cost_per_point
            if point_type == "tech":
                player_state.tech_points = int(player_state.tech_points) + affordable

    # Process strategy selections (government actions)
    for selection in government_plan.get("strategySelections") or []:
        action_id = str(selection.get("actionId") or "")
        action, _is_market_regulation = _resolve_government_strategy_action(balance, action_id)
        if action is None:
            continue
        admin_cost = 0 if action_id == RESEARCH_FACILITY_ACTION_ID else 1
        if admin_cost > 0 and int(player_state.administration_capacity) < admin_cost:
            continue
        cost = int(action.budget_pool_cost)
        if cost > 0:
            if spent + cost > available_budget:
                continue
            spent += cost
        if admin_cost > 0:
            player_state.administration_capacity = int(player_state.administration_capacity) - admin_cost

        _apply_decision_action_effects(player_state, action.effects)
        _record_government_market_policy_effect(player_state, action.effects)
        _apply_decision_action_ratio_delta_once(player_state, action.ratio_delta)

    player_state.budget_pools["governmentFiscal"] = max(
        0,
        int(player_state.budget_pools.get("governmentFiscal", 0)) - spent,
    )
    return spent


def _record_government_market_policy_effect(player_state, effects: dict[str, Any]) -> None:
    for effect_key, temporary_key in GOVERNMENT_MARKET_POLICY_EFFECT_KEYS.items():
        if effect_key not in effects:
            continue
        current_value = int(player_state.temporary_effects.get(temporary_key, 0))
        player_state.temporary_effects[temporary_key] = current_value + int(effects[effect_key])


def _apply_phase3_research_plan(player_state, payload: dict[str, Any], balance) -> None:
    target = payload.get("researchTarget")
    if not target:
        return
    tech_id = str(target)

    for chain in balance.technology.chains.values():
        order = [tech.tech_id for tech in chain.techs]
        if tech_id not in order:
            continue
        if tech_id in player_state.unlocked_techs:
            return
        index = order.index(tech_id)
        if index > 0 and order[index - 1] not in player_state.unlocked_techs:
            return
        player_state.active_research = tech_id
        return


def _apply_military_plan(
    player_state,
    military_plan: dict[str, Any],
    balance,
    snapshot=None,
) -> int:
    spent = 0
    available_budget = int(player_state.budget_pools.get("governmentFiscal", 0))
    army_current = int(player_state.army.get("army", 0))
    army_cap = int(player_state.army_cap)

    for selection in military_plan.get("militaryActions", []):
        action_id = str(selection.get("actionId") or "")
        action = balance.military_actions.military_actions.get(action_id)
        if action is None:
            continue
        budget_cost = int(action.budget_pool_cost)
        if spent + budget_cost > available_budget:
            continue
        # Army cap check for recruit actions
        if action_id == "recruit_army" and army_current >= army_cap:
            continue
        spent += budget_cost
        if action_id == "recruit_army":
            army_current += 1
        _apply_decision_action_effects(player_state, action.effects)

    if snapshot is not None:
        _apply_colonization_actions(player_state, military_plan, snapshot, balance)
        _apply_naval_deployment(player_state, military_plan, snapshot, balance)
        _apply_region_blockades(player_state, military_plan, snapshot, balance)

    player_state.budget_pools["governmentFiscal"] = max(
        0,
        int(player_state.budget_pools.get("governmentFiscal", 0)) - spent,
    )
    return spent


def _apply_colonization_actions(player_state, military_plan: dict[str, Any], snapshot, balance) -> None:
    actions = military_plan.get("colonizationActions")
    if not isinstance(actions, list) or len(actions) == 0:
        return
    regions_by_id = {region.region_id: region for region in snapshot.region_states}
    seen: set[str] = set()
    for action in actions:
        if not isinstance(action, dict):
            continue
        region_id = str(action.get("regionId") or action.get("targetRegionId") or "")
        if not region_id or region_id in seen:
            continue
        seen.add(region_id)
        region_state = regions_by_id.get(region_id)
        if region_state is None:
            continue
        can_colonize, _ = can_colonize_region(snapshot, player_state, region_state, balance)
        if not can_colonize:
            continue
        if int(player_state.army.get("army", 0)) < COLONIZATION_ARMY_COST:
            continue
        player_state.army["army"] = int(player_state.army.get("army", 0)) - COLONIZATION_ARMY_COST
        region_state.controller = player_state.country.value


def _apply_naval_deployment(player_state, military_plan: dict[str, Any], snapshot, balance) -> None:
    del balance
    deployment = military_plan.get("navalDeployment")
    if not isinstance(deployment, dict):
        return
    if len(deployment) == 0:
        return

    total_fleets = int(player_state.navy.get("fleets", 0))
    nodes_by_id = {node.node_id: node for node in snapshot.ocean_node_states}
    country_key = player_state.country.value

    sanitized: dict[str, int] = {}
    for node_id, raw_count in deployment.items():
        node_id_str = str(node_id)
        if node_id_str not in nodes_by_id:
            continue
        try:
            count = int(raw_count)
        except (TypeError, ValueError):
            return
        if count < 0 or count > total_fleets:
            return
        sanitized[node_id_str] = count

    proposed_by_node = {
        node.node_id: int(node.navy_by_country.get(country_key, 0))
        for node in snapshot.ocean_node_states
    }
    for node_id, count in sanitized.items():
        proposed_by_node[node_id] = count

    deployed_to_regions = sum(
        int(region.navy_by_country.get(country_key, 0))
        for region in snapshot.region_states
    )
    if deployed_to_regions + sum(proposed_by_node.values()) > total_fleets:
        return

    for node in snapshot.ocean_node_states:
        node.navy_by_country[country_key] = proposed_by_node.get(node.node_id, 0)


def _apply_region_blockades(player_state, military_plan: dict[str, Any], snapshot, balance) -> None:
    del balance
    deployment = military_plan.get("regionBlockades")
    if not isinstance(deployment, dict):
        return
    if len(deployment) == 0:
        return

    total_fleets = int(player_state.navy.get("fleets", 0))
    regions_by_id = {region.region_id: region for region in snapshot.region_states}
    country_key = player_state.country.value

    sanitized: dict[str, int] = {}
    for region_id, raw_count in deployment.items():
        region_id_str = str(region_id)
        if region_id_str not in regions_by_id:
            continue
        try:
            count = int(raw_count)
        except (TypeError, ValueError):
            return
        if count < 0 or count > total_fleets:
            return
        sanitized[region_id_str] = count

    proposed_by_region = {
        region.region_id: int(region.navy_by_country.get(country_key, 0))
        for region in snapshot.region_states
    }
    for region_id, count in sanitized.items():
        proposed_by_region[region_id] = count

    deployed_to_oceans = sum(
        int(node.navy_by_country.get(country_key, 0))
        for node in snapshot.ocean_node_states
    )
    if deployed_to_oceans + sum(proposed_by_region.values()) > total_fleets:
        return

    for region in snapshot.region_states:
        region.navy_by_country[country_key] = proposed_by_region.get(region.region_id, 0)


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
            player_state.ideology_levels[ideology_key] = _clamp_ideology_level(reset_value, balance)

    if "targetIdeologyDelta" in effects:
        target_ideology = str(selection.get("targetIdeology") or "")
        if target_ideology in player_state.ideology_levels:
            player_state.ideology_levels[target_ideology] = _clamp_ideology_level(
                int(player_state.ideology_levels.get(target_ideology, 0)) + int(effects["targetIdeologyDelta"]),
                balance,
            )

    free_upgrade = effects.get("freeUpgradeCapacity")
    if isinstance(free_upgrade, dict):
        source_route_id = str(free_upgrade.get("sourceRouteId") or "")
        target_route_id = str(free_upgrade.get("targetRouteId") or "")
        quantity = min(
            max(0, int(free_upgrade.get("quantity", 0))),
            max(0, int(player_state.production_capacity.get(source_route_id, 0))),
            factory_mode_remaining_capacity(player_state, target_route_id),
        )
        if quantity > 0:
            player_state.production_capacity[source_route_id] = int(player_state.production_capacity.get(source_route_id, 0)) - quantity
            player_state.phase1_economy.capacity_by_mode[source_route_id] = int(
                player_state.phase1_economy.capacity_by_mode.get(source_route_id, 0)
            ) - quantity
            player_state.production_capacity[target_route_id] = int(player_state.production_capacity.get(target_route_id, 0)) + quantity
            player_state.phase1_economy.capacity_by_mode[target_route_id] = int(
                player_state.phase1_economy.capacity_by_mode.get(target_route_id, 0)
            ) + quantity

    if effects.get("convertIdleCapacityToHandicraft"):
        idle_capacity = max(0, int(player_state.production_capacity.get("idle", 0)))
        if idle_capacity > 0:
            apply_permanent_capacity_effects(player_state, {"handicraftCapacityDelta": idle_capacity})

    _apply_decision_action_effects(player_state, effects)
    player_state.used_abilities.append(ability_id)


def _clamp_ideology_level(value: int, balance) -> int:
    return max(
        int(balance.politics.ideology_min),
        min(int(balance.politics.ideology_max), int(value)),
    )


def _apply_decision_action_effects(player_state, effects: dict[str, Any]) -> None:
    permanent_effects, transient_effects = split_permanent_capacity_effects(effects)
    apply_permanent_capacity_effects(player_state, permanent_effects)
    apply_effects(player_state, transient_effects)


def _apply_decision_action_ratio_delta_once(player_state, ratio_delta: dict[str, Any]) -> None:
    if not isinstance(ratio_delta, dict):
        return
    accumulated = dict(player_state.income_summary.get("decisionActionRatioDelta") or {})
    for raw_key, raw_delta in ratio_delta.items():
        key = _normalize_reform_ratio_key(str(raw_key))
        delta = float(raw_delta)
        player_state.income_allocation_ratio[key] = max(
            0.0,
            float(player_state.income_allocation_ratio.get(key, 0.0)) + delta,
        )
        accumulated[key] = float(accumulated.get(key, 0.0)) + delta
    player_state.income_summary["decisionActionRatioDelta"] = accumulated


_REFORM_RATIO_KEY_ALIASES = {
    "consumption": "domesticMarket",
    "fiscal": "governmentFiscal",
}


def _normalize_reform_ratio_key(key: str) -> str:
    return _REFORM_RATIO_KEY_ALIASES.get(key, key)


def _apply_reform_or_policy_effects(player_state, effects: dict[str, Any]) -> None:
    if not isinstance(effects, dict):
        return

    market_capacity_effects = {
        key: effects[key]
        for key in ("domesticMarketCapacityDelta", "overseasMarketCapacityDelta")
        if key in effects
    }
    if market_capacity_effects:
        apply_permanent_capacity_effects(player_state, market_capacity_effects)

    administration_capacity_delta = effects.get("administrationCapacityDelta")
    if administration_capacity_delta is not None:
        delta = int(administration_capacity_delta)
        player_state.base_admin_capacity = max(
            0,
            int(player_state.base_admin_capacity) + delta,
        )
        player_state.administration_capacity = max(
            0,
            int(player_state.administration_capacity) + delta,
        )

    ideology_delta = effects.get("ideologyDelta")
    if isinstance(ideology_delta, dict):
        for key, delta in ideology_delta.items():
            player_state.ideology_levels[key] = max(
                0,
                min(
                    10,
                    int(player_state.ideology_levels.get(key, 0)) + int(delta),
                ),
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
        apply_permanent_capacity_effects(player_state, {"productionCapacityDelta": capacity_delta})

    research_facility_delta = effects.get("researchFacilityDelta")
    if isinstance(research_facility_delta, dict):
        for key, delta in research_facility_delta.items():
            player_state.research_facilities[key] = max(
                0, int(player_state.research_facilities.get(key, 0)) + int(delta)
            )

    tech_points_delta = effects.get("techPointsDelta")
    if tech_points_delta is not None:
        player_state.tech_points = max(
            0, int(player_state.tech_points) + int(tech_points_delta)
        )

    army_cap_delta = effects.get("armyCapDelta")
    if army_cap_delta is not None:
        player_state.army_cap = max(
            0, int(player_state.army_cap) + int(army_cap_delta)
        )

    for discount_key in PERMANENT_FACTORY_DISCOUNT_KEYS:
        if discount_key in effects:
            current = int(player_state.permanent_effects.get(discount_key, 0))
            player_state.permanent_effects[discount_key] = current + int(effects[discount_key])

    fiscal_refund = effects.get("fiscalRefund")
    if fiscal_refund is not None:
        player_state.budget_pools["governmentFiscal"] = (
            int(player_state.budget_pools.get("governmentFiscal", 0)) + int(fiscal_refund)
        )

    cap_multiplier = effects.get("productionCapacityMultiplier")
    if cap_multiplier is not None:
        mult = float(cap_multiplier)
        for cap_key in list(player_state.production_capacity.keys()):
            player_state.production_capacity[cap_key] = max(
                0, int(int(player_state.production_capacity.get(cap_key, 0)) * mult)
            )

    mobilize = effects.get("mobilizeCapacityToMilitary")
    if isinstance(mobilize, dict):
        ratio = float(mobilize.get("ratio", 0))
        mp_per_unit = int(mobilize.get("militaryPerUnit", 1))
        total_mp = 0
        for cap_key in list(player_state.production_capacity.keys()):
            if cap_key == "idle":
                continue
            current = int(player_state.production_capacity.get(cap_key, 0))
            converted = int(current * ratio)
            player_state.production_capacity[cap_key] = current - converted
            player_state.phase1_economy.capacity_by_mode[cap_key] = max(
                0,
                int(player_state.phase1_economy.capacity_by_mode.get(cap_key, 0)) - converted,
            )
            total_mp += converted * mp_per_unit
        player_state.army["army"] = int(player_state.army.get("army", 0)) + total_mp

    suppression = effects.get("suppressIdeology")
    if isinstance(suppression, dict):
        cost = int(suppression.get("militaryCost", 0))
        delta = int(suppression.get("delta", 0))
        target = str(suppression.get("targetIdeology") or "")
        if cost > 0 and delta != 0:
            if int(player_state.army.get("army", 0)) >= cost:
                player_state.army["army"] = int(player_state.army.get("army", 0)) - cost
                if target == "all":
                    for key in list(player_state.ideology_levels.keys()):
                        player_state.ideology_levels[key] = max(
                            0, int(player_state.ideology_levels.get(key, 0)) + delta
                        )
                elif target in player_state.ideology_levels:
                    player_state.ideology_levels[target] = max(
                        0, int(player_state.ideology_levels.get(target, 0)) + delta
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


def _apply_reform_plan(player_state, payload: dict[str, Any], balance) -> tuple[list[str], list[str]]:
    enacted: list[str] = []
    errors: list[str] = []
    requested = payload.get("reforms")
    if not isinstance(requested, list):
        return enacted, errors

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
        if reform.requires_reforms:
            missing = [req for req in reform.requires_reforms if req not in player_state.completed_reforms]
            if missing:
                errors.append(f"改革「{reform.label}」需要先完成前置改革：{'、'.join(missing)}")
                continue

        player_state.base_admin_capacity = max(
            0,
            int(player_state.base_admin_capacity) - int(reform.admin_cost),
        )
        player_state.administration_capacity = max(
            0,
            int(player_state.administration_capacity) - int(reform.admin_cost),
        )
        player_state.completed_reforms.append(reform_id)
        player_state.pending_reforms.append(reform_id)
        enacted.append(reform_id)

    return enacted, errors


def _apply_policy_plan(player_state, payload: dict[str, Any], balance) -> list[str]:
    activated: list[str] = []

    deactivate_list = payload.get("deactivatePolicies")
    if isinstance(deactivate_list, list):
        for raw_id in deactivate_list:
            policy_id = str(raw_id or "")
            if policy_id in player_state.active_policies:
                player_state.active_policies.remove(policy_id)
                policy = balance.reforms.regular_policies.get(policy_id)
                if policy is not None:
                    _reverse_policy_ratio_effect(player_state, policy.effects)

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
        effective_reforms = _effective_completed_reforms(player_state)
        if policy.requires_reform is not None and policy.requires_reform not in effective_reforms:
            continue
        if _is_policy_path_blocked(player_state, balance, policy):
            continue
        suppression = policy.effects.get("suppressIdeology") if isinstance(policy.effects, dict) else None
        if isinstance(suppression, dict):
            military_cost = int(suppression.get("militaryCost", 0))
            if military_cost > int(player_state.army.get("army", 0)):
                continue
        admin_cost = int(policy.admin_cost_per_turn)
        if int(player_state.administration_capacity) < admin_cost:
            continue

        budget_cost = int(policy.budget_cost)
        if budget_cost > 0:
            pool = player_state.budget_pools.get("governmentFiscal", 0)
            if int(pool) < budget_cost:
                continue
            player_state.budget_pools["governmentFiscal"] = int(pool) - budget_cost
        player_state.administration_capacity = int(player_state.administration_capacity) - admin_cost
        player_state.active_policies.append(policy_id)
        _apply_policy_ratio_effect_once(player_state, policy.effects)
        _apply_immediate_policy_effects(player_state, policy.effects)
        activated.append(policy_id)

    return activated


def _effective_completed_reforms(player_state) -> set[str]:
    pending = set(getattr(player_state, "pending_reforms", []))
    return {
        reform_id
        for reform_id in getattr(player_state, "completed_reforms", [])
        if reform_id not in pending
    }


def _is_policy_path_blocked(player_state, balance, policy) -> bool:
    if policy.requires_reform is None:
        return False
    required_reform = balance.reforms.reforms.get(policy.requires_reform)
    if required_reform is None:
        return False
    for done_id in player_state.completed_reforms:
        done = balance.reforms.reforms.get(done_id)
        if done is None:
            continue
        if required_reform.path in done.blocks_other_paths:
            return True
    return False


def _apply_immediate_policy_effects(player_state, effects: dict[str, Any]) -> None:
    immediate_effects = {
        key: effects[key]
        for key in IMMEDIATE_POLICY_EFFECT_KEYS
        if key in effects
    }
    if not immediate_effects:
        return

    temporary_effects = {
        key: value
        for key, value in immediate_effects.items()
        if key in {"productionOutputMultiplier", "phase1ProductionRawCapacityDelta"}
    }
    if temporary_effects:
        apply_effects(player_state, temporary_effects)

    one_shot_effects = {
        key: value
        for key, value in immediate_effects.items()
        if key not in temporary_effects
    }
    if one_shot_effects:
        _apply_reform_or_policy_effects(player_state, one_shot_effects)


def _reset_round_policy_state(player_state, balance) -> None:
    for policy_id in player_state.active_policies:
        policy = balance.reforms.regular_policies.get(policy_id)
        if policy is not None:
            _reverse_policy_ratio_effect(player_state, policy.effects)
    player_state.active_policies.clear()
    player_state.administration_capacity = int(player_state.base_admin_capacity)
    player_state.controlled_regions_bonus = 0


def _apply_policy_ratio_effect_once(player_state, effects: dict[str, Any]) -> None:
    ratio_delta = effects.get("ratioDelta")
    if isinstance(ratio_delta, dict):
        _apply_reform_or_policy_effects(player_state, {"ratioDelta": ratio_delta})


def _reverse_policy_ratio_effect(player_state, effects: dict[str, Any]) -> None:
    ratio_delta = effects.get("ratioDelta")
    if not isinstance(ratio_delta, dict):
        return
    reversed_delta = {key: -float(value) for key, value in ratio_delta.items()}
    _apply_reform_or_policy_effects(player_state, {"ratioDelta": reversed_delta})
