import unittest
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app
from app.contracts.api import error_response, ok_response
from app.contracts.enums import ErrorCode, GamePhase, RoomStatus, SocketEventName
from app.contracts.socket import socket_envelope
from app.modules.rules.common import PHASE_INPUT_FIELDS
from app.modules.settlement.contracts import SettlementOutcome


class SharedContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()

    def test_ok_response_uses_data_shell(self) -> None:
        with self.app.app_context():
            response, status = ok_response({"hello": "world"}, status=201)
            self.assertEqual(status, 201)
            self.assertEqual(response.get_json(), {"ok": True, "data": {"hello": "world"}})

    def test_error_response_uses_error_shell(self) -> None:
        with self.app.app_context():
            response, status = error_response(ErrorCode.ROOM_NOT_FOUND, "missing", status=404)
            self.assertEqual(status, 404)
            self.assertEqual(
                response.get_json(),
                {
                    "ok": False,
                    "error": {"code": "ROOM_NOT_FOUND", "message": "missing"},
                },
            )

    def test_socket_envelope_uses_locked_outer_shape(self) -> None:
        envelope = socket_envelope(room_code="ROOM1", game_id="GAME1", payload={"status": "ok"})
        self.assertEqual(envelope["roomCode"], "ROOM1")
        self.assertEqual(envelope["gameId"], "GAME1")
        self.assertEqual(envelope["payload"], {"status": "ok"})
        self.assertIn("serverTime", envelope)

    def test_enums_match_three_phase_contract(self) -> None:
        self.assertEqual(RoomStatus.WAITING.value, "waiting")
        self.assertEqual(GamePhase.DECISION.value, "decision")
        self.assertEqual(GamePhase.MARKET.value, "market")
        self.assertEqual(GamePhase.SETTLEMENT.value, "settlement")
        self.assertEqual(SocketEventName.ROOM_UPDATED.value, "room.updated")

    def test_phase_input_fields_are_locked(self) -> None:
        self.assertEqual(
            PHASE_INPUT_FIELDS["decision"],
            (
                "factoryPlan",
                "domesticMarketPlan",
                "governmentPlan",
                "militaryPlan",
            ),
        )
        self.assertEqual(
            PHASE_INPUT_FIELDS["market"],
            ("saleOrders",),
        )
        self.assertEqual(PHASE_INPUT_FIELDS["settlement"], ())

    def test_settlement_outcome_uses_frozen_backend_contract(self) -> None:
        outcome = SettlementOutcome(
            updated_game=None,
            updated_snapshot=None,
            generated_logs=[],
            auto_submitted_player_ids=[],
            next_phase=GamePhase.MARKET,
            next_deadline_at=None,
            is_game_finished=False,
            final_ranking=[],
        )

        self.assertEqual(outcome.next_phase, GamePhase.MARKET)
        self.assertEqual(outcome.final_ranking, [])
        self.assertFalse(outcome.is_game_finished)


if __name__ == "__main__":
    unittest.main()
