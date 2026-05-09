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
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {"adminPurchases": 0, "pointPurchases": [], "strategySelections": []},
    }

    budget_pools = _as_mapping(workspace.get("budgetPools"))
    base_budget_pools = _as_mapping(workspace.get("baseBudgetPools"))
    market_allowance = max(0, int(workspace.get("marketRegulationAllowance", 0) or 0))
    government_budget = int(
        base_budget_pools.get(
            "governmentFiscal",
            max(0, int(budget_pools.get("governmentFiscal", 0)) - market_allowance),
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
            and government_budget + market_allowance >= int(action.get("cost", 0))
        ),
        None,
    )
    if first_market_strategy is not None:
        draft["governmentPlan"]["strategySelections"].append(
            {"actionId": str(first_market_strategy.get("actionId"))}
        )
        strategy_cost = int(first_market_strategy.get("cost", 0))
        government_budget -= max(0, strategy_cost - market_allowance)
        market_allowance = max(0, market_allowance - strategy_cost)

    research_target = _find_research_target(workspace)
    if research_target:
        draft["researchTarget"] = research_target

    gov_reforms = _as_mapping(workspace.get("governmentReforms"))
    admin_cost = max(1, int(gov_reforms.get("adminPurchaseCost", 0) or 0))
    if government_budget >= admin_cost:
        draft["governmentPlan"]["adminPurchases"] = government_budget // admin_cost

    phase1_economy = _as_mapping(workspace.get("phase1Economy"))
    if phase1_economy:
        production_modes = [
            mode for mode in _as_list(phase1_economy.get("productionModes")) if isinstance(mode, dict)
        ]
        chosen_mode = next(
            (
                mode
                for mode in production_modes
                if str(mode.get("mode") or "") != "idle"
                and bool(mode.get("isAvailable"))
                and int(mode.get("currentCapacity", 0)) > 0
            ),
            None,
        )
        if chosen_mode is not None:
            draft["phase1Production"] = {
                "rawMaterialAssignments": {str(chosen_mode.get("mode")): 1}
            }
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
