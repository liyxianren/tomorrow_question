from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.modules.balance_config import get_balance_config
from app.modules.game_state.market_access import (
    is_region_accessible,
    resolve_domestic_market_capacity,
    resolve_overseas_market_capacity,
)
from app.modules.game_state.effects import get_effect_bonus

from .common import RuleResolution, clone_snapshot, default_market_submission_payload, index_turn_inputs
from .phase1_economy import (
    calculate_domestic_demand,
    calculate_domestic_price,
    calculate_equilibrium_price,
)
from .route_utils import check_route_accessible


def resolve_market_phase(*, snapshot, turn_inputs) -> RuleResolution:
    balance = get_balance_config()
    updated_snapshot = clone_snapshot(snapshot)
    turn_inputs_by_player_id = index_turn_inputs(turn_inputs)
    generated_logs: list[dict[str, object]] = []
    summary_lines: list[str] = []

    region_states_by_id = {region.region_id: region for region in updated_snapshot.region_states}
    competition_rewards_by_player = _resolve_external_market_competitions(
        snapshot=updated_snapshot,
        turn_inputs_by_player_id=turn_inputs_by_player_id,
        balance=balance,
    )

    for player_state in updated_snapshot.player_states:
        submitted = turn_inputs_by_player_id.get(player_state.player_id)
        payload = dict(submitted.payload) if submitted is not None else default_market_submission_payload()

        phase1_market = payload.get("phase1Market") or {}
        domestic_revenue, overseas_revenue = _apply_phase1_market(
            player_state,
            phase1_market,
            region_states_by_id=region_states_by_id,
            snapshot=updated_snapshot,
            competition_rewards_by_region=competition_rewards_by_player.get(player_state.player_id, {}),
        )
        summary_lines.append(
            f"{player_state.country.value} 本回合国内销售额 {domestic_revenue}，海外销售额 {overseas_revenue}，国家收入 {player_state.national_income}。"
        )
        generated_logs.append(
            {
                "gameId": updated_snapshot.game_id,
                "roundNo": updated_snapshot.round_no,
                "phase": updated_snapshot.phase,
                "kind": "market.resolved",
                "message": f"{player_state.country.value} resolved market sales.",
                "details": {
                    "playerId": player_state.player_id,
                    "domesticSalesRevenue": domestic_revenue,
                    "overseasSalesRevenue": overseas_revenue,
                    "nationalIncome": player_state.national_income,
                },
                "createdAt": None,
            }
        )

    return RuleResolution(
        updated_snapshot=updated_snapshot,
        generated_logs=generated_logs,
        summary={
            "settledPhase": snapshot.phase.value,
            "headline": "市场出售完成，国家收入已经形成，等待财政结算分账。",
            "summaryLines": summary_lines,
        },
    )


PHASE1_GOODS_KEY = "phase1_goods"


def _available_market_competition_army(player_state) -> dict[str, int]:
    return {
        "infantry": max(0, int(player_state.army.get("infantry", 0))) + max(0, int(player_state.army.get("army", 0))),
        "artillery": max(0, int(player_state.army.get("artillery", 0))),
    }


def _spend_market_infantry(player_state, amount: int) -> None:
    remaining = max(0, int(amount))
    infantry_pool = max(0, int(player_state.army.get("infantry", 0)))
    from_infantry = min(infantry_pool, remaining)
    if from_infantry > 0:
        player_state.army["infantry"] = infantry_pool - from_infantry
        remaining -= from_infantry
    if remaining > 0:
        generic_pool = max(0, int(player_state.army.get("army", 0)))
        player_state.army["army"] = max(0, generic_pool - remaining)


def _apply_phase1_market(
    player_state,
    phase1_market: dict[str, object],
    *,
    region_states_by_id: dict[str, object],
    snapshot,
    competition_rewards_by_region: dict[str, dict[str, int]] | None = None,
) -> tuple[int, int]:
    """Phase-1 unified market: one good, supply-demand pricing, optional external markets at the same price."""
    balance = get_balance_config()
    capacity_by_mode = player_state.phase1_economy.capacity_by_mode
    demand = calculate_domestic_demand(capacity_by_mode)
    available_inventory = int(player_state.phase1_economy.goods_inventory)
    original_inventory = available_inventory
    supply = Decimal(original_inventory)

    equilibrium_price = calculate_equilibrium_price(demand=demand)
    goods_config = balance.production.goods.get(PHASE1_GOODS_KEY)
    domestic_price_ceiling = int(goods_config.price_ceiling) if goods_config is not None else 8
    overseas_price_ceiling = int(goods_config.overseas_price_ceiling) if goods_config is not None else 24
    domestic_price_bonus = Decimal(int(get_effect_bonus(player_state, "domesticPriceBonus")))
    overseas_price_bonus = int(get_effect_bonus(player_state, "overseasPriceBonus"))
    # Apply cross-round price drift from settlement adjustments.
    price_drift = int(getattr(snapshot, "market_price_adjustments", {}).get("phase1_goods", 0))
    if price_drift:
        equilibrium_price = max(Decimal("1"), equilibrium_price + Decimal(str(price_drift)))
    domestic_request = max(0, int(phase1_market.get("domesticAllocation", 0) or 0))
    domestic_capacity = max(0, int(resolve_domestic_market_capacity(player_state)))
    sold_domestic_d = min(
        Decimal(domestic_request),
        Decimal(available_inventory),
        demand,
        Decimal(domestic_capacity),
    )
    price_supply = sold_domestic_d if domestic_request > 0 else supply
    base_final_price = calculate_domestic_price(
        equilibrium_price=equilibrium_price,
        supply=price_supply,
        demand=demand,
        minimum_price=1,
        maximum_price=domestic_price_ceiling,
    )
    final_price = min(Decimal(domestic_price_ceiling), max(Decimal("1"), base_final_price + domestic_price_bonus))
    sold_domestic = int(sold_domestic_d)
    available_inventory -= sold_domestic
    domestic_revenue_d = sold_domestic_d * final_price
    domestic_revenue = int(domestic_revenue_d)

    overseas_revenue = 0
    sold_overseas = 0
    overseas_capacity = max(0, int(resolve_overseas_market_capacity(player_state)))
    rewards_by_region = competition_rewards_by_region or {}
    competition_capacity_remaining = {
        region_id: max(0, int(reward.get("capacityBonus", 0)))
        for region_id, reward in rewards_by_region.items()
    }
    competition_price_bonus_by_region = {
        region_id: max(0, int(reward.get("priceBonus", 0)))
        for region_id, reward in rewards_by_region.items()
    }
    for alloc in phase1_market.get("externalAllocations", []) or []:
        if available_inventory <= 0:
            break
        if not isinstance(alloc, dict):
            continue
        region_id = str(alloc.get("marketId") or "")
        quantity = max(0, int(alloc.get("quantity", 0) or 0))
        if quantity <= 0 or not region_id:
            continue
        region_state = region_states_by_id.get(region_id)
        if region_state is None or not is_region_accessible(
            region_state.access_level,
            region_id=region_id,
            established_diplomacy=player_state.established_diplomacy,
        ):
            continue
        if not check_route_accessible(
            player_state.country.value, region_id, snapshot, balance
        ):
            continue
        reward_capacity = max(0, int(competition_capacity_remaining.get(region_id, 0)))
        if overseas_capacity <= 0 and reward_capacity <= 0:
            continue
        reward_sold = min(quantity, available_inventory, reward_capacity)
        shared_sold = min(
            max(0, quantity - reward_sold),
            max(0, available_inventory - reward_sold),
            overseas_capacity,
        )
        sold = reward_sold + shared_sold
        if sold <= 0:
            continue
        region_blueprint = balance.regions.region_blueprints.get(region_id)
        multiplier = float(region_blueprint.price_multiplier) if region_blueprint else 1.0
        competition_price_bonus = int(competition_price_bonus_by_region.get(region_id, 0))
        overseas_unit_price = (
            int(Decimal(str(equilibrium_price)) * Decimal(str(multiplier)))
            + overseas_price_bonus
            + competition_price_bonus
        )
        overseas_unit_price = max(1, min(overseas_price_ceiling, overseas_unit_price))
        revenue = int(Decimal(sold) * Decimal(str(overseas_unit_price)))
        overseas_revenue += revenue
        sold_overseas += sold
        available_inventory -= sold
        overseas_capacity -= shared_sold
        competition_capacity_remaining[region_id] = max(0, reward_capacity - reward_sold)
        region_state.market_supply[PHASE1_GOODS_KEY] = (
            int(region_state.market_supply.get(PHASE1_GOODS_KEY, 0)) + sold
        )
        region_state.market_price[PHASE1_GOODS_KEY] = overseas_unit_price

    sold_quantity = sold_domestic + sold_overseas
    unsold_quantity = available_inventory

    player_state.phase1_economy.goods_inventory = available_inventory
    player_state.phase1_economy.market_metrics = {
        "demand": float(demand),
        "supply": float(supply),
        "equilibriumPrice": float(equilibrium_price),
        "finalPrice": float(final_price),
        "soldQuantity": float(sold_quantity),
        "unsoldQuantity": float(unsold_quantity),
        "revenue": float(domestic_revenue + overseas_revenue),
    }

    legacy_stock = {key: int(value) for key, value in player_state.goods_stock.items()}
    legacy_stock[PHASE1_GOODS_KEY] = available_inventory
    player_state.goods_stock = legacy_stock
    player_state.goods_allocation = {PHASE1_GOODS_KEY: sold_quantity} if sold_quantity > 0 else {}
    player_state.domestic_sales_revenue = domestic_revenue
    player_state.overseas_sales_revenue = overseas_revenue
    player_state.national_income = domestic_revenue + overseas_revenue
    player_state.income_summary["domesticSalesRevenue"] = domestic_revenue
    player_state.income_summary["overseasSalesRevenue"] = overseas_revenue
    player_state.income_summary["nationalIncome"] = player_state.national_income

    return domestic_revenue, overseas_revenue


def _resolve_external_market_competitions(
    *,
    snapshot,
    turn_inputs_by_player_id: dict[str, Any],
    balance,
) -> dict[str, dict[str, dict[str, int]]]:
    competition = balance.market.overseas_competition
    minimum_power = int(competition.minimum_power)
    infantry_power = int(competition.infantry_power)
    artillery_power = int(competition.artillery_power)
    region_states_by_id = {region.region_id: region for region in snapshot.region_states}
    region_attackers: dict[str, list[tuple[Any, int, int, int]]] = {}

    for player_state in snapshot.player_states:
        submitted = turn_inputs_by_player_id.get(player_state.player_id)
        payload = dict(submitted.payload) if submitted is not None else default_market_submission_payload()
        phase1_market = payload.get("phase1Market") or {}
        deployments = phase1_market.get("externalCompetitionDeployments", []) if isinstance(phase1_market, dict) else []
        if not isinstance(deployments, list):
            continue

        remaining_army = _available_market_competition_army(player_state)
        seen_regions: set[str] = set()
        for deployment in deployments:
            if not isinstance(deployment, dict):
                continue
            region_id = str(deployment.get("marketId") or "").strip()
            if not region_id or region_id in seen_regions:
                continue
            seen_regions.add(region_id)
            if region_id not in region_states_by_id:
                continue
            if region_id not in player_state.established_diplomacy:
                continue
            if not check_route_accessible(player_state.country.value, region_id, snapshot, balance):
                continue

            infantry = min(
                max(0, int(deployment.get("infantry", 0) or 0)),
                remaining_army["infantry"],
            )
            artillery = min(
                max(0, int(deployment.get("artillery", 0) or 0)),
                remaining_army["artillery"],
            )
            power = infantry * infantry_power + artillery * artillery_power
            if power < minimum_power:
                continue

            remaining_army["infantry"] -= infantry
            remaining_army["artillery"] -= artillery
            region_attackers.setdefault(region_id, []).append(
                (player_state, infantry, artillery, power)
            )

    rewards_by_player: dict[str, dict[str, dict[str, int]]] = {}
    for region_id, attackers in region_attackers.items():
        if not attackers:
            continue
        max_power = max(entry[3] for entry in attackers)
        winners = [entry for entry in attackers if entry[3] == max_power]
        if len(winners) != 1:
            continue
        winner_player, infantry_used, artillery_used, _ = winners[0]
        _spend_market_infantry(winner_player, infantry_used)
        winner_player.army["artillery"] = max(
            0,
            int(winner_player.army.get("artillery", 0)) - artillery_used,
        )
        rewards_by_player.setdefault(winner_player.player_id, {})[region_id] = {
            "capacityBonus": int(competition.reward_capacity_bonus),
            "priceBonus": int(competition.reward_price_bonus),
        }
    return rewards_by_player


def _mirror_phase1_market_metrics(
    player_state,
    *,
    domestic_revenue: int,
    overseas_revenue: int,
    sold_quantity: int,
    unsold_quantity: int,
) -> None:
    demand = calculate_domestic_demand(player_state.phase1_economy.capacity_by_mode)
    supply = Decimal(int(player_state.phase1_economy.goods_inventory))
    equilibrium_price = calculate_equilibrium_price(demand=demand)
    final_price = calculate_domestic_price(
        equilibrium_price=equilibrium_price,
        supply=supply,
        demand=demand,
        minimum_price=1,
    )
    player_state.phase1_economy.market_metrics = {
        "demand": float(demand),
        "supply": float(supply),
        "equilibriumPrice": float(equilibrium_price),
        "finalPrice": float(final_price),
        "soldQuantity": float(sold_quantity),
        "unsoldQuantity": float(unsold_quantity),
        "revenue": float(int(domestic_revenue) + int(overseas_revenue)),
    }
