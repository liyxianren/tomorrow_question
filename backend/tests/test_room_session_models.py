from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import ConnectionStatus, CountryCode, ErrorCode, RoomStatus
from app.modules.room.selectors import room_to_payload
from app.modules.room.service import (
    RoomError,
    add_member,
    assign_country,
    create_room,
    fill_bots,
    finish_room,
    mark_member_ready,
    remove_bot,
    room_can_start,
    start_game,
)
from app.modules.session.selectors import session_to_payload
from app.modules.session.service import (
    SessionError,
    connect_session,
    create_session,
    disconnect_session,
    restore_session,
)


class RoomModelTests(unittest.TestCase):
    def test_room_payload_matches_locked_contract_shape(self) -> None:
        room = create_room(room_code="ROOM12", host_player_id="player-host", host_nickname="Host")

        payload = room_to_payload(room)

        self.assertEqual(payload["roomCode"], "ROOM12")
        self.assertEqual(payload["status"], RoomStatus.WAITING)
        self.assertEqual(payload["hostPlayerId"], "player-host")
        self.assertEqual(payload["memberPlayerIds"], ["player-host"])
        self.assertEqual(
            payload["members"],
            [
                {
                    "playerId": "player-host",
                    "nickname": "Host",
                    "selectedCountry": None,
                    "connectionStatus": ConnectionStatus.ONLINE,
                    "isReady": False,
                    "memberType": "human",
                    "botProfileKey": None,
                }
            ],
        )
        self.assertEqual(
            payload["countrySlots"],
            {
                CountryCode.BRITAIN.value: None,
                CountryCode.FRANCE.value: None,
                CountryCode.PRUSSIA.value: None,
                CountryCode.AUSTRIA.value: None,
                CountryCode.RUSSIA.value: None,
            },
        )
        self.assertIsNone(payload["currentGameId"])

    def test_room_moves_through_readying_in_game_and_finished(self) -> None:
        room = create_room(room_code="ROOM12", host_player_id="player-1", host_nickname="Player 1")

        for idx in range(2, 6):
            add_member(room, player_id=f"player-{idx}", nickname=f"Player {idx}")

        self.assertEqual(room.status, RoomStatus.READYING)

        countries = [
            CountryCode.BRITAIN,
            CountryCode.FRANCE,
            CountryCode.PRUSSIA,
            CountryCode.AUSTRIA,
            CountryCode.RUSSIA,
        ]
        for idx, country in enumerate(countries, start=1):
            assign_country(room, player_id=f"player-{idx}", country=country)
            mark_member_ready(room, player_id=f"player-{idx}", is_ready=True)

        self.assertTrue(room_can_start(room))

        start_game(room, game_id="game-1")
        self.assertEqual(room.status, RoomStatus.IN_GAME)
        self.assertEqual(room.current_game_id, "game-1")

        finish_room(room)
        self.assertEqual(room.status, RoomStatus.FINISHED)
        self.assertEqual(room.current_game_id, "game-1")

    def test_room_enforces_capacity_country_uniqueness_and_ready_rules(self) -> None:
        room = create_room(room_code="ROOM12", host_player_id="player-1", host_nickname="Player 1")
        add_member(room, player_id="player-2", nickname="Player 2")

        with self.assertRaises(RoomError) as ready_error:
            mark_member_ready(room, player_id="player-1", is_ready=True)
        self.assertEqual(ready_error.exception.error_code, ErrorCode.NOT_READYABLE)

        assign_country(room, player_id="player-1", country=CountryCode.BRITAIN)
        with self.assertRaises(RoomError) as country_error:
            assign_country(room, player_id="player-2", country=CountryCode.BRITAIN)
        self.assertEqual(country_error.exception.error_code, ErrorCode.COUNTRY_TAKEN)

        add_member(room, player_id="player-3", nickname="Player 3")
        add_member(room, player_id="player-4", nickname="Player 4")
        add_member(room, player_id="player-5", nickname="Player 5")

        with self.assertRaises(RoomError) as full_error:
            add_member(room, player_id="player-6", nickname="Player 6")
        self.assertEqual(full_error.exception.error_code, ErrorCode.ROOM_FULL)

    def test_room_rejects_new_members_after_game_started(self) -> None:
        room = create_room(room_code="ROOM12", host_player_id="player-1", host_nickname="Player 1")
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
            if idx > 1:
                add_member(room, player_id=f"player-{idx}", nickname=f"Player {idx}")
            assign_country(room, player_id=f"player-{idx}", country=country)
            mark_member_ready(room, player_id=f"player-{idx}", is_ready=True)

        start_game(room, game_id="game-1")

        with self.assertRaises(RoomError) as in_game_error:
            add_member(room, player_id="player-6", nickname="Late")
        self.assertEqual(in_game_error.exception.error_code, ErrorCode.ROOM_ALREADY_IN_GAME)

    def test_fill_bots_assigns_remaining_countries_marks_ready_and_keeps_room_startable(self) -> None:
        room = create_room(room_code="ROOM12", host_player_id="player-1", host_nickname="Host")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        mark_member_ready(room, "player-1", True)
        add_member(room, player_id="player-2", nickname="Player 2")
        assign_country(room, "player-2", CountryCode.FRANCE)
        mark_member_ready(room, "player-2", True)

        added_bots = fill_bots(room, actor_player_id="player-1")

        self.assertEqual(len(added_bots), 3)
        self.assertEqual(len(room.members), 5)
        self.assertTrue(all(member.is_ready for member in room.members))
        self.assertEqual(
            {member.selected_country for member in room.members},
            set(CountryCode),
        )
        self.assertTrue(all(member.member_type == "bot" for member in added_bots))
        self.assertTrue(room_can_start(room))

    def test_fill_bots_rejects_non_host(self) -> None:
        room = create_room(room_code="ROOM12", host_player_id="player-1", host_nickname="Host")
        add_member(room, player_id="player-2", nickname="Player 2")

        with self.assertRaises(RoomError) as error:
            fill_bots(room, actor_player_id="player-2")

        self.assertEqual(error.exception.error_code, ErrorCode.ROOM_ACTION_FORBIDDEN)

    def test_remove_bot_only_allows_host_before_game_start(self) -> None:
        room = create_room(room_code="ROOM12", host_player_id="player-1", host_nickname="Host")
        assign_country(room, "player-1", CountryCode.BRITAIN)
        mark_member_ready(room, "player-1", True)
        fill_bots(room, actor_player_id="player-1")
        bot_member = next(member for member in room.members if member.member_type == "bot")

        with self.assertRaises(RoomError) as non_host_error:
            remove_bot(room, actor_player_id=bot_member.player_id, bot_player_id=bot_member.player_id)
        self.assertEqual(non_host_error.exception.error_code, ErrorCode.ROOM_ACTION_FORBIDDEN)

        removed_bot = remove_bot(room, actor_player_id="player-1", bot_player_id=bot_member.player_id)
        self.assertEqual(removed_bot.player_id, bot_member.player_id)
        self.assertEqual(len(room.members), 4)

        fill_bots(room, actor_player_id="player-1")
        start_game(room, game_id="game-1")
        surviving_bot = next(member for member in room.members if member.member_type == "bot")
        with self.assertRaises(RoomError) as in_game_error:
            remove_bot(room, actor_player_id="player-1", bot_player_id=surviving_bot.player_id)
        self.assertEqual(in_game_error.exception.error_code, ErrorCode.ROOM_ALREADY_IN_GAME)


class PlayerSessionTests(unittest.TestCase):
    def test_session_payload_matches_locked_contract_shape(self) -> None:
        created_at = datetime(2026, 3, 29, 12, 0, tzinfo=timezone.utc)
        session = create_session(nickname="Host", room_code="ROOM12", now=created_at)

        payload = session_to_payload(session)

        self.assertTrue(payload["playerId"].startswith("player_"))
        self.assertTrue(payload["sessionId"].startswith("session_"))
        self.assertEqual(payload["nickname"], "Host")
        self.assertEqual(payload["roomCode"], "ROOM12")
        self.assertIsNone(payload["selectedCountry"])
        self.assertEqual(payload["connectionStatus"], ConnectionStatus.ONLINE)
        self.assertEqual(payload["lastSeenAt"], "2026-03-29T12:00:00+00:00")

    def test_session_disconnect_and_restore_updates_recovery_state(self) -> None:
        created_at = datetime(2026, 3, 29, 12, 0, tzinfo=timezone.utc)
        disconnected_at = datetime(2026, 3, 29, 12, 5, tzinfo=timezone.utc)
        restored_at = datetime(2026, 3, 29, 12, 10, tzinfo=timezone.utc)

        session = create_session(nickname="Player 1", room_code="ROOM12", now=created_at)
        disconnect_session(session, now=disconnected_at)
        self.assertEqual(session.connection_status, ConnectionStatus.OFFLINE_RECOVERABLE)
        self.assertEqual(session.last_seen_at, disconnected_at)

        restored = restore_session(
            session_id=session.session_id,
            sessions_by_id={session.session_id: session},
            active_room_codes={"ROOM12"},
            now=restored_at,
        )
        self.assertIs(restored, session)
        self.assertEqual(session.connection_status, ConnectionStatus.ONLINE)
        self.assertEqual(session.last_seen_at, restored_at)

    def test_restore_rejects_missing_or_inactive_session_context(self) -> None:
        created_at = datetime(2026, 3, 29, 12, 0, tzinfo=timezone.utc)
        session = create_session(nickname="Player 1", room_code="ROOM12", now=created_at)

        with self.assertRaises(SessionError) as missing_error:
            restore_session(
                session_id="session_missing",
                sessions_by_id={session.session_id: session},
                active_room_codes={"ROOM12"},
                now=created_at,
            )
        self.assertEqual(missing_error.exception.error_code, ErrorCode.INVALID_SESSION)

        with self.assertRaises(SessionError) as inactive_error:
            restore_session(
                session_id=session.session_id,
                sessions_by_id={session.session_id: session},
                active_room_codes={"OTHER1"},
                now=created_at,
            )
        self.assertEqual(inactive_error.exception.error_code, ErrorCode.RECOVERY_NOT_AVAILABLE)

    def test_connect_session_marks_online_without_changing_identity(self) -> None:
        created_at = datetime(2026, 3, 29, 12, 0, tzinfo=timezone.utc)
        reconnect_at = datetime(2026, 3, 29, 12, 3, tzinfo=timezone.utc)

        session = create_session(nickname="Player 1", room_code=None, now=created_at)
        disconnect_session(session, now=created_at)

        connect_session(session, now=reconnect_at)

        self.assertEqual(session.connection_status, ConnectionStatus.ONLINE)
        self.assertEqual(session.last_seen_at, reconnect_at)
        self.assertIsNone(session.room_code)


if __name__ == "__main__":
    unittest.main()
