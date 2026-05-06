from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
from typing import Any

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus
from app.modules.balance_config import get_balance_config
from app.modules.game_state.market_access import (
    is_region_accessible,
    region_lock_reason,
    resolve_domestic_market_capacity,
    resolve_overseas_market_capacity,
)
from app.modules.rules.route_utils import check_route_accessible
from app.modules.rules.common import POINT_PURCHASE_COSTS
from app.modules.rules.phase1_economy import (
    PRODUCTION_MODE_DEMAND_COEFFICIENTS,
    PRODUCTION_MODE_OUTPUT_RATIOS,
    calculate_domestic_demand,
    calculate_domestic_price,
    calculate_equilibrium_price,
)

from .factory_economy import (
    available_batches_this_round,
    action_locked_reason,
    build_region_reference_prices,
    current_route_capacity,
    domestic_reference_price,
    expansion_unit_budget_cost,
    expansion_option_max_quantity,
    get_route_label,
    goods_locked_reason,
    iter_visible_route_ids,
    new_factory_unit_budget_cost,
    new_factory_option_max_quantity,
    overseas_reference_price_range,
    pending_route_capacity,
    production_option_max_quantity,
    region_label,
    route_locked_reason,
    upgrade_unit_budget_cost,
    upgrade_option_max_quantity,
)
from .effects import apply_effects, get_effect_bonus, get_raw_materials_per_turn
from .models import GameSnapshot, PlayerState


PHASE1_MODE_ORDER: tuple[str, ...] = ("idle", "handicraft", "mechanized", "steam", "electrified")
PHASE1_MODE_LABELS: dict[str, str] = {
    "idle": "闲置",
    "handicraft": "手工业",
    "mechanized": "机械化",
    "steam": "蒸汽工业",
    "electrified": "电气工业",
}


PHASE_LABELS: dict[str, str] = {
    GamePhase.DECISION.value: "国家决策",
    GamePhase.MARKET.value: "市场出售",
    GamePhase.SETTLEMENT.value: "财政结算",
}

COUNTRY_LABELS: dict[str, str] = {
    CountryCode.BRITAIN.value: "英国",
    CountryCode.FRANCE.value: "法国",
    CountryCode.PRUSSIA.value: "普鲁士",
    CountryCode.AUSTRIA.value: "奥地利",
    CountryCode.RUSSIA.value: "俄罗斯",
}

GOODS_LABELS: dict[str, str] = {
    "phase1_goods": "统一商品",
}

def hydrate_snapshot_workspaces(
    snapshot: GameSnapshot,
    *,
    previous_snapshot: GameSnapshot | None = None,
    settled_phase: GamePhase | None = None,
    auto_submitted_player_ids: list[str] | None = None,
    submission_status_by_player_id: dict[str, PlayerSubmissionStatus] | None = None,
) -> GameSnapshot:
    snapshot.phase_workspace = build_phase_workspace(
        snapshot,
        submission_status_by_player_id=submission_status_by_player_id,
    )
    snapshot.ranking_workspace = build_ranking_workspace(snapshot)
    snapshot.last_settlement_workspace = build_phase_settlement_workspace(
        snapshot,
        previous_snapshot=previous_snapshot,
        settled_phase=settled_phase,
        auto_submitted_player_ids=auto_submitted_player_ids or [],
    )
    return snapshot


def build_phase_workspace(
    snapshot: GameSnapshot,
    *,
    submission_status_by_player_id: dict[str, PlayerSubmissionStatus] | None = None,
) -> dict[str, Any]:
    if snapshot.phase == GamePhase.DECISION:
        players = {
            player.player_id: build_decision_player_workspace(snapshot, player) for player in snapshot.player_states
        }
        return {
            "phase": snapshot.phase,
            "phaseLabel": PHASE_LABELS.get(snapshot.phase.value, snapshot.phase.value),
            "submittedPlayerIds": _submitted_player_ids(submission_status_by_player_id),
            "availableActionsByPlayer": deepcopy(players),
            "players": players,
        }
    if snapshot.phase == GamePhase.MARKET:
        players = {
            player.player_id: build_market_player_workspace(snapshot, player) for player in snapshot.player_states
        }
        return {
            "phase": snapshot.phase,
            "phaseLabel": PHASE_LABELS.get(snapshot.phase.value, snapshot.phase.value),
            "submittedPlayerIds": _submitted_player_ids(submission_status_by_player_id),
            "saleOptionsByPlayer": deepcopy(players),
            "players": players,
        }

    players = {player.player_id: build_settlement_player_workspace(snapshot, player) for player in snapshot.player_states}
    return {
        "phase": snapshot.phase,
        "phaseLabel": PHASE_LABELS.get(snapshot.phase.value, snapshot.phase.value),
        "submittedPlayerIds": [],
        "settlementByPlayer": deepcopy(players),
        "players": players,
    }


def build_ranking_workspace(snapshot: GameSnapshot) -> dict[str, Any]:
    standings = deepcopy(snapshot.ranking)
    return {
        "leader": standings[0]["playerId"] if standings else None,
        "standings": standings,
    }


def build_phase_settlement_workspace(
    snapshot: GameSnapshot,
    *,
    previous_snapshot: GameSnapshot | None = None,
    settled_phase: GamePhase | None = None,
    auto_submitted_player_ids: list[str] | None = None,
) -> dict[str, Any] | None:
    if not snapshot.last_settlement_summary:
        return None

    summary = snapshot.last_settlement_summary
    return {
        "settledPhase": summary.get("settledPhase"),
        "phaseLabel": PHASE_LABELS.get(str(summary.get("settledPhase") or ""), str(summary.get("settledPhase") or "")),
        "headline": str(summary.get("headline") or "财政结算已完成。"),
        "summaryCards": list(summary.get("summaryCards") or []),
        "summaryLines": list(summary.get("summaryLines") or []),
        "autoSubmittedPlayerIds": list(auto_submitted_player_ids or []),
        "previousPhase": previous_snapshot.phase if previous_snapshot is not None else settled_phase,
    }


def build_decision_player_workspace(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    balance = get_balance_config()
    player = _player_with_active_event_preview(snapshot, player)
    domestic_actions = [
        {
            "actionId": action.action_id,
            "label": action.label,
            "cost": action.budget_pool_cost,
            "description": _build_action_description(action.description, action.effects),
            "lockedReason": action_locked_reason(player, action.action_id),
            "effects": deepcopy(action.effects),
        }
        for action in balance.decision_actions.domestic_market_actions.values()
    ]
    government_strategies = [
        {
            "actionId": action.action_id,
            "label": action.label,
            "cost": action.budget_pool_cost,
            "description": _build_action_description(action.description, action.effects),
            "lockedReason": action_locked_reason(player, action.action_id),
            "effects": deepcopy(action.effects),
            "ratioDelta": deepcopy(action.ratio_delta),
        }
        for action in balance.decision_actions.government_actions.values()
    ]
    factory_actions = [
        {
            "actionId": action.action_id,
            "label": action.label,
            "cost": action.budget_pool_cost,
            "description": _build_action_description(action.description, action.effects),
            "lockedReason": action_locked_reason(player, action.action_id),
            "effects": deepcopy(action.effects),
            "ratioDelta": deepcopy(action.ratio_delta),
        }
        for action in balance.decision_actions.factory_actions.values()
    ]
    return {
        "countryCode": player.country.value,
        "countryLabel": COUNTRY_LABELS.get(player.country.value, player.country.value),
        "budgetPools": deepcopy(player.budget_pools),
        "domesticMarketCapacity": resolve_domestic_market_capacity(player),
        "overseasMarketCapacity": resolve_overseas_market_capacity(player),
        "incomeAllocationRatio": deepcopy(player.income_allocation_ratio),
        "techPoints": player.tech_points,
        "militaryPoints": player.military_points,
        "routeSummaries": _build_route_summaries(player),
        "productionOptions": _build_production_options(snapshot, player),
        "expansionOptions": _build_expansion_options(player),
        "upgradeOptions": _build_upgrade_options(player),
        "newFactoryOptions": _build_new_factory_options(player),
        "factoryActions": factory_actions,
        "activeEvents": deepcopy(snapshot.active_events),
        "nationalAbility": _build_national_ability(player),
        "techTree": _build_tech_tree(player),
        "domesticMarketActions": domestic_actions,
        "governmentActions": {
            "pointPurchaseCosts": dict(POINT_PURCHASE_COSTS),
            "strategies": government_strategies,
        },
        "militaryWorkspace": _build_military_workspace(snapshot, player),
        "researchWorkspace": _build_research_workspace(snapshot, player),
        "governmentReforms": {
            "administrationCapacity": int(player.administration_capacity),
            "adminPurchaseCost": int(balance.politics.administration_cost),
            "completedReforms": list(player.completed_reforms),
            "activePolicies": list(player.active_policies),
            "ideologyLevels": dict(player.ideology_levels),
            "ideologyMin": int(balance.politics.ideology_min),
            "ideologyMax": int(balance.politics.ideology_max),
            "revolutionThreshold": int(balance.politics.revolution_threshold),
            "terminalReformsByIdeology": dict(balance.politics.terminal_reforms_by_ideology),
            "ideologyMilestones": {
                ideology_key: [
                    {
                        "level": int(level),
                        "label": milestone.label,
                        "effects": deepcopy(milestone.effects),
                        "penalty": deepcopy(milestone.penalty),
                    }
                    for level, milestone in sorted(milestones.items())
                ]
                for ideology_key, milestones in balance.politics.milestones.items()
            },
            "availableReforms": [
                {
                    "reformId": reform.reform_id,
                    "path": reform.path,
                    "label": reform.label,
                    "adminCost": int(reform.admin_cost),
                    "description": reform.description,
                    "isCompleted": reform.reform_id in player.completed_reforms,
                    "isBlocked": _is_reform_blocked_for_workspace(player, reform, balance),
                    "effects": reform.effects,
                    "unlocksPolicies": list(reform.unlocks_policies),
                }
                for reform in balance.reforms.reforms.values()
            ],
            "availablePolicies": [
                {
                    "policyId": policy_id,
                    "label": policy.label,
                    "adminCostPerTurn": int(policy.admin_cost_per_turn),
                    "budgetCost": int(policy.budget_cost),
                    "description": policy.description,
                    "effects": deepcopy(policy.effects),
                    "isActive": policy_id in player.active_policies,
                    "requiresReform": policy.requires_reform,
                    "isUnlocked": policy.requires_reform is None or policy.requires_reform in player.completed_reforms,
                }
                for policy_id, policy in balance.reforms.regular_policies.items()
            ],
        },
        "phase1Economy": _decision_phase1_economy(snapshot, player),
    }


def _player_with_active_event_preview(snapshot: GameSnapshot, player: PlayerState) -> PlayerState:
    if not snapshot.active_events:
        return player
    preview_player = deepcopy(player)
    for event in snapshot.active_events:
        effects = event.get("effects")
        if isinstance(effects, dict):
            apply_effects(preview_player, effects)
    return preview_player


def _is_reform_blocked_for_workspace(player: PlayerState, reform: Any, balance: Any) -> bool:
    for done_id in player.completed_reforms:
        done = balance.reforms.reforms.get(done_id)
        if done is None:
            continue
        if reform.path in done.blocks_other_paths:
            return True
        if done.path in reform.blocks_other_paths:
            return True
    return False


def _decision_phase1_economy(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    payload: dict[str, Any] = dict(player.phase1_economy.to_payload())
    payload.update(_build_phase1_market_preview(snapshot, player))
    payload["investmentPool"] = int(player.budget_pools.get("factory", 0))
    payload["rawMaterialsPerTurn"] = get_raw_materials_per_turn(player)
    return payload


def build_market_player_workspace(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    domestic_capacity = resolve_domestic_market_capacity(player)
    overseas_capacity = resolve_overseas_market_capacity(player)
    return {
        "countryCode": player.country.value,
        "countryLabel": COUNTRY_LABELS.get(player.country.value, player.country.value),
        "budgetPools": deepcopy(player.budget_pools),
        "sellableInventory": [
            {
                "goodsId": goods_id,
                "label": GOODS_LABELS.get(goods_id, goods_id),
                "quantity": quantity,
                "domesticReferencePrice": domestic_reference_price(player, goods_id, snapshot),
                "overseasReferencePrices": build_region_reference_prices(player, goods_id, snapshot.region_states, snapshot),
                "priceAdjustment": int(snapshot.market_price_adjustments.get(goods_id, 0)),
                "priceTrend": _price_trend(snapshot.market_price_adjustments.get(goods_id, 0)),
            }
            for goods_id, quantity in player.goods_stock.items()
            if int(quantity) > 0
        ],
        "domesticMarketCapacity": domestic_capacity,
        "overseasMarketCapacity": overseas_capacity,
        "regionAccessStatus": _build_region_access_status(snapshot, player),
        "phase1Economy": _market_phase1_economy(snapshot, player),
    }


def _market_phase1_economy(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    payload: dict[str, Any] = dict(player.phase1_economy.to_payload())
    payload.update(_build_phase1_market_preview(snapshot, player))
    payload["phase1GoodsAvailable"] = int(player.phase1_economy.goods_inventory)
    return payload


def build_settlement_player_workspace(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    market_income = int(player.national_income)
    colony_income = _preview_colony_income(snapshot, player)
    national_income = market_income + colony_income
    allocation = _preview_budget_allocation(national_income, player.income_allocation_ratio)
    return {
        "countryCode": player.country.value,
        "countryLabel": COUNTRY_LABELS.get(player.country.value, player.country.value),
        "domesticSalesRevenue": player.domestic_sales_revenue,
        "overseasSalesRevenue": player.overseas_sales_revenue,
        "marketIncome": market_income,
        "colonyIncome": colony_income,
        "nationalIncome": national_income,
        "budgetAllocation": allocation,
        "nextRatio": deepcopy(player.income_allocation_ratio),
        "phase1Economy": _settlement_phase1_economy(player, national_income),
    }


def _preview_colony_income(snapshot: GameSnapshot, player: PlayerState) -> int:
    balance = get_balance_config()
    income_per_colony = int(balance.military.colonization_income_per_colony_per_round)
    return sum(
        income_per_colony
        for region_state in snapshot.region_states
        if region_state.controller == player.country.value
    )


def _settlement_phase1_economy(player: PlayerState, national_income: int) -> dict[str, Any]:
    payload: dict[str, Any] = dict(player.phase1_economy.to_payload())
    allocation = _preview_budget_allocation(national_income, player.income_allocation_ratio)
    payload["poolDeltaPreview"] = {
        "consumption": float(allocation["domesticMarket"]),
        "investment": float(allocation["factory"]),
        "fiscal": float(allocation["governmentFiscal"]),
    }
    payload["consumptionPool"] = int(player.budget_pools.get("domesticMarket", 0))
    return payload


def _build_phase1_production_modes(player: PlayerState) -> list[dict[str, Any]]:
    balance = get_balance_config()
    route_unlocks = balance.technology.route_unlocks
    capacity_by_mode = player.phase1_economy.capacity_by_mode

    modes: list[dict[str, Any]] = []
    for mode in PHASE1_MODE_ORDER:
        required_techs = route_unlocks.get(mode)
        if mode == "idle":
            is_available = True
        elif int(capacity_by_mode.get(mode, 0)) > 0:
            is_available = True
        elif required_techs is None:
            is_available = True
        else:
            is_available = all(t in player.unlocked_techs for t in required_techs)
        modes.append(
            {
                "mode": mode,
                "label": PHASE1_MODE_LABELS.get(mode, mode),
                "inputRatio": 1,
                "outputRatio": int(PRODUCTION_MODE_OUTPUT_RATIOS[mode]),
                "demandCoefficient": float(PRODUCTION_MODE_DEMAND_COEFFICIENTS[mode]),
                "buildCost": new_factory_unit_budget_cost(player, mode),
                "upgradeCost": upgrade_unit_budget_cost(player, mode),
                "currentCapacity": int(capacity_by_mode.get(mode, 0)),
                "requiredTech": required_techs,
                "isAvailable": is_available,
            }
        )
    return modes


def _build_phase1_market_preview(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    balance = get_balance_config()
    capacity_by_mode = player.phase1_economy.capacity_by_mode
    goods_inventory = int(player.phase1_economy.goods_inventory)
    consumption_pool = int(player.budget_pools.get("domesticMarket", 0))
    goods_config = balance.production.goods.get("phase1_goods")
    domestic_price_ceiling = int(goods_config.price_ceiling) if goods_config is not None else 8
    overseas_price_ceiling = int(goods_config.overseas_price_ceiling) if goods_config is not None else 24
    domestic_price_bonus = int(get_effect_bonus(player, "domesticPriceBonus"))
    overseas_price_bonus = int(get_effect_bonus(player, "overseasPriceBonus"))

    demand = calculate_domestic_demand(capacity_by_mode)
    equilibrium = calculate_equilibrium_price(consumption_pool=consumption_pool, demand=demand)
    price_drift = int(getattr(snapshot, "market_price_adjustments", {}).get("phase1_goods", 0))
    if price_drift:
        equilibrium = max(Decimal("1"), equilibrium + Decimal(str(price_drift)))
    base_domestic_price_preview = calculate_domestic_price(
        equilibrium_price=equilibrium,
        supply=goods_inventory,
        demand=demand,
        maximum_price=domestic_price_ceiling,
    )
    domestic_price_before_cap = max(
        Decimal("1"),
        base_domestic_price_preview + Decimal(domestic_price_bonus),
    )
    domestic_price_preview = min(
        Decimal(domestic_price_ceiling),
        domestic_price_before_cap,
    )
    return {
        "productionModes": _build_phase1_production_modes(player),
        "domesticDemand": float(demand),
        "equilibriumPrice": float(equilibrium),
        "domesticBasePricePreview": float(base_domestic_price_preview),
        "domesticPriceBeforeCap": float(domestic_price_before_cap),
        "domesticPricePreview": float(domestic_price_preview),
        "domesticPriceCapReached": domestic_price_before_cap > Decimal(domestic_price_ceiling),
        "marketPriceDrift": price_drift,
        "domesticPriceBonus": domestic_price_bonus,
        "overseasPriceBonus": overseas_price_bonus,
        "domesticPriceCeiling": domestic_price_ceiling,
        "overseasPriceCeiling": overseas_price_ceiling,
    }


def _build_route_summaries(player: PlayerState) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for route_id in iter_visible_route_ids(player):
        summaries.append(
            {
                "routeId": route_id,
                "routeLabel": get_route_label(route_id),
                "currentCapacity": current_route_capacity(player, route_id),
                "pendingCapacity": pending_route_capacity(player, route_id),
                "availableBatchesThisRound": available_batches_this_round(player, route_id),
            }
        )
    return summaries


def _build_production_options(snapshot: GameSnapshot, player: PlayerState) -> list[dict[str, Any]]:
    balance = get_balance_config()
    options: list[dict[str, Any]] = []
    for goods_id, goods in balance.production.goods.items():
        locked_reason = goods_locked_reason(player, goods.route_id, goods_id)
        overseas_min, overseas_max = overseas_reference_price_range(player, goods_id, snapshot)
        options.append(
            {
                "goodsId": goods_id,
                "label": goods.label,
                "routeId": goods.route_id,
                "routeLabel": get_route_label(goods.route_id),
                "unitBudgetCost": goods.unit_budget_cost,
                "unitOutput": goods.unit_output,
                "outputMultiplier": int(balance.production.output_multipliers.get(goods.route_id, 1)),
                "domesticReferencePrice": domestic_reference_price(player, goods_id, snapshot),
                "overseasReferencePriceMin": overseas_min,
                "overseasReferencePriceMax": overseas_max,
                "priceAdjustment": int(snapshot.market_price_adjustments.get(goods_id, 0)),
                "priceTrend": _price_trend(snapshot.market_price_adjustments.get(goods_id, 0)),
                "maxQuantity": production_option_max_quantity(player, goods_id),
                "lockedReason": locked_reason,
                "usageHint": goods.usage_hint,
            }
        )
    return options


def _build_expansion_options(player: PlayerState) -> list[dict[str, Any]]:
    balance = get_balance_config()
    options: list[dict[str, Any]] = []
    for route_id in balance.production.expansion_costs:
        if current_route_capacity(player, route_id) <= 0:
            continue
        unit_cost = expansion_unit_budget_cost(player, route_id)
        max_quantity = expansion_option_max_quantity(player, route_id)
        options.append(
            {
                "routeId": route_id,
                "routeLabel": get_route_label(route_id),
                "unitBudgetCost": unit_cost,
                "capacityDelta": 1,
                "maxQuantity": max_quantity,
                "lockedReason": None if max_quantity > 0 else "预算不足",
            }
        )
    return options


def _build_upgrade_options(player: PlayerState) -> list[dict[str, Any]]:
    balance = get_balance_config()
    options: list[dict[str, Any]] = []
    for target_route, source_route in balance.production.upgrade_source_levels.items():
        if current_route_capacity(player, source_route) <= 0:
            continue
        locked_reason = route_locked_reason(player, target_route)
        if locked_reason is not None:
            continue
        max_quantity = upgrade_option_max_quantity(player, target_route)
        options.append(
            {
                "routeId": target_route,
                "routeLabel": get_route_label(target_route),
                "sourceRouteId": source_route,
                "sourceRouteLabel": get_route_label(source_route),
                "unitBudgetCost": upgrade_unit_budget_cost(player, target_route),
                "capacityDelta": 1,
                "maxQuantity": max_quantity,
                "lockedReason": locked_reason or (None if max_quantity > 0 else "预算不足"),
            }
        )
    return options


def _build_new_factory_options(player: PlayerState) -> list[dict[str, Any]]:
    balance = get_balance_config()
    options: list[dict[str, Any]] = []
    for route_id in balance.production.new_factory_costs:
        locked_reason = route_locked_reason(player, route_id) if route_id != "handicraft" else None
        if locked_reason is not None:
            continue
        unit_cost = new_factory_unit_budget_cost(player, route_id)
        max_quantity = new_factory_option_max_quantity(player, route_id) if not locked_reason else 0
        options.append(
            {
                "routeId": route_id,
                "routeLabel": get_route_label(route_id),
                "unitBudgetCost": int(unit_cost),
                "capacityDelta": 2,
                "maxQuantity": max_quantity,
                "lockedReason": locked_reason or (None if max_quantity > 0 else "预算不足"),
            }
        )
    return options


def _submitted_player_ids(
    submission_status_by_player_id: dict[str, PlayerSubmissionStatus] | None,
) -> list[str]:
    if submission_status_by_player_id is None:
        return []
    return [
        player_id
        for player_id, status in submission_status_by_player_id.items()
        if status != PlayerSubmissionStatus.PENDING
    ]


def _build_military_workspace(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    balance = get_balance_config()
    return {
        "militaryPoints": int(player.military_points),
        "army": deepcopy(player.army),
        "navy": deepcopy(player.navy),
        "controlledRegions": int(player.controlled_regions_bonus),
        "establishedDiplomacy": list(player.established_diplomacy),
        "overseasCapacity": resolve_overseas_market_capacity(player),
        "oceanControlThreshold": int(balance.military.ocean_control_threshold),
        "regionAccessStatus": _build_region_access_status(snapshot, player),
        "availableMilitaryActions": [
            {
                "actionId": action.action_id,
                "label": action.label,
                "cost": action.military_point_cost,
                "maxPerRound": action.max_per_round,
                "description": _build_action_description(action.description, action.effects),
                "effects": deepcopy(action.effects),
            }
            for action in balance.military_actions.military_actions.values()
        ],
        "availableDiplomacyActions": [
            {
                "actionId": action.action_id,
                "label": action.label,
                "cost": action.budget_pool_cost,
                "targetRegion": action.target_region,
                "targetRegionLabel": region_label(action.target_region),
                "description": action.description,
                "isEstablished": action.target_region in player.established_diplomacy,
            }
            for action in balance.military_actions.diplomacy_actions.values()
            if check_route_accessible(player.country.value, action.target_region, snapshot, balance)
        ],
        "colonizationCapability": {
            "isUnlocked": bool(player.colonization_unlocked),
            "unlockCost": int(balance.military.colonization_unlock_cost),
            "militaryPointCost": int(balance.military.colonization_military_point_cost),
            "incomePerColonyPerRound": int(balance.military.colonization_income_per_colony_per_round),
            "maxColonizationsPerRound": int(balance.military.max_colonizations_per_round),
        },
        "colonizationOptions": _build_colonization_options(snapshot, player),
        "oceanNodes": [
            {
                "nodeId": node.node_id,
                "navyByCountry": dict(node.navy_by_country),
                "controller": node.controller,
                "isBlockaded": node.is_blockaded,
                "myFleet": int(node.navy_by_country.get(player.country.value, 0)),
            }
            for node in snapshot.ocean_node_states
        ],
    }


def _build_research_workspace(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    balance = get_balance_config()
    talent_tree = balance.research_actions.talent_tree

    talent_branches = []
    for branch_id, branch_config in talent_tree.branches.items():
        nodes = []
        for node_id in branch_config.unlock_order:
            node = talent_tree.nodes.get(node_id)
            if node is None:
                continue
            node_index = list(branch_config.unlock_order).index(node_id)
            is_unlocked = node_id in player.unlocked_talents
            can_unlock = (
                not is_unlocked
                and player.tech_points >= node.tech_point_cost
                and (node_index == 0 or branch_config.unlock_order[node_index - 1] in player.unlocked_talents)
            )
            nodes.append({
                "nodeId": node_id,
                "label": node.label,
                "techPointCost": node.tech_point_cost,
                "description": _build_action_description(node.description, node.permanent_effects),
                "permanentEffects": deepcopy(node.permanent_effects),
                "isUnlocked": is_unlocked,
                "canUnlock": can_unlock,
            })
        talent_branches.append({
            "branchId": branch_id,
            "label": branch_config.label,
            "nodes": nodes,
        })

    return {
        "techPoints": int(player.tech_points),
        "talentBranches": talent_branches,
        "unlockedTalentCount": len(player.unlocked_talents),
    }


def _build_region_access_status(snapshot: GameSnapshot, player: PlayerState) -> list[dict[str, Any]]:
    balance = get_balance_config()
    statuses: list[dict[str, Any]] = []
    for region in snapshot.region_states:
        route_blocked = not check_route_accessible(
            player.country.value, region.region_id, snapshot, balance
        )
        lock_reason = region_lock_reason(
            region.access_level,
            region_id=region.region_id,
            established_diplomacy=player.established_diplomacy,
            route_blocked=route_blocked,
        )
        statuses.append(
            {
                "regionId": region.region_id,
                "label": region_label(region.region_id),
                "accessLevel": region.access_level,
                "isAccessible": lock_reason is None,
                "lockReason": lock_reason,
                "isDiplomacyEstablished": region.region_id in player.established_diplomacy,
                "acceptedGoods": list(region.resource_limit),
                "isColonized": region.controller is not None,
                "controller": region.controller,
                "priceMultiplier": float(
                    balance.regions.region_blueprints[region.region_id].price_multiplier
                ) if region.region_id in balance.regions.region_blueprints else 1.0,
            }
        )
    return statuses


def _build_colonization_options(snapshot: GameSnapshot, player: PlayerState) -> list[dict[str, Any]]:
    balance = get_balance_config()
    military_point_cost = int(balance.military.colonization_military_point_cost)
    options = []
    for region in snapshot.region_states:
        blueprint = balance.regions.region_blueprints.get(region.region_id)
        if blueprint is None or not blueprint.colonizable:
            continue
        already_colonized = region.controller is not None
        is_unlocked = bool(player.colonization_unlocked)
        has_diplomacy = region.region_id in player.established_diplomacy
        has_military = player.military_points >= military_point_cost
        options.append({
            "regionId": region.region_id,
            "regionLabel": region_label(region.region_id),
            "controller": region.controller,
            "isColonized": already_colonized,
            "militaryPointCost": military_point_cost,
            "canColonize": not already_colonized and is_unlocked and has_diplomacy and has_military,
            "independence": int(region.independence),
            "garrison": dict(region.garrison),
            "resourceLimit": dict(blueprint.resource_limit),
            "lockedReason": (
                "已被殖民" if already_colonized
                else "需先永久解锁殖民扩张" if not is_unlocked
                else "需先建交" if not has_diplomacy
                else f"需要{military_point_cost}军事点" if not has_military
                else None
            ),
        })
    return options


def _preview_budget_allocation(national_income: int, ratio: dict[str, float]) -> dict[str, int]:
    total_weight = float(sum(ratio.values()) or 0)
    if national_income <= 0 or total_weight <= 0:
        return {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0}

    domestic = int(national_income * (float(ratio.get("domesticMarket", 0.0)) / total_weight))
    factory = int(national_income * (float(ratio.get("factory", 0.0)) / total_weight))
    government = int(national_income) - domestic - factory
    return {
        "domesticMarket": domestic,
        "factory": factory,
        "governmentFiscal": government,
    }


def _build_national_ability(player: PlayerState) -> dict[str, Any] | None:
    ability = get_balance_config().abilities.national_abilities.get(player.country.value)
    if ability is None:
        return None
    return {
        "abilityId": ability.ability_id,
        "label": ability.label,
        "description": ability.description,
        "requiresTargetIdeology": ability.requires_target_ideology,
        "isAvailable": ability.ability_id not in player.used_abilities,
    }


def _build_tech_tree(player: PlayerState) -> dict[str, Any]:
    balance = get_balance_config()
    route_unlocks_by_tech: dict[str, list[str]] = {}
    for route_id, required_techs in balance.technology.route_unlocks.items():
        for tech_id in required_techs:
            route_unlocks_by_tech.setdefault(tech_id, []).append(route_id)

    chains_payload: list[dict[str, Any]] = []
    for chain_id, chain in balance.technology.chains.items():
        techs_payload: list[dict[str, Any]] = []
        for index, tech in enumerate(chain.techs):
            attempts = int(player.breakthrough_attempts.get(tech.tech_id, 0))
            effective_threshold = max(1, int(tech.threshold) - attempts)
            is_unlocked = tech.tech_id in player.unlocked_techs
            is_active = player.active_research == tech.tech_id
            prereq_met = index == 0 or chain.techs[index - 1].tech_id in player.unlocked_techs
            techs_payload.append(
                {
                    "techId": tech.tech_id,
                    "label": tech.label,
                    "threshold": int(tech.threshold),
                    "progress": int(player.research_progress.get(tech.tech_id, 0)),
                    "effectiveThreshold": effective_threshold,
                    "isUnlocked": is_unlocked,
                    "isActive": is_active,
                    "canResearch": (not is_unlocked) and prereq_met,
                    "isDiscovered": is_unlocked,
                    "breakthroughAttempts": attempts,
                    "unlocksRoutes": route_unlocks_by_tech.get(tech.tech_id, []),
                }
            )
        chains_payload.append(
            {
                "chainId": chain_id,
                "label": chain.label,
                "techs": techs_payload,
            }
        )
    return {
        "chains": chains_payload,
        "researchFacilities": int(sum(player.research_facilities.values())),
        "facilityCost": int(balance.technology.research_facility_cost),
        "progressPerFacility": int(balance.technology.research_facility_progress_per_turn),
        "breakthroughDieSides": int(balance.technology.breakthrough_die_sides),
        "activeResearch": player.active_research,
    }


def _price_trend(adjustment: int | None) -> str:
    normalized = int(adjustment or 0)
    if normalized > 0:
        return "up"
    if normalized < 0:
        return "down"
    return "flat"


_EFFECT_LABELS: dict[str, str] = {
    "handicraftCapacityDelta": "手工业产能",
    "domesticMarketCapacityDelta": "国内容量",
    "domesticPriceBonusDelta": "国内价格",
    "overseasMarketCapacityDelta": "海外容量",
    "overseasPriceBonusDelta": "海外价格",
    "techPointsDelta": "科技点",
    "militaryPointsDelta": "军事点",
    "controlledRegionsDelta": "控制区域",
    "factoryBudgetDelta": "工厂预算",
    "governmentFiscalBudgetDelta": "政府预算",
    "domesticMarketBudgetDelta": "国内预算",
    "rawMaterialsDelta": "原材料",
    "phase1ProductionRawCapacityDelta": "本回合投料上限",
    "productionOutputMultiplier": "产出倍率",
}

_NESTED_EFFECT_LABELS: dict[str, dict[str, str]] = {
    "navyDelta": {"fleets": "舰队"},
    "armyDelta": {"infantry": "步兵", "artillery": "炮兵"},
}


def _build_action_description(base_description: str, effects: dict[str, Any]) -> str:
    parts: list[str] = []
    for key, value in effects.items():
        if isinstance(value, (int, float)):
            label = _EFFECT_LABELS.get(key)
            if label:
                sign = "+" if value > 0 else ""
                parts.append(f"{label} {sign}{int(value)}")
        elif isinstance(value, dict):
            nested_labels = _NESTED_EFFECT_LABELS.get(key, {})
            for sub_key, sub_value in value.items():
                sub_label = nested_labels.get(sub_key)
                if sub_label and isinstance(sub_value, (int, float)):
                    sign = "+" if sub_value > 0 else ""
                    parts.append(f"{sub_label} {sign}{int(sub_value)}")
    if not parts:
        return base_description
    return f"{base_description} 效果：{'，'.join(parts)}。"
