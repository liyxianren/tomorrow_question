from __future__ import annotations

import random
from collections.abc import Callable

from app.modules.balance_config import get_balance_config
from app.modules.game_state.effects import (
    apply_effects,
    apply_permanent_capacity_effects,
    get_raw_materials_per_turn,
    reset_temporary_effects,
    split_permanent_capacity_effects,
)

from .common import RuleResolution, clone_snapshot
from .decision import _apply_reform_or_policy_effects, _reset_round_policy_state
from .phase1_economy import (
    DEFAULT_INCOME_ALLOCATION_RATIO as PHASE1_DEFAULT_RATIO,
    allocate_revenue_to_pools,
)
from .route_utils import resolve_naval_blockade


def resolve_settlement_phase(*, snapshot, turn_inputs) -> RuleResolution:
    balance = get_balance_config()
    updated_snapshot = clone_snapshot(snapshot)
    generated_logs: list[dict[str, object]] = []
    summary_lines: list[str] = []
    summary_cards: list[dict[str, object]] = []
    total_sold_by_goods: dict[str, int] = {}
    signal_values_by_player_id: dict[str, dict[str, int]] = {}

    _resolve_naval_blockade(updated_snapshot, balance)

    for player_state in updated_snapshot.player_states:
        colony_income = 0
        player_state.national_income = int(player_state.national_income) + colony_income

        reset_temporary_effects(player_state)
        policy_cleanups = _apply_active_policy_effects(player_state, balance)

        effective_income = int(player_state.national_income)
        allocation = _allocate_income_phase1(
            national_income=effective_income,
            ratio=player_state.income_allocation_ratio,
        )
        for key, value in allocation.items():
            player_state.budget_pools[key] = int(player_state.budget_pools.get(key, 0)) + int(value)
        player_state.cumulative_national_income = int(player_state.cumulative_national_income) + effective_income
        for route_key, pending in list(player_state.pending_production_capacity.items()):
            player_state.production_capacity[route_key] = int(player_state.production_capacity.get(route_key, 0)) + int(pending)
            player_state.phase1_economy.capacity_by_mode[route_key] = (
                int(player_state.phase1_economy.capacity_by_mode.get(route_key, 0)) + int(pending)
            )
            player_state.pending_production_capacity[route_key] = 0
        for goods_id, quantity in player_state.goods_allocation.items():
            total_sold_by_goods[goods_id] = int(total_sold_by_goods.get(goods_id, 0)) + int(quantity)
        signal_values_by_player_id[player_state.player_id] = _build_ideology_signals(
            player_state,
            allocation=allocation,
        )

        summary_lines.append(
            (
                f"{player_state.country.value} 财政结算完成：国内 {player_state.domestic_sales_revenue}，"
                f"海外 {player_state.overseas_sales_revenue}，国家收入 {player_state.national_income}。"
            )
        )
        summary_cards.append(
            {
                "playerId": player_state.player_id,
                "countryId": player_state.country.value,
                "nationalIncome": int(player_state.national_income),
                "colonyIncome": colony_income,
                "budgetAllocation": allocation,
                "unsoldGoodsInventory": int(player_state.phase1_economy.goods_inventory),
            }
        )
        generated_logs.append(
            {
                "gameId": updated_snapshot.game_id,
                "roundNo": updated_snapshot.round_no,
                "phase": updated_snapshot.phase,
                "kind": "settlement.resolved",
                "message": f"{player_state.country.value} completed national income allocation.",
                "details": {
                    "playerId": player_state.player_id,
                    "nationalIncome": int(player_state.national_income),
                    "colonyIncome": colony_income,
                    "cumulativeNationalIncome": int(player_state.cumulative_national_income),
                    "budgetAllocation": allocation,
                },
                "createdAt": None,
            }
        )
        _apply_ideology_progression(player_state, signal_values_by_player_id[player_state.player_id], balance)
        _apply_permanent_reform_effects(player_state, balance)
        research_summary = _apply_phase3_research_progress(player_state, updated_snapshot, balance)
        if research_summary:
            summary_lines.append(f"{player_state.country.value} {research_summary}")
        for cleanup in policy_cleanups:
            cleanup()
        # Policies are one-round decisions: they affect this settlement, then
        # the next decision workspace must start with refreshed admin points.
        _reset_round_policy_state(player_state, balance)
        _reset_decision_action_ratio_state(player_state)
        player_state.phase1_economy.income_allocation_ratio = _phase1_ratio_from_legacy(
            player_state.income_allocation_ratio
        )
        raw_materials_per_turn = get_raw_materials_per_turn(player_state, balance)
        player_state.phase1_economy.raw_materials = (
            int(player_state.phase1_economy.raw_materials)
            + raw_materials_per_turn
        )
        player_state.domestic_sales_revenue = 0
        player_state.overseas_sales_revenue = 0
        player_state.national_income = 0
        player_state.goods_allocation = {}

    for region_state in updated_snapshot.region_states:
        region_state.market_supply = {}
    updated_snapshot.looted_regions_this_turn = set()

    updated_snapshot.market_price_adjustments = _build_market_price_adjustments(
        previous_adjustments=snapshot.market_price_adjustments,
        total_sold_by_goods=total_sold_by_goods,
        balance=balance,
    )
    updated_snapshot.active_events, updated_snapshot.event_deck = _advance_active_events(
        snapshot=updated_snapshot,
        balance=balance,
        next_round=min(snapshot.round_no + 1, snapshot.max_rounds),
    )

    return RuleResolution(
        updated_snapshot=updated_snapshot,
        generated_logs=generated_logs,
        summary={
            "settledPhase": snapshot.phase.value,
            "headline": "财政结算完成，国家收入已按比例重新分配到三个预算池。",
            "summaryLines": summary_lines,
            "summaryCards": summary_cards,
        },
    )


def _is_phase1_economy_active(player_state) -> bool:
    """True when this player has produced or sold via the phase-1 economy this round.

    Note: ``capacity_by_mode`` is auto-initialized by the factory to mirror legacy
    production capacity, so it cannot be used as a switch — we look at signals that
    the new pipeline has actually written: phase-1 goods, raw materials consumed,
    or revenue recorded by the unified market.
    """
    pe = player_state.phase1_economy
    if int(pe.goods_inventory) > 0:
        return True
    if float(pe.market_metrics.get("revenue", 0) or 0) > 0:
        return True
    return False


def _allocate_income_phase1(*, national_income: int, ratio: dict[str, float] | None = None) -> dict[str, int]:
    """Split income by the player's current three-pool weights, defaulting to 3:3:4."""
    if national_income <= 0:
        return {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0}
    legacy = ratio or {}
    domestic_w = max(0.0, float(legacy.get("domesticMarket", 3.0)))
    factory_w = max(0.0, float(legacy.get("factory", 3.0)))
    gov_w = max(0.0, float(legacy.get("governmentFiscal", 4.0)))
    total_weight = domestic_w + factory_w + gov_w
    if total_weight <= 0:
        domestic = int(national_income * 0.3)
        factory = int(national_income * 0.3)
    else:
        domestic = int(national_income * (domestic_w / total_weight))
        factory = int(national_income * (factory_w / total_weight))
    government = int(national_income) - domestic - factory
    return {
        "domesticMarket": domestic,
        "factory": factory,
        "governmentFiscal": government,
    }


def _phase1_ratio_from_legacy(ratio: dict[str, float] | None) -> dict[str, float]:
    if not ratio:
        return {
            "consumption": float(PHASE1_DEFAULT_RATIO["consumption"]),
            "investment": float(PHASE1_DEFAULT_RATIO["investment"]),
            "fiscal": float(PHASE1_DEFAULT_RATIO["fiscal"]),
        }

    domestic = max(0.0, float(ratio.get("domesticMarket", 0.0)))
    factory = max(0.0, float(ratio.get("factory", 0.0)))
    government = max(0.0, float(ratio.get("governmentFiscal", 0.0)))
    total = domestic + factory + government
    if total <= 0:
        return {
            "consumption": float(PHASE1_DEFAULT_RATIO["consumption"]),
            "investment": float(PHASE1_DEFAULT_RATIO["investment"]),
            "fiscal": float(PHASE1_DEFAULT_RATIO["fiscal"]),
        }

    return {
        "consumption": domestic / total,
        "investment": factory / total,
        "fiscal": government / total,
    }


def _allocate_income(*, national_income: int, ratio: dict[str, float]) -> dict[str, int]:
    total_weight = float(sum(float(value) for value in ratio.values()) or 0.0)
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


def _build_market_price_adjustments(
    *,
    previous_adjustments: dict[str, int],
    total_sold_by_goods: dict[str, int],
    balance,
) -> dict[str, int]:
    new_adjustments: dict[str, int] = {}
    for goods_id, goods_config in balance.production.goods.items():
        if goods_id == "phase1_goods":
            continue
        sold = int(total_sold_by_goods.get(goods_id, 0))
        previous = int(previous_adjustments.get(goods_id, 0))
        min_adjustment = int(goods_config.price_floor) - int(goods_config.domestic_reference_price)
        max_adjustment = int(goods_config.price_ceiling) - int(goods_config.domestic_reference_price)
        adjustment_step = 2 if goods_config.route_id in ("mechanized", "steam", "electrified") else 1
        if sold > int(goods_config.demand_threshold):
            new_adjustments[goods_id] = max(min_adjustment, previous - adjustment_step)
        elif sold < int(goods_config.demand_threshold):
            new_adjustments[goods_id] = min(max_adjustment, previous + adjustment_step)
        else:
            new_adjustments[goods_id] = previous
    return new_adjustments


def _build_ideology_signals(player_state, *, allocation: dict[str, int]) -> dict[str, int]:
    return {
        "industryStrength": int(allocation.get("factory", 0)),
        "domesticStrength": int(player_state.domestic_sales_revenue),
        "externalBalance": int(player_state.overseas_sales_revenue)
        - int(player_state.domestic_sales_revenue),
    }


def _apply_ideology_progression(player_state, signals: dict[str, int], balance) -> None:
    for ideology_key in balance.politics.ideology_keys:
        rule = balance.politics.natural_shift_rules.get(ideology_key)
        if rule is None:
            continue
        current_level = int(player_state.ideology_levels.get(ideology_key, 0))
        signal_value = int(signals.get(rule.signal_key, 0))
        if signal_value >= int(rule.high_threshold):
            next_level = min(balance.politics.ideology_max, current_level + int(rule.high_shift))
        elif signal_value <= int(rule.low_threshold):
            next_level = max(balance.politics.ideology_min, current_level + int(rule.low_shift))
        else:
            next_level = current_level
        player_state.ideology_levels[ideology_key] = next_level
        _apply_milestone_if_needed(player_state, ideology_key, next_level, balance)


def _apply_milestone_if_needed(player_state, ideology_key: str, level: int, balance) -> None:
    milestone = balance.politics.milestones.get(ideology_key, {}).get(int(level))
    if milestone is None or milestone.label in player_state.reforms:
        return

    player_state.reforms.append(milestone.label)
    non_passive_effects = {
        key: value
        for key, value in milestone.effects.items()
        if key not in {
            "domesticMarketCapacityDelta",
            "domesticPriceBonusDelta",
            "overseasMarketCapacityDelta",
        }
    }
    if non_passive_effects:
        apply_effects(player_state, non_passive_effects)
    if milestone.penalty:
        apply_effects(player_state, milestone.penalty)


def _advance_active_events(*, snapshot, balance, next_round: int) -> tuple[list[dict[str, object]], list[str]]:
    active_events: list[dict[str, object]] = []
    for event in snapshot.active_events:
        remaining_rounds = max(0, int(event.get("remainingRounds", 0)) - 1)
        if remaining_rounds <= 0:
            continue
        next_event = dict(event)
        next_event["remainingRounds"] = remaining_rounds
        active_events.append(next_event)

    remaining_deck = list(snapshot.event_deck) if snapshot.event_deck else _build_event_deck(snapshot, balance)
    if next_round > snapshot.max_rounds:
        return active_events, remaining_deck

    event_configs_by_id = {event.event_id: event for event in balance.events.events}
    for event_id in list(remaining_deck):
        if len(active_events) >= 2:
            break
        event_config = event_configs_by_id.get(event_id)
        if event_config is None or not _event_is_eligible(event_config, snapshot, next_round):
            continue
        active_events.append(
            {
                "eventId": event_config.event_id,
                "label": event_config.label,
                "description": event_config.description,
                "effects": dict(event_config.global_effects),
                "remainingRounds": int(event_config.duration_rounds),
            }
        )
        remaining_deck.remove(event_id)
    return active_events, remaining_deck


def _build_event_deck(snapshot, balance) -> list[str]:
    events = list(balance.events.events)
    randomizer = random.Random(f"{snapshot.game_id}:{snapshot.snapshot_id}:{snapshot.round_no}")
    scored: list[tuple[float, str]] = []
    for event in events:
        weight = max(1, int(event.weight))
        score = randomizer.random() ** (1.0 / weight)
        scored.append((score, event.event_id))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [event_id for _, event_id in scored]


def _event_is_eligible(event_config, snapshot, next_round: int) -> bool:
    if not (int(event_config.round_range[0]) <= next_round <= int(event_config.round_range[1])):
        return False
    conditions = event_config.conditions
    if not conditions:
        return True

    capacity_condition = conditions.get("anyPlayerProductionCapacityAtLeast")
    if isinstance(capacity_condition, dict):
        route_id = str(capacity_condition.get("routeId") or "")
        minimum = max(0, int(capacity_condition.get("value", 0)))
        if not any(int(player.production_capacity.get(route_id, 0)) >= minimum for player in snapshot.player_states):
            return False

    controlled_region_condition = conditions.get("anyPlayerControlledRegionsAtLeast")
    if controlled_region_condition is not None:
        minimum_regions = max(0, int(controlled_region_condition))
        if not any(_controlled_region_count(snapshot, player) >= minimum_regions for player in snapshot.player_states):
            return False

    return True


def _controlled_region_count(snapshot, player_state) -> int:
    return sum(1 for region in snapshot.region_states if region.controller == player_state.country.value)


_PERMANENT_POOL_ALIASES = {
    "fiscal": "governmentFiscal",
    "consumption": "domesticMarket",
}


def _resolve_pool_key(raw_key: str) -> str:
    return _PERMANENT_POOL_ALIASES.get(raw_key, raw_key)


def _apply_permanent_effects(player_state, permanent: dict) -> None:
    tech_per_turn = permanent.get("techPointsPerTurn")
    if tech_per_turn is not None:
        player_state.tech_points = int(player_state.tech_points) + int(tech_per_turn)

    welfare_transfer = permanent.get("welfareTransfer")
    if isinstance(welfare_transfer, dict):
        from_pool = _resolve_pool_key(str(welfare_transfer.get("from") or ""))
        to_pool = _resolve_pool_key(str(welfare_transfer.get("to") or ""))
        ratio = float(welfare_transfer.get("ratio", 0.0))
        if from_pool and to_pool and ratio > 0:
            amount = int(int(player_state.budget_pools.get(from_pool, 0)) * ratio)
            if amount > 0:
                player_state.budget_pools[from_pool] = (
                    int(player_state.budget_pools.get(from_pool, 0)) - amount
                )
                player_state.budget_pools[to_pool] = (
                    int(player_state.budget_pools.get(to_pool, 0)) + amount
                )

    army_cap_delta = permanent.get("armyCapDelta")
    if army_cap_delta is not None:
        player_state.army_cap = max(
            0, int(player_state.army_cap) + int(army_cap_delta)
        )


def _apply_active_policy_effects(player_state, balance) -> list[Callable[[], None]]:
    """Apply active policy effects for this settlement.

    Capacity and cap effects are permanent by rule; other policy effects are
    applied only for this settlement or as a one-time state delta before the
    policy expires.
    """
    cleanup_callbacks: list[Callable[[], None]] = []
    for policy_id in list(player_state.active_policies):
        policy = balance.reforms.regular_policies.get(policy_id)
        if policy is None:
            continue
        permanent_effects, transient_effects = split_permanent_capacity_effects(policy.effects)
        apply_permanent_capacity_effects(player_state, permanent_effects)
        transient_effects.pop("ratioDelta", None)
        transient_effects.pop("permanent", None)
        research_facility_delta = transient_effects.pop("researchFacilityDelta", None)
        if isinstance(research_facility_delta, dict):
            cleanup_callbacks.append(_apply_temporary_research_facility_delta(player_state, research_facility_delta))
        if transient_effects:
            _apply_reform_or_policy_effects(player_state, transient_effects)
        permanent = policy.effects.get("permanent") if isinstance(policy.effects, dict) else None
        if isinstance(permanent, dict):
            _apply_permanent_effects(player_state, permanent)
    return cleanup_callbacks


def _apply_temporary_research_facility_delta(player_state, facility_delta: dict) -> Callable[[], None]:
    applied: dict[str, int] = {}
    for key, raw_delta in facility_delta.items():
        delta = int(raw_delta)
        if delta == 0:
            continue
        facility_key = str(key)
        before = int(player_state.research_facilities.get(facility_key, 0))
        after = max(0, before + delta)
        applied[facility_key] = after - before
        player_state.research_facilities[facility_key] = after

    def cleanup() -> None:
        for facility_key, delta in applied.items():
            player_state.research_facilities[facility_key] = max(
                0,
                int(player_state.research_facilities.get(facility_key, 0)) - int(delta),
            )

    return cleanup


def _reverse_policy_ratio_effect(player_state, effects: dict) -> None:
    ratio_delta = effects.get("ratioDelta")
    if not isinstance(ratio_delta, dict):
        return
    reversed_delta = {key: -float(value) for key, value in ratio_delta.items()}
    _apply_reform_or_policy_effects(player_state, {"ratioDelta": reversed_delta})


def _reset_decision_action_ratio_state(player_state) -> None:
    ratio_delta = player_state.income_summary.pop("decisionActionRatioDelta", None)
    if not isinstance(ratio_delta, dict):
        return
    reversed_delta = {key: -float(value) for key, value in ratio_delta.items()}
    _apply_reform_or_policy_effects(player_state, {"ratioDelta": reversed_delta})


def _apply_permanent_reform_effects(player_state, balance) -> None:
    for reform_id in player_state.completed_reforms:
        reform = balance.reforms.reforms.get(reform_id)
        if reform is None:
            continue
        permanent = reform.effects.get("permanent") if isinstance(reform.effects, dict) else None
        if isinstance(permanent, dict):
            _apply_permanent_effects(player_state, permanent)


def _apply_phase3_research_progress(player_state, snapshot, balance) -> str | None:
    active = player_state.active_research
    if active is None or active in player_state.unlocked_techs:
        return None

    tech_config = None
    for chain in balance.technology.chains.values():
        for tech in chain.techs:
            if tech.tech_id == active:
                tech_config = tech
                break
        if tech_config is not None:
            break
    if tech_config is None:
        return None

    facility_total = sum(int(value) for value in player_state.research_facilities.values())
    progress_per_turn = int(balance.technology.research_facility_progress_per_turn)
    new_progress = int(player_state.research_progress.get(active, 0)) + facility_total * progress_per_turn
    player_state.research_progress[active] = new_progress

    threshold = int(tech_config.threshold)
    attempts = int(player_state.breakthrough_attempts.get(active, 0))
    effective_threshold = max(1, threshold - attempts)

    if new_progress < effective_threshold:
        return f"研究「{tech_config.label}」推进 {facility_total * progress_per_turn} 点，当前 {new_progress}/{effective_threshold}，尚未触发突破检定。"

    all_unlocked = {
        tech_id
        for ps in snapshot.player_states
        for tech_id in ps.unlocked_techs
    }
    is_discovered = active in all_unlocked

    if is_discovered:
        player_state.breakthrough_attempts.pop(active, None)
        if new_progress >= threshold:
            player_state.research_progress[active] = new_progress - threshold
            player_state.unlocked_techs.append(active)
            player_state.tech_points = int(player_state.tech_points) + 1
            player_state.active_research = None
            return f"研究「{tech_config.label}」已被他国发现，本国进度达标后直接解锁。"
        return f"研究「{tech_config.label}」已触发追赶判定，但进度 {new_progress}/{threshold} 尚未达到直接解锁线。"

    roll = random.randint(1, int(balance.technology.breakthrough_die_sides))
    if roll >= effective_threshold:
        player_state.unlocked_techs.append(active)
        player_state.research_progress[active] = 0
        player_state.breakthrough_attempts.pop(active, None)
        player_state.tech_points = int(player_state.tech_points) + 1
        player_state.active_research = None
        return f"研究「{tech_config.label}」突破成功：掷骰 {roll} ≥ {effective_threshold}，科技已解锁。"
    else:
        player_state.breakthrough_attempts[active] = attempts + 1
        return f"研究「{tech_config.label}」突破失败：掷骰 {roll} < {effective_threshold}，下次突破阈值降低 1。"


def _apply_independence_progression(
    snapshot,
    balance,
    *,
    looted_regions: set[str],
) -> list[dict[str, object]]:
    del balance, looted_regions
    for region in snapshot.region_states:
        region.market_supply = {}
    return []


def _resolve_naval_blockade(snapshot, balance) -> None:
    resolve_naval_blockade(snapshot, balance)
