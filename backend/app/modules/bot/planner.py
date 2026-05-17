from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.contracts.enums import GamePhase

from .models import BotPlanningContext


def plan_bot_payload(context: BotPlanningContext) -> dict[str, Any]:
    phase = context.snapshot.phase
    workspace = context.player_workspace

    if phase == GamePhase.DECISION:
        return _plan_decision(workspace)
    if phase == GamePhase.MARKET:
        return _plan_market(workspace)
    return {}


def _plan_decision(workspace: Mapping[str, Any]) -> dict[str, Any]:
    draft = {
        "factoryPlan": {
            "productionOrders": [],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
            "factoryActions": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {"adminPurchases": 0, "pointPurchases": [], "strategySelections": []},
    }

    budget_pools = _as_mapping(workspace.get("budgetPools"))
    factory_budget = int(budget_pools.get("factory", 0) or 0)
    government_budget = int(
        budget_pools.get(
            "governmentFiscal",
            max(0, int(budget_pools.get("governmentFiscal", 0))),
        )
    )
    government_actions = _as_mapping(workspace.get("governmentActions"))
    government_strategies = [
        action for action in _as_list(government_actions.get("strategies")) if isinstance(action, dict)
    ]
    first_market_strategy = next(
        (
            action
            for action in government_strategies
            if str(action.get("actionId") or "")
            and str(action.get("actionId")) != "expand_research"
            and government_budget >= int(action.get("cost", 0))
        ),
        None,
    )
    if first_market_strategy is not None:
        draft["governmentPlan"]["strategySelections"].append(
            {"actionId": str(first_market_strategy.get("actionId"))}
        )
        strategy_cost = int(first_market_strategy.get("cost", 0))
        government_budget -= strategy_cost

    research_target = _find_research_target(workspace)
    if research_target:
        draft["researchTarget"] = research_target

    factory_budget = _select_factory_construction(draft, workspace, factory_budget)

    phase1_economy = _as_mapping(workspace.get("phase1Economy"))
    if phase1_economy:
        effective_capacity_by_mode = _phase1_capacity_after_selected_construction(
            draft,
            workspace,
            phase1_economy,
        )
        production_unit_cost = _phase1_production_unit_budget_cost(workspace)
        can_afford_production = production_unit_cost <= 0 or factory_budget >= production_unit_cost
        production_modes = [
            mode for mode in _as_list(phase1_economy.get("productionModes")) if isinstance(mode, dict)
        ]
        chosen_mode = next(
            (
                mode
                for mode in production_modes
                if str(mode.get("mode") or "") != "idle"
                and bool(mode.get("isAvailable"))
                and int(effective_capacity_by_mode.get(str(mode.get("mode") or ""), 0)) > 0
            ),
            None,
        )
        if chosen_mode is not None and can_afford_production:
            draft["phase1Production"] = {"rawMaterialAssignments": {str(chosen_mode.get("mode")): 1}}
    return draft


def _plan_market(workspace: Mapping[str, Any]) -> dict[str, Any]:
    draft: dict[str, Any] = {"saleOrders": []}
    inventory = [item for item in _as_list(workspace.get("sellableInventory")) if isinstance(item, dict)]
    remaining_domestic_capacity = int(workspace.get("domesticMarketCapacity", 0))
    remaining_overseas_capacity = int(workspace.get("overseasMarketCapacity", 0))

    for item in inventory:
        goods_id = str(item.get("goodsId") or "")
        remaining_quantity = max(0, int(item.get("quantity", 0)))
        if not goods_id or remaining_quantity <= 0:
            continue
        if remaining_domestic_capacity > 0:
            domestic_quantity = min(remaining_quantity, remaining_domestic_capacity)
            draft["saleOrders"].append(
                {"goodsId": goods_id, "market": "domestic", "quantity": domestic_quantity}
            )
            remaining_quantity -= domestic_quantity
            remaining_domestic_capacity -= domestic_quantity
        overseas_reference_prices = [
            candidate
            for candidate in _as_list(item.get("overseasReferencePrices"))
            if isinstance(candidate, dict) and str(candidate.get("regionId") or "")
        ]
        first_overseas = overseas_reference_prices[0] if overseas_reference_prices else None
        if remaining_quantity > 0 and first_overseas is not None and remaining_overseas_capacity > 0:
            overseas_quantity = min(remaining_quantity, remaining_overseas_capacity)
            draft["saleOrders"].append(
                {
                    "goodsId": goods_id,
                    "market": "overseas",
                    "regionId": str(first_overseas.get("regionId") or ""),
                    "quantity": overseas_quantity,
                }
            )
            remaining_overseas_capacity -= overseas_quantity

    phase1_economy = _as_mapping(workspace.get("phase1Economy"))
    if phase1_economy:
        goods_available = int(
            phase1_economy.get("goodsInventory")
            or phase1_economy.get("phase1GoodsAvailable")
            or 0
        )
        if goods_available > 0:
            demand = int(phase1_economy.get("domesticDemand", 0) or 0)
            domestic_allocation = min(goods_available, demand)
            external_allocations: list[dict[str, Any]] = []
            competition_deployments: list[dict[str, Any]] = []
            remaining_quantity = max(0, goods_available - domestic_allocation)
            remaining_overseas_capacity = int(workspace.get("overseasMarketCapacity", 0) or 0)
            region_statuses = [
                region for region in _as_list(workspace.get("regionAccessStatus")) if isinstance(region, dict)
            ]
            for region in region_statuses:
                if remaining_quantity <= 0 or remaining_overseas_capacity <= 0:
                    break
                if not bool(region.get("isAccessible")):
                    continue
                region_id = str(region.get("regionId") or "")
                if not region_id:
                    continue
                quantity = min(remaining_quantity, remaining_overseas_capacity)
                external_allocations.append({"marketId": region_id, "quantity": quantity})
                remaining_quantity -= quantity
                remaining_overseas_capacity -= quantity

            competition = _as_mapping(workspace.get("overseasCompetition"))
            available_army = _as_mapping(competition.get("availableArmy"))
            available_infantry = int(available_army.get("infantry", 0) or 0)
            available_artillery = int(available_army.get("artillery", 0) or 0)
            if remaining_quantity > 0 and (available_infantry > 0 or available_artillery > 0):
                target_region = next(
                    (
                        region
                        for region in region_statuses
                        if bool(region.get("canCompete")) and str(region.get("regionId") or "")
                    ),
                    None,
                )
                if target_region is not None:
                    region_id = str(target_region.get("regionId") or "")
                    infantry = 1 if available_infantry > 0 else 0
                    artillery = 0 if infantry > 0 else 1
                    competition_deployments.append(
                        {"marketId": region_id, "infantry": infantry, "artillery": artillery}
                    )
                    reward_capacity = int(
                        target_region.get(
                            "competitionRewardCapacityBonus",
                            competition.get("rewardCapacityBonus", 0),
                        )
                        or 0
                    )
                    reward_quantity = min(remaining_quantity, max(0, reward_capacity))
                    if reward_quantity > 0:
                        existing = next(
                            (item for item in external_allocations if item["marketId"] == region_id),
                            None,
                        )
                        if existing is not None:
                            existing["quantity"] = int(existing["quantity"]) + reward_quantity
                        else:
                            external_allocations.append({"marketId": region_id, "quantity": reward_quantity})
            draft["phase1Market"] = {
                "domesticAllocation": domestic_allocation,
                "externalAllocations": external_allocations,
                "externalCompetitionDeployments": competition_deployments,
            }
    return draft


def _as_mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _as_list(value: object) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _find_research_target(workspace: Mapping[str, Any]) -> str | None:
    """Find the first unresearched technology in the first available chain."""
    tech_tree = _as_mapping(workspace.get("techTree"))
    chains = _as_list(tech_tree.get("chains"))
    for chain in chains:
        if not isinstance(chain, dict):
            continue
        techs = _as_list(chain.get("techs"))
        for tech in techs:
            if not isinstance(tech, dict):
                continue
            if not bool(tech.get("isUnlocked")):
                return str(tech.get("techId") or "")
    return None


def _select_factory_construction(
    draft: dict[str, Any],
    workspace: Mapping[str, Any],
    factory_budget: int,
) -> int:
    construction_fields = (
        ("upgradeOptions", "upgradeOrders"),
        ("expansionOptions", "expansionOrders"),
        ("newFactoryOptions", "newFactoryOrders"),
    )
    for option_key, order_key in construction_fields:
        options = [option for option in _as_list(workspace.get(option_key)) if isinstance(option, dict)]
        for option in options:
            if option.get("lockedReason") is not None:
                continue
            route_id = str(option.get("routeId") or "")
            unit_cost = int(option.get("unitBudgetCost", 0) or 0)
            max_quantity = int(option.get("maxQuantity", 0) or 0)
            if not route_id or unit_cost <= 0 or max_quantity <= 0 or factory_budget < unit_cost:
                continue
            draft["factoryPlan"][order_key].append({"routeId": route_id, "quantity": 1})
            return factory_budget - unit_cost
    return factory_budget


def _phase1_production_unit_budget_cost(workspace: Mapping[str, Any]) -> int:
    production_options = [
        option for option in _as_list(workspace.get("productionOptions")) if isinstance(option, dict)
    ]
    phase1_goods = next(
        (option for option in production_options if str(option.get("goodsId") or "") == "phase1_goods"),
        None,
    )
    if phase1_goods is not None:
        return max(0, int(phase1_goods.get("unitBudgetCost", 1) or 0))
    first_option = production_options[0] if production_options else None
    if first_option is not None:
        return max(0, int(first_option.get("unitBudgetCost", 1) or 0))
    return 1


def _phase1_capacity_after_selected_construction(
    draft: dict[str, Any],
    workspace: Mapping[str, Any],
    phase1_economy: Mapping[str, Any],
) -> dict[str, int]:
    capacity_by_mode: dict[str, int] = {}
    for mode in _as_list(phase1_economy.get("productionModes")):
        if not isinstance(mode, dict):
            continue
        mode_id = str(mode.get("mode") or "")
        if not mode_id:
            continue
        capacity_by_mode[mode_id] = max(0, int(mode.get("currentCapacity", 0) or 0))

    upgrade_options_by_route = {
        str(option.get("routeId") or ""): option
        for option in _as_list(workspace.get("upgradeOptions"))
        if isinstance(option, dict) and str(option.get("routeId") or "")
    }
    for order in draft.get("factoryPlan", {}).get("upgradeOrders", []):
        if not isinstance(order, dict):
            continue
        option = upgrade_options_by_route.get(str(order.get("routeId") or ""))
        if option is None:
            continue
        source_route = str(option.get("sourceRouteId") or "")
        target_route = str(option.get("routeId") or "")
        quantity = max(0, int(order.get("quantity", 0) or 0))
        if not source_route or not target_route or quantity <= 0:
            continue
        capacity_delta = quantity * max(1, int(option.get("capacityDelta", 1) or 1))
        source_capacity = max(0, int(capacity_by_mode.get(source_route, 0)))
        moved_capacity = min(source_capacity, capacity_delta)
        if moved_capacity <= 0:
            continue
        capacity_by_mode[source_route] = source_capacity - moved_capacity
        capacity_by_mode[target_route] = max(0, int(capacity_by_mode.get(target_route, 0))) + moved_capacity
    return capacity_by_mode
