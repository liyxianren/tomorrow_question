"""Colonization Full Chain Unit Tests — 明日之问

Tests the complete colonization lifecycle in a single-turn resolution:
  unlock → diplomacy → colonize → loot

Also tests multi-round colonization with different regions.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus, RegionAccessLevel
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot, PlayerState, RegionState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.rules.decision import resolve_decision_phase


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
    snapshot.phase = GamePhase.DECISION
    return snapshot


def get_player(snapshot: GameSnapshot, player_id: str) -> PlayerState:
    return next(player for player in snapshot.player_states if player.player_id == player_id)


def get_region(snapshot: GameSnapshot, region_id: str) -> RegionState:
    return next(region for region in snapshot.region_states if region.region_id == region_id)


def build_turn_input(player_id: str, payload: dict[str, object]) -> PlayerTurnInput:
    return PlayerTurnInput(
        game_id="game-1",
        round_no=1,
        phase=GamePhase.DECISION,
        player_id=player_id,
        submission_status=PlayerSubmissionStatus.SUBMITTED,
        payload=payload,
        submitted_at=None,
        is_timeout_generated=False,
    )


def full_chain_payload(
    *,
    unlock_colonization: bool = False,
    military_actions: list[str] | None = None,
    diplomacy_actions: list[str] | None = None,
    colonization_actions: list[dict] | None = None,
    looting_actions: list[dict] | None = None,
) -> dict[str, object]:
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
            "unlockColonization": unlock_colonization,
            "militaryActions": [{"actionId": a} for a in (military_actions or [])],
            "diplomacyActions": [{"actionId": a} for a in (diplomacy_actions or [])],
            "colonizationActions": colonization_actions or [],
            "navalDeployment": {},
            "conquestActions": [],
            "lootingActions": looting_actions or [],
        },
    }


class ColonizationFullChainSingleTurnTest(unittest.TestCase):
    """Test: unlock + diplomacy + colonize + loot all in one turn."""

    def test_full_chain_single_turn_americas(self) -> None:
        """Britain with enough mp: unlock→diplomacy→colonize in one turn."""
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        balance = get_balance_config()
        colonization_mp_cost = int(balance.military.colonization_military_point_cost)
        unlock_cost = int(balance.military.colonization_unlock_cost)
        britain.military_points = colonization_mp_cost

        # Britain initial: govFiscal=10; set mp to exactly the colonization cost.
        self.assertEqual(britain.budget_pools["governmentFiscal"], 10)
        self.assertEqual(britain.military_points, colonization_mp_cost)

        # Processing order: diplomacy → unlock → colonization
        # establish_americas (3 govFiscal), unlock (balance cost), colonize (mp cost).
        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                full_chain_payload(
                    diplomacy_actions=["establish_americas"],
                    unlock_colonization=True,
                    colonization_actions=[{"targetRegionId": "americas"}],
                ),
            )],
        )

        updated = get_player(resolution.updated_snapshot, "player-1")
        americas = get_region(resolution.updated_snapshot, "americas")

        self.assertTrue(updated.colonization_unlocked, "colonization should be unlocked")
        self.assertIn("americas", updated.established_diplomacy, "diplomacy with americas")
        self.assertEqual(updated.budget_pools["governmentFiscal"], 10 - 3 - unlock_cost)
        self.assertEqual(updated.military_points, 0, "all mp spent on colonization")
        self.assertEqual(americas.controller, "britain", "americas should be british colony")
        self.assertEqual(americas.access_level, RegionAccessLevel.COLONY)

    def test_full_chain_single_turn_then_loot_next_turn(self) -> None:
        """Full chain → then loot in next turn."""
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        americas = get_region(snapshot, "americas")
        britain.military_points = int(get_balance_config().military.colonization_military_point_cost)

        # Turn 1: unlock + diplomacy + colonize
        resolution1 = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                full_chain_payload(
                    diplomacy_actions=["establish_americas"],
                    unlock_colonization=True,
                    colonization_actions=[{"targetRegionId": "americas"}],
                ),
            )],
        )

        updated_britain = get_player(resolution1.updated_snapshot, "player-1")
        americas_after = get_region(resolution1.updated_snapshot, "americas")
        self.assertEqual(americas_after.controller, "britain")

        # Turn 2: loot from americas (reset looted_regions_this_turn)
        snap2 = resolution1.updated_snapshot
        snap2.looted_regions_this_turn = set()

        resolution2 = resolve_decision_phase(
            snapshot=snap2,
            turn_inputs=[build_turn_input(
                "player-1",
                full_chain_payload(
                    looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
                ),
            )],
        )

        final_britain = get_player(resolution2.updated_snapshot, "player-1")
        americas_final = get_region(resolution2.updated_snapshot, "americas")

        self.assertEqual(final_britain.phase1_economy.raw_materials, 26, "should loot 1 cotton (25 initial + 1 looted)")
        self.assertEqual(
            americas_final.resource_limit.get("cotton"),
            americas.resource_limit.get("cotton", 4) - 1,
            "cotton should decrease by 1",
        )
        self.assertIn("americas", resolution2.updated_snapshot.looted_regions_this_turn)

    def test_loot_without_colonization_rejected(self) -> None:
        """Loot attempt without colonizing first → nothing happens."""
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.phase1_economy.raw_materials = 0

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                full_chain_payload(
                    looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
                ),
            )],
        )

        updated = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated.phase1_economy.raw_materials, 0, "no loot without colonization")


class ColonizationMultiRegionTest(unittest.TestCase):
    """Test colonization of different regions."""

    def test_colonize_africa_in_separate_turn(self) -> None:
        """After unlocking, colonize africa (requires mediterranean route)."""
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        balance = get_balance_config()
        britain.military_points = int(balance.military.colonization_military_point_cost)

        # Unlock + diplomacy + colonize africa in one turn
        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                full_chain_payload(
                    diplomacy_actions=["establish_africa"],
                    unlock_colonization=True,
                    colonization_actions=[{"targetRegionId": "africa"}],
                ),
            )],
        )

        updated = get_player(resolution.updated_snapshot, "player-1")
        africa = get_region(resolution.updated_snapshot, "africa")

        self.assertTrue(updated.colonization_unlocked)
        self.assertIn("africa", updated.established_diplomacy)
        self.assertEqual(africa.controller, "britain")

    def test_cannot_colonize_without_diplomacy(self) -> None:
        """Colonization requires diplomacy with target region."""
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.colonization_unlocked = True
        britain.military_points = 10  # plenty of mp

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                full_chain_payload(
                    colonization_actions=[{"targetRegionId": "americas"}],
                ),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertNotEqual(americas.controller, "britain", "should fail without diplomacy")

    def test_cannot_colonize_without_unlock(self) -> None:
        """Colonization requires unlockColonization=True."""
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.established_diplomacy = ["americas"]
        britain.military_points = 10

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                full_chain_payload(
                    diplomacy_actions=[],  # already have diplomacy
                    colonization_actions=[{"targetRegionId": "americas"}],
                ),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertNotEqual(americas.controller, "britain", "should fail without unlock")

    def test_insufficient_mp_blocks_colonization(self) -> None:
        """Not enough military points → colonization silently skipped."""
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.colonization_unlocked = True
        britain.established_diplomacy = ["americas"]
        britain.military_points = 0  # not enough mp (costs 2)

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                full_chain_payload(
                    colonization_actions=[{"targetRegionId": "americas"}],
                ),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        self.assertNotEqual(americas.controller, "britain", "should fail with insufficient mp")


class ColonizationMaxPerRoundTest(unittest.TestCase):
    """maxColonizationsPerRound=1 enforcement."""

    def test_second_colonization_in_same_turn_ignored(self) -> None:
        """Even with enough mp, only 1 colonization per round."""
        snapshot = build_snapshot()
        britain = get_player(snapshot, "player-1")
        britain.colonization_unlocked = True
        britain.established_diplomacy = ["americas", "africa"]
        britain.military_points = 20  # plenty

        resolution = resolve_decision_phase(
            snapshot=snapshot,
            turn_inputs=[build_turn_input(
                "player-1",
                full_chain_payload(
                    colonization_actions=[
                        {"targetRegionId": "americas"},
                        {"targetRegionId": "africa"},
                    ],
                ),
            )],
        )

        americas = get_region(resolution.updated_snapshot, "americas")
        africa = get_region(resolution.updated_snapshot, "africa")

        self.assertEqual(americas.controller, "britain", "first colonization succeeds")
        # Africa should NOT be colonized (max_per_round=1)
        self.assertNotEqual(africa.controller, "britain", "second colonization blocked")


class ColonizationIndependenceIntegrationTest(unittest.TestCase):
    """Verify looted colonies get independence penalty during settlement."""

    def test_looted_colony_gets_independence_penalty(self) -> None:
        from app.modules.rules.settlement import _apply_independence_progression

        snapshot = build_snapshot()
        americas = get_region(snapshot, "americas")
        americas.controller = "britain"
        americas.access_level = RegionAccessLevel.COLONY
        americas.independence = 0
        americas.garrison = {}
        americas.market_supply = {"cotton": 10}
        americas.resource_limit = {"cotton": 10}

        snapshot.looted_regions_this_turn = {"americas"}

        _apply_independence_progression(
            snapshot,
            get_balance_config(),
            looted_regions=set(snapshot.looted_regions_this_turn),
        )

        self.assertEqual(americas.independence, 2, "looted colony gets +2 independence")


if __name__ == "__main__":
    unittest.main()
