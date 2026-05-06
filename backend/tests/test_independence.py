from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, RegionAccessLevel
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, RegionState
from app.modules.rules.settlement import _apply_independence_progression


def build_snapshot() -> GameSnapshot:
    game = create_game(room_code="ROOM01", game_id="game-1")
    snapshot = create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-1",
        player_assignments={
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        },
    )
    snapshot.phase = GamePhase.SETTLEMENT
    return snapshot


def get_region(snapshot: GameSnapshot, region_id: str) -> RegionState:
    return next(region for region in snapshot.region_states if region.region_id == region_id)


def setup_colony(
    snapshot: GameSnapshot,
    *,
    region_id: str = "americas",
    controller: str = "britain",
    independence: int = 0,
    garrison: dict[str, int] | None = None,
    market_supply: dict[str, int] | None = None,
    resource_limit: dict[str, int] | None = None,
    access_level: RegionAccessLevel = RegionAccessLevel.COLONY,
) -> RegionState:
    region = get_region(snapshot, region_id)
    region.controller = controller
    region.access_level = access_level
    region.independence = independence
    region.garrison = dict(garrison or {})
    if market_supply is not None:
        region.market_supply = dict(market_supply)
    if resource_limit is not None:
        region.resource_limit = dict(resource_limit)
    return region


class IndependenceProgressionTests(unittest.TestCase):
    def test_balanced_market_no_garrison_independence_stable(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        setup_colony(
            snapshot,
            independence=3,
            garrison={},
            market_supply={"foo": 10},
            resource_limit={"foo": 10},
        )

        _apply_independence_progression(snapshot, balance, looted_regions=set())

        region = get_region(snapshot, "americas")
        self.assertEqual(region.independence, 3)
        self.assertEqual(region.controller, "britain")

    def test_empty_market_supply_does_not_create_passive_revolt_pressure(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        setup_colony(
            snapshot,
            independence=8,
            garrison={},
            market_supply={},
            resource_limit={"cotton": 4, "grain": 4},
        )

        logs = _apply_independence_progression(snapshot, balance, looted_regions=set())

        region = get_region(snapshot, "americas")
        self.assertEqual(region.independence, 8)
        self.assertEqual(region.controller, "britain")
        self.assertEqual(logs, [])

    def test_mild_market_imbalance_increases_independence_by_one(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        setup_colony(
            snapshot,
            independence=2,
            garrison={},
            market_supply={"foo": 15},
            resource_limit={"foo": 10},
        )

        _apply_independence_progression(snapshot, balance, looted_regions=set())

        region = get_region(snapshot, "americas")
        self.assertEqual(region.independence, 3)
        self.assertEqual(region.market_supply, {})

    def test_market_supply_only_counts_for_current_settlement(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        setup_colony(
            snapshot,
            independence=2,
            garrison={},
            market_supply={"foo": 30},
            resource_limit={"foo": 10},
        )

        _apply_independence_progression(snapshot, balance, looted_regions=set())
        _apply_independence_progression(snapshot, balance, looted_regions=set())

        region = get_region(snapshot, "americas")
        self.assertEqual(region.independence, 4)

    def test_severe_market_imbalance_increases_independence_by_two(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        setup_colony(
            snapshot,
            independence=2,
            garrison={},
            market_supply={"foo": 30},
            resource_limit={"foo": 10},
        )

        _apply_independence_progression(snapshot, balance, looted_regions=set())

        region = get_region(snapshot, "americas")
        self.assertEqual(region.independence, 4)

    def test_garrison_decreases_independence(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        setup_colony(
            snapshot,
            independence=5,
            garrison={"infantry": 2},
            market_supply={"foo": 10},
            resource_limit={"foo": 10},
        )

        _apply_independence_progression(snapshot, balance, looted_regions=set())

        region = get_region(snapshot, "americas")
        self.assertEqual(region.independence, 3)

    def test_looting_increases_independence_by_two(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        setup_colony(
            snapshot,
            independence=0,
            garrison={},
            market_supply={"foo": 10},
            resource_limit={"foo": 10},
        )

        _apply_independence_progression(snapshot, balance, looted_regions={"americas"})

        region = get_region(snapshot, "americas")
        self.assertEqual(region.independence, 2)

    def test_revolt_at_threshold_resets_region(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        setup_colony(
            snapshot,
            independence=8,
            garrison={"infantry": 0},
            market_supply={"foo": 30},
            resource_limit={"foo": 10},
            access_level=RegionAccessLevel.COLONY,
        )

        logs = _apply_independence_progression(snapshot, balance, looted_regions=set())

        region = get_region(snapshot, "americas")
        self.assertIsNone(region.controller)
        self.assertEqual(region.garrison, {})
        self.assertEqual(region.independence, 0)
        self.assertEqual(region.access_level, RegionAccessLevel.CONCESSION)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["kind"], "settlement.region_revolt")
        self.assertEqual(logs[0]["details"]["regionId"], "americas")
        self.assertEqual(logs[0]["details"]["previousController"], "britain")

    def test_independence_never_goes_below_zero(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        setup_colony(
            snapshot,
            independence=1,
            garrison={"infantry": 5, "artillery": 3},
            market_supply={"foo": 10},
            resource_limit={"foo": 10},
        )

        _apply_independence_progression(snapshot, balance, looted_regions=set())

        region = get_region(snapshot, "americas")
        self.assertEqual(region.independence, 0)

    def test_uncontrolled_region_independence_stays_zero(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        region = get_region(snapshot, "americas")
        region.controller = None
        region.independence = 7
        region.garrison = {}
        region.market_supply = {"foo": 30}
        region.resource_limit = {"foo": 10}

        _apply_independence_progression(snapshot, balance, looted_regions={"americas"})

        region = get_region(snapshot, "americas")
        self.assertIsNone(region.controller)
        self.assertEqual(region.independence, 0)

    def test_garrison_suppresses_looting_penalty(self) -> None:
        snapshot = build_snapshot()
        balance = get_balance_config()
        setup_colony(
            snapshot,
            independence=4,
            garrison={"infantry": 2},
            market_supply={"foo": 10},
            resource_limit={"foo": 10},
        )

        _apply_independence_progression(snapshot, balance, looted_regions={"americas"})

        region = get_region(snapshot, "americas")
        self.assertEqual(region.independence, 4)


if __name__ == "__main__":
    unittest.main()
