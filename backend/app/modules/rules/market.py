from __future__ import annotations

from decimal import Decimal

from app.modules.balance_config import get_balance_config
from app.modules.game_state.market_access import (
    is_region_accessible,
    resolve_domestic_market_capacity,
    resolve_overseas_market_capacity,
)
from app.modules.game_state.factory_economy import domestic_reference_price, overseas_reference_price

from .common import RuleResolution, clone_snapshot, default_market_submission_payload, index_turn_inputs
from .phase1_economy import (
    calculate_domestic_demand,
    calculate_domestic_price,
    calculate_equilibrium_price,
)


def resolve_market_phase(*, snapshot, turn_inputs) -> RuleResolution:
    balance = get_balance_config()
    updated_snapshot = clone_snapshot(snapshot)
    turn_inputs_by_player_id = index_turn_inputs(turn_inputs)
    generated_logs: list[dict[str, object]] = []
    summary_lines: list[str] = []

    region_states_by_id = {region.region_id: region for region in updated_snapshot.region_states}

    for player_state in updated_snapshot.player_states:
        submitted = turn_inputs_by_player_id.get(player_state.player_id)
        payload = dict(submitted.payload) if submitted is not None else default_market_submission_payload()

        phase1_market = payload.get("phase1Market")
        if isinstance(phase1_market, dict):
            domestic_revenue, overseas_revenue = _apply_phase1_market(
                player_state,
                phase1_market,
                region_states_by_id=region_states_by_id,
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
            continue

        sale_orders = list(payload.get("saleOrders", []))
        remaining_stock = {goods_key: int(amount) for goods_key, amount in player_state.goods_stock.items()}
        remaining_domestic_capacity = resolve_domestic_market_capacity(player_state)
        remaining_overseas_capacity = resolve_overseas_market_capacity(player_state)
        domestic_revenue = 0
        overseas_revenue = 0
        goods_allocation: dict[str, int] = {}

        for order in sale_orders:
            goods_id = str(order.get("goodsId"))
            available = int(remaining_stock.get(goods_id, 0))
            if available <= 0:
                continue
            requested = max(0, int(order.get("quantity", 0)))
            if requested <= 0:
                continue

            if order.get("market") == "domestic":
                sold = min(available, requested, remaining_domestic_capacity)
                if sold <= 0:
                    continue
                unit_price = domestic_reference_price(player_state, goods_id, updated_snapshot)
                domestic_revenue += sold * unit_price
                remaining_domestic_capacity -= sold
                remaining_stock[goods_id] = available - sold
                goods_allocation[goods_id] = int(goods_allocation.get(goods_id, 0)) + sold
                continue

            region_id = str(order.get("regionId") or "")
            region_state = region_states_by_id.get(region_id)
            if region_state is None or not is_region_accessible(
                region_state.access_level,
                player_state.military_points,
                region_id=region_id,
                established_diplomacy=player_state.established_diplomacy,
            ):
                continue
            # Check resource limit for this goods in this region
            region_blueprint = balance.regions.region_blueprints.get(region_id)
            if region_blueprint is not None:
                goods_limit = region_blueprint.resource_limit.get(goods_id)
                if goods_limit is None:
                    continue  # Region does not accept this goods type
                current_supply = int(region_state.market_supply.get(goods_id, 0))
                available_limit = max(0, int(goods_limit) - current_supply)
                if available_limit <= 0:
                    continue
                sold = min(available, requested, remaining_overseas_capacity, available_limit)
            else:
                sold = min(available, requested, remaining_overseas_capacity)
            if sold <= 0:
                continue
            unit_price = overseas_reference_price(player_state, goods_id, region_id, updated_snapshot)
            overseas_revenue += sold * unit_price
            remaining_overseas_capacity -= sold
            remaining_stock[goods_id] = available - sold
            goods_allocation[goods_id] = int(goods_allocation.get(goods_id, 0)) + sold
            region_state.market_supply[goods_id] = int(region_state.market_supply.get(goods_id, 0)) + sold
            region_state.market_price[goods_id] = unit_price

        player_state.goods_stock = remaining_stock
        player_state.goods_allocation = goods_allocation
        player_state.domestic_sales_revenue = domestic_revenue
        player_state.overseas_sales_revenue = overseas_revenue
        player_state.national_income = domestic_revenue + overseas_revenue
        player_state.income_summary["domesticSalesRevenue"] = domestic_revenue
        player_state.income_summary["overseasSalesRevenue"] = overseas_revenue
        player_state.income_summary["nationalIncome"] = player_state.national_income
        _mirror_phase1_market_metrics(
            player_state,
            domestic_revenue=domestic_revenue,
            overseas_revenue=overseas_revenue,
            sold_quantity=sum(int(qty) for qty in goods_allocation.values()),
            unsold_quantity=sum(int(qty) for qty in remaining_stock.values()),
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


def _apply_phase1_market(
    player_state,
    phase1_market: dict[str, object],
    *,
    region_states_by_id: dict[str, object],
) -> tuple[int, int]:
    """Phase-1 unified market: one good, supply-demand pricing, optional external markets at the same price."""
    balance = get_balance_config()
    capacity_by_mode = player_state.phase1_economy.capacity_by_mode
    demand = calculate_domestic_demand(capacity_by_mode)
    consumption_pool = Decimal(int(player_state.budget_pools.get("domesticMarket", 0)))
    available_inventory = int(player_state.phase1_economy.goods_inventory)
    supply = Decimal(available_inventory)

    equilibrium_price = calculate_equilibrium_price(
        consumption_pool=consumption_pool, demand=demand
    )
    final_price = calculate_domestic_price(
        equilibrium_price=equilibrium_price,
        supply=supply,
        demand=demand,
        minimum_price=1,
    )

    domestic_request = max(0, int(phase1_market.get("domesticAllocation", 0) or 0))
    domestic_capacity = max(0, int(resolve_domestic_market_capacity(player_state)))
    sold_domestic_d = min(
        Decimal(domestic_request),
        Decimal(available_inventory),
        demand,
        Decimal(domestic_capacity),
    )
    sold_domestic = int(sold_domestic_d)
    available_inventory -= sold_domestic
    domestic_revenue_d = sold_domestic_d * final_price
    domestic_revenue = int(domestic_revenue_d)

    overseas_revenue = 0
    sold_overseas = 0
    overseas_capacity = max(0, int(resolve_overseas_market_capacity(player_state)))
    for alloc in phase1_market.get("externalAllocations", []) or []:
        if available_inventory <= 0 or overseas_capacity <= 0:
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
            player_state.military_points,
            region_id=region_id,
            established_diplomacy=player_state.established_diplomacy,
        ):
            continue
        sold = min(quantity, available_inventory, overseas_capacity)
        if sold <= 0:
            continue
        region_blueprint = balance.regions.region_blueprints.get(region_id)
        multiplier = float(region_blueprint.price_multiplier) if region_blueprint else 1.0
        overseas_unit_price = int(Decimal(str(equilibrium_price)) * Decimal(str(multiplier)))
        revenue = int(Decimal(sold) * Decimal(str(overseas_unit_price)))
        overseas_revenue += revenue
        sold_overseas += sold
        available_inventory -= sold
        overseas_capacity -= sold
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
    consumption_pool = Decimal(int(player_state.budget_pools.get("domesticMarket", 0)))
    equilibrium_price = calculate_equilibrium_price(
        consumption_pool=consumption_pool, demand=demand
    )
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
