"""M3a tests: phase-1 economy persistence + initial-snapshot seeding.

These tests prove that:
  (1) the SQLite snapshot normalization roundtrip preserves the new
      ``phase1Economy`` payload per player (mutated values survive a
      save/load cycle through SnapshotRepository);
  (2) a legacy v2 payload missing ``phase1Economy`` still normalizes to a
      default phase1 economy without crashing;
  (3) ``create_initial_snapshot`` seeds ``phase1_economy.capacity_by_mode``
      from the existing balance baseline ``production_capacity`` (raw
      materials and goods inventory remain at zero, since the current docs
      do not define non-zero 2.0 starting values).
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import (
    DEFAULT_PHASE1_CAPACITY_BY_MODE,
    DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO,
    DEFAULT_PHASE1_MARKET_METRICS,
)
from app.modules.persistence import (
    SnapshotRepository,
    connect_database,
    initialize_database,
)


def _build_initial_snapshot_payload(snapshot_id: str = "snapshot-1") -> dict:
    game = create_game(room_code="ROOM01", game_id="game-1")
    snapshot = create_initial_snapshot(
        game=game,
        snapshot_id=snapshot_id,
        player_assignments={
            "player-britain": CountryCode.BRITAIN,
            "player-france": CountryCode.FRANCE,
            "player-prussia": CountryCode.PRUSSIA,
            "player-austria": CountryCode.AUSTRIA,
            "player-russia": CountryCode.RUSSIA,
        },
        phase_deadline_at=datetime(2026, 4, 27, 12, 0, tzinfo=UTC),
    )
    return snapshot.to_payload()


class SnapshotPersistencePhase1EconomyTests(unittest.TestCase):
    """Snapshot save/load roundtrip must retain ``phase1Economy`` payload."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "test.sqlite3"
        self.connection = connect_database(self.database_path)
        initialize_database(self.connection)
        self.snapshot_repository = SnapshotRepository(self.connection)

    def tearDown(self) -> None:
        self.connection.close()
        self.temp_dir.cleanup()

    def test_snapshot_roundtrip_preserves_phase1_economy_mutations(self) -> None:
        snapshot_payload = _build_initial_snapshot_payload()
        britain_state = snapshot_payload["nationalStateByPlayer"]["player-britain"]
        britain_state["phase1Economy"]["rawMaterials"] = 12
        britain_state["phase1Economy"]["goodsInventory"] = 7
        britain_state["phase1Economy"]["capacityByMode"]["handicraft"] = 5
        britain_state["phase1Economy"]["capacityByMode"]["mechanized"] = 2
        britain_state["phase1Economy"]["marketMetrics"]["demand"] = 70
        britain_state["phase1Economy"]["marketMetrics"]["finalPrice"] = 12.5
        britain_state["phase1Economy"]["incomeAllocationRatio"]["consumption"] = 0.5

        self.snapshot_repository.save(snapshot_payload)
        loaded = self.snapshot_repository.get("snapshot-1")

        self.assertIsNotNone(loaded)
        loaded_phase1 = loaded["nationalStateByPlayer"]["player-britain"]["phase1Economy"]
        self.assertEqual(loaded_phase1["rawMaterials"], 12)
        self.assertEqual(loaded_phase1["goodsInventory"], 7)
        self.assertEqual(loaded_phase1["capacityByMode"]["handicraft"], 5)
        self.assertEqual(loaded_phase1["capacityByMode"]["mechanized"], 2)
        self.assertEqual(loaded_phase1["marketMetrics"]["demand"], 70)
        self.assertAlmostEqual(loaded_phase1["marketMetrics"]["finalPrice"], 12.5, places=6)
        self.assertEqual(loaded_phase1["incomeAllocationRatio"]["consumption"], 0.5)

    def test_legacy_payload_without_phase1_economy_normalizes_to_default(self) -> None:
        snapshot_payload = _build_initial_snapshot_payload()
        for player_state in snapshot_payload["nationalStateByPlayer"].values():
            player_state.pop("phase1Economy", None)

        self.snapshot_repository.save(snapshot_payload)
        loaded = self.snapshot_repository.get("snapshot-1")

        self.assertIsNotNone(loaded)
        for player_state in loaded["nationalStateByPlayer"].values():
            self.assertIn("phase1Economy", player_state)
            phase1 = player_state["phase1Economy"]
            self.assertEqual(phase1["rawMaterials"], 0)
            self.assertEqual(phase1["goodsInventory"], 0)
            self.assertEqual(
                set(phase1["capacityByMode"].keys()),
                set(DEFAULT_PHASE1_CAPACITY_BY_MODE.keys()),
            )
            self.assertEqual(
                phase1["marketMetrics"],
                {**DEFAULT_PHASE1_MARKET_METRICS, **phase1["marketMetrics"]},
            )
            self.assertEqual(
                phase1["incomeAllocationRatio"],
                DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO,
            )


class InitialSnapshotPhase1EconomySeedingTests(unittest.TestCase):
    """``create_initial_snapshot`` should seed phase-1 capacity from baseline."""

    def test_capacity_by_mode_is_seeded_from_balance_baseline(self) -> None:
        balance_config = get_balance_config()
        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={
                "player-britain": CountryCode.BRITAIN,
                "player-france": CountryCode.FRANCE,
                "player-prussia": CountryCode.PRUSSIA,
                "player-austria": CountryCode.AUSTRIA,
                "player-russia": CountryCode.RUSSIA,
            },
        )

        for player_state in snapshot.player_states:
            baseline = balance_config.countries[player_state.country.value]
            expected_capacity = {
                "idle": 0,
                "handicraft": 0,
                "mechanized": 0,
                "steam": 0,
                "electrified": 0,
            }
            for mode, value in baseline.production_capacity.items():
                expected_capacity[mode] = int(value)
            self.assertEqual(
                player_state.phase1_economy.capacity_by_mode,
                expected_capacity,
                f"capacity_by_mode for {player_state.country.value} must mirror baseline",
            )

    def test_capacity_by_mode_matches_legacy_production_capacity_for_known_country(self) -> None:
        # Britain baseline has handicraft=8 in production.json.
        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={
                "player-britain": CountryCode.BRITAIN,
                "player-france": CountryCode.FRANCE,
                "player-prussia": CountryCode.PRUSSIA,
                "player-austria": CountryCode.AUSTRIA,
                "player-russia": CountryCode.RUSSIA,
            },
        )
        britain = next(p for p in snapshot.player_states if p.country == CountryCode.BRITAIN)
        self.assertEqual(britain.phase1_economy.capacity_by_mode["handicraft"], 8)
        self.assertEqual(britain.phase1_economy.capacity_by_mode["idle"], 0)
        self.assertEqual(britain.phase1_economy.capacity_by_mode["mechanized"], 0)
        self.assertEqual(britain.phase1_economy.capacity_by_mode["steam"], 0)
        self.assertEqual(britain.phase1_economy.capacity_by_mode["electrified"], 0)
        # The seeded phase-1 capacity must equal the legacy production_capacity.
        self.assertEqual(
            britain.phase1_economy.capacity_by_mode,
            britain.production_capacity,
        )

    def test_initial_snapshot_seeds_raw_materials_and_keeps_goods_inventory_at_zero(self) -> None:
        balance_config = get_balance_config()
        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={
                "player-britain": CountryCode.BRITAIN,
                "player-france": CountryCode.FRANCE,
                "player-prussia": CountryCode.PRUSSIA,
                "player-austria": CountryCode.AUSTRIA,
                "player-russia": CountryCode.RUSSIA,
            },
        )

        for player_state in snapshot.player_states:
            # Initial raw materials seeded from the country balance config so
            # the phase-1 production loop has something to consume on round 1.
            expected_raw = int(
                balance_config.countries[player_state.country.value].initial_raw_materials
            )
            self.assertEqual(
                player_state.phase1_economy.raw_materials,
                expected_raw,
            )
            self.assertEqual(player_state.phase1_economy.goods_inventory, 0)
            self.assertEqual(
                player_state.phase1_economy.income_allocation_ratio,
                DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO,
            )

    def test_initial_snapshot_payload_exposes_seeded_capacity_by_mode(self) -> None:
        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game,
            snapshot_id="snapshot-1",
            player_assignments={
                "player-britain": CountryCode.BRITAIN,
                "player-france": CountryCode.FRANCE,
                "player-prussia": CountryCode.PRUSSIA,
                "player-austria": CountryCode.AUSTRIA,
                "player-russia": CountryCode.RUSSIA,
            },
        )
        payload = snapshot.to_payload()
        britain_payload = payload["nationalStateByPlayer"]["player-britain"]
        self.assertEqual(
            britain_payload["phase1Economy"]["capacityByMode"]["handicraft"],
            8,
        )


if __name__ == "__main__":
    unittest.main()
