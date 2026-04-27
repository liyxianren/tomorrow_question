"""M2 scaffolding tests: phase-1 economy state on PlayerState + payload.

These tests prove that the new phase-1 economy shape exists side-by-side with
the legacy runtime fields, without rewiring gameplay behavior.

References:
- backend/app/modules/rules/phase1_economy.py (M1, pure calculation)
- docs/第一阶段-市场与生产机制.md
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode
from app.modules.game_state.models import (
    DEFAULT_INCOME_ALLOCATION_RATIO,
    DEFAULT_PHASE1_CAPACITY_BY_MODE,
    DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO,
    DEFAULT_PHASE1_MARKET_METRICS,
    Phase1EconomyState,
    PlayerState,
)


class Phase1EconomyDefaultsTests(unittest.TestCase):
    """Default phase-1 economy state must hold zero/default values."""

    def test_default_phase1_capacity_covers_five_modes(self) -> None:
        self.assertEqual(
            set(DEFAULT_PHASE1_CAPACITY_BY_MODE.keys()),
            {"idle", "handicraft", "mechanized", "steam", "electrified"},
        )
        for mode, value in DEFAULT_PHASE1_CAPACITY_BY_MODE.items():
            self.assertEqual(value, 0, f"capacity for {mode} should default to 0")

    def test_default_phase1_market_metrics_has_zero_defaults(self) -> None:
        for key in (
            "demand",
            "supply",
            "equilibriumPrice",
            "finalPrice",
            "soldQuantity",
            "unsoldQuantity",
            "revenue",
        ):
            self.assertIn(key, DEFAULT_PHASE1_MARKET_METRICS)
            self.assertEqual(DEFAULT_PHASE1_MARKET_METRICS[key], 0)

    def test_default_phase1_income_allocation_is_5_3_2(self) -> None:
        # M1 normalized ratio: 消费 0.5 / 投资 0.3 / 财政 0.2.
        self.assertEqual(DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO["consumption"], 0.5)
        self.assertEqual(DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO["investment"], 0.3)
        self.assertEqual(DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO["fiscal"], 0.2)

    def test_phase1_economy_state_defaults_match_constants(self) -> None:
        state = Phase1EconomyState()
        self.assertEqual(state.raw_materials, 0)
        self.assertEqual(state.goods_inventory, 0)
        self.assertEqual(state.capacity_by_mode, DEFAULT_PHASE1_CAPACITY_BY_MODE)
        self.assertEqual(state.market_metrics, DEFAULT_PHASE1_MARKET_METRICS)
        self.assertEqual(state.income_allocation_ratio, DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO)

    def test_phase1_economy_state_defaults_are_independent_copies(self) -> None:
        # Mutating one instance must not leak into the next default.
        first = Phase1EconomyState()
        first.capacity_by_mode["handicraft"] = 5
        second = Phase1EconomyState()
        self.assertEqual(second.capacity_by_mode["handicraft"], 0)


class PlayerStatePhase1EconomyScaffoldingTests(unittest.TestCase):
    """PlayerState exposes phase-1 economy alongside legacy runtime fields."""

    def test_default_player_state_has_phase1_economy_zero_defaults(self) -> None:
        state = PlayerState(player_id="player-a", country=CountryCode.BRITAIN)
        self.assertIsInstance(state.phase1_economy, Phase1EconomyState)
        self.assertEqual(state.phase1_economy.raw_materials, 0)
        self.assertEqual(state.phase1_economy.goods_inventory, 0)
        self.assertEqual(
            state.phase1_economy.capacity_by_mode,
            DEFAULT_PHASE1_CAPACITY_BY_MODE,
        )
        self.assertEqual(
            state.phase1_economy.market_metrics,
            DEFAULT_PHASE1_MARKET_METRICS,
        )
        self.assertEqual(
            state.phase1_economy.income_allocation_ratio,
            DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO,
        )

    def test_legacy_runtime_fields_still_exist_side_by_side(self) -> None:
        # Legacy goods_stock / budget_pools / income_allocation_ratio must NOT
        # be removed in M2; gameplay still depends on them.
        state = PlayerState(player_id="player-a", country=CountryCode.BRITAIN)
        self.assertTrue(hasattr(state, "goods_stock"))
        self.assertEqual(state.goods_stock, {})
        self.assertTrue(hasattr(state, "budget_pools"))
        self.assertEqual(
            state.budget_pools,
            {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0},
        )
        self.assertEqual(state.income_allocation_ratio, DEFAULT_INCOME_ALLOCATION_RATIO)

    def test_legacy_active_income_allocation_ratio_is_unchanged(self) -> None:
        # M2 must NOT swap the active legacy ratio (3:3:4) for the phase-1
        # target ratio (5:3:2). The new ratio lives only on phase1_economy.
        state = PlayerState(player_id="player-a", country=CountryCode.BRITAIN)
        self.assertEqual(state.income_allocation_ratio["domesticMarket"], 3.0)
        self.assertEqual(state.income_allocation_ratio["factory"], 3.0)
        self.assertEqual(state.income_allocation_ratio["governmentFiscal"], 4.0)
        # And the new ratio sits on the phase-1 economy state.
        self.assertEqual(state.phase1_economy.income_allocation_ratio["consumption"], 0.5)
        self.assertEqual(state.phase1_economy.income_allocation_ratio["investment"], 0.3)
        self.assertEqual(state.phase1_economy.income_allocation_ratio["fiscal"], 0.2)


class PlayerStatePhase1EconomyPayloadTests(unittest.TestCase):
    """Payload contract exposes the new phase-1 economy shape (camelCase)."""

    def test_default_payload_contains_phase1_economy_zero_defaults(self) -> None:
        payload = PlayerState(player_id="player-a", country=CountryCode.BRITAIN).to_payload()
        self.assertIn("phase1Economy", payload)
        phase1 = payload["phase1Economy"]
        self.assertEqual(phase1["rawMaterials"], 0)
        self.assertEqual(phase1["goodsInventory"], 0)
        self.assertEqual(
            set(phase1["capacityByMode"].keys()),
            {"idle", "handicraft", "mechanized", "steam", "electrified"},
        )
        for value in phase1["capacityByMode"].values():
            self.assertEqual(value, 0)
        for key in (
            "demand",
            "supply",
            "equilibriumPrice",
            "finalPrice",
            "soldQuantity",
            "unsoldQuantity",
            "revenue",
        ):
            self.assertIn(key, phase1["marketMetrics"])
            self.assertEqual(phase1["marketMetrics"][key], 0)
        self.assertEqual(phase1["incomeAllocationRatio"]["consumption"], 0.5)
        self.assertEqual(phase1["incomeAllocationRatio"]["investment"], 0.3)
        self.assertEqual(phase1["incomeAllocationRatio"]["fiscal"], 0.2)

    def test_payload_roundtrip_preserves_phase1_economy(self) -> None:
        original = PlayerState(player_id="player-a", country=CountryCode.BRITAIN)
        original.phase1_economy.raw_materials = 12
        original.phase1_economy.goods_inventory = 7
        original.phase1_economy.capacity_by_mode["handicraft"] = 3
        original.phase1_economy.capacity_by_mode["mechanized"] = 2
        original.phase1_economy.market_metrics["demand"] = 70
        original.phase1_economy.market_metrics["finalPrice"] = 12.857142857
        original.phase1_economy.income_allocation_ratio["consumption"] = 0.5

        payload = original.to_payload()
        restored = PlayerState.from_payload("player-a", payload)

        self.assertEqual(restored.phase1_economy.raw_materials, 12)
        self.assertEqual(restored.phase1_economy.goods_inventory, 7)
        self.assertEqual(restored.phase1_economy.capacity_by_mode["handicraft"], 3)
        self.assertEqual(restored.phase1_economy.capacity_by_mode["mechanized"], 2)
        self.assertEqual(restored.phase1_economy.market_metrics["demand"], 70)
        self.assertAlmostEqual(
            restored.phase1_economy.market_metrics["finalPrice"], 12.857142857, places=6
        )
        self.assertEqual(restored.phase1_economy.income_allocation_ratio["consumption"], 0.5)

    def test_legacy_payload_without_phase1_economy_still_loads(self) -> None:
        # Legacy payloads (pre-M2) won't carry phase1Economy. from_payload must
        # default it to zero so the model stays backward compatible.
        legacy_payload = PlayerState(
            player_id="player-a", country=CountryCode.BRITAIN
        ).to_payload()
        legacy_payload.pop("phase1Economy", None)

        restored = PlayerState.from_payload("player-a", legacy_payload)

        self.assertIsInstance(restored.phase1_economy, Phase1EconomyState)
        self.assertEqual(restored.phase1_economy.raw_materials, 0)
        self.assertEqual(restored.phase1_economy.goods_inventory, 0)
        self.assertEqual(
            restored.phase1_economy.capacity_by_mode,
            DEFAULT_PHASE1_CAPACITY_BY_MODE,
        )
        self.assertEqual(
            restored.phase1_economy.income_allocation_ratio,
            DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO,
        )


if __name__ == "__main__":
    unittest.main()
