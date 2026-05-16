"""Pure calculation module for Tomorrow Question 2.0 phase-1 economy.

Implements the macro economic loop:
  capacity structure -> raw materials to goods
  -> domestic / external market allocation
  -> supply / demand price -> revenue -> 5:3:2 pool delta.

This module is intentionally free of Flask, repository, or session dependencies
so the formulas stay testable in isolation. See:
  - docs/第一阶段-市场与生产机制.md
  - docs/2.0迁移前逻辑推演与计划.md
  - docs/用户原始需求-核心机制.md
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Mapping, Union


Number = Union[int, float, Decimal, str]


# 各生产方式的商品产出倍率 (原材料 -> 商品)。
PRODUCTION_MODE_OUTPUT_RATIOS: Mapping[str, Decimal] = {
    "idle": Decimal("0"),
    "handicraft": Decimal("1"),
    "mechanized": Decimal("2"),
    "steam": Decimal("4"),
    "electrified": Decimal("8"),
}

# 各生产方式的需求系数：每单位产能创造的本国需求。
PRODUCTION_MODE_DEMAND_COEFFICIENTS: Mapping[str, Decimal] = {
    "idle": Decimal("0"),
    "handicraft": Decimal("1"),
    "mechanized": Decimal("1.5"),
    "steam": Decimal("2.5"),
    "electrified": Decimal("3.5"),
}

# 固定均衡基准价：替代原「消费池余额 / 需求」公式。
# 供需浮动由 calculate_domestic_price 处理。
DEFAULT_EQUILIBRIUM_BASE_PRICE: Decimal = Decimal("3")

# 价格下限：避免极端过剩时本国价格归零或为负。
DEFAULT_MINIMUM_DOMESTIC_PRICE: Decimal = Decimal("1")

# 价格上限。
DEFAULT_MAXIMUM_DOMESTIC_PRICE: Decimal = Decimal("8")

# 供需价格阻尼系数（与前端 priceCurves.ts 一致）。
# 短缺时：price = equilibrium × (1 + shortage_rate × damping)
# 过剩时：price = equilibrium × max(surplus_floor, 1 - surplus_rate × damping)
SHORTAGE_PRICE_DAMPING: Decimal = Decimal("0.5")
SURPLUS_PRICE_DAMPING: Decimal = Decimal("0.3")
MIN_SURPLUS_PRICE_RATIO: Decimal = Decimal("0.5")

# 销售收入分配比例 5:3:2。
DEFAULT_INCOME_ALLOCATION_RATIO: Mapping[str, Decimal] = {
    "consumption": Decimal("0.5"),
    "investment": Decimal("0.3"),
    "fiscal": Decimal("0.2"),
}


def _to_decimal(value: Number) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def calculate_mode_output(mode: str, raw_input: Number) -> Decimal:
    """Goods output for a single production mode."""
    ratio = PRODUCTION_MODE_OUTPUT_RATIOS[mode]
    return _to_decimal(raw_input) * ratio


def calculate_production_output(
    raw_material_assignments: Mapping[str, Number],
) -> Decimal:
    """Total goods output across all production modes."""
    total = Decimal("0")
    for mode, raw_input in raw_material_assignments.items():
        total += calculate_mode_output(mode, raw_input)
    return total


def calculate_domestic_demand(capacities: Mapping[str, Number]) -> Decimal:
    """Sum of capacity × demand coefficient across all production modes."""
    total = Decimal("0")
    for mode, capacity in capacities.items():
        coefficient = PRODUCTION_MODE_DEMAND_COEFFICIENTS[mode]
        total += _to_decimal(capacity) * coefficient
    return total


def calculate_equilibrium_price(*, demand: Number) -> Decimal:
    """均衡价格 = 固定基准价。高需求本身不抬价，供需浮动由 calculate_domestic_price 处理。"""
    demand_d = _to_decimal(demand)
    if demand_d == 0:
        return Decimal("0")
    return DEFAULT_EQUILIBRIUM_BASE_PRICE


def calculate_domestic_price(
    *,
    equilibrium_price: Number,
    supply: Number,
    demand: Number,
    minimum_price: Number = DEFAULT_MINIMUM_DOMESTIC_PRICE,
    maximum_price: Number = DEFAULT_MAXIMUM_DOMESTIC_PRICE,
) -> Decimal:
    """Apply shortage / surplus adjustment to equilibrium price with floor and ceiling."""
    equilibrium_d = _to_decimal(equilibrium_price)
    supply_d = _to_decimal(supply)
    demand_d = _to_decimal(demand)
    minimum_d = _to_decimal(minimum_price)
    maximum_d = _to_decimal(maximum_price)

    if demand_d == 0:
        return minimum_d

    if supply_d == demand_d:
        raw_price = equilibrium_d
    elif supply_d < demand_d:
        shortage_rate = (demand_d - supply_d) / demand_d
        raw_price = equilibrium_d * (Decimal("1") + shortage_rate * SHORTAGE_PRICE_DAMPING)
    else:
        surplus_rate = (supply_d - demand_d) / demand_d
        scale = max(MIN_SURPLUS_PRICE_RATIO, Decimal("1") - surplus_rate * SURPLUS_PRICE_DAMPING)
        raw_price = equilibrium_d * scale

    if raw_price < minimum_d:
        return minimum_d
    if raw_price > maximum_d:
        return maximum_d
    return raw_price


@dataclass(frozen=True)
class DomesticMarketOutcome:
    """Result of resolving the domestic market for one player."""

    demand: Decimal
    supply: Decimal
    equilibrium_price: Decimal
    final_price: Decimal
    sold_quantity: Decimal
    revenue: Decimal
    unsold_quantity: Decimal
    shortage_rate: Decimal
    surplus_rate: Decimal


def resolve_domestic_market(
    *,
    supply: Number,
    demand: Number,
    minimum_price: Number = DEFAULT_MINIMUM_DOMESTIC_PRICE,
) -> DomesticMarketOutcome:
    """Compute price, sold quantity, revenue, and unsold quantity."""
    supply_d = _to_decimal(supply)
    demand_d = _to_decimal(demand)

    equilibrium = calculate_equilibrium_price(demand=demand_d)
    final_price = calculate_domestic_price(
        equilibrium_price=equilibrium,
        supply=supply_d,
        demand=demand_d,
        minimum_price=minimum_price,
    )

    if supply_d < demand_d and demand_d > 0:
        shortage_rate = (demand_d - supply_d) / demand_d
    else:
        shortage_rate = Decimal("0")

    if supply_d > demand_d and demand_d > 0:
        surplus_rate = (supply_d - demand_d) / demand_d
    else:
        surplus_rate = Decimal("0")

    sold = supply_d if supply_d < demand_d else demand_d
    unsold = supply_d - sold
    revenue = sold * final_price

    return DomesticMarketOutcome(
        demand=demand_d,
        supply=supply_d,
        equilibrium_price=equilibrium,
        final_price=final_price,
        sold_quantity=sold,
        revenue=revenue,
        unsold_quantity=unsold,
        shortage_rate=shortage_rate,
        surplus_rate=surplus_rate,
    )


@dataclass(frozen=True)
class IncomePoolDelta:
    """Per-pool revenue delta from a single allocation pass."""

    consumption: Decimal
    investment: Decimal
    fiscal: Decimal


def allocate_revenue_to_pools(
    total_revenue: Number,
    *,
    ratio: Mapping[str, Number] = DEFAULT_INCOME_ALLOCATION_RATIO,
) -> IncomePoolDelta:
    """Split revenue into 消费 / 投资 / 财政 by ratio (default 5:3:2)."""
    revenue_d = _to_decimal(total_revenue)
    return IncomePoolDelta(
        consumption=revenue_d * _to_decimal(ratio["consumption"]),
        investment=revenue_d * _to_decimal(ratio["investment"]),
        fiscal=revenue_d * _to_decimal(ratio["fiscal"]),
    )
