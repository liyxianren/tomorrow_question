from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus
from app.modules.balance_config import get_balance_config
from app.modules.game_state.market_access import (
    is_region_accessible,
    resolve_domestic_market_capacity,
    resolve_overseas_market_capacity,
)

from .factory_economy import (
    available_batches_this_round,
    action_locked_reason,
    build_region_reference_prices,
    current_route_capacity,
    domestic_reference_price,
    expansion_option_max_quantity,
    get_route_label,
    goods_locked_reason,
    is_tech_researchable,
    iter_visible_route_ids,
    new_factory_option_max_quantity,
    overseas_reference_price_range,
    pending_route_capacity,
    production_option_max_quantity,
    region_label,
    route_locked_reason,
    upgrade_option_max_quantity,
)
from .models import GameSnapshot, PlayerState


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
    "coal": "煤炭",
    "steel": "钢铁",
    "grain": "粮食",
    "cotton": "棉花",
    "oil": "石油",
    "rubber": "橡胶",
    "minerals": "矿产",
    "tea": "茶叶",
    "silk": "丝绸",
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
    government_actions = [
        {
            "actionId": action.action_id,
            "label": action.label,
            "cost": action.budget_pool_cost,
            "techPointCost": action.tech_point_cost,
            "militaryPointCost": action.military_point_cost,
            "techPointDelta": int(action.effects.get("techPointsDelta", 0)),
            "militaryPointDelta": int(action.effects.get("militaryPointsDelta", 0)),
            "ratioDelta": deepcopy(action.ratio_delta),
            "description": _build_action_description(action.description, action.effects),
            "lockedReason": action_locked_reason(player, action.action_id),
            "effects": deepcopy(action.effects),
        }
        for action in balance.decision_actions.government_actions.values()
    ]
    return {
        "countryCode": player.country.value,
        "countryLabel": COUNTRY_LABELS.get(player.country.value, player.country.value),
        "budgetPools": deepcopy(player.budget_pools),
        "incomeAllocationRatio": deepcopy(player.income_allocation_ratio),
        "techPoints": player.tech_points,
        "militaryPoints": player.military_points,
        "routeSummaries": _build_route_summaries(player),
        "productionOptions": _build_production_options(snapshot, player),
        "expansionOptions": _build_expansion_options(player),
        "upgradeOptions": _build_upgrade_options(player),
        "newFactoryOptions": _build_new_factory_options(player),
        "activeEvents": deepcopy(snapshot.active_events),
        "nationalAbility": _build_national_ability(player),
        "techTree": _build_tech_tree(player),
        "domesticMarketActions": domestic_actions,
        "governmentActions": {
            "pointPurchaseCosts": {
                "tech": max(1, balance.technology.facility_cost // 5),
                "military": max(1, balance.military.army_unit_cost),
            },
            "strategies": government_actions,
        },
        "militaryWorkspace": _build_military_workspace(snapshot, player),
        "researchWorkspace": _build_research_workspace(snapshot, player),
    }


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
    }


def build_settlement_player_workspace(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    allocation = _preview_budget_allocation(player.national_income, player.income_allocation_ratio)
    return {
        "countryCode": player.country.value,
        "countryLabel": COUNTRY_LABELS.get(player.country.value, player.country.value),
        "domesticSalesRevenue": player.domestic_sales_revenue,
        "overseasSalesRevenue": player.overseas_sales_revenue,
        "nationalIncome": player.national_income,
        "budgetAllocation": allocation,
        "nextRatio": deepcopy(player.income_allocation_ratio),
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
    for route_id, unit_cost in balance.production.expansion_costs.items():
        if current_route_capacity(player, route_id) <= 0:
            continue
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
        max_quantity = upgrade_option_max_quantity(player, target_route)
        locked_reason = route_locked_reason(player, target_route)
        options.append(
            {
                "routeId": target_route,
                "routeLabel": get_route_label(target_route),
                "sourceRouteId": source_route,
                "sourceRouteLabel": get_route_label(source_route),
                "unitBudgetCost": int(balance.production.upgrade_costs[target_route]),
                "capacityDelta": 1,
                "maxQuantity": max_quantity,
                "lockedReason": locked_reason or (None if max_quantity > 0 else "预算不足"),
            }
        )
    return options


def _build_new_factory_options(player: PlayerState) -> list[dict[str, Any]]:
    balance = get_balance_config()
    options: list[dict[str, Any]] = []
    for route_id, unit_cost in balance.production.new_factory_costs.items():
        locked_reason = route_locked_reason(player, route_id) if route_id != "handicraft" else None
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
        "regionAccessStatus": _build_region_access_status(snapshot, player),
        "availableMilitaryActions": [
            {
                "actionId": action.action_id,
                "label": action.label,
                "cost": action.budget_pool_cost,
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
        ],
        "colonizationCapability": {
            "isUnlocked": bool(player.colonization_unlocked),
            "unlockCost": int(balance.military.colonization_unlock_cost),
            "militaryPointCost": int(balance.military.colonization_military_point_cost),
            "incomePerColonyPerRound": int(balance.military.colonization_income_per_colony_per_round),
            "maxColonizationsPerRound": int(balance.military.max_colonizations_per_round),
        },
        "colonizationOptions": _build_colonization_options(snapshot, player),
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
    return [
        {
            "regionId": region.region_id,
            "label": region_label(region.region_id),
            "accessLevel": region.access_level,
            "isAccessible": is_region_accessible(
                region.access_level,
                player.military_points,
                region_id=region.region_id,
                established_diplomacy=player.established_diplomacy,
            ),
            "isDiplomacyEstablished": region.region_id in player.established_diplomacy,
            "acceptedGoods": list(region.resource_limit),
            "isColonized": region.controller is not None,
            "controller": region.controller,
        }
        for region in snapshot.region_states
    ]


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


def _build_tech_tree(player: PlayerState) -> list[dict[str, Any]]:
    tech_tree = []
    for tech_id, tech in get_balance_config().technology.tech_tree.items():
        tech_tree.append(
            {
                "techId": tech_id,
                "label": tech.label,
                "budgetPool": tech.budget_pool,
                "budgetCost": tech.budget_cost,
                "prerequisites": list(tech.prerequisites),
                "isUnlocked": tech_id in player.unlocked_techs,
                "canResearch": is_tech_researchable(player, tech_id),
                "unlocksGoods": list(tech.unlocks_goods),
                "unlocksActions": list(tech.unlocks_actions),
                "unlocksRoutes": list(tech.unlocks_routes),
            }
        )
    return tech_tree


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
