from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.modules.rules.phase1_economy import (
    DEFAULT_INCOME_ALLOCATION_RATIO,
    DEFAULT_MINIMUM_DOMESTIC_PRICE,
    PRODUCTION_MODE_DEMAND_COEFFICIENTS,
    PRODUCTION_MODE_OUTPUT_RATIOS,
    DomesticMarketOutcome,
    IncomePoolDelta,
    allocate_revenue_to_pools,
    calculate_domestic_demand,
    calculate_domestic_price,
    calculate_equilibrium_price,
    calculate_mode_output,
    calculate_production_output,
    resolve_domestic_market,
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
        # docs/第一阶段-市场与生产机制.md 12.1: 20 + 20 + 30 = 70
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
    """均衡价格 = 阶段开始时消费池 / 本国需求。"""

    def test_doc_example_pool_700_demand_70(self):
        price = calculate_equilibrium_price(consumption_pool=700, demand=70)
        self.assertEqual(price, Decimal("10"))

    def test_zero_demand_returns_zero(self):
        # 防御除零：demand=0 时返回 0，避免运行时崩溃。
        self.assertEqual(
            calculate_equilibrium_price(consumption_pool=500, demand=0),
            Decimal("0"),
        )


class CalculateDomesticPriceTests(unittest.TestCase):
    """本国市场价格波动公式。"""

    def test_supply_equals_demand_returns_equilibrium(self):
        price = calculate_domestic_price(
            equilibrium_price=Decimal("10"), supply=70, demand=70
        )
        self.assertEqual(price, Decimal("10"))

    def test_shortage_increases_price(self):
        # supply 50, demand 70 -> 短缺率 20/70, 价格 10 * (1 + 2/7) = 90/7 ≈ 12.857142857
        price = calculate_domestic_price(
            equilibrium_price=Decimal("10"), supply=50, demand=70
        )
        self.assertAlmostEqual(float(price), 12.857142857, places=6)

    def test_surplus_decreases_price(self):
        # supply 90, demand 70 -> 过剩率 20/70, 价格 10 * (1 - 2/7) = 50/7 ≈ 7.142857143
        price = calculate_domestic_price(
            equilibrium_price=Decimal("10"), supply=90, demand=70
        )
        self.assertAlmostEqual(float(price), 7.142857143, places=6)

    def test_extreme_surplus_clamped_to_minimum(self):
        # 默认最低价格为 1。供给远大于需求时不可低于 1。
        price = calculate_domestic_price(
            equilibrium_price=Decimal("10"), supply=140, demand=70
        )
        self.assertEqual(price, DEFAULT_MINIMUM_DOMESTIC_PRICE)

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
        self.assertEqual(price, DEFAULT_MINIMUM_DOMESTIC_PRICE)


class ResolveDomesticMarketTests(unittest.TestCase):
    """本国市场结算：价格、成交量、销售额、未售出。"""

    def test_doc_example_supply_50(self):
        # docs/2.0迁移前逻辑推演与计划.md 表格行: supply 50 -> price 12.857..., revenue 642.857...
        outcome = resolve_domestic_market(
            supply=50, demand=70, consumption_pool=700
        )
        self.assertIsInstance(outcome, DomesticMarketOutcome)
        self.assertEqual(outcome.demand, Decimal("70"))
        self.assertEqual(outcome.supply, Decimal("50"))
        self.assertEqual(outcome.equilibrium_price, Decimal("10"))
        self.assertAlmostEqual(float(outcome.final_price), 12.857142857, places=6)
        self.assertEqual(outcome.sold_quantity, Decimal("50"))
        self.assertAlmostEqual(float(outcome.revenue), 642.857142857, places=4)
        self.assertEqual(outcome.unsold_quantity, Decimal("0"))

    def test_doc_example_supply_90(self):
        # docs/2.0迁移前逻辑推演与计划.md 表格行: supply 90 -> price 7.142..., revenue 500
        outcome = resolve_domestic_market(
            supply=90, demand=70, consumption_pool=700
        )
        self.assertAlmostEqual(float(outcome.final_price), 7.142857143, places=6)
        self.assertEqual(outcome.sold_quantity, Decimal("70"))
        self.assertAlmostEqual(float(outcome.revenue), 500.0, places=4)
        # 过剩商品 90-70=20 进入未成交。
        self.assertEqual(outcome.unsold_quantity, Decimal("20"))

    def test_doc_example_supply_70_equilibrium(self):
        outcome = resolve_domestic_market(
            supply=70, demand=70, consumption_pool=700
        )
        self.assertEqual(outcome.final_price, Decimal("10"))
        self.assertEqual(outcome.sold_quantity, Decimal("70"))
        self.assertEqual(outcome.revenue, Decimal("700"))
        self.assertEqual(outcome.unsold_quantity, Decimal("0"))


class AllocateRevenueToPoolsTests(unittest.TestCase):
    """收入按 5:3:2 进入消费 / 投资 / 财政池。"""

    def test_default_ratio_is_5_3_2(self):
        self.assertEqual(DEFAULT_INCOME_ALLOCATION_RATIO["consumption"], Decimal("0.5"))
        self.assertEqual(DEFAULT_INCOME_ALLOCATION_RATIO["investment"], Decimal("0.3"))
        self.assertEqual(DEFAULT_INCOME_ALLOCATION_RATIO["fiscal"], Decimal("0.2"))

    def test_revenue_1000_splits_500_300_200(self):
        # docs/2.0迁移前逻辑推演与计划.md: 总收入 1000 -> 500 / 300 / 200
        delta = allocate_revenue_to_pools(Decimal("1000"))
        self.assertIsInstance(delta, IncomePoolDelta)
        self.assertEqual(delta.consumption, Decimal("500.0"))
        self.assertEqual(delta.investment, Decimal("300.0"))
        self.assertEqual(delta.fiscal, Decimal("200.0"))

    def test_zero_revenue(self):
        delta = allocate_revenue_to_pools(Decimal("0"))
        self.assertEqual(delta.consumption, Decimal("0"))
        self.assertEqual(delta.investment, Decimal("0"))
        self.assertEqual(delta.fiscal, Decimal("0"))

    def test_doc_example_supply_50_pool_split(self):
        # 推演表 supply 50 -> 收入 642.857... -> 消费 321.43, 投资 192.86, 财政 128.57
        revenue = Decimal("4500") / Decimal("7")
        delta = allocate_revenue_to_pools(revenue)
        self.assertAlmostEqual(float(delta.consumption), 321.4285714, places=4)
        self.assertAlmostEqual(float(delta.investment), 192.8571429, places=4)
        self.assertAlmostEqual(float(delta.fiscal), 128.5714286, places=4)


if __name__ == "__main__":
    unittest.main()
