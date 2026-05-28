from __future__ import annotations

import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import ErrorCode, GamePhase, PlayerSubmissionStatus
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.phase_deadline import assign_phase_deadline, calculate_phase_deadline
from app.modules.game_state.phase_state import PhaseSubmissionState
from app.modules.room.service import create_room
from app.modules.settlement.phase_submission import (
    PhaseSubmissionError,
    PhaseSubmissionService,
    build_timeout_player_turn_input,
)


def build_room():
    room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
    room.members.extend(
        [
            room.members[0].__class__(player_id="player-2", nickname="Linus"),
            room.members[0].__class__(player_id="player-3", nickname="Grace"),
            room.members[0].__class__(player_id="player-4", nickname="Margaret"),
            room.members[0].__class__(player_id="player-5", nickname="Donald"),
        ]
    )
    return room


def build_snapshot():
    game = create_game(room_code="ROOM01", game_id="game-1")
    snapshot = create_initial_snapshot(
        game=game,
        snapshot_id="snapshot-1",
        player_assignments={
            "player-1": "britain",
            "player-2": "france",
            "player-3": "prussia",
            "player-4": "austria",
            "player-5": "russia",
        },
    )
    return game, snapshot


def empty_decision_payload() -> dict[str, object]:
    return {
        "factoryPlan": {
            "productionOrders": [],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
            "rawMaterialPurchaseQuantity": 0,
            "factoryActions": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {
            "adminPurchases": 0,
        },
        "militaryPlan": {
            "militaryActions": [],
            "diplomacyActions": [],
            "colonizationActions": [],
            "navalDeployment": {},
            "regionBlockades": {},
        },
        "talentPlan": {"talentUnlocks": []},
    }


class PhaseSubmissionServiceTests(unittest.TestCase):
    def test_standard_submission_builds_player_turn_input_and_updates_state(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )
        phase_state = PhaseSubmissionState.from_snapshot(snapshot)

        payload = empty_decision_payload()
        payload["factoryPlan"]["productionOrders"] = [{"goodsId": "phase1_goods", "quantity": 1}]

        service = PhaseSubmissionService()
        result = service.submit(
            room=room,
            game=game,
            snapshot=snapshot,
            phase_state=phase_state,
            player_id="player-1",
            requested_phase=GamePhase.DECISION,
            payload=payload,
            submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
        )

        self.assertEqual(result.player_turn_input.game_id, "game-1")
        self.assertEqual(result.player_turn_input.round_no, 1)
        self.assertEqual(result.player_turn_input.phase, GamePhase.DECISION)
        self.assertEqual(result.player_turn_input.player_id, "player-1")
        self.assertEqual(result.player_turn_input.submission_status, PlayerSubmissionStatus.SUBMITTED)
        self.assertEqual(
            result.player_turn_input.payload["factoryPlan"]["productionOrders"],
            [{"goodsId": "phase1_goods", "quantity": 1}],
        )
        self.assertEqual(result.player_turn_input.payload["militaryPlan"]["unlockColonization"], False)
        self.assertEqual(result.player_turn_input.payload["militaryPlan"]["colonizationActions"], [])
        self.assertFalse(result.player_turn_input.is_timeout_generated)
        self.assertEqual(result.updated_phase_state.submission_status_by_player_id["player-1"], PlayerSubmissionStatus.SUBMITTED)

    def test_decision_submission_validation_uses_active_event_resource_preview(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")
        britain.budget_pools["governmentFiscal"] = 0
        snapshot.active_events = [
            {
                "eventId": "militia_drive",
                "label": "民兵动员",
                "effects": {"governmentFiscalDelta": 5},
            }
        ]
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        payload = empty_decision_payload()
        payload["militaryPlan"]["militaryActions"] = [{"actionId": "recruit_army"}]

        result = PhaseSubmissionService().submit(
            room=room,
            game=game,
            snapshot=snapshot,
            phase_state=PhaseSubmissionState.from_snapshot(snapshot),
            player_id="player-1",
            requested_phase=GamePhase.DECISION,
            payload=payload,
            submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
        )

        self.assertEqual(
            result.player_turn_input.payload["militaryPlan"]["militaryActions"],
            [{"actionId": "recruit_army"}],
        )
        self.assertEqual(
            britain.budget_pools["governmentFiscal"],
            0,
            "submission validation must not consume active events early",
        )

    def test_decision_submission_preserves_admin_purchase_quantity(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        payload = empty_decision_payload()
        payload["governmentPlan"]["adminPurchases"] = 1

        result = PhaseSubmissionService().submit(
            room=room,
            game=game,
            snapshot=snapshot,
            phase_state=PhaseSubmissionState.from_snapshot(snapshot),
            player_id="player-1",
            requested_phase=GamePhase.DECISION,
            payload=payload,
            submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
        )

        self.assertEqual(result.player_turn_input.payload["governmentPlan"]["adminPurchases"], 1)

    def test_submit_rejects_phase_mismatch(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=PhaseSubmissionState.from_snapshot(snapshot),
                player_id="player-1",
                requested_phase=GamePhase.MARKET,
                payload={},
                submitted_at=datetime(2026, 3, 29, 12, 0, 30, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.PHASE_MISMATCH)

    def test_submit_rejects_duplicate_submission(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )
        phase_state = PhaseSubmissionState.from_snapshot(snapshot)
        first_payload = empty_decision_payload()
        first_payload["factoryPlan"]["productionOrders"] = [{"goodsId": "phase1_goods", "quantity": 1}]
        first = PhaseSubmissionService().submit(
            room=room,
            game=game,
            snapshot=snapshot,
            phase_state=phase_state,
            player_id="player-1",
            requested_phase=GamePhase.DECISION,
            payload=first_payload,
            submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
        )

        second_payload = empty_decision_payload()
        second_payload["factoryPlan"]["productionOrders"] = [{"goodsId": "phase1_goods", "quantity": 2}]
        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=first.updated_phase_state,
                player_id="player-1",
                requested_phase=GamePhase.DECISION,
                payload=second_payload,
                submitted_at=datetime(2026, 3, 29, 12, 1, 30, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.ALREADY_SUBMITTED)

    def test_submit_rejects_phase1_production_over_factory_budget(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")
        britain.budget_pools["factory"] = 2
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        payload = empty_decision_payload()
        payload["phase1Production"] = {"rawMaterialAssignments": {"handicraft": 8}}

        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=PhaseSubmissionState.from_snapshot(snapshot),
                player_id="player-1",
                requested_phase=GamePhase.DECISION,
                payload=payload,
                submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.INVALID_SUBMISSION)
        self.assertIn("工厂预算超支", error.exception.details["reason"])

    def test_submit_rejects_factory_upgrade_before_route_research(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        britain = next(player for player in snapshot.player_states if player.player_id == "player-1")
        britain.budget_pools["factory"] = 100
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        payload = empty_decision_payload()
        payload["factoryPlan"]["upgradeOrders"] = [{"routeId": "mechanized", "quantity": 1}]

        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=PhaseSubmissionState.from_snapshot(snapshot),
                player_id="player-1",
                requested_phase=GamePhase.DECISION,
                payload=payload,
                submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.INVALID_SUBMISSION)
        self.assertIn("requires route technology", str(error.exception))

    def test_submit_rejects_after_deadline(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=PhaseSubmissionState.from_snapshot(snapshot),
                player_id="player-1",
                requested_phase=GamePhase.DECISION,
                payload={},
                submitted_at=datetime(2026, 3, 29, 12, 2, 1, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.DEADLINE_PASSED)

    def test_submit_rejects_non_member(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=PhaseSubmissionState.from_snapshot(snapshot),
                player_id="outsider",
                requested_phase=GamePhase.DECISION,
                payload={},
                submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.NOT_ROOM_MEMBER)

    def test_timeout_auto_submit_generates_empty_inputs_for_pending_players(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )
        service = PhaseSubmissionService()
        submitted_payload = empty_decision_payload()
        submitted_payload["factoryPlan"]["productionOrders"] = [{"goodsId": "phase1_goods", "quantity": 1}]
        submitted = service.submit(
            room=room,
            game=game,
            snapshot=snapshot,
            phase_state=PhaseSubmissionState.from_snapshot(snapshot),
            player_id="player-1",
            requested_phase=GamePhase.DECISION,
            payload=submitted_payload,
            submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
        )

        generated = service.auto_submit_timeouts(
            snapshot=snapshot,
            phase_state=submitted.updated_phase_state,
            triggered_at=datetime(2026, 3, 29, 12, 2, 1, tzinfo=UTC),
        )

        self.assertEqual(len(generated.generated_inputs), 4)
        self.assertEqual(
            {item.player_id for item in generated.generated_inputs},
            {"player-2", "player-3", "player-4", "player-5"},
        )
        for item in generated.generated_inputs:
            self.assertEqual(item.submission_status, PlayerSubmissionStatus.TIMEOUT_AUTO_SUBMITTED)
            self.assertEqual(item.payload, empty_decision_payload())
            self.assertTrue(item.is_timeout_generated)
        self.assertTrue(generated.updated_phase_state.all_players_submitted)

    def test_build_timeout_player_turn_input_marks_timeout_metadata(self) -> None:
        timeout_input = build_timeout_player_turn_input(
            game_id="game-1",
            round_no=1,
            phase=GamePhase.DECISION,
            player_id="player-2",
            submitted_at=datetime(2026, 3, 29, 12, 2, tzinfo=UTC),
        )

        self.assertEqual(timeout_input.submission_status, PlayerSubmissionStatus.TIMEOUT_AUTO_SUBMITTED)
        self.assertEqual(timeout_input.payload, empty_decision_payload())
        self.assertTrue(timeout_input.is_timeout_generated)

    def test_submit_strips_legacy_diplomacy_actions(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        snapshot.player_states[0].established_diplomacy = ["africa"]
        snapshot.player_states[0].budget_pools["governmentFiscal"] = 30
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        payload = empty_decision_payload()
        payload["militaryPlan"]["diplomacyActions"] = [{"actionId": "establish_africa"}]
        result = PhaseSubmissionService().submit(
            room=room,
            game=game,
            snapshot=snapshot,
            phase_state=PhaseSubmissionState.from_snapshot(snapshot),
            player_id="player-1",
            requested_phase=GamePhase.DECISION,
            payload=payload,
            submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
        )

        self.assertEqual(result.player_turn_input.payload["militaryPlan"]["diplomacyActions"], [])

    def test_submit_normalizes_simplified_colonization_payload(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        snapshot.player_states[0].budget_pools["governmentFiscal"] = 18
        snapshot.player_states[0].army = {"army": 3}
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        payload = empty_decision_payload()
        payload["militaryPlan"]["unlockColonization"] = True
        payload["militaryPlan"]["colonizationActions"] = [{"targetRegionId": "americas"}]
        result = PhaseSubmissionService().submit(
            room=room,
            game=game,
            snapshot=snapshot,
            phase_state=PhaseSubmissionState.from_snapshot(snapshot),
            player_id="player-1",
            requested_phase=GamePhase.DECISION,
            payload=payload,
            submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
        )

        self.assertEqual(result.player_turn_input.payload["militaryPlan"]["unlockColonization"], False)
        self.assertEqual(
            result.player_turn_input.payload["militaryPlan"]["colonizationActions"],
            [{"regionId": "americas"}],
        )

    def test_submit_accepts_overseas_competition_without_diplomacy(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        game.current_phase = GamePhase.MARKET
        snapshot.phase = GamePhase.MARKET
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )
        britain = snapshot.player_states[0]
        britain.army = {"infantry": 1, "artillery": 0}

        result = PhaseSubmissionService().submit(
            room=room,
            game=game,
            snapshot=snapshot,
            phase_state=PhaseSubmissionState.from_snapshot(snapshot),
            player_id="player-1",
            requested_phase=GamePhase.MARKET,
            payload={
                "saleOrders": [],
                "phase1Market": {
                    "domesticAllocation": 0,
                    "externalCompetitionDeployments": [
                        {"marketId": "africa", "infantry": 1, "artillery": 0}
                    ],
                },
            },
            submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
        )

        self.assertEqual(
            result.player_turn_input.payload["phase1Market"]["externalCompetitionDeployments"],
            [{"marketId": "africa", "infantry": 1, "artillery": 0}],
        )

    def test_submit_rejects_unknown_phase1_external_allocation_region(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        game.current_phase = GamePhase.MARKET
        snapshot.phase = GamePhase.MARKET
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=PhaseSubmissionState.from_snapshot(snapshot),
                player_id="player-1",
                requested_phase=GamePhase.MARKET,
                payload={
                    "saleOrders": [],
                    "phase1Market": {
                        "domesticAllocation": 0,
                        "externalAllocations": [{"marketId": "unknown", "quantity": 1}],
                    },
                },
                submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.INVALID_SUBMISSION)
        self.assertIn("region unknown is invalid", error.exception.message)

    def test_submit_rejects_blocked_phase1_external_allocation_region(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        game.current_phase = GamePhase.MARKET
        snapshot.phase = GamePhase.MARKET
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )
        britain = snapshot.player_states[0]
        britain.phase1_economy.goods_inventory = 5
        africa = next(region for region in snapshot.region_states if region.region_id == "africa")
        africa.is_blockaded = True
        africa.blockade_controller = "france"

        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=PhaseSubmissionState.from_snapshot(snapshot),
                player_id="player-1",
                requested_phase=GamePhase.MARKET,
                payload={
                    "saleOrders": [],
                    "phase1Market": {
                        "domesticAllocation": 0,
                        "externalAllocations": [{"marketId": "africa", "quantity": 1}],
                    },
                },
                submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.INVALID_SUBMISSION)
        self.assertIn("region africa route is blocked", error.exception.message)

    def test_submit_rejects_overseas_competition_army_overcommit(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        game.current_phase = GamePhase.MARKET
        snapshot.phase = GamePhase.MARKET
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )
        britain = snapshot.player_states[0]
        britain.army = {"infantry": 0, "artillery": 0}

        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=PhaseSubmissionState.from_snapshot(snapshot),
                player_id="player-1",
                requested_phase=GamePhase.MARKET,
                payload={
                    "saleOrders": [],
                    "phase1Market": {
                        "domesticAllocation": 0,
                        "externalCompetitionDeployments": [
                            {"marketId": "asia_pacific", "infantry": 1, "artillery": 0}
                        ],
                    },
                },
                submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.INVALID_SUBMISSION)
        self.assertIn("exceeds available army", error.exception.message)

    @unittest.skip("2.0: overseas market goodsId validation removed; region resource_limit check is legacy 1.0 logic")
    def test_submit_rejects_market_sale_for_region_that_does_not_accept_goods(self) -> None:
        room = build_room()
        game, snapshot = build_snapshot()
        game.current_phase = GamePhase.MARKET
        snapshot.phase = GamePhase.MARKET
        assign_phase_deadline(
            snapshot,
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=2),
        )

        with self.assertRaises(PhaseSubmissionError) as error:
            PhaseSubmissionService().submit(
                room=room,
                game=game,
                snapshot=snapshot,
                phase_state=PhaseSubmissionState.from_snapshot(snapshot),
                player_id="player-5",
                requested_phase=GamePhase.MARKET,
                payload={
                    "saleOrders": [
                        {"goodsId": "phase1_goods", "market": "overseas", "regionId": "middle_east", "quantity": 1}
                    ]
                },
                submitted_at=datetime(2026, 3, 29, 12, 1, tzinfo=UTC),
            )

        self.assertEqual(error.exception.error_code, ErrorCode.INVALID_SUBMISSION)

    def test_calculate_phase_deadline_uses_started_at_plus_duration(self) -> None:
        deadline = calculate_phase_deadline(
            started_at=datetime(2026, 3, 29, 12, 0, tzinfo=UTC),
            duration=timedelta(minutes=3),
        )

        self.assertEqual(deadline, datetime(2026, 3, 29, 12, 3, tzinfo=UTC))


if __name__ == "__main__":
    unittest.main()
