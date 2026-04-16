from __future__ import annotations

import random

from app.modules.balance_config import get_balance_config
from app.modules.game_state.effects import apply_effects, get_effect_bonus, reset_temporary_effects

from .common import RuleResolution, clone_snapshot


def resolve_settlement_phase(*, snapshot, turn_inputs) -> RuleResolution:
    balance = get_balance_config()
    updated_snapshot = clone_snapshot(snapshot)
    generated_logs: list[dict[str, object]] = []
    summary_lines: list[str] = []
    summary_cards: list[dict[str, object]] = []
    total_sold_by_goods: dict[str, int] = {}
    signal_values_by_player_id: dict[str, dict[str, int]] = {}

    base_income = int(balance.global_config.base_income_per_round)

    for player_state in updated_snapshot.player_states:
        colony_income = 0
        for region_state in updated_snapshot.region_states:
            if region_state.controller == player_state.country.value:
                colony_income += int(balance.military.colonization_income_per_colony_per_round)

        player_state.national_income = int(player_state.national_income) + colony_income

        effective_income = max(base_income, int(player_state.national_income))
        allocation = _allocate_income(
            national_income=effective_income,
            ratio=player_state.income_allocation_ratio,
        )
        for key, value in allocation.items():
            player_state.budget_pools[key] = int(player_state.budget_pools.get(key, 0)) + int(value)
        player_state.cumulative_national_income = int(player_state.cumulative_national_income) + effective_income
        for route_key, pending in list(player_state.pending_production_capacity.items()):
            player_state.production_capacity[route_key] = int(player_state.production_capacity.get(route_key, 0)) + int(pending)
            player_state.pending_production_capacity[route_key] = 0
        for goods_id, quantity in player_state.goods_allocation.items():
            total_sold_by_goods[goods_id] = int(total_sold_by_goods.get(goods_id, 0)) + int(quantity)
        signal_values_by_player_id[player_state.player_id] = _build_ideology_signals(player_state)

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
        reset_temporary_effects(player_state)
        _apply_ideology_progression(player_state, signal_values_by_player_id[player_state.player_id], balance)
        player_state.domestic_sales_revenue = 0
        player_state.overseas_sales_revenue = 0
        player_state.national_income = 0
        player_state.goods_allocation = {}

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


def _build_ideology_signals(player_state) -> dict[str, int]:
    return {
        "industryStrength": int(player_state.budget_pools.get("factory", 0))
        + sum(int(value) for value in player_state.production_capacity.values() if str(value) is not None),
        "domesticStrength": int(player_state.budget_pools.get("domesticMarket", 0))
        + get_effect_bonus(player_state, "domesticPriceBonus"),
        "externalBalance": int(player_state.overseas_sales_revenue)
        - int(player_state.domestic_sales_revenue)
        + int(player_state.military_points),
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
            "overseasPriceBonusDelta",
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
    controlled = sum(1 for region in snapshot.region_states if region.controller == player_state.country.value)
    return controlled + int(player_state.controlled_regions_bonus)
