from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.modules.rules.phase1_economy import (
    DEFAULT_INCOME_ALLOCATION_RATIO,
    DOMESTIC_PRICE_CEILING_RATIO,
    DOMESTIC_PRICE_FLOOR_RATIO,
    PRODUCTION_MODE_DEMAND_COEFFICIENTS,
    PRODUCTION_MODE_OUTPUT_RATIOS,
    DomesticMarketOutcome,
    IncomePoolDelta,
    allocate_revenue_to_pools,
    calculate_domestic_demand,
    calculate_maximum_domestic_price,
    calculate_minimum_domestic_price,
    calculate_domestic_price,
    calculate_equilibrium_price,
    calculate_mode_output,
    calculate_production_output,
    resolve_domestic_market,
    round_market_revenue,
)


class ProductionModeConstantsTests(unittest.TestCase):
    """生产方式倍率与需求系数对照原始需求文档。"""

    def test_output_ratios_match_user_requirements(self):
        self.assertEqual(PRODUCTION_MODE_OUTPUT_RATIOS["idle"], Decimal("0"))
        self.assertEqual(PRODUCTION_MODE_OUTPUT_RATIOS["handicraft"], Decimal("1"))
        self.assertEqual(PRODUCTION_MODE_OUTPUT_RATIOS["mechanized"], Decimal("2"))
        self.assertEqual(PRODUCTION_MODE_OUTPUT_RATIOS["steam"], Decimal("4"))
        self.assertEqual(PRODUCTION_MODE_OUTPUT_RATIOS["electrified"], Decimal("8"))

    def test_demand_coefficients_match_user_requirements(self):
        self.assertEqual(PRODUCTION_MODE_DEMAND_COEFFICIENTS["idle"], Decimal("1"))
        self.assertEqual(PRODUCTION_MODE_DEMAND_COEFFICIENTS["handicraft"], Decimal("2"))
        self.assertEqual(PRODUCTION_MODE_DEMAND_COEFFICIENTS["mechanized"], Decimal("3"))
        self.assertEqual(PRODUCTION_MODE_DEMAND_COEFFICIENTS["steam"], Decimal("4"))
        self.assertEqual(PRODUCTION_MODE_DEMAND_COEFFICIENTS["electrified"], Decimal("5"))


class CalculateModeOutputTests(unittest.TestCase):
    """单一生产方式的商品产出计算。"""

    def test_idle_produces_no_goods(self):
        self.assertEqual(calculate_mode_output("idle", 100), Decimal("0"))

    def test_handicraft_one_to_one(self):
        self.assertEqual(calculate_mode_output("handicraft", 1), Decimal("1"))
        self.assertEqual(calculate_mode_output("handicraft", 10), Decimal("10"))

    def test_mechanized_one_to_two(self):
        self.assertEqual(calculate_mode_output("mechanized", 1), Decimal("2"))
        self.assertEqual(calculate_mode_output("mechanized", 10), Decimal("20"))

    def test_steam_one_to_four(self):
        self.assertEqual(calculate_mode_output("steam", 1), Decimal("4"))

    def test_electrified_one_to_eight(self):
        self.assertEqual(calculate_mode_output("electrified", 1), Decimal("8"))

    def test_zero_input_produces_zero(self):
        self.assertEqual(calculate_mode_output("mechanized", 0), Decimal("0"))

    def test_unknown_mode_raises(self):
        with self.assertRaises(KeyError):
            calculate_mode_output("nuclear", 1)


class CalculateProductionOutputTests(unittest.TestCase):
    """多生产方式合并产出。"""

    def test_doc_example_handicraft_10_plus_mechanized_20(self):
        # docs/第一阶段-市场与生产机制.md 12.2: 手工业 10 + 机械生产 20 -> 50
        output = calculate_production_output(
            {"handicraft": 10, "mechanized": 20}
        )
        self.assertEqual(output, Decimal("50"))

    def test_empty_assignments_returns_zero(self):
        self.assertEqual(calculate_production_output({}), Decimal("0"))

    def test_idle_assignment_does_not_contribute(self):
        # idle 倍率 0，即使分配原材料也不产出。
        output = calculate_production_output({"idle": 50, "handicraft": 5})
        self.assertEqual(output, Decimal("5"))


class CalculateDomesticDemandTests(unittest.TestCase):
    """本国总需求 = Σ(产能 × 需求系数)。"""

    def test_doc_example_idle_20_handicraft_10_mechanized_10(self):
        # 新系数: 20 + 20 + 30 = 70
        demand = calculate_domestic_demand(
            {"idle": 20, "handicraft": 10, "mechanized": 10}
        )
        self.assertEqual(demand, Decimal("70"))

    def test_empty_capacities_returns_zero(self):
        self.assertEqual(calculate_domestic_demand({}), Decimal("0"))

    def test_each_mode_demand_coefficient(self):
        self.assertEqual(calculate_domestic_demand({"idle": 1}), Decimal("1"))
        self.assertEqual(calculate_domestic_demand({"handicraft": 1}), Decimal("2"))
        self.assertEqual(calculate_domestic_demand({"mechanized": 1}), Decimal("3"))
        self.assertEqual(calculate_domestic_demand({"steam": 1}), Decimal("4"))
        self.assertEqual(calculate_domestic_demand({"electrified": 1}), Decimal("5"))


class CalculateEquilibriumPriceTests(unittest.TestCase):
    """均衡价格 = 消费池 / 国内定价软上限。"""

    def test_returns_consumption_pool_divided_by_capacity(self):
        price = calculate_equilibrium_price(consumption_pool=210, effective_capacity=70)
        self.assertEqual(price, Decimal("3"))

    def test_underfunded_pool_can_still_return_fractional_equilibrium_price(self):
        price = calculate_equilibrium_price(consumption_pool=21, effective_capacity=24)
        self.assertEqual(price, Decimal("0.875"))

    def test_zero_demand_returns_zero(self):
        # 防御除零：demand=0 时返回 0。
        self.assertEqual(
            calculate_equilibrium_price(demand=0),
            Decimal("0"),
        )


class CalculateDomesticPriceTests(unittest.TestCase):
    """本国市场价格波动公式。"""

    def test_dynamic_floor_and_ceiling_are_ratios_of_equilibrium(self):
        equilibrium = Decimal("1.05")
        self.assertEqual(calculate_minimum_domestic_price(equilibrium), Decimal("0.105"))
        self.assertEqual(calculate_maximum_domestic_price(equilibrium), Decimal("2.10"))
        self.assertEqual(DOMESTIC_PRICE_FLOOR_RATIO, Decimal("0.1"))
        self.assertEqual(DOMESTIC_PRICE_CEILING_RATIO, Decimal("2"))

    def test_supply_equals_demand_returns_equilibrium(self):
        price = calculate_domestic_price(
            equilibrium_price=Decimal("10"), supply=70, demand=70
        )
        self.assertEqual(price, Decimal("10"))

    def test_supply_matching_demand_uses_fractional_equilibrium_price(self):
        price = calculate_domestic_price(
            equilibrium_price=calculate_equilibrium_price(consumption_pool=21, effective_capacity=24),
            supply=24,
            demand=24,
        )
        self.assertEqual(price, Decimal("0.875"))

    def test_surplus_still_decreases_price(self):
        price = calculate_domestic_price(
            equilibrium_price=calculate_equilibrium_price(consumption_pool=24, effective_capacity=24),
            supply=36,
            demand=24,
        )
        self.assertEqual(price, Decimal("0.5"))

    def test_shortage_increases_price(self):
        price = calculate_domestic_price(
            equilibrium_price=Decimal("10"), supply=50, demand=70
        )
        self.assertAlmostEqual(float(price), 12.857142857, places=6)

    def test_surplus_decreases_price(self):
        price = calculate_domestic_price(
            equilibrium_price=Decimal("10"), supply=90, demand=70
        )
        self.assertAlmostEqual(float(price), 7.142857142, places=6)

    def test_extreme_surplus_clamped_to_minimum(self):
        price = calculate_domestic_price(
            equilibrium_price=Decimal("10"), supply=140, demand=70
        )
        self.assertEqual(price, Decimal("1"))

    def test_minimum_price_can_be_overridden_to_zero(self):
        price = calculate_domestic_price(
            equilibrium_price=Decimal("10"),
            supply=140,
            demand=70,
            minimum_price=Decimal("0"),
        )
        self.assertEqual(price, Decimal("0"))

    def test_zero_demand_returns_minimum_price(self):
        # demand=0 时无需求，不应崩溃；价格回退到最低价格。
        price = calculate_domestic_price(
            equilibrium_price=Decimal("0"), supply=10, demand=0
        )
        self.assertEqual(price, Decimal("0"))

    def test_shortage_clamped_to_dynamic_ceiling(self):
        price = calculate_domestic_price(
            equilibrium_price=Decimal("1.05"), supply=0, demand=70
        )
        self.assertEqual(price, Decimal("2.10"))


class ResolveDomesticMarketTests(unittest.TestCase):
    """本国市场结算：软上限定价，国内成交只受库存/投放约束。"""

    def test_supply_shortage(self):
        outcome = resolve_domestic_market(
            supply=50, demand=70, consumption_pool=210
        )
        self.assertIsInstance(outcome, DomesticMarketOutcome)
        self.assertEqual(outcome.demand, Decimal("70"))
        self.assertEqual(outcome.supply, Decimal("50"))
        self.assertEqual(outcome.equilibrium_price, Decimal("3"))
        self.assertAlmostEqual(float(outcome.final_price), 3.857142, places=5)
        self.assertEqual(outcome.sold_quantity, Decimal("50"))
        self.assertAlmostEqual(float(outcome.revenue), 192.85714, places=4)
        self.assertEqual(outcome.unsold_quantity, Decimal("0"))

    def test_supply_surplus(self):
        outcome = resolve_domestic_market(
            supply=90, demand=70, consumption_pool=210
        )
        self.assertAlmostEqual(float(outcome.final_price), 2.14285714, places=6)
        self.assertEqual(outcome.sold_quantity, Decimal("90"))
        self.assertAlmostEqual(float(outcome.revenue), 192.85714, places=4)
        self.assertEqual(outcome.unsold_quantity, Decimal("0"))

    def test_supply_equals_demand(self):
        outcome = resolve_domestic_market(
            supply=70, demand=70, consumption_pool=210
        )
        self.assertEqual(outcome.equilibrium_price, Decimal("3"))
        self.assertEqual(outcome.final_price, Decimal("3"))
        self.assertEqual(outcome.sold_quantity, Decimal("70"))
        self.assertEqual(outcome.revenue, Decimal("210"))
        self.assertEqual(outcome.unsold_quantity, Decimal("0"))


class RoundMarketRevenueTests(unittest.TestCase):
    """市场收入小数按四舍五入进入财政整数。"""

    def test_rounds_half_up_to_whole_fiscal_units(self):
        self.assertEqual(round_market_revenue(Decimal("15.49")), 15)
        self.assertEqual(round_market_revenue(Decimal("15.50")), 16)


class AllocateRevenueToPoolsTests(unittest.TestCase):
    """收入按 3:3:4 进入消费 / 投资 / 财政池。"""

    def test_default_ratio_is_3_3_4(self):
        self.assertEqual(DEFAULT_INCOME_ALLOCATION_RATIO["consumption"], Decimal("0.3"))
        self.assertEqual(DEFAULT_INCOME_ALLOCATION_RATIO["investment"], Decimal("0.3"))
        self.assertEqual(DEFAULT_INCOME_ALLOCATION_RATIO["fiscal"], Decimal("0.4"))

    def test_revenue_1000_splits_300_300_400(self):
        delta = allocate_revenue_to_pools(Decimal("1000"))
        self.assertIsInstance(delta, IncomePoolDelta)
        self.assertEqual(delta.consumption, Decimal("300.0"))
        self.assertEqual(delta.investment, Decimal("300.0"))
        self.assertEqual(delta.fiscal, Decimal("400.0"))

    def test_zero_revenue(self):
        delta = allocate_revenue_to_pools(Decimal("0"))
        self.assertEqual(delta.consumption, Decimal("0"))
        self.assertEqual(delta.investment, Decimal("0"))
        self.assertEqual(delta.fiscal, Decimal("0"))

    def test_doc_example_supply_50_pool_split(self):
        # 推演表 supply 50 -> 收入 642.857... -> 消费 192.86, 投资 192.86, 财政 257.14
        revenue = Decimal("4500") / Decimal("7")
        delta = allocate_revenue_to_pools(revenue)
        self.assertAlmostEqual(float(delta.consumption), 192.8571429, places=4)
        self.assertAlmostEqual(float(delta.investment), 192.8571429, places=4)
        self.assertAlmostEqual(float(delta.fiscal), 257.1428571, places=4)


if __name__ == "__main__":
    unittest.main()
