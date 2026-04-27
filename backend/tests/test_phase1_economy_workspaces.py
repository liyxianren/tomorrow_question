"""M3b tests: per-player workspaces expose a read-only `phase1Economy` block.

These tests prove that the new phase-1 economy state on PlayerState is mirrored
into the decision/market/settlement workspace player payloads, side-by-side
with legacy fields. The block must be a read-only mirror — mutating the
returned workspace must not mutate PlayerState.phase1_economy.

References:
- backend/app/modules/game_state/workspaces.py (M3b)
- backend/app/modules/game_state/models.py (Phase1EconomyState)
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.workspaces import (
    build_decision_player_workspace,
    build_market_player_workspace,
    build_settlement_player_workspace,
)


def _build_snapshot():
    game = create_game(room_code="ROOM01", game_id="game-phase1-ws")
    return create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-phase1-ws",
        player_assignments={
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        },
    )


def _get_player(snapshot, player_id):
    return next(p for p in snapshot.player_states if p.player_id == player_id)


class DecisionWorkspacePhase1EconomyTests(unittest.TestCase):
    def test_decision_workspace_exposes_phase1_economy_with_capacity_by_mode(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")

        workspace = build_decision_player_workspace(snapshot, britain)

        self.assertIn("phase1Economy", workspace)
        phase1 = workspace["phase1Economy"]
        self.assertIn("capacityByMode", phase1)
        self.assertEqual(
            set(phase1["capacityByMode"].keys()),
            {"idle", "handicraft", "mechanized", "steam", "electrified"},
        )
        # Initial seeding: capacity_by_mode is seeded from baseline production
        # capacity (e.g. handicraft > 0 for at least one country baseline).
        self.assertEqual(
            phase1["capacityByMode"], britain.phase1_economy.to_payload()["capacityByMode"]
        )
        # Raw materials are seeded by the factory so the phase-1 production loop
        # has something to consume on round 1.
        self.assertEqual(phase1["rawMaterials"], britain.phase1_economy.raw_materials)
        self.assertEqual(phase1["goodsInventory"], 0)

    def test_decision_workspace_keeps_legacy_fields(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")

        workspace = build_decision_player_workspace(snapshot, britain)

        # Legacy fields must remain — phase1Economy is additive, not a swap.
        self.assertIn("budgetPools", workspace)
        self.assertIn("incomeAllocationRatio", workspace)
        self.assertIn("productionOptions", workspace)
        self.assertIn("phase1Economy", workspace)

    def test_decision_workspace_phase1_economy_is_read_only_mirror(self) -> None:
        snapshot = _build_snapshot()
        britain = _get_player(snapshot, "player-1")
        original_capacity = dict(britain.phase1_economy.capacity_by_mode)
        original_raw = britain.phase1_economy.raw_materials

        workspace = build_decision_player_workspace(snapshot, britain)
        workspace["phase1Economy"]["capacityByMode"]["handicraft"] = 999
        workspace["phase1Economy"]["rawMaterials"] = 999

        self.assertEqual(britain.phase1_economy.capacity_by_mode, original_capacity)
        self.assertEqual(britain.phase1_economy.raw_materials, original_raw)


class MarketWorkspacePhase1EconomyTests(unittest.TestCase):
    def test_market_workspace_exposes_phase1_economy(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.MARKET
        britain = _get_player(snapshot, "player-1")

        workspace = build_market_player_workspace(snapshot, britain)

        self.assertIn("phase1Economy", workspace)
        self.assertEqual(
            set(workspace["phase1Economy"]["capacityByMode"].keys()),
            {"idle", "handicraft", "mechanized", "steam", "electrified"},
        )

    def test_market_workspace_keeps_legacy_sellable_inventory_and_capacities(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.MARKET
        britain = _get_player(snapshot, "player-1")
        britain.goods_stock["grain"] = 3

        workspace = build_market_player_workspace(snapshot, britain)

        self.assertIn("sellableInventory", workspace)
        self.assertIn("domesticMarketCapacity", workspace)
        self.assertIn("overseasMarketCapacity", workspace)
        self.assertIn("phase1Economy", workspace)
        self.assertTrue(any(item["goodsId"] == "grain" for item in workspace["sellableInventory"]))

    def test_market_workspace_phase1_economy_is_read_only_mirror(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.MARKET
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 5
        britain.phase1_economy.capacity_by_mode["mechanized"] = 2
        original_capacity = dict(britain.phase1_economy.capacity_by_mode)

        workspace = build_market_player_workspace(snapshot, britain)
        workspace["phase1Economy"]["capacityByMode"]["mechanized"] = 999
        workspace["phase1Economy"]["rawMaterials"] = 999

        self.assertEqual(britain.phase1_economy.capacity_by_mode, original_capacity)
        self.assertEqual(britain.phase1_economy.raw_materials, 5)


class SettlementWorkspacePhase1EconomyTests(unittest.TestCase):
    def test_settlement_workspace_exposes_phase1_economy(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.SETTLEMENT
        britain = _get_player(snapshot, "player-1")

        workspace = build_settlement_player_workspace(snapshot, britain)

        self.assertIn("phase1Economy", workspace)
        self.assertEqual(
            set(workspace["phase1Economy"]["capacityByMode"].keys()),
            {"idle", "handicraft", "mechanized", "steam", "electrified"},
        )

    def test_settlement_workspace_keeps_legacy_settlement_fields(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.SETTLEMENT
        britain = _get_player(snapshot, "player-1")
        britain.national_income = 100

        workspace = build_settlement_player_workspace(snapshot, britain)

        self.assertIn("budgetAllocation", workspace)
        self.assertIn("nextRatio", workspace)
        self.assertIn("nationalIncome", workspace)
        self.assertEqual(workspace["nationalIncome"], 100)
        self.assertIn("phase1Economy", workspace)

    def test_settlement_workspace_phase1_economy_is_read_only_mirror(self) -> None:
        snapshot = _build_snapshot()
        snapshot.phase = GamePhase.SETTLEMENT
        britain = _get_player(snapshot, "player-1")
        britain.phase1_economy.goods_inventory = 4
        original_inventory = britain.phase1_economy.goods_inventory

        workspace = build_settlement_player_workspace(snapshot, britain)
        workspace["phase1Economy"]["goodsInventory"] = 999
        workspace["phase1Economy"]["capacityByMode"]["steam"] = 999

        self.assertEqual(britain.phase1_economy.goods_inventory, original_inventory)
        self.assertEqual(britain.phase1_economy.capacity_by_mode["steam"], 0)


if __name__ == "__main__":
    unittest.main()
