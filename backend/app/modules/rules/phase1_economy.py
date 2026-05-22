"""Pure calculation module for Tomorrow Question 2.0 phase-1 economy.

Implements the macro economic loop:
  capacity structure -> raw materials to goods
  -> domestic / external market allocation
  -> supply / demand price -> revenue -> 3:3:4 pool delta.

This module is intentionally free of Flask, repository, or session dependencies
so the formulas stay testable in isolation. See:
  - docs/第一阶段-市场与生产机制.md
  - docs/2.0迁移前逻辑推演与计划.md
  - docs/用户原始需求-核心机制.md
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
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
    "idle": Decimal("1"),
    "handicraft": Decimal("2"),
    "mechanized": Decimal("3"),
    "steam": Decimal("4"),
    "electrified": Decimal("5"),
}

# 国内成交价边界：用户需求为价格下限 0.1×基础价格，上限 2×基础价格。
DOMESTIC_PRICE_FLOOR_RATIO: Decimal = Decimal("0.1")
DOMESTIC_PRICE_CEILING_RATIO: Decimal = Decimal("2")

# 销售收入分配比例 3:3:4。
DEFAULT_INCOME_ALLOCATION_RATIO: Mapping[str, Decimal] = {
    "consumption": Decimal("0.3"),
    "investment": Decimal("0.3"),
    "fiscal": Decimal("0.4"),
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


def calculate_domestic_demand(
    capacities: Mapping[str, Number],
    demand_coefficients: Mapping[str, Number] | None = None,
) -> Decimal:
    """Sum of capacity × demand coefficient across all production modes."""
    coefficients = demand_coefficients or PRODUCTION_MODE_DEMAND_COEFFICIENTS
    total = Decimal("0")
    for mode, capacity in capacities.items():
        coefficient = _to_decimal(coefficients.get(mode, PRODUCTION_MODE_DEMAND_COEFFICIENTS[mode]))
        total += _to_decimal(capacity) * coefficient
    return total


def calculate_effective_domestic_capacity(
    capacities: Mapping[str, Number],
    demand_coefficients: Mapping[str, Number] | None = None,
    *,
    capacity_bonus: Number = 0,
) -> Decimal:
    """Domestic soft cap K = demand from factory structure + policy/event capacity bonus."""
    demand = calculate_domestic_demand(capacities, demand_coefficients)
    return max(Decimal("1"), demand + _to_decimal(capacity_bonus))


def calculate_equilibrium_price(
    *,
    consumption_pool: Number | None = None,
    effective_capacity: Number | None = None,
    demand: Number | None = None,
) -> Decimal:
    """Equilibrium price = current consumption pool / domestic soft cap."""
    capacity_value = effective_capacity if effective_capacity is not None else demand
    if capacity_value is None:
        return Decimal("0")
    capacity_d = _to_decimal(capacity_value)
    if capacity_d <= 0:
        return Decimal("0")
    return _to_decimal(consumption_pool or 0) / capacity_d


def calculate_minimum_domestic_price(equilibrium_price: Number) -> Decimal:
    return max(Decimal("0"), _to_decimal(equilibrium_price) * DOMESTIC_PRICE_FLOOR_RATIO)


def calculate_maximum_domestic_price(equilibrium_price: Number) -> Decimal:
    return max(Decimal("0"), _to_decimal(equilibrium_price) * DOMESTIC_PRICE_CEILING_RATIO)


def calculate_domestic_price(
    *,
    equilibrium_price: Number,
    allocation: Number | None = None,
    effective_capacity: Number | None = None,
    supply: Number | None = None,
    demand: Number | None = None,
    minimum_price: Number | None = None,
    maximum_price: Number | None = None,
    price_bonus: Number = 0,
) -> Decimal:
    """Apply user domestic price formula and clamp to 0.1×P0..2×P0."""
    equilibrium_d = _to_decimal(equilibrium_price)
    allocation_d = _to_decimal(allocation if allocation is not None else (supply or 0))
    capacity_d = _to_decimal(effective_capacity if effective_capacity is not None else (demand or 0))
    minimum_d = (
        calculate_minimum_domestic_price(equilibrium_d)
        if minimum_price is None
        else _to_decimal(minimum_price)
    )
    maximum_d = (
        calculate_maximum_domestic_price(equilibrium_d)
        if maximum_price is None
        else _to_decimal(maximum_price)
    )
    maximum_d = max(minimum_d, maximum_d)
    bonus_d = _to_decimal(price_bonus)

    if capacity_d <= 0:
        return minimum_d

    raw_price = equilibrium_d * (Decimal("2") - (allocation_d / capacity_d))
    return min(maximum_d, max(minimum_d, raw_price + bonus_d))


def round_market_revenue(value: Number) -> int:
    """Round market revenue to whole fiscal units using ordinary half-up rounding."""
    return int(_to_decimal(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


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
    consumption_pool: Number = 0,
    capacity_bonus: Number = 0,
    minimum_price: Number | None = None,
    maximum_price: Number | None = None,
    price_bonus: Number = 0,
) -> DomesticMarketOutcome:
    """Compute price, sold quantity, revenue, and unsold quantity."""
    supply_d = _to_decimal(supply)
    demand_d = _to_decimal(demand)
    effective_capacity = max(Decimal("1"), demand_d + _to_decimal(capacity_bonus))

    equilibrium = calculate_equilibrium_price(
        consumption_pool=consumption_pool,
        effective_capacity=effective_capacity,
    )
    final_price = calculate_domestic_price(
        equilibrium_price=equilibrium,
        allocation=supply_d,
        effective_capacity=effective_capacity,
        minimum_price=minimum_price,
        maximum_price=maximum_price,
        price_bonus=price_bonus,
    )

    if supply_d < effective_capacity and effective_capacity > 0:
        shortage_rate = (effective_capacity - supply_d) / effective_capacity
    else:
        shortage_rate = Decimal("0")

    if supply_d > effective_capacity and effective_capacity > 0:
        surplus_rate = (supply_d - effective_capacity) / effective_capacity
    else:
        surplus_rate = Decimal("0")

    sold = supply_d
    unsold = Decimal("0")
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
    """Split revenue into 消费 / 投资 / 财政 by ratio (default 3:3:4)."""
    revenue_d = _to_decimal(total_revenue)
    return IncomePoolDelta(
        consumption=revenue_d * _to_decimal(ratio["consumption"]),
        investment=revenue_d * _to_decimal(ratio["investment"]),
        fiscal=revenue_d * _to_decimal(ratio["fiscal"]),
    )
