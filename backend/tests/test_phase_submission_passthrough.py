from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.modules.settlement.phase_submission import (
    _normalize_decision_submission,
    _normalize_market_submission,
)


def base_decision_payload() -> dict[str, object]:
    return {
        "factoryPlan": {
            "productionOrders": [],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {"pointPurchases": [], "strategySelections": [], "techResearch": []},
        "militaryPlan": {
            "unlockColonization": False,
            "militaryActions": [],
            "diplomacyActions": [],
            "colonizationActions": [],
        },
        "talentPlan": {"talentUnlocks": []},
    }


class DecisionPhase1ProductionPassthroughTests(unittest.TestCase):
    def test_valid_phase1_production_survives_normalization(self) -> None:
        payload = base_decision_payload()
        payload["phase1Production"] = {
            "rawMaterialAssignments": {"handicraft": 3, "factory": 1},
            "buildOrders": [{"mode": "factory", "quantity": 1}],
        }

        normalized = _normalize_decision_submission(payload)

        self.assertIn("phase1Production", normalized)
        self.assertEqual(
            normalized["phase1Production"]["rawMaterialAssignments"],
            {"handicraft": 3, "factory": 1},
        )
        self.assertEqual(
            normalized["phase1Production"]["buildOrders"],
            [{"mode": "factory", "quantity": 1}],
        )

    def test_phase1_production_without_raw_assignments_is_dropped(self) -> None:
        payload = base_decision_payload()
        payload["phase1Production"] = {"buildOrders": []}

        normalized = _normalize_decision_submission(payload)

        self.assertNotIn("phase1Production", normalized)

    def test_phase1_production_with_empty_raw_assignments_is_dropped(self) -> None:
        payload = base_decision_payload()
        payload["phase1Production"] = {"rawMaterialAssignments": {}}

        normalized = _normalize_decision_submission(payload)

        self.assertNotIn("phase1Production", normalized)

    def test_phase1_production_non_dict_raw_assignments_is_dropped(self) -> None:
        payload = base_decision_payload()
        payload["phase1Production"] = {"rawMaterialAssignments": [1, 2]}

        normalized = _normalize_decision_submission(payload)

        self.assertNotIn("phase1Production", normalized)

    def test_phase1_production_non_dict_value_is_dropped(self) -> None:
        payload = base_decision_payload()
        payload["phase1Production"] = "not-a-dict"

        normalized = _normalize_decision_submission(payload)

        self.assertNotIn("phase1Production", normalized)

    def test_legacy_fields_still_normalize_alongside_phase1_production(self) -> None:
        payload = base_decision_payload()
        payload["factoryPlan"]["productionOrders"] = [{"goodsId": "coal", "quantity": 2}]
        payload["governmentPlan"]["pointPurchases"] = [{"pointType": "tech", "quantity": 1}]
        payload["phase1Production"] = {"rawMaterialAssignments": {"handicraft": 5}}

        normalized = _normalize_decision_submission(payload)

        self.assertEqual(
            normalized["factoryPlan"]["productionOrders"],
            [{"goodsId": "coal", "quantity": 2}],
        )
        self.assertEqual(
            normalized["governmentPlan"]["pointPurchases"],
            [{"pointType": "tech", "quantity": 1}],
        )
        self.assertEqual(
            normalized["phase1Production"]["rawMaterialAssignments"],
            {"handicraft": 5},
        )


class MarketPhase1MarketPassthroughTests(unittest.TestCase):
    def test_valid_phase1_market_survives_normalization(self) -> None:
        payload = {
            "saleOrders": [],
            "phase1Market": {
                "domesticAllocation": 5,
                "externalAllocations": [{"marketId": "europe", "quantity": 2}],
                "externalCompetitionDeployments": [
                    {"marketId": "europe", "infantry": 1, "artillery": 0}
                ],
            },
        }

        normalized = _normalize_market_submission(payload)

        self.assertIn("phase1Market", normalized)
        self.assertEqual(normalized["phase1Market"]["domesticAllocation"], 5)
        self.assertEqual(
            normalized["phase1Market"]["externalAllocations"],
            [{"marketId": "europe", "quantity": 2}],
        )
        self.assertEqual(
            normalized["phase1Market"]["externalCompetitionDeployments"],
            [{"marketId": "europe", "infantry": 1, "artillery": 0}],
        )

    def test_zero_domestic_allocation_survives(self) -> None:
        payload = {
            "saleOrders": [],
            "phase1Market": {"domesticAllocation": 0},
        }

        normalized = _normalize_market_submission(payload)

        self.assertIn("phase1Market", normalized)
        self.assertEqual(normalized["phase1Market"]["domesticAllocation"], 0)

    def test_negative_domestic_allocation_is_dropped(self) -> None:
        payload = {
            "saleOrders": [],
            "phase1Market": {"domesticAllocation": -1},
        }

        normalized = _normalize_market_submission(payload)

        self.assertNotIn("phase1Market", normalized)

    def test_missing_domestic_allocation_is_dropped(self) -> None:
        payload = {
            "saleOrders": [],
            "phase1Market": {"externalAllocations": []},
        }

        normalized = _normalize_market_submission(payload)

        self.assertNotIn("phase1Market", normalized)

    def test_non_numeric_domestic_allocation_is_dropped(self) -> None:
        payload = {
            "saleOrders": [],
            "phase1Market": {"domesticAllocation": "5"},
        }

        normalized = _normalize_market_submission(payload)

        self.assertNotIn("phase1Market", normalized)

    def test_phase1_market_non_dict_value_is_dropped(self) -> None:
        payload = {
            "saleOrders": [],
            "phase1Market": ["not", "a", "dict"],
        }

        normalized = _normalize_market_submission(payload)

        self.assertNotIn("phase1Market", normalized)

    def test_legacy_sale_orders_still_normalize_alongside_phase1_market(self) -> None:
        payload = {
            "saleOrders": [
                {"goodsId": "coal", "market": "domestic", "quantity": 3},
            ],
            "phase1Market": {"domesticAllocation": 4},
        }

        normalized = _normalize_market_submission(payload)

        self.assertEqual(
            normalized["saleOrders"],
            [{"goodsId": "coal", "market": "domestic", "quantity": 3}],
        )
        self.assertEqual(normalized["phase1Market"]["domesticAllocation"], 4)


if __name__ == "__main__":
    unittest.main()
