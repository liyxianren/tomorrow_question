from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, RegionAccessLevel
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.market_access import (
    is_region_accessible,
    region_lock_reason,
)
from app.modules.game_state.workspaces import build_market_player_workspace


def _build_snapshot():
    game = create_game(room_code="ROOM01", game_id="game-lock-reason")
    return create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-lock-reason",
        player_assignments={
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        },
    )


class RegionLockReasonTests(unittest.TestCase):
    def test_open_region_with_no_blockade_returns_none(self) -> None:
        self.assertIsNone(
            region_lock_reason(
                RegionAccessLevel.OPEN,
                region_id="europe",
                established_diplomacy=[],
                route_blocked=False,
            )
        )

    def test_concession_without_diplomacy_returns_diplomacy_not_established(self) -> None:
        self.assertEqual(
            region_lock_reason(
                RegionAccessLevel.CONCESSION,
                region_id="africa",
                established_diplomacy=[],
                route_blocked=False,
            ),
            "diplomacy_not_established",
        )

    def test_colony_without_diplomacy_returns_diplomacy_not_established(self) -> None:
        self.assertEqual(
            region_lock_reason(
                RegionAccessLevel.COLONY,
                region_id="americas",
                established_diplomacy=[],
                route_blocked=False,
            ),
            "diplomacy_not_established",
        )

    def test_concession_with_diplomacy_returns_none(self) -> None:
        self.assertIsNone(
            region_lock_reason(
                RegionAccessLevel.CONCESSION,
                region_id="africa",
                established_diplomacy=["africa"],
                route_blocked=False,
            )
        )

    def test_open_region_with_blockade_returns_route_blocked(self) -> None:
        self.assertEqual(
            region_lock_reason(
                RegionAccessLevel.OPEN,
                region_id="europe",
                established_diplomacy=[],
                route_blocked=True,
            ),
            "route_blocked",
        )

    def test_concession_with_diplomacy_but_blockade_returns_route_blocked(self) -> None:
        self.assertEqual(
            region_lock_reason(
                RegionAccessLevel.CONCESSION,
                region_id="africa",
                established_diplomacy=["africa"],
                route_blocked=True,
            ),
            "route_blocked",
        )

    def test_diplomacy_takes_precedence_over_route_blocked(self) -> None:
        # If you can't enter the region at all, blockade is moot — show the
        # actionable reason (establish diplomacy first).
        self.assertEqual(
            region_lock_reason(
                RegionAccessLevel.CONCESSION,
                region_id="africa",
                established_diplomacy=[],
                route_blocked=True,
            ),
            "diplomacy_not_established",
        )

    def test_is_region_accessible_remains_true_for_open(self) -> None:
        self.assertTrue(
            is_region_accessible(
                RegionAccessLevel.OPEN,
                military_points=0,
                region_id="europe",
                established_diplomacy=[],
            )
        )

    def test_is_region_accessible_remains_false_for_concession_without_diplomacy(self) -> None:
        self.assertFalse(
            is_region_accessible(
                RegionAccessLevel.CONCESSION,
                military_points=0,
                region_id="africa",
                established_diplomacy=[],
            )
        )


class MarketWorkspaceLockReasonTests(unittest.TestCase):
    def test_workspace_region_status_includes_lock_reason_field(self) -> None:
        snapshot = _build_snapshot()
        britain = next(p for p in snapshot.player_states if p.player_id == "player-1")

        workspace = build_market_player_workspace(snapshot, britain)
        for status in workspace["regionAccessStatus"]:
            self.assertIn("lockReason", status)

    def test_workspace_open_region_has_no_lock_reason(self) -> None:
        snapshot = _build_snapshot()
        britain = next(p for p in snapshot.player_states if p.player_id == "player-1")

        workspace = build_market_player_workspace(snapshot, britain)
        europe = next(s for s in workspace["regionAccessStatus"] if s["regionId"] == "europe")

        self.assertTrue(europe["isAccessible"])
        self.assertIsNone(europe["lockReason"])

    def test_workspace_concession_region_without_diplomacy_reports_diplomacy_lock(self) -> None:
        snapshot = _build_snapshot()
        britain = next(p for p in snapshot.player_states if p.player_id == "player-1")

        workspace = build_market_player_workspace(snapshot, britain)
        africa = next(s for s in workspace["regionAccessStatus"] if s["regionId"] == "africa")

        self.assertFalse(africa["isAccessible"])
        self.assertEqual(africa["lockReason"], "diplomacy_not_established")

    def test_workspace_route_blockade_reports_route_blocked(self) -> None:
        snapshot = _build_snapshot()
        britain = next(p for p in snapshot.player_states if p.player_id == "player-1")
        # Establish diplomacy with americas so the only remaining lock is the route.
        britain.established_diplomacy = ["americas"]
        # Blockade an ocean node required by americas with a non-British controller.
        for node in snapshot.ocean_node_states:
            if node.node_id == "north_atlantic":
                node.is_blockaded = True
                node.controller = CountryCode.FRANCE.value
                break

        workspace = build_market_player_workspace(snapshot, britain)
        americas = next(s for s in workspace["regionAccessStatus"] if s["regionId"] == "americas")

        self.assertFalse(americas["isAccessible"])
        self.assertEqual(americas["lockReason"], "route_blocked")


if __name__ == "__main__":
    unittest.main()
