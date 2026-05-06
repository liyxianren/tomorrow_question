from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app
from app.config import Settings
from app.contracts.enums import ConnectionStatus, CountryCode, ErrorCode, GamePhase, RoomStatus
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.workspaces import hydrate_snapshot_workspaces
from app.modules.persistence import (
    GameRepository,
    GameLogRepository,
    PlayerTurnInputRepository,
    RoomRepository,
    SessionRepository,
    SnapshotRepository,
    connect_database,
    initialize_database,
)
from app.modules.room.selectors import room_to_payload
from app.modules.room.service import add_member, assign_country, create_room, mark_member_ready, set_member_connection_status, start_game
from app.modules.session.selectors import session_to_payload
from app.modules.session.service import create_session, set_selected_country


FIXED_NOW = datetime(2026, 3, 29, 12, 0, tzinfo=timezone.utc)


def build_game_payload(active_snapshot_id: str | None = "snapshot-1") -> dict[str, object]:
    return {
        "gameId": "game-1",
        "roomCode": "ROOM01",
        "currentRound": 3,
        "totalRounds": 15,
        "currentPhase": GamePhase.MARKET,
        "isFinished": False,
        "activeSnapshotId": active_snapshot_id,
    }


def build_snapshot_payload(snapshot_id: str = "snapshot-1") -> dict[str, object]:
    game = create_game(room_code="ROOM01", game_id="game-1")
    snapshot = create_initial_snapshot(
        game=game,
        snapshot_id=snapshot_id,
        player_assignments={
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        },
        phase_deadline_at=datetime(2026, 3, 29, 12, 10, tzinfo=timezone.utc),
    )
    snapshot.round_no = 3
    snapshot.phase = GamePhase.MARKET
    snapshot.ranking = [
        {
            "rank": 1,
            "playerId": "player-1",
            "countryId": CountryCode.BRITAIN,
            "cumulativeNationalIncome": 12,
            "tieBreak": {"productionCapacity": 1, "controlledRegions": 0, "budgetPoolsTotal": 42},
        }
    ]
    snapshot.last_settlement_summary = {
        "settledPhase": "decision",
        "headline": "国家决策已完成。",
        "summaryLines": ["player-1 已进入市场出售阶段。"],
    }
    hydrate_snapshot_workspaces(snapshot)
    return snapshot.to_payload()


def build_turn_input_payload(
    player_id: str = "player-1",
    *,
    round_no: int = 3,
    phase: GamePhase = GamePhase.MARKET,
    submission_status: str = "submitted",
    is_timeout_generated: bool = False,
) -> dict[str, object]:
    return {
        "gameId": "game-1",
        "roundNo": round_no,
        "phase": phase,
        "playerId": player_id,
        "submissionStatus": submission_status,
        "payload": {
            "saleOrders": [
                {"goodsId": "tea", "market": "domestic", "quantity": 2},
            ]
        },
        "submittedAt": "2026-03-29T12:05:00Z",
        "isTimeoutGenerated": is_timeout_generated,
    }


def build_game_log_payload(
    kind: str = "settlement.phase_resolved",
    *,
    round_no: int = 3,
    phase: GamePhase | None = GamePhase.MARKET,
    message: str = "Market phase settled.",
) -> dict[str, object]:
    return {
        "gameId": "game-1",
        "roundNo": round_no,
        "phase": phase,
        "kind": kind,
        "message": message,
        "details": {"settledPhase": "market"},
        "createdAt": "2026-03-29T12:10:00Z",
    }


class RoomSessionApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "api.sqlite3"
        self.frontend_dist = Path(self.temp_dir.name) / "frontend-dist"
        settings = Settings(
            app_env="test",
            secret_key="test-secret",
            host="127.0.0.1",
            port=5000,
            database_path=str(self.database_path),
            frontend_dist=str(self.frontend_dist),
            socketio_async_mode="threading",
            cors_allowed_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
            debug=False,
        )

        self.app = create_app(settings)
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def seed_room(
        self,
        *,
        room_code: str = "ROOM01",
        host_player_id: str = "player-1",
        host_session_id: str = "session-1",
        host_nickname: str = "Ada",
    ) -> tuple[dict[str, object], dict[str, object]]:
        room = create_room(room_code=room_code, host_player_id=host_player_id, host_nickname=host_nickname)
        session = create_session(
            nickname=host_nickname,
            room_code=room_code,
            now=FIXED_NOW,
            player_id=host_player_id,
            session_id=host_session_id,
        )

        connection = connect_database(self.database_path)
        initialize_database(connection)
        RoomRepository(connection).save(room_to_payload(room))
        SessionRepository(connection).save(session_to_payload(session))
        connection.close()

        return room_to_payload(room), session_to_payload(session)

    def update_room(self, room_code: str, mutator) -> None:
        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_payload = RoomRepository(connection).get(room_code)
        self.assertIsNotNone(room_payload)

        room = create_room(
            room_code=room_payload["roomCode"],
            host_player_id=room_payload["hostPlayerId"],
            host_nickname=room_payload["members"][0]["nickname"],
        )
        room.current_game_id = room_payload["currentGameId"]
        room.members = []
        for member_payload in room_payload["members"]:
            add_member(room, member_payload["playerId"], member_payload["nickname"], member_payload["connectionStatus"])
            if member_payload["selectedCountry"] is not None:
                assign_country(room, member_payload["playerId"], member_payload["selectedCountry"])
            if member_payload["isReady"]:
                mark_member_ready(room, member_payload["playerId"], True)

        mutator(room)

        RoomRepository(connection).save(room_to_payload(room))
        connection.close()

    def seed_active_game(self) -> None:
        connection = connect_database(self.database_path)
        initialize_database(connection)
        GameRepository(connection).save(build_game_payload())
        SnapshotRepository(connection).save(build_snapshot_payload())
        room_payload = RoomRepository(connection).get("ROOM01")
        self.assertIsNotNone(room_payload)
        room_payload["currentGameId"] = "game-1"
        room_payload["status"] = room_payload["status"].IN_GAME
        RoomRepository(connection).save(room_payload)
        connection.close()

    def seed_active_game_records(self) -> None:
        connection = connect_database(self.database_path)
        initialize_database(connection)
        PlayerTurnInputRepository(connection).save(build_turn_input_payload())
        PlayerTurnInputRepository(connection).save(
            build_turn_input_payload(
                player_id="player-2",
                submission_status="timeout_auto_submitted",
                is_timeout_generated=True,
            )
        )
        GameLogRepository(connection).save(build_game_log_payload())
        connection.close()

    def test_create_room_returns_session_and_room_payload(self) -> None:
        response = self.client.post("/api/v1/rooms", json={"nickname": "Ada"})

        self.assertEqual(response.status_code, 201)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["session"]["nickname"], "Ada")
        self.assertEqual(payload["data"]["session"]["roomCode"], payload["data"]["room"]["roomCode"])
        self.assertEqual(payload["data"]["room"]["members"][0]["nickname"], "Ada")
        self.assertEqual(payload["data"]["room"]["hostPlayerId"], payload["data"]["session"]["playerId"])

    def test_create_room_preflight_returns_cors_headers_for_allowed_origin(self) -> None:
        response = self.client.open(
            "/api/v1/rooms",
            method="OPTIONS",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-session-id",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173")
        self.assertIn("X-Session-Id", response.headers.get("Access-Control-Allow-Headers", ""))
        self.assertIn("POST", response.headers.get("Access-Control-Allow-Methods", ""))

    def test_create_room_response_returns_cors_headers_for_allowed_origin(self) -> None:
        response = self.client.post(
            "/api/v1/rooms",
            json={"nickname": "Ada"},
            headers={
                "Origin": "http://localhost:5173",
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173")

    def test_create_room_preflight_returns_cors_headers_for_loopback_origin(self) -> None:
        response = self.client.open(
            "/api/v1/rooms",
            method="OPTIONS",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-session-id",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:5173")
        self.assertIn("X-Session-Id", response.headers.get("Access-Control-Allow-Headers", ""))
        self.assertIn("POST", response.headers.get("Access-Control-Allow-Methods", ""))

    def test_create_room_response_returns_cors_headers_for_loopback_origin(self) -> None:
        response = self.client.post(
            "/api/v1/rooms",
            json={"nickname": "Ada"},
            headers={
                "Origin": "http://127.0.0.1:5173",
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:5173")

    def test_join_room_returns_session_and_room_context(self) -> None:
        self.seed_room()

        response = self.client.post("/api/v1/rooms/join", json={"nickname": "Linus", "roomCode": "ROOM01"})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["session"]["nickname"], "Linus")
        self.assertEqual(payload["data"]["room"]["roomCode"], "ROOM01")
        self.assertEqual(len(payload["data"]["room"]["members"]), 2)

    def test_join_room_with_existing_room_session_restores_member_instead_of_duplicating(self) -> None:
        self.seed_room()
        self.update_room(
            "ROOM01",
            lambda room: set_member_connection_status(room, "player-1", ConnectionStatus.OFFLINE_RECOVERABLE),
        )

        response = self.client.post(
            "/api/v1/rooms/join",
            json={"nickname": "Ada", "roomCode": "ROOM01"},
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["session"]["sessionId"], "session-1")
        self.assertEqual(payload["data"]["session"]["playerId"], "player-1")
        members = payload["data"]["room"]["members"]
        self.assertEqual(len(members), 1)
        self.assertEqual(members[0]["playerId"], "player-1")
        self.assertEqual(members[0]["connectionStatus"], ConnectionStatus.ONLINE.value)

    def test_join_room_emits_room_updated(self) -> None:
        self.seed_room()

        with patch("app.api.routes.emit_room_updated") as emit_room_updated_mock:
            response = self.client.post("/api/v1/rooms/join", json={"nickname": "Linus", "roomCode": "ROOM01"})

        self.assertEqual(response.status_code, 200)
        emit_room_updated_mock.assert_called_once()

    def test_join_room_rejects_full_room(self) -> None:
        self.seed_room()
        self.update_room(
            "ROOM01",
            lambda room: [
                add_member(room, player_id=f"player-{idx}", nickname=f"Player {idx}")
                for idx in range(2, 6)
            ],
        )

        response = self.client.post("/api/v1/rooms/join", json={"nickname": "Late", "roomCode": "ROOM01"})

        self.assertEqual(response.status_code, 409)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.ROOM_FULL.value)

    def test_join_room_rejects_room_already_in_game(self) -> None:
        self.seed_room()
        self.update_room(
            "ROOM01",
            lambda room: start_game(
                self._prepare_startable_room(room),
                game_id="game-1",
            ),
        )

        response = self.client.post("/api/v1/rooms/join", json={"nickname": "Late", "roomCode": "ROOM01"})

        self.assertEqual(response.status_code, 409)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.ROOM_ALREADY_IN_GAME.value)

    def test_host_leave_waiting_room_disbands_room(self) -> None:
        self.seed_room()
        self.client.post("/api/v1/rooms/join", json={"nickname": "Linus", "roomCode": "ROOM01"})

        response = self.client.post("/api/v1/rooms/ROOM01/leave", headers={"X-Session-Id": "session-1"})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["data"]["disbanded"])
        self.assertEqual(payload["data"]["removedPlayerId"], "player-1")

        connection = connect_database(self.database_path)
        initialize_database(connection)
        self.assertIsNone(RoomRepository(connection).get("ROOM01"))
        host_session = SessionRepository(connection).get("session-1")
        self.assertIsNotNone(host_session)
        self.assertIsNone(host_session["roomCode"])
        connection.close()

    def test_guest_leave_waiting_room_removes_member_without_disbanding(self) -> None:
        self.seed_room()
        join_response = self.client.post("/api/v1/rooms/join", json={"nickname": "Linus", "roomCode": "ROOM01"})
        guest_session_id = join_response.get_json()["data"]["session"]["sessionId"]
        guest_player_id = join_response.get_json()["data"]["session"]["playerId"]

        response = self.client.post("/api/v1/rooms/ROOM01/leave", headers={"X-Session-Id": guest_session_id})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertFalse(payload["data"]["disbanded"])
        self.assertEqual(payload["data"]["removedPlayerId"], guest_player_id)
        self.assertEqual([member["playerId"] for member in payload["data"]["room"]["members"]], ["player-1"])

        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_payload = RoomRepository(connection).get("ROOM01")
        self.assertIsNotNone(room_payload)
        self.assertEqual(room_payload["memberPlayerIds"], ["player-1"])
        guest_session = SessionRepository(connection).get(guest_session_id)
        self.assertIsNotNone(guest_session)
        self.assertIsNone(guest_session["roomCode"])
        connection.close()

    def test_restore_session_returns_room_and_active_game_context_from_header(self) -> None:
        self.seed_room()
        self.seed_active_game()

        response = self.client.post("/api/v1/sessions/restore", headers={"X-Session-Id": "session-1"})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["session"]["sessionId"], "session-1")
        self.assertEqual(payload["data"]["room"]["roomCode"], "ROOM01")
        self.assertEqual(payload["data"]["activeGame"]["gameId"], "game-1")
        self.assertEqual(payload["data"]["activeSnapshot"]["snapshotId"], "snapshot-1")

    def test_restore_session_rehydrates_missing_snapshot_workspaces(self) -> None:
        self.seed_room()
        self.seed_active_game()

        response = self.client.post("/api/v1/sessions/restore", headers={"X-Session-Id": "session-1"})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(
            payload["data"]["activeSnapshot"]["rankingWorkspace"]["standings"][0]["playerId"],
            "player-1",
        )

    def test_restore_session_returns_active_turn_inputs_and_game_logs(self) -> None:
        self.seed_room()
        self.seed_active_game()
        self.seed_active_game_records()

        response = self.client.post("/api/v1/sessions/restore", headers={"X-Session-Id": "session-1"})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(
            [item["playerId"] for item in payload["data"]["activeTurnInputs"]],
            ["player-1", "player-2"],
        )
        self.assertEqual(
            payload["data"]["activeTurnInputs"][1]["submissionStatus"],
            "timeout_auto_submitted",
        )
        self.assertEqual(
            [item["kind"] for item in payload["data"]["gameLogs"]],
            ["settlement.phase_resolved"],
        )

    def test_restore_session_rejects_invalid_session(self) -> None:
        response = self.client.post("/api/v1/sessions/restore", headers={"X-Session-Id": "session-missing"})

        self.assertEqual(response.status_code, 401)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.INVALID_SESSION.value)

    def test_select_country_persists_selection(self) -> None:
        self.seed_room()

        response = self.client.post(
            "/api/v1/rooms/ROOM01/country",
            json={"selectedCountry": CountryCode.BRITAIN.value},
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["selectedCountry"], CountryCode.BRITAIN.value)

        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_payload = RoomRepository(connection).get("ROOM01")
        session_payload = SessionRepository(connection).get("session-1")
        connection.close()

        self.assertEqual(room_payload["members"][0]["selectedCountry"], CountryCode.BRITAIN)
        self.assertEqual(session_payload["selectedCountry"], CountryCode.BRITAIN)

    def test_select_country_rejects_taken_country(self) -> None:
        self.seed_room()
        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_repository = RoomRepository(connection)
        session_repository = SessionRepository(connection)

        room_payload = room_repository.get("ROOM01")
        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        add_member(room, "player-2", "Linus")
        assign_country(room, "player-2", CountryCode.FRANCE)
        room_repository.save(room_to_payload(room))
        session_repository.save(
            session_to_payload(
                create_session(
                    nickname="Linus",
                    room_code="ROOM01",
                    selected_country=CountryCode.FRANCE,
                    now=FIXED_NOW,
                    player_id="player-2",
                    session_id="session-2",
                )
            )
        )
        connection.close()

        response = self.client.post(
            "/api/v1/rooms/ROOM01/country",
            json={"selectedCountry": CountryCode.BRITAIN.value},
            headers={"X-Session-Id": "session-2"},
        )

        self.assertEqual(response.status_code, 409)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.COUNTRY_TAKEN.value)

    def test_select_country_rejects_non_member_session(self) -> None:
        self.seed_room()
        connection = connect_database(self.database_path)
        initialize_database(connection)
        SessionRepository(connection).save(
            session_to_payload(
                create_session(
                    nickname="Outsider",
                    room_code="OTHER1",
                    now=FIXED_NOW,
                    player_id="player-9",
                    session_id="session-9",
                )
            )
        )
        connection.close()

        response = self.client.post(
            "/api/v1/rooms/ROOM01/country",
            json={"selectedCountry": CountryCode.BRITAIN.value},
            headers={"X-Session-Id": "session-9"},
        )

        self.assertEqual(response.status_code, 403)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.NOT_ROOM_MEMBER.value)

    def test_ready_rejects_player_without_country(self) -> None:
        self.seed_room()

        response = self.client.post(
            "/api/v1/rooms/ROOM01/ready",
            json={"isReady": True},
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 409)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.NOT_READYABLE.value)

    def test_ready_updates_member_state(self) -> None:
        self.seed_room()
        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_repository = RoomRepository(connection)
        session_repository = SessionRepository(connection)
        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        room_repository.save(room_to_payload(room))
        session = create_session(
            nickname="Ada",
            room_code="ROOM01",
            now=FIXED_NOW,
            player_id="player-1",
            session_id="session-1",
        )
        set_selected_country(session, CountryCode.BRITAIN)
        session_repository.save(session_to_payload(session))
        connection.close()

        response = self.client.post(
            "/api/v1/rooms/ROOM01/ready",
            json={"isReady": True},
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["data"]["isReady"])

    def test_host_can_fill_room_with_bots_and_room_context_reflects_ai_members(self) -> None:
        self.seed_room()
        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_repository = RoomRepository(connection)
        room_payload = room_repository.get("ROOM01")
        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        mark_member_ready(room, "player-1", True)
        room_repository.save(room_to_payload(room))
        connection.close()

        response = self.client.post(
            "/api/v1/rooms/ROOM01/bots/fill",
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(len(payload["data"]["room"]["members"]), 5)
        bot_members = [member for member in payload["data"]["room"]["members"] if member["memberType"] == "bot"]
        self.assertEqual(len(bot_members), 4)
        self.assertTrue(all(member["isReady"] for member in bot_members))
        self.assertEqual(
            {member["selectedCountry"] for member in payload["data"]["room"]["members"]},
            {
                CountryCode.BRITAIN.value,
                CountryCode.FRANCE.value,
                CountryCode.PRUSSIA.value,
                CountryCode.AUSTRIA.value,
                CountryCode.RUSSIA.value,
            },
        )

    def test_non_host_cannot_fill_room_with_bots(self) -> None:
        self.seed_room()
        self.client.post("/api/v1/rooms/join", json={"nickname": "Linus", "roomCode": "ROOM01"})
        join_payload = self.client.post("/api/v1/rooms/join", json={"nickname": "Grace", "roomCode": "ROOM01"})
        grace_session_id = join_payload.get_json()["data"]["session"]["sessionId"]

        response = self.client.post(
            "/api/v1/rooms/ROOM01/bots/fill",
            headers={"X-Session-Id": grace_session_id},
        )

        self.assertEqual(response.status_code, 403)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.ROOM_ACTION_FORBIDDEN.value)

    def test_host_can_remove_bot_before_game_start(self) -> None:
        self.seed_room()
        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_repository = RoomRepository(connection)
        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        room_repository.save(room_to_payload(room))
        connection.close()
        fill_response = self.client.post(
            "/api/v1/rooms/ROOM01/bots/fill",
            headers={"X-Session-Id": "session-1"},
        )
        bot_player_id = next(
            member["playerId"]
            for member in fill_response.get_json()["data"]["room"]["members"]
            if member["memberType"] == "bot"
        )

        response = self.client.delete(
            f"/api/v1/rooms/ROOM01/bots/{bot_player_id}",
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(len(payload["data"]["room"]["members"]), 4)
        self.assertTrue(all(member["playerId"] != bot_player_id for member in payload["data"]["room"]["members"]))

        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_payload = RoomRepository(connection).get("ROOM01")
        connection.close()

        self.assertEqual(len(room_payload["members"]), 4)
        self.assertEqual(room_payload["status"].value, "waiting")

    def test_ready_starts_game_when_last_member_becomes_ready(self) -> None:
        self.seed_room()
        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_repository = RoomRepository(connection)
        session_repository = SessionRepository(connection)

        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
        assignments = {
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        }

        for idx in range(2, 6):
            add_member(room, player_id=f"player-{idx}", nickname=f"Player {idx}")

        for idx in range(1, 6):
            player_id = f"player-{idx}"
            assign_country(room, player_id, assignments[player_id])
            if player_id != "player-1":
                mark_member_ready(room, player_id, True)

            session = create_session(
                nickname="Ada" if player_id == "player-1" else f"Player {idx}",
                room_code="ROOM01",
                selected_country=assignments[player_id],
                now=FIXED_NOW,
                player_id=player_id,
                session_id=f"session-{idx}",
            )
            session_repository.save(session_to_payload(session))

        room_repository.save(room_to_payload(room))
        connection.close()

        with (
            patch("app.api.routes.emit_room_updated") as emit_room_updated_mock,
            patch("app.modules.settlement.emit_game_started") as emit_game_started_mock,
        ):
            response = self.client.post(
                "/api/v1/rooms/ROOM01/ready",
                json={"isReady": True},
                headers={"X-Session-Id": "session-1"},
            )

        self.assertEqual(response.status_code, 200)
        emit_game_started_mock.assert_called_once()
        self.assertEqual(emit_room_updated_mock.call_count, 2)

        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_payload = RoomRepository(connection).get("ROOM01")
        self.assertIsNotNone(room_payload)
        self.assertIsNotNone(room_payload["currentGameId"])

        game_payload = GameRepository(connection).get(room_payload["currentGameId"])
        self.assertIsNotNone(game_payload)
        self.assertIsNotNone(game_payload["activeSnapshotId"])
        snapshot_payload = SnapshotRepository(connection).get(game_payload["activeSnapshotId"])
        connection.close()

        self.assertIsNotNone(snapshot_payload)

    def test_ready_starts_game_without_phase_deadline_when_duration_disabled(self) -> None:
        self.app.config["PHASE_DURATION_SECONDS"] = 0
        self.seed_room()
        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_repository = RoomRepository(connection)
        session_repository = SessionRepository(connection)

        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
        assignments = {
            "player-1": CountryCode.BRITAIN,
            "player-2": CountryCode.FRANCE,
            "player-3": CountryCode.PRUSSIA,
            "player-4": CountryCode.AUSTRIA,
            "player-5": CountryCode.RUSSIA,
        }

        for idx in range(2, 6):
            add_member(room, player_id=f"player-{idx}", nickname=f"Player {idx}")

        for idx in range(1, 6):
            player_id = f"player-{idx}"
            assign_country(room, player_id, assignments[player_id])
            if player_id != "player-1":
                mark_member_ready(room, player_id, True)

            session = create_session(
                nickname="Ada" if player_id == "player-1" else f"Player {idx}",
                room_code="ROOM01",
                selected_country=assignments[player_id],
                now=FIXED_NOW,
                player_id=player_id,
                session_id=f"session-{idx}",
            )
            session_repository.save(session_to_payload(session))

        room_repository.save(room_to_payload(room))
        connection.close()

        response = self.client.post(
            "/api/v1/rooms/ROOM01/ready",
            json={"isReady": True},
            headers={"X-Session-Id": "session-1"},
        )

        self.assertEqual(response.status_code, 200)

        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_payload = RoomRepository(connection).get("ROOM01")
        self.assertIsNotNone(room_payload)
        self.assertIsNotNone(room_payload["currentGameId"])

        game_payload = GameRepository(connection).get(room_payload["currentGameId"])
        self.assertIsNotNone(game_payload)
        self.assertIsNotNone(game_payload["activeSnapshotId"])
        snapshot_payload = SnapshotRepository(connection).get(game_payload["activeSnapshotId"])
        connection.close()

        self.assertIsNotNone(snapshot_payload)
        self.assertIsNone(snapshot_payload["phaseDeadlineAt"])

    def test_room_context_returns_room_active_game_and_snapshot(self) -> None:
        self.seed_room()
        self.seed_active_game()

        response = self.client.get("/api/v1/rooms/ROOM01/context")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["room"]["roomCode"], "ROOM01")
        self.assertEqual(payload["data"]["activeGame"]["gameId"], "game-1")
        self.assertEqual(payload["data"]["activeSnapshot"]["snapshotId"], "snapshot-1")

    def test_room_context_rejects_missing_room(self) -> None:
        response = self.client.get("/api/v1/rooms/MISSING/context")

        self.assertEqual(response.status_code, 404)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.ROOM_NOT_FOUND.value)

    def test_waiting_rooms_returns_empty_list_for_empty_lobby(self) -> None:
        response = self.client.get("/api/v1/lobby/waiting-rooms")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"], [])

    def test_waiting_rooms_returns_waiting_room_card(self) -> None:
        self.seed_room()

        response = self.client.get("/api/v1/lobby/waiting-rooms")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(len(payload["data"]), 1)
        room = payload["data"][0]
        self.assertEqual(room["roomCode"], "ROOM01")
        self.assertEqual(room["hostNickname"], "Ada")
        self.assertEqual(room["memberCount"], 1)
        self.assertEqual(room["maxPlayers"], 5)
        self.assertEqual(room["availableSeatCount"], 4)
        self.assertEqual(room["status"], RoomStatus.WAITING.value)
        self.assertEqual(room["readyCount"], 0)
        self.assertEqual(room["selectedCountriesCount"], 0)
        self.assertFalse(room["hasActiveGame"])
        self.assertTrue(room["isJoinable"])
        self.assertIsInstance(room["lastActivityAt"], str)
        self.assertEqual(
            room["members"],
            [
                {
                    "nickname": "Ada",
                    "selectedCountry": None,
                    "isReady": False,
                    "memberType": "human",
                }
            ],
        )

    def test_waiting_rooms_filters_non_waiting_statuses(self) -> None:
        self.seed_room(room_code="WAIT01", host_player_id="player-w", host_session_id="session-w", host_nickname="Waiting")
        self.seed_room(room_code="READY1", host_player_id="player-r", host_session_id="session-r", host_nickname="Readying")
        self.seed_room(room_code="GAME01", host_player_id="player-1", host_session_id="session-g", host_nickname="InGame")
        self.seed_room(room_code="DONE01", host_player_id="player-d", host_session_id="session-d", host_nickname="Finished")

        self.update_room(
            "READY1",
            lambda room: [
                add_member(room, player_id=f"player-r-{idx}", nickname=f"Ready {idx}")
                for idx in range(2, 6)
            ],
        )
        self.update_room(
            "GAME01",
            lambda room: start_game(
                self._prepare_startable_room(room),
                game_id="game-1",
            ),
        )
        self.update_room("DONE01", lambda room: setattr(room, "status", RoomStatus.FINISHED))

        response = self.client.get("/api/v1/lobby/waiting-rooms")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual([room["roomCode"] for room in payload["data"]], ["WAIT01"])

    def test_waiting_rooms_prioritizes_rooms_closer_to_starting(self) -> None:
        self.seed_room(room_code="ONE001", host_player_id="player-1", host_session_id="session-1", host_nickname="One")
        self.seed_room(room_code="THREE1", host_player_id="player-3", host_session_id="session-3", host_nickname="Three")
        self.seed_room(room_code="TWO001", host_player_id="player-2", host_session_id="session-2", host_nickname="Two")

        self.update_room(
            "TWO001",
            lambda room: add_member(room, player_id="player-2b", nickname="Two B"),
        )
        self.update_room(
            "THREE1",
            lambda room: [
                add_member(room, player_id="player-3b", nickname="Three B"),
                add_member(room, player_id="player-3c", nickname="Three C"),
            ],
        )

        response = self.client.get("/api/v1/lobby/waiting-rooms")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual([room["roomCode"] for room in payload["data"]], ["THREE1", "TWO001", "ONE001"])

    def test_waiting_rooms_counts_ready_and_selected_countries(self) -> None:
        self.seed_room()
        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_repository = RoomRepository(connection)
        session_repository = SessionRepository(connection)
        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")

        add_member(room, "player-2", "Linus")
        add_member(room, "player-3", "Grace")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        assign_country(room, "player-2", CountryCode.FRANCE)
        mark_member_ready(room, "player-2", True)

        room_repository.save(room_to_payload(room))
        session_repository.save(
            session_to_payload(
                create_session(
                    nickname="Linus",
                    room_code="ROOM01",
                    selected_country=CountryCode.FRANCE,
                    now=FIXED_NOW,
                    player_id="player-2",
                    session_id="session-2",
                )
            )
        )
        session_repository.save(
            session_to_payload(
                create_session(
                    nickname="Grace",
                    room_code="ROOM01",
                    now=FIXED_NOW,
                    player_id="player-3",
                    session_id="session-3",
                )
            )
        )
        connection.close()

        response = self.client.get("/api/v1/lobby/waiting-rooms")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"][0]["roomCode"], "ROOM01")
        self.assertEqual(payload["data"][0]["hostNickname"], "Ada")
        self.assertEqual(payload["data"][0]["memberCount"], 3)
        self.assertEqual(payload["data"][0]["maxPlayers"], 5)
        self.assertEqual(payload["data"][0]["availableSeatCount"], 2)
        self.assertEqual(payload["data"][0]["status"], RoomStatus.WAITING.value)
        self.assertEqual(payload["data"][0]["readyCount"], 1)
        self.assertEqual(payload["data"][0]["selectedCountriesCount"], 2)
        self.assertFalse(payload["data"][0]["hasActiveGame"])
        self.assertTrue(payload["data"][0]["isJoinable"])
        self.assertEqual(
            payload["data"][0]["members"],
            [
                {
                    "nickname": "Ada",
                    "selectedCountry": "britain",
                    "isReady": False,
                    "memberType": "human",
                },
                {
                    "nickname": "Linus",
                    "selectedCountry": "france",
                    "isReady": True,
                    "memberType": "human",
                },
                {
                    "nickname": "Grace",
                    "selectedCountry": None,
                    "isReady": False,
                    "memberType": "human",
                },
            ],
        )

    def test_waiting_rooms_hides_rooms_inactive_for_more_than_three_minutes(self) -> None:
        self.seed_room(room_code="FRESH1", host_player_id="player-f", host_session_id="session-f", host_nickname="Fresh")
        self.seed_room(room_code="STALE1", host_player_id="player-s", host_session_id="session-s", host_nickname="Stale")

        connection = connect_database(self.database_path)
        initialize_database(connection)
        try:
            room_repository = RoomRepository(connection)

            fresh_room = room_repository.get("FRESH1")
            stale_room = room_repository.get("STALE1")
            self.assertIsNotNone(fresh_room)
            self.assertIsNotNone(stale_room)

            fresh_room["lastActivityAt"] = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
            stale_room["lastActivityAt"] = (datetime.now(timezone.utc) - timedelta(minutes=4)).isoformat()
            room_repository.save(fresh_room)
            room_repository.save(stale_room)
        finally:
            connection.close()

        response = self.client.get("/api/v1/lobby/waiting-rooms")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual([room["roomCode"] for room in payload["data"]], ["FRESH1"])

    def test_waiting_rooms_deletes_rooms_inactive_for_more_than_fifteen_minutes(self) -> None:
        self.seed_room(room_code="EXPIRE1", host_player_id="player-e", host_session_id="session-e", host_nickname="Expired")

        connection = connect_database(self.database_path)
        initialize_database(connection)
        try:
            room_repository = RoomRepository(connection)
            expired_room = room_repository.get("EXPIRE1")
            self.assertIsNotNone(expired_room)
            expired_room["lastActivityAt"] = (datetime.now(timezone.utc) - timedelta(minutes=16)).isoformat()
            room_repository.save(expired_room)
        finally:
            connection.close()

        response = self.client.get("/api/v1/lobby/waiting-rooms")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"], [])

        connection = connect_database(self.database_path)
        initialize_database(connection)
        try:
            self.assertIsNone(RoomRepository(connection).get("EXPIRE1"))
        finally:
            connection.close()

    def test_waiting_rooms_falls_back_to_empty_host_nickname_when_host_member_missing(self) -> None:
        self.seed_room()
        connection = connect_database(self.database_path)
        initialize_database(connection)
        room_repository = RoomRepository(connection)
        room_payload = room_repository.get("ROOM01")
        self.assertIsNotNone(room_payload)
        room_payload["members"] = []
        room_payload["memberPlayerIds"] = []
        room_repository.save(room_payload)
        connection.close()

        response = self.client.get("/api/v1/lobby/waiting-rooms")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"][0]["hostNickname"], "")

    def _prepare_startable_room(self, room):
        if len(room.members) == 1:
            for idx in range(2, 6):
                add_member(room, player_id=f"player-{idx}", nickname=f"Player {idx}")

        for idx, country in enumerate(
            [
                CountryCode.BRITAIN,
                CountryCode.FRANCE,
                CountryCode.PRUSSIA,
                CountryCode.AUSTRIA,
                CountryCode.RUSSIA,
            ],
            start=1,
        ):
            assign_country(room, f"player-{idx}", country)
            mark_member_ready(room, f"player-{idx}", True)

        return room


if __name__ == "__main__":
    unittest.main()
