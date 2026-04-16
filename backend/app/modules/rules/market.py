from __future__ import annotations

from app.modules.balance_config import get_balance_config
from app.modules.game_state.market_access import (
    is_region_accessible,
    resolve_domestic_market_capacity,
    resolve_overseas_market_capacity,
)
from app.modules.game_state.factory_economy import domestic_reference_price, overseas_reference_price

from .common import RuleResolution, clone_snapshot, default_market_submission_payload, index_turn_inputs


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
