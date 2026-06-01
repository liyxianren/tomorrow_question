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
from app.modules.game_state.budgeting import (
    decision_phase_budget_pools,
    market_regulation_allowance,
)
from app.modules.rules.route_utils import explain_route_access
from app.modules.rules.common import POINT_PURCHASE_COSTS
from app.modules.rules.colonization import (
    COLONIZATION_ARMY_COST,
    colony_raw_materials_per_turn,
    colonization_status,
)
from app.modules.rules.phase1_economy import (
    PRODUCTION_MODE_DEMAND_COEFFICIENTS,
    PRODUCTION_MODE_OUTPUT_RATIOS,
    calculate_domestic_demand,
    calculate_domestic_price,
    calculate_equilibrium_price,
    calculate_maximum_domestic_price,
    calculate_minimum_domestic_price,
)

from .factory_economy import (
    available_batches_this_round,
    action_locked_reason,
    build_region_reference_prices,
    current_route_capacity,
    domestic_reference_price,
    enabled_factory_count,
    expansion_option_max_quantity,
    factory_caps_by_mode,
    factory_total_cap,
    get_route_label,
    goods_locked_reason,
    idle_factory_capacity,
    iter_visible_route_ids,
    expansion_unit_budget_cost,
    new_factory_option_max_quantity,
    new_factory_unit_budget_cost,
    overseas_reference_price_range,
    pending_route_capacity,
    production_option_max_quantity,
    region_label,
    route_locked_reason,
    route_technology_locked_reason,
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

INCOME_RATIO_KEYS = ("domesticMarket", "factory", "governmentFiscal")
DEFAULT_INCOME_ALLOCATION_RATIO = {
    "domesticMarket": 3.0,
    "factory": 3.0,
    "governmentFiscal": 4.0,
}
INCOME_RATIO_KEY_ALIASES = {
    "consumption": "domesticMarket",
    "fiscal": "governmentFiscal",
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


def _market_competition_available_army(player: PlayerState) -> dict[str, int]:
    return {
        "infantry": max(0, int(player.army.get("infantry", 0))) + max(0, int(player.army.get("army", 0))),
        "artillery": max(0, int(player.army.get("artillery", 0))),
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
    government_market_action_ids = {"trade_promotion"}
    market_action_ids = government_market_action_ids
    # Domestic market pricing and capacity are calculated by the Phase 1 market
    # formula. Do not expose old domestic regulation actions as government
    # strategy cards; only the overseas capacity policy remains active.
    domestic_actions: list[dict[str, Any]] = []
    government_market_actions = [
        action
        for action_id, action in balance.decision_actions.government_actions.items()
        if action_id in government_market_action_ids
    ]
    research_facility_action = balance.decision_actions.government_actions.get("expand_research")
    government_workspace_actions = [
        *government_market_actions,
        *([research_facility_action] if research_facility_action is not None else []),
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
            "isMarketRegulation": action.action_id in market_action_ids,
        }
        for action in government_workspace_actions
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
        if action.action_id != "industrial_upgrade"
    ]
    income_allocation_preview = _build_income_allocation_preview(player, balance)
    return {
        "countryCode": player.country.value,
        "countryLabel": COUNTRY_LABELS.get(player.country.value, player.country.value),
        "budgetPools": decision_phase_budget_pools(player),
        "baseBudgetPools": deepcopy(player.budget_pools),
        "marketRegulationAllowance": market_regulation_allowance(player),
        "domesticMarketCapacity": resolve_domestic_market_capacity(player),
        "overseasMarketCapacity": resolve_overseas_market_capacity(player),
        "incomeAllocationRatio": deepcopy(player.income_allocation_ratio),
        **income_allocation_preview,
        "techPoints": player.tech_points,
        "armyCap": player.army_cap,
        "routeSummaries": _build_route_summaries(player),
        "productionOptions": _build_production_options(snapshot, player),
        "expansionOptions": _build_expansion_options(player),
        "upgradeOptions": _build_upgrade_options(player),
        "newFactoryOptions": _build_new_factory_options(player),
        "factoryActions": factory_actions,
        "activeEvents": deepcopy(snapshot.active_events),
        "nationalAbility": _build_national_ability(player),
        "techTree": _build_tech_tree(player, snapshot),
        "domesticMarketActions": domestic_actions,
        "governmentActions": {
            "pointPurchaseCosts": dict(POINT_PURCHASE_COSTS),
            "strategies": government_strategies,
        },
        "militaryWorkspace": _build_military_workspace(snapshot, player),
        "researchWorkspace": _build_research_workspace(snapshot, player),
        "aiGuidance": _build_ai_guidance(snapshot, player),
        "governmentReforms": {
            "administrationCapacity": int(player.administration_capacity),
            "baseAdminCapacity": int(player.base_admin_capacity),
            "adminPurchaseCost": int(balance.politics.administration_cost),
            "completedReforms": list(player.completed_reforms),
            "pendingReforms": list(player.pending_reforms),
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
                    "isPendingActivation": reform.reform_id in player.pending_reforms,
                    "isBlocked": _is_reform_blocked_for_workspace(player, reform, balance),
                    "effects": reform.effects,
                    "unlocksPolicies": list(reform.unlocks_policies),
                    "isTerminal": len(reform.blocks_other_paths) > 0,
                    "locksPaths": list(reform.blocks_other_paths),
                    "lockDescription": _format_reform_lock_description(reform),
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
                    "requiresReformLabel": _resolve_reform_label(balance, policy.requires_reform),
                    "isUnlocked": (
                        (policy.requires_reform is None or policy.requires_reform in _effective_completed_reforms(player))
                        and not _is_policy_blocked_for_workspace(player, policy, balance)
                    ),
                    "isBlocked": _is_policy_blocked_for_workspace(player, policy, balance),
                    "lockedReason": (
                        "已被最终改革锁定"
                        if _is_policy_blocked_for_workspace(player, policy, balance)
                        else "下回合解锁"
                        if policy.requires_reform in player.pending_reforms
                        else None
                    ),
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


def _resolve_reform_label(balance, reform_id: str | None) -> str | None:
    if reform_id is None:
        return None
    for reform in balance.reforms.reforms.values():
        if reform.reform_id == reform_id:
            return reform.label
    return None


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


def _is_policy_blocked_for_workspace(player: PlayerState, policy: Any, balance: Any) -> bool:
    if policy.requires_reform is None:
        return False
    required_reform = balance.reforms.reforms.get(policy.requires_reform)
    if required_reform is None:
        return False
    for done_id in player.completed_reforms:
        done = balance.reforms.reforms.get(done_id)
        if done is None:
            continue
        if required_reform.path in done.blocks_other_paths:
            return True
    return False


def _effective_completed_reforms(player: PlayerState) -> set[str]:
    pending = set(getattr(player, "pending_reforms", []))
    return {
        reform_id
        for reform_id in getattr(player, "completed_reforms", [])
        if reform_id not in pending
    }


def _format_reform_lock_description(reform: Any) -> str | None:
    if not reform.blocks_other_paths:
        return None
    locked_labels = "、".join(_reform_path_label(path) for path in reform.blocks_other_paths)
    return f"最终改革：实施后锁定{locked_labels}。"


def _reform_path_label(path: str) -> str:
    return {
        "freedom": "自由之路",
        "equality": "平等之路",
        "national": "民族之路",
    }.get(path, str(path))


def _decision_phase1_economy(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    balance = get_balance_config()
    payload: dict[str, Any] = dict(player.phase1_economy.to_payload())
    payload.update(_build_phase1_market_preview(snapshot, player))
    payload["investmentPool"] = int(player.budget_pools.get("factory", 0))
    payload["rawMaterialsPerTurn"] = (
        get_raw_materials_per_turn(player)
        + colony_raw_materials_per_turn(snapshot, player.country.value)
    )
    payload["factoryTotalCap"] = factory_total_cap(player)
    payload["factoryEnabledCount"] = enabled_factory_count(player)
    payload["idleCapacity"] = idle_factory_capacity(player)
    payload["factoryCapsByMode"] = factory_caps_by_mode(player)
    country_config = balance.countries.get(player.country.value)
    purchase_cap = int(country_config.material_purchase_cap_per_turn) if country_config is not None else 0
    unit_cost = max(0, int(balance.production.raw_material_purchase_unit_cost))
    payload["materialPurchaseCapPerTurn"] = purchase_cap
    payload["rawMaterialPurchaseUnitCost"] = unit_cost
    payload["maxRawMaterialPurchase"] = min(
        purchase_cap,
        int(player.budget_pools.get("factory", 0)) // unit_cost if unit_cost > 0 else purchase_cap,
    )
    return payload


def build_market_player_workspace(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    domestic_capacity = resolve_domestic_market_capacity(player)
    overseas_capacity = resolve_overseas_market_capacity(player)
    balance = get_balance_config()
    competition = balance.market.overseas_competition
    income_allocation_preview = _build_income_allocation_preview(
        player,
        balance,
        national_income=int(player.national_income),
    )
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
        "incomeAllocationRatio": deepcopy(player.income_allocation_ratio),
        **income_allocation_preview,
        "regionAccessStatus": _build_region_access_status(snapshot, player),
        "overseasCompetition": {
            "availableArmy": _market_competition_available_army(player),
            "rewardCapacityBonus": int(competition.reward_capacity_bonus),
            "infantryPower": int(competition.infantry_power),
            "artilleryPower": int(competition.artillery_power),
            "minimumPower": int(competition.minimum_power),
        },
        "phase1Economy": _market_phase1_economy(snapshot, player),
    }


def _market_phase1_economy(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    payload: dict[str, Any] = dict(player.phase1_economy.to_payload())
    payload.update(_build_phase1_market_preview(snapshot, player))
    payload["phase1GoodsAvailable"] = int(player.phase1_economy.goods_inventory)
    payload["factoryTotalCap"] = factory_total_cap(player)
    payload["factoryEnabledCount"] = enabled_factory_count(player)
    payload["idleCapacity"] = idle_factory_capacity(player)
    payload["factoryCapsByMode"] = factory_caps_by_mode(player)
    return payload


def build_settlement_player_workspace(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    market_income = int(player.national_income)
    colony_income = 0
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
                "demandCoefficient": float(
                    balance.production.demand_coefficients.get(
                        mode,
                        float(PRODUCTION_MODE_DEMAND_COEFFICIENTS[mode]),
                    )
                ),
                "buildCost": expansion_unit_budget_cost(player, mode),
                "upgradeCost": upgrade_unit_budget_cost(player, mode),
                "currentCapacity": int(capacity_by_mode.get(mode, 0)),
                "factoryCap": factory_total_cap(player),
                "requiredTech": required_techs,
                "isAvailable": is_available,
            }
        )
    return modes


def _build_phase1_market_preview(snapshot: GameSnapshot, player: PlayerState) -> dict[str, Any]:
    balance = get_balance_config()
    capacity_by_mode = player.phase1_economy.capacity_by_mode
    goods_inventory = int(player.phase1_economy.goods_inventory)
    domestic_price_bonus = int(get_effect_bonus(player, "domesticPriceBonus"))
    domestic_capacity_bonus = int(get_effect_bonus(player, "domesticMarketCapacityBonus"))
    overseas_capacity_bonus = int(get_effect_bonus(player, "overseasMarketCapacityBonus"))
    government_domestic_capacity_bonus = int(player.temporary_effects.get("governmentDomesticMarketCapacityBonus", 0))
    government_domestic_price_bonus = int(player.temporary_effects.get("governmentDomesticPriceBonus", 0))
    government_overseas_capacity_bonus = int(player.temporary_effects.get("governmentOverseasMarketCapacityBonus", 0))

    demand = calculate_domestic_demand(capacity_by_mode, balance.production.demand_coefficients)
    domestic_soft_cap = Decimal(max(1, int(resolve_domestic_market_capacity(player))))
    consumption_pool = Decimal(max(0, int(player.budget_pools.get("domesticMarket", 0))))
    equilibrium = calculate_equilibrium_price(
        consumption_pool=consumption_pool,
        effective_capacity=domestic_soft_cap,
    )
    minimum_domestic_price = calculate_minimum_domestic_price(equilibrium)
    maximum_domestic_price = calculate_maximum_domestic_price(equilibrium)
    base_domestic_price_preview = calculate_domestic_price(
        equilibrium_price=equilibrium,
        allocation=goods_inventory,
        effective_capacity=domestic_soft_cap,
    )
    domestic_price_preview = calculate_domestic_price(
        equilibrium_price=equilibrium,
        allocation=goods_inventory,
        effective_capacity=domestic_soft_cap,
        price_bonus=domestic_price_bonus,
    )
    domestic_price_before_floor = (
        equilibrium * (Decimal("2") - (Decimal(goods_inventory) / domestic_soft_cap))
        + Decimal(domestic_price_bonus)
    )
    shortage_rate = (
        (domestic_soft_cap - Decimal(goods_inventory)) / domestic_soft_cap
        if Decimal(goods_inventory) < domestic_soft_cap
        else Decimal("0")
    )
    surplus_rate = (
        (Decimal(goods_inventory) - domestic_soft_cap) / domestic_soft_cap
        if Decimal(goods_inventory) > domestic_soft_cap
        else Decimal("0")
    )
    return {
        "productionModes": _build_phase1_production_modes(player),
        "domesticDemand": float(demand),
        "domesticSoftCap": float(domestic_soft_cap),
        "consumptionPool": float(consumption_pool),
        "equilibriumPrice": float(equilibrium),
        "domesticBasePricePreview": float(base_domestic_price_preview),
        "domesticPriceBeforeFloor": float(domestic_price_before_floor),
        "domesticPriceBeforeCap": float(domestic_price_preview),
        "domesticPricePreview": float(domestic_price_preview),
        "domesticPriceCapReached": False,
        "marketPriceDrift": 0,
        "domesticPriceBonus": domestic_price_bonus,
        "domesticMarketCapacityBonus": domestic_capacity_bonus,
        "overseasMarketCapacityBonus": overseas_capacity_bonus,
        "governmentDomesticMarketCapacityBonus": government_domestic_capacity_bonus,
        "governmentDomesticPriceBonus": government_domestic_price_bonus,
        "governmentOverseasMarketCapacityBonus": government_overseas_capacity_bonus,
        "minimumDomesticPrice": float(minimum_domestic_price),
        "domesticPriceCeiling": float(maximum_domestic_price),
        "shortageRate": float(shortage_rate),
        "surplusRate": float(surplus_rate),
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
        locked_reason = route_technology_locked_reason(player, route_id)
        if locked_reason is not None:
            continue
        unit_cost = expansion_unit_budget_cost(player, route_id)
        max_quantity = expansion_option_max_quantity(player, route_id)
        if max_quantity <= 0 and idle_factory_capacity(player) <= 0:
            locked_reason = "工厂总上限已满"
        options.append(
            {
                "routeId": route_id,
                "routeLabel": get_route_label(route_id),
                "unitBudgetCost": int(unit_cost),
                "capacityDelta": 1,
                "maxQuantity": max_quantity,
                "lockedReason": locked_reason or (None if max_quantity > 0 else "预算不足"),
            }
        )
    return options


def _build_upgrade_options(player: PlayerState) -> list[dict[str, Any]]:
    balance = get_balance_config()
    options: list[dict[str, Any]] = []
    for target_route, source_route in balance.production.upgrade_source_levels.items():
        if current_route_capacity(player, source_route) <= 0:
            continue
        locked_reason = route_technology_locked_reason(player, target_route)
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
        locked_reason = route_technology_locked_reason(player, route_id)
        if locked_reason is not None:
            continue
        unit_cost = new_factory_unit_budget_cost(player, route_id)
        max_quantity = new_factory_option_max_quantity(player, route_id) if not locked_reason else 0
        if max_quantity <= 0 and idle_factory_capacity(player) <= 0:
            locked_reason = "工厂总上限已满"
        options.append(
            {
                "routeId": route_id,
                "routeLabel": get_route_label(route_id),
                "unitBudgetCost": int(unit_cost),
                "capacityDelta": 1,
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
    army_total = int(player.army.get("army", 0))
    colonization_options = _build_colonization_options(snapshot, player, balance)
    return {
        "army": {"army": army_total},
        "armyCap": int(player.army_cap),
        "navy": deepcopy(player.navy),
        "controlledRegions": sum(
            1 for region in snapshot.region_states if region.controller == player.country.value
        ),
        "overseasCapacity": resolve_overseas_market_capacity(player),
        "oceanControlThreshold": int(balance.military.ocean_control_threshold),
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
        "colonizationCapability": {
            "isUnlocked": True,
            "unlockCost": 0,
            "budgetCost": COLONIZATION_ARMY_COST,
            "armyCost": COLONIZATION_ARMY_COST,
            "incomePerColonyPerRound": 0,
            "maxColonizationsPerRound": len(colonization_options),
        },
        "colonizationOptions": colonization_options,
        "oceanNodes": [
            {
                "nodeId": node.node_id,
                "navyByCountry": dict(node.navy_by_country),
                "controller": node.controller,
                "isBlockaded": node.is_blockaded,
                "myFleet": int(node.navy_by_country.get(player.country.value, 0)),
                "reachableRoutes": list(node.reachable_routes),
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


def _build_ai_guidance(snapshot: GameSnapshot, player: PlayerState) -> list[dict[str, str]]:
    balance = get_balance_config()
    guidance: list[dict[str, str]] = []
    phase1 = player.phase1_economy
    remaining_rounds = max(0, int(snapshot.max_rounds) - int(snapshot.round_no))

    if remaining_rounds <= 2:
        guidance.append({
            "category": "终局",
            "title": "优先兑现收益",
            "body": "已经进入第 8-10 回合，优先选择能立刻转化为库存、销量或财政回流的动作。",
        })

    raw_materials = int(phase1.raw_materials)
    goods_inventory = int(phase1.goods_inventory)
    enabled_factories = enabled_factory_count(player)
    if raw_materials > 0 and enabled_factories > 0:
        guidance.append({
            "category": "工厂",
            "title": "先吃掉原材料",
            "body": f"当前有 {raw_materials} 原材料，优先安排投料；每投 1 原材料会占用 1 工厂预算，剩余预算再考虑升级或扩建。",
        })
    elif goods_inventory <= 0:
        guidance.append({
            "category": "工厂",
            "title": "补足本轮库存",
            "body": "当前库存偏低，先保证本轮有商品可卖，再做长期扩张。",
        })

    overseas_capacity = resolve_overseas_market_capacity(player)
    if goods_inventory > overseas_capacity:
        guidance.append({
            "category": "市场",
            "title": "先卖高价海外",
            "body": f"海外容量约 {overseas_capacity}，优先投向欧洲、美洲等高价地区，剩余库存再回国内。",
        })
    else:
        guidance.append({
            "category": "市场",
            "title": "关注容量和封锁",
            "body": "海外价格固定，真正限制收益的是海外容量、竞争额外容量和地区封锁。",
        })

    colonization_candidates = [
        option
        for option in _build_colonization_options(snapshot, player, balance)
        if option["canColonize"]
    ]
    if int(player.army.get("army", 0)) >= COLONIZATION_ARMY_COST and colonization_candidates:
        best_colony = max(colonization_candidates, key=lambda item: int(item["rawMaterialsPerTurn"]))
        guidance.append({
            "category": "军事",
            "title": f"可殖民{best_colony['regionLabel']}",
            "body": f"消耗 {COLONIZATION_ARMY_COST} 陆军，之后每回合原材料 +{best_colony['rawMaterialsPerTurn']}。",
        })
    elif colonization_candidates:
        guidance.append({
            "category": "军事",
            "title": "陆军不足以殖民",
            "body": f"殖民需要 {COLONIZATION_ARMY_COST} 陆军；若想走殖民原材料路线，先征募陆军。",
        })

    reforms = balance.reforms.reforms
    terminal_candidates = [
        reform
        for reform in reforms.values()
        if reform.blocks_other_paths and reform.reform_id not in player.completed_reforms
    ]
    affordable_terminal = [
        reform for reform in terminal_candidates if int(player.administration_capacity) >= int(reform.admin_cost)
    ]
    if affordable_terminal:
        reform = affordable_terminal[0]
        guidance.append({
            "category": "政府",
            "title": f"{reform.label}会锁定路线",
            "body": _format_reform_lock_description(reform) or "这是最终改革，实施前确认路线选择。",
        })
    else:
        useful_reform = next(
            (
                reform for reform in reforms.values()
                if reform.reform_id not in player.completed_reforms
                and (reform.effects or reform.unlocks_policies)
                and int(player.administration_capacity) >= int(reform.admin_cost)
            ),
            None,
        )
        if useful_reform is not None:
            guidance.append({
                "category": "政府",
                "title": f"可考虑{useful_reform.label}",
                "body": "优先选择有真实数值、解锁政策或路线价值的改革。",
            })

    if int(player.tech_points) > 0:
        guidance.append({
            "category": "研究",
            "title": "不要闲置科技点",
            "body": "优先研究能解锁下一档工厂或提高产销效率的科技。",
        })

    return guidance[:5]


def _build_region_access_status(snapshot: GameSnapshot, player: PlayerState) -> list[dict[str, Any]]:
    balance = get_balance_config()
    competition = balance.market.overseas_competition
    available_army = _market_competition_available_army(player)
    army_power = (
        int(available_army.get("infantry", 0)) * int(competition.infantry_power)
        + int(available_army.get("artillery", 0)) * int(competition.artillery_power)
    )
    statuses: list[dict[str, Any]] = []
    for region in snapshot.region_states:
        route_status = explain_route_access(
            player.country.value, region.region_id, snapshot, balance
        )
        route_blocked = not bool(route_status["isAccessible"])
        lock_reason = region_lock_reason(
            region.access_level,
            region_id=region.region_id,
            established_diplomacy=player.established_diplomacy,
            route_blocked=route_blocked,
        )
        if route_blocked:
            competition_lock_reason = "route_blocked"
        elif army_power < int(competition.minimum_power):
            competition_lock_reason = "no_army"
        else:
            competition_lock_reason = None
        statuses.append(
            {
                "regionId": region.region_id,
                "label": region_label(region.region_id),
                "accessLevel": region.access_level,
                "isAccessible": lock_reason is None,
                "lockReason": lock_reason,
                "requiredOceanNodes": list(route_status["requiredOceanNodes"]),
                "blockedOceanNodes": [
                    {
                        **node,
                        "label": region_label(node["nodeId"])
                        if node.get("nodeId") == region.region_id
                        else str(node.get("nodeId", "")),
                    }
                    for node in route_status["blockedOceanNodes"]
                ],
                "navyByCountry": dict(region.navy_by_country),
                "blockadeController": region.blockade_controller,
                "isBlockaded": bool(region.is_blockaded),
                "myBlockadeFleet": int(region.navy_by_country.get(player.country.value, 0)),
                "canCompete": competition_lock_reason is None,
                "competitionLockedReason": competition_lock_reason,
                "competitionRewardCapacityBonus": int(competition.reward_capacity_bonus),
                "competitionMinimumPower": int(competition.minimum_power),
                "acceptedGoods": list(region.resource_limit),
                "isColonized": region.controller is not None,
                "controller": region.controller,
                "garrison": dict(region.garrison),
                **colonization_status(snapshot, player, region, balance),
                "fixedOverseasPrice": int(
                    balance.regions.region_blueprints[region.region_id].fixed_overseas_price
                ) if region.region_id in balance.regions.region_blueprints else 1,
            }
        )
    return statuses


def _build_colonization_options(snapshot: GameSnapshot, player: PlayerState, balance: Any) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    for region in snapshot.region_states:
        status = colonization_status(snapshot, player, region, balance)
        options.append(
            {
                "regionId": region.region_id,
                "regionLabel": region_label(region.region_id),
                "controller": region.controller,
                "isColonized": region.controller is not None,
                "budgetCost": int(status["armyCost"]),
                "armyCost": int(status["armyCost"]),
                "rawMaterialsPerTurn": int(status["rawMaterialsPerTurn"]),
                "canColonize": bool(status["canColonize"]),
                "lockedReason": status["lockedReason"],
                "isColonizable": bool(status["isColonizable"]),
                "garrison": dict(region.garrison),
                "resourceLimit": dict(region.resource_limit),
            }
        )
    return options


def _preview_budget_allocation(national_income: int, ratio: dict[str, float]) -> dict[str, int]:
    total_weight = float(
        ratio.get("domesticMarket", 0.0)
        + ratio.get("factory", 0.0)
        + ratio.get("governmentFiscal", 0.0)
    )
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


def _normalize_income_ratio_key(key: str) -> str:
    return INCOME_RATIO_KEY_ALIASES.get(key, key)


def _normalized_income_ratio(ratio: dict[str, float] | None) -> dict[str, float]:
    source = ratio or {}
    return {
        key: max(0.0, float(source.get(key, DEFAULT_INCOME_ALLOCATION_RATIO[key])))
        for key in INCOME_RATIO_KEYS
    }


def _active_policy_ratio_delta(player: PlayerState, balance) -> dict[str, float]:
    delta = {key: 0.0 for key in INCOME_RATIO_KEYS}
    for policy_id in getattr(player, "active_policies", []):
        policy = balance.reforms.regular_policies.get(policy_id)
        if policy is None:
            continue
        ratio_delta = policy.effects.get("ratioDelta") if isinstance(policy.effects, dict) else None
        if not isinstance(ratio_delta, dict):
            continue
        for raw_key, raw_value in ratio_delta.items():
            key = _normalize_income_ratio_key(str(raw_key))
            if key in delta:
                delta[key] += float(raw_value)
    return delta


def _build_income_allocation_preview(
    player: PlayerState,
    balance,
    *,
    national_income: int | None = None,
) -> dict[str, Any]:
    effective = _normalized_income_ratio(player.income_allocation_ratio)
    temporary_delta = _active_policy_ratio_delta(player, balance)
    base = {
        key: max(0.0, effective[key] - temporary_delta[key])
        for key in INCOME_RATIO_KEYS
    }
    payload: dict[str, Any] = {
        "baseIncomeAllocationRatio": base,
        "effectiveIncomeAllocationRatio": effective,
        "incomeAllocationDelta": temporary_delta,
    }
    if national_income is not None:
        payload["estimatedBudgetAllocation"] = _preview_budget_allocation(national_income, effective)
    return payload


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


def _build_tech_tree(player: PlayerState, snapshot: GameSnapshot) -> dict[str, Any]:
    balance = get_balance_config()
    discovered_techs = {
        tech_id
        for player_state in snapshot.player_states
        for tech_id in player_state.unlocked_techs
    }
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
            is_discovered = tech.tech_id in discovered_techs
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
                    "isDiscovered": is_discovered,
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
    "techPointsDelta": "科技点",
    "armyCapDelta": "军事上限",
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
    "armyDelta": {"army": "陆军"},
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
