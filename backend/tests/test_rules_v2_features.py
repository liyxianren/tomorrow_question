from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode, GamePhase, PlayerSubmissionStatus, RegionAccessLevel
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import DEFAULT_TEMPORARY_EFFECTS, GameSnapshot, PlayerState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.rules.decision import resolve_decision_phase
from app.modules.rules.market import resolve_market_phase
from app.modules.rules.settlement import resolve_settlement_phase


def build_snapshot(phase: GamePhase) -> GameSnapshot:
    game = create_game(room_code="ROOM01", game_id="game-v2")
    snapshot = create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-v2",
        player_assignments={
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        },
    )
    snapshot.phase = phase
    return snapshot


def get_player(snapshot: GameSnapshot, player_id: str) -> PlayerState:
    return next(player for player in snapshot.player_states if player.player_id == player_id)


def build_turn_input(player_id: str, phase: GamePhase, payload: dict[str, object]) -> PlayerTurnInput:
    return PlayerTurnInput(
        game_id="game-v2",
        round_no=1,
        phase=phase,
        player_id=player_id,
        submission_status=PlayerSubmissionStatus.SUBMITTED,
        payload=payload,
        submitted_at=None,
        is_timeout_generated=False,
    )


class V2FeatureRulesTests(unittest.TestCase):
    def test_settlement_clears_temporary_effects_keeps_phase1_price_drift_disabled_and_draws_events(self) -> None:
        snapshot = build_snapshot(GamePhase.SETTLEMENT)
        britain = get_player(snapshot, "player-1")
        britain.national_income = 12
        britain.domestic_sales_revenue = 6
        britain.overseas_sales_revenue = 6
        britain.goods_allocation = {"grain": 2}
        britain.temporary_effects = {
            "domesticMarketCapacityBonus": 2,
            "domesticPriceBonus": 1,
            "overseasMarketCapacityBonus": 1,
            "productionOutputMultiplier": 2,
        }
        snapshot.event_deck = ["harvest_boom", "trade_winds"]

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])

        updated_britain = get_player(resolution.updated_snapshot, "player-1")
        self.assertEqual(updated_britain.temporary_effects, DEFAULT_TEMPORARY_EFFECTS)
        self.assertNotIn("phase1_goods", resolution.updated_snapshot.market_price_adjustments)
        self.assertEqual(
            [event["eventId"] for event in resolution.updated_snapshot.active_events],
            ["harvest_boom", "trade_winds"],
        )
        self.assertEqual(resolution.updated_snapshot.event_deck, [])

    def test_settlement_advances_ideology_and_unlocks_milestone(self) -> None:
        snapshot = build_snapshot(GamePhase.SETTLEMENT)
        prussia = get_player(snapshot, "player-3")
        prussia.national_income = 20
        prussia.income_allocation_ratio = {
            "domesticMarket": 0.0,
            "factory": 1.0,
            "governmentFiscal": 0.0,
        }
        prussia.ideology_levels["liberalism"] = 4

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])

        updated_prussia = get_player(resolution.updated_snapshot, "player-3")
        self.assertEqual(updated_prussia.ideology_levels["liberalism"], 5)
        self.assertIn("产业自由化", updated_prussia.reforms)

    def test_liberalism_does_not_rise_from_accumulated_factory_budget_without_new_investment(self) -> None:
        snapshot = build_snapshot(GamePhase.SETTLEMENT)
        prussia = get_player(snapshot, "player-3")
        prussia.national_income = 0
        prussia.ideology_levels["liberalism"] = 4
        prussia.budget_pools["factory"] = 200

        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])

        updated_prussia = get_player(resolution.updated_snapshot, "player-3")
        self.assertEqual(updated_prussia.ideology_levels["liberalism"], 3)


if __name__ == "__main__":
    unittest.main()
