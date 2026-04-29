from __future__ import annotations

import sys
import unittest
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode
from app.modules.game_state.factory import create_initial_snapshot
from app.modules.game_state.models import Game, GameSnapshot, OceanNodeState


class OceanNodeStateTests(unittest.TestCase):
    def test_default_values(self) -> None:
        node = OceanNodeState(node_id="north_atlantic")

        self.assertEqual(node.node_id, "north_atlantic")
        self.assertEqual(node.navy_by_country, {})
        self.assertIsNone(node.controller)
        self.assertFalse(node.is_blockaded)
        self.assertEqual(node.reachable_routes, [])
        self.assertEqual(node.total_power(), 0)

    def test_total_power_sums_navy_by_country(self) -> None:
        node = OceanNodeState(
            node_id="north_atlantic",
            navy_by_country={"britain": 3, "france": 2, "prussia": 0},
        )

        self.assertEqual(node.total_power(), 5)

    def test_snapshot_roundtrip_preserves_ocean_node_states(self) -> None:
        game = Game(game_id="game-1", room_code="ROOM1")
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
            phase_deadline_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
        )

        self.assertGreater(len(snapshot.ocean_node_states), 0)
        first_node = snapshot.ocean_node_states[0]
        first_node.navy_by_country["britain"] = 4
        first_node.navy_by_country["france"] = 2
        first_node.controller = "player-britain"
        first_node.is_blockaded = True

        payload = snapshot.to_payload()
        restored = GameSnapshot.from_payload(payload)

        self.assertEqual(
            [node.node_id for node in restored.ocean_node_states],
            [node.node_id for node in snapshot.ocean_node_states],
        )
        restored_first = restored.ocean_node_states[0]
        self.assertEqual(restored_first.navy_by_country["britain"], 4)
        self.assertEqual(restored_first.navy_by_country["france"], 2)
        self.assertEqual(restored_first.controller, "player-britain")
        self.assertTrue(restored_first.is_blockaded)
        self.assertEqual(restored_first.total_power(), 6)


if __name__ == "__main__":
    unittest.main()
