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
        "governmentPlan": {"pointPurchases": [], "strategySelections": []},
    }

    budget_pools = _as_mapping(workspace.get("budgetPools"))

    production_options = [
        option for option in _as_list(workspace.get("productionOptions")) if isinstance(option, dict)
    ]
    first_production = next(
        (
            option
            for option in production_options
            if str(option.get("goodsId") or "") and int(option.get("maxQuantity", 0)) > 0
        ),
        None,
    )
    if first_production is not None:
        draft["factoryPlan"]["productionOrders"].append(
            {
                "goodsId": str(first_production.get("goodsId")),
                "quantity": 1,
            }
        )

    domestic_actions = [
        action for action in _as_list(workspace.get("domesticMarketActions")) if isinstance(action, dict)
    ]
    first_domestic_action = next(
        (
            action
            for action in domestic_actions
            if str(action.get("actionId") or "")
            and int(budget_pools.get("domesticMarket", 0)) >= int(action.get("cost", 0))
        ),
        None,
    )
    if first_domestic_action is not None:
        draft["domesticMarketPlan"]["domesticMarketActions"].append(
            {"actionId": str(first_domestic_action.get("actionId"))}
        )

    government_actions = _as_mapping(workspace.get("governmentActions"))
    point_purchase_costs = _as_mapping(government_actions.get("pointPurchaseCosts"))
    government_budget = int(budget_pools.get("governmentFiscal", 0))
    tech_cost = max(1, int(point_purchase_costs.get("tech", 0) or 0))
    if government_budget >= tech_cost:
        draft["governmentPlan"]["pointPurchases"].append({"pointType": "tech", "quantity": 1})
        government_budget -= tech_cost

    strategies = [
        action for action in _as_list(government_actions.get("strategies")) if isinstance(action, dict)
    ]
    first_strategy = next(
        (
            action
            for action in strategies
            if str(action.get("actionId") or "")
            and government_budget >= int(action.get("cost", 0))
            and int(workspace.get("techPoints", 0)) + _planned_point_quantity(draft, "tech") >= int(action.get("techPointCost", 0))
            and int(workspace.get("militaryPoints", 0)) + _planned_point_quantity(draft, "military") >= int(action.get("militaryPointCost", 0))
        ),
        None,
    )
    if first_strategy is not None:
        draft["governmentPlan"]["strategySelections"].append(
            {"actionId": str(first_strategy.get("actionId"))}
        )

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
            draft["phase1Market"] = {
                "domesticAllocation": min(goods_available, demand),
                "externalAllocations": [],
            }
    return draft


def _as_mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _as_list(value: object) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _planned_point_quantity(draft: dict[str, Any], point_type: str) -> int:
    return sum(
        int(purchase.get("quantity", 0))
        for purchase in _as_list(_as_mapping(draft.get("governmentPlan")).get("pointPurchases"))
        if isinstance(purchase, dict) and str(purchase.get("pointType")) == point_type
    )
