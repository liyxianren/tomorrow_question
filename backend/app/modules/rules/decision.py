from __future__ import annotations

from typing import Any

from app.modules.balance_config import get_balance_config
from app.modules.game_state.effects import apply_effects
from app.modules.game_state.factory_economy import action_locked_reason
from app.contracts.enums import RegionAccessLevel
from app.modules.game_state.models import DEFAULT_PHASE1_CAPACITY_BY_MODE

from .common import RuleResolution, clone_snapshot, default_decision_submission_payload, index_turn_inputs
from .phase1_economy import (
    PRODUCTION_MODE_OUTPUT_RATIOS,
    calculate_production_output,
)
from .route_utils import check_route_accessible


PHASE1_GOODS_KEY = "phase1_goods"


def resolve_decision_phase(*, snapshot, turn_inputs) -> RuleResolution:
    balance = get_balance_config()
    updated_snapshot = clone_snapshot(snapshot)
    turn_inputs_by_player_id = index_turn_inputs(turn_inputs)
    generated_logs: list[dict[str, Any]] = []
    summary_lines: list[str] = []

    all_conquest_actions: list[tuple[Any, list[dict[str, Any]]]] = []

    for player_state in updated_snapshot.player_states:
        submitted = turn_inputs_by_player_id.get(player_state.player_id)
        payload = dict(submitted.payload) if submitted is not None else default_decision_submission_payload()
        domestic_before = int(player_state.budget_pools.get("domesticMarket", 0))
        factory_before = int(player_state.budget_pools.get("factory", 0))
        government_before = int(player_state.budget_pools.get("governmentFiscal", 0))

        _apply_active_event_effects(player_state, updated_snapshot.active_events)
        _apply_ability_selection(player_state, payload.get("abilitySelection"), balance)

        phase1_production = payload.get("phase1Production") or {}
        upgrade_orders = (
            payload.get("factoryPlan", {}).get("upgradeOrders", [])
            or phase1_production.get("upgradeOrders", [])
            or []
        )
        factory_spent = _apply_phase1_production_plan(player_state, phase1_production, balance, upgrade_orders)
        domestic_spent = _apply_domestic_market_plan(player_state, payload.get("domesticMarketPlan") or {}, balance)
        government_spent = _apply_government_plan(player_state, payload.get("governmentPlan") or {}, balance)
        military_plan = payload.get("militaryPlan") or {}
        military_spent = _apply_military_plan(player_state, military_plan, balance, updated_snapshot)
        conquest_actions = military_plan.get("conquestActions") or []
        if conquest_actions:
            all_conquest_actions.append((player_state, list(conquest_actions)))
        _apply_reform_plan(player_state, payload, balance)
        _apply_policy_plan(player_state, payload, balance)
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
                    "militaryPoints": player_state.military_points,
                },
                "createdAt": None,
            }
        )

    if all_conquest_actions:
        _resolve_conquest_actions(all_conquest_actions, updated_snapshot, balance)

    return RuleResolution(
        updated_snapshot=updated_snapshot,
        generated_logs=generated_logs,
        summary={
            "settledPhase": snapshot.phase.value,
            "headline": "国家决策已完成，新的预算结构和卖货库存已经准备好。",
            "summaryLines": summary_lines,
        },
    )


def _apply_phase1_production_plan(player_state, phase1_production: dict[str, Any], balance, upgrade_orders=None) -> int:
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
            required_techs = balance.technology.route_unlocks[mode]
            if not all(t in player_state.unlocked_techs for t in required_techs):
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

    for order in (upgrade_orders or []):
        route_id = str(order.get("routeId") or "")
        if not route_id:
            continue
        source_mode = str(balance.production.upgrade_source_levels.get(route_id) or "")
        target_mode = route_id
        quantity = max(0, int(order.get("quantity", 0)))
        if source_mode not in DEFAULT_PHASE1_CAPACITY_BY_MODE:
            continue
        if target_mode not in DEFAULT_PHASE1_CAPACITY_BY_MODE:
            continue
        if target_mode in balance.technology.route_unlocks:
            required_techs = balance.technology.route_unlocks[target_mode]
            if not all(t in player_state.unlocked_techs for t in required_techs):
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
    multiplier = int(player_state.temporary_effects.get("productionOutputMultiplier", 1))
    if multiplier > 1:
        output_decimal = output_decimal * multiplier
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
    """Phase-2 government plan: spend fiscal on admin capacity, points, and strategy actions."""
    spent = 0
    remaining_budget = int(player_state.budget_pools.get("governmentFiscal", 0))
    admin_cost = max(1, int(balance.politics.administration_cost))

    raw_admin_purchase = government_plan.get("adminPurchases")
    try:
        admin_quantity = max(0, int(raw_admin_purchase or 0))
    except (TypeError, ValueError):
        admin_quantity = 0
    if admin_quantity > 0:
        affordable = min(admin_quantity, (remaining_budget - spent) // admin_cost)
        if affordable > 0:
            spent += affordable * admin_cost
            player_state.administration_capacity = (
                int(player_state.administration_capacity) + affordable
            )

    # Process point purchases (tech/military)
    point_costs = {"tech": 2, "military": 10}  # budget cost per point
    for purchase in government_plan.get("pointPurchases") or []:
        point_type = str(purchase.get("pointType", ""))
        quantity = max(0, int(purchase.get("quantity", 0)))
        if point_type not in point_costs or quantity <= 0:
            continue
        cost_per_point = point_costs[point_type]
        affordable = min(quantity, (remaining_budget - spent) // cost_per_point)
        if affordable > 0:
            spent += affordable * cost_per_point
            if point_type == "tech":
                player_state.tech_points = int(player_state.tech_points) + affordable
            elif point_type == "military":
                player_state.military_points = int(player_state.military_points) + affordable

    # Process strategy selections (government actions)
    from app.modules.game_state.effects import apply_effects
    for selection in government_plan.get("strategySelections") or []:
        action_id = str(selection.get("actionId") or "")
        action = balance.decision_actions.government_actions.get(action_id)
        if action is None:
            continue
        cost = int(action.budget_pool_cost)
        if cost > 0 and spent + cost > remaining_budget:
            continue
        if cost > 0:
            spent += cost
        apply_effects(player_state, action.effects)
        for pool_key, delta in action.ratio_delta.items():
            player_state.income_allocation_ratio[pool_key] = max(
                0.0,
                float(player_state.income_allocation_ratio.get(pool_key, 0.0)) + float(delta),
            )

    player_state.budget_pools["governmentFiscal"] = max(0, remaining_budget - spent)
    return spent


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

    if snapshot is not None:
        _apply_naval_deployment(player_state, military_plan, snapshot, balance)

    for selection in military_plan.get("diplomacyActions", []):
        action_id = str(selection.get("actionId") or "")
        action = balance.military_actions.diplomacy_actions.get(action_id)
        if action is None:
            continue
        if action.target_region in player_state.established_diplomacy:
            continue
        if remaining_budget < int(action.budget_pool_cost):
            continue
        if snapshot is not None and not check_route_accessible(
            player_state.country.value, action.target_region, snapshot, balance
        ):
            continue
        remaining_budget -= int(action.budget_pool_cost)
        spent += int(action.budget_pool_cost)
        player_state.established_diplomacy.append(action.target_region)

    # ── unlockColonization ───────────────────────────────────────────────
    if military_plan.get("unlockColonization", False) and not player_state.colonization_unlocked:
        unlock_cost = int(balance.military.colonization_unlock_cost)
        if remaining_budget >= unlock_cost:
            remaining_budget -= unlock_cost
            spent += unlock_cost
            player_state.colonization_unlocked = True

    # ── colonizationActions ──────────────────────────────────────────────
    if snapshot is not None:
        _apply_colonization_actions(player_state, military_plan, snapshot, balance)

    if snapshot is not None:
        _apply_looting_actions(
            player_state,
            military_plan.get("lootingActions", []) or [],
            snapshot,
            balance,
        )

    player_state.budget_pools["governmentFiscal"] = max(0, remaining_budget)
    return spent


def _apply_colonization_actions(
    player_state,
    military_plan: dict[str, Any],
    snapshot,
    balance,
) -> None:
    """Colonize regions using military points (mp-based colonization).

    Requires: colonization_unlocked=True, diplomacy established, enough mp.
    Each colonization costs colonizationMilitaryPointCost mp.
    """
    colonization_actions = military_plan.get("colonizationActions", [])
    if not colonization_actions:
        return
    if not player_state.colonization_unlocked:
        return

    regions_by_id = {region.region_id: region for region in snapshot.region_states}
    country_key = player_state.country.value
    mp_cost = int(balance.military.colonization_military_point_cost)
    max_per_round = int(balance.military.max_colonizations_per_round)
    colonized_count = 0

    for action in colonization_actions:
        if colonized_count >= max_per_round:
            break
        region_id = str(action.get("targetRegionId") or "")
        if not region_id:
            continue

        blueprint = balance.regions.region_blueprints.get(region_id)
        if blueprint is None or not blueprint.colonizable:
            continue

        # Must have diplomacy with the region
        if region_id not in player_state.established_diplomacy:
            continue

        target_region = regions_by_id.get(region_id)
        if target_region is None:
            continue

        # Must not already be controlled by this player
        if target_region.controller == country_key:
            continue

        # Check route accessibility
        if not check_route_accessible(country_key, region_id, snapshot, balance):
            continue

        # Must have enough military points
        if player_state.military_points < mp_cost:
            continue

        player_state.military_points -= mp_cost
        target_region.controller = country_key
        target_region.access_level = RegionAccessLevel.COLONY
        colonized_count += 1


def _apply_looting_actions(
    player_state,
    looting_actions: list[dict[str, Any]],
    snapshot,
    balance,
) -> None:
    """Loot raw materials from owned colonies. One action per colony per turn.

    Each valid action transfers 1 unit from region.resource_limit into the
    player's phase1 raw_materials and marks the region as looted for the turn
    so the settlement-time independence penalty applies.
    """
    del balance
    regions_by_id = {region.region_id: region for region in snapshot.region_states}
    country_key = player_state.country.value
    looted_this_turn = snapshot.looted_regions_this_turn

    for action in looting_actions:
        region_id = str(action.get("regionId") or "")
        resource_type = str(action.get("resourceType") or "")
        if not region_id or not resource_type:
            continue
        if region_id in looted_this_turn:
            continue
        region = regions_by_id.get(region_id)
        if region is None:
            continue
        if region.controller != country_key:
            continue
        if region.access_level != RegionAccessLevel.COLONY:
            continue
        available = int(region.resource_limit.get(resource_type, 0))
        if available <= 0:
            continue
        looted_amount = min(1, available)
        region.resource_limit[resource_type] = available - looted_amount
        player_state.phase1_economy.raw_materials = (
            int(player_state.phase1_economy.raw_materials) + looted_amount
        )
        looted_this_turn.add(region_id)


def _resolve_conquest_actions(
    all_conquest_actions: list[tuple[Any, list[dict[str, Any]]]],
    snapshot,
    balance,
) -> None:
    """Resolve army-based region conquest simultaneously across all players.

    Conflict rule: per region, the qualifying attacker with the highest power wins;
    ties mean nobody wins. Army is only deducted from winners.
    """
    regions_by_id = {region.region_id: region for region in snapshot.region_states}

    # Per-player remaining army budget across this player's conquest list (cap requests by what's available).
    remaining_army_by_player: dict[str, dict[str, int]] = {}
    # region_id -> list of (player_state, infantry_used, artillery_used, attack_power)
    region_attackers: dict[str, list[tuple[Any, int, int, int]]] = {}

    for player_state, conquest_actions in all_conquest_actions:
        if player_state.player_id not in remaining_army_by_player:
            remaining_army_by_player[player_state.player_id] = {
                "infantry": int(player_state.army.get("infantry", 0)),
                "artillery": int(player_state.army.get("artillery", 0)),
            }
        seen_regions: set[str] = set()

        for action in conquest_actions:
            region_id = str(action.get("regionId") or "")
            if not region_id or region_id in seen_regions:
                continue
            seen_regions.add(region_id)

            requested_inf = max(0, int(action.get("infantry", 0)))
            requested_art = max(0, int(action.get("artillery", 0)))
            rem = remaining_army_by_player[player_state.player_id]
            inf_used = min(requested_inf, rem["infantry"])
            art_used = min(requested_art, rem["artillery"])
            attack_power = inf_used + art_used * 2
            if attack_power <= 0:
                continue

            blueprint = balance.regions.region_blueprints.get(region_id)
            if blueprint is None or not blueprint.colonizable:
                continue
            target_region = regions_by_id.get(region_id)
            if target_region is None:
                continue
            if target_region.controller == player_state.country.value:
                continue
            if not check_route_accessible(player_state.country.value, region_id, snapshot, balance):
                continue

            region_attackers.setdefault(region_id, []).append(
                (player_state, inf_used, art_used, attack_power)
            )

    for region_id, attackers in region_attackers.items():
        target_region = regions_by_id.get(region_id)
        if target_region is None:
            continue

        if target_region.controller is None:
            blueprint = balance.regions.region_blueprints.get(region_id)
            min_army = max(1, int(getattr(blueprint, "min_army", 1) or 1))
            threshold = min_army
        else:
            garrison_inf = int(target_region.garrison.get("infantry", 0))
            garrison_art = int(target_region.garrison.get("artillery", 0))
            threshold = max(1, (garrison_inf + garrison_art * 2) * 2)

        qualified = [entry for entry in attackers if entry[3] >= threshold]
        if not qualified:
            continue

        max_power = max(entry[3] for entry in qualified)
        winners = [entry for entry in qualified if entry[3] == max_power]
        if len(winners) != 1:
            continue

        winner_player, inf_used, art_used, _ = winners[0]
        winner_player.army["infantry"] = max(
            0, int(winner_player.army.get("infantry", 0)) - inf_used
        )
        winner_player.army["artillery"] = max(
            0, int(winner_player.army.get("artillery", 0)) - art_used
        )
        target_region.controller = winner_player.country.value
        target_region.garrison = {"infantry": inf_used, "artillery": art_used}


def _apply_naval_deployment(player_state, military_plan: dict[str, Any], snapshot, balance) -> None:
    del balance
    deployment = military_plan.get("navalDeployment")
    if not isinstance(deployment, dict):
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

    if sum(sanitized.values()) > total_fleets:
        return

    for node in snapshot.ocean_node_states:
        if node.node_id in sanitized:
            node.navy_by_country[country_key] = sanitized[node.node_id]
        elif country_key in node.navy_by_country:
            node.navy_by_country[country_key] = 0


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
            current = int(player_state.production_capacity.get(cap_key, 0))
            converted = int(current * ratio)
            player_state.production_capacity[cap_key] = current - converted
            total_mp += converted * mp_per_unit
        player_state.military_points = int(player_state.military_points) + total_mp

    suppression = effects.get("suppressIdeology")
    if isinstance(suppression, dict):
        cost = int(suppression.get("militaryCost", 0))
        delta = int(suppression.get("delta", 0))
        target = str(suppression.get("targetIdeology") or "")
        if cost > 0 and delta != 0:
            if int(player_state.military_points) >= cost:
                player_state.military_points = int(player_state.military_points) - cost
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


