import json
import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import (
    ConnectionStatus,
    CountryCode,
    GamePhase,
    PlayerSubmissionStatus,
    RegionAccessLevel,
    RoomStatus,
)
from app.modules.persistence import (
    GameRepository,
    GameLogRepository,
    PlayerTurnInputRepository,
    RecoveryRepository,
    RoomRepository,
    SessionRepository,
    SnapshotRepository,
    connect_database,
    initialize_database,
)
from app.modules.game_state.models import GameSnapshot
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.workspaces import hydrate_snapshot_workspaces


def build_room_payload(current_game_id: str | None = None) -> dict[str, object]:
    return {
        "roomCode": "ROOM01",
        "status": RoomStatus.READYING,
        "hostPlayerId": "player-1",
        "memberPlayerIds": ["player-1", "player-2"],
        "members": [
            {
                "playerId": "player-1",
                "nickname": "Ada",
                "selectedCountry": CountryCode.BRITAIN,
                "connectionStatus": ConnectionStatus.ONLINE,
                "isReady": True,
                "memberType": "human",
                "botProfileKey": None,
            },
            {
                "playerId": "player-2",
                "nickname": "Linus",
                "selectedCountry": CountryCode.FRANCE,
                "connectionStatus": ConnectionStatus.OFFLINE_RECOVERABLE,
                "isReady": False,
                "memberType": "human",
                "botProfileKey": None,
            },
        ],
        "countrySlots": {
            CountryCode.BRITAIN.value: "player-1",
            CountryCode.FRANCE.value: "player-2",
            CountryCode.PRUSSIA.value: None,
            CountryCode.AUSTRIA.value: None,
            CountryCode.RUSSIA.value: None,
        },
        "currentGameId": current_game_id,
        "lastActivityAt": "2026-03-29T12:00:00+00:00",
    }


def build_session_payload(
    session_id: str = "session-1",
    player_id: str = "player-1",
    room_code: str | None = "ROOM01",
) -> dict[str, object]:
    return {
        "playerId": player_id,
        "sessionId": session_id,
        "nickname": "Ada" if player_id == "player-1" else "Linus",
        "roomCode": room_code,
        "selectedCountry": CountryCode.BRITAIN if player_id == "player-1" else CountryCode.FRANCE,
        "connectionStatus": ConnectionStatus.ONLINE if player_id == "player-1" else ConnectionStatus.OFFLINE_RECOVERABLE,
        "lastSeenAt": "2026-03-29T12:00:00Z",
    }


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


def build_snapshot_payload(snapshot_id: str = "snapshot-1", round_no: int = 3) -> dict[str, object]:
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
        phase_deadline_at=datetime(2026, 3, 29, 12, 10, tzinfo=UTC),
    )
    snapshot.round_no = round_no
    snapshot.phase = GamePhase.MARKET
    player = snapshot.player_states[0]
    player.domestic_sales_revenue = 7
    player.overseas_sales_revenue = 11
    player.national_income = 18
    player.cumulative_national_income = 54
    player.budget_pools = {"domesticMarket": 40, "factory": 20, "governmentFiscal": 120}
    player.production_capacity = {"idle": 0, "handicraft": 2, "mechanized": 1, "steam": 0, "electrified": 0}
    player.pending_production_capacity = {"idle": 0, "handicraft": 0, "mechanized": 1, "steam": 0, "electrified": 0}
    player.goods_stock = {"coal": 2}
    player.raw_material_usage = {"coal": 1}
    player.research = {"spinning_jenny": 3, "steam_engine": 1, "steelmaking": 0}
    player.research_facilities = {"public_labs": 1}
    player.unlocked_techs = ["steam_engine"]
    player.unlocked_talents = ["ind_basic_metallurgy"]
    player.goods_allocation = {"home_market": 2}
    player.army = {"infantry": 6}
    player.navy = {"fleet": 2}
    player.established_diplomacy = ["africa"]
    player.colonization_unlocked = True
    player.administration_capacity = 3
    player.ideology_levels = {"liberalism": 1}
    player.reforms = ["tax_reform"]
    player.policies = ["free_trade"]
    player.income_summary = {"domesticMarketCapacity": 2, "overseasMarketCapacity": 1}
    snapshot.region_states = snapshot.region_states[:1]
    snapshot.region_states[0].access_level = RegionAccessLevel.CONCESSION
    snapshot.region_states[0].market_supply = {"tea": 7}
    snapshot.region_states[0].market_price = {"tea": 3}
    snapshot.region_states[0].controller = CountryCode.BRITAIN.value
    snapshot.region_states[0].garrison = {CountryCode.BRITAIN.value: 2}
    snapshot.region_states[0].independence = 20
    snapshot.region_states[0].resource_limit = {"tea": 9}
    snapshot.ocean_node_states = snapshot.ocean_node_states[:1]
    snapshot.ocean_node_states[0].navy_by_country = {CountryCode.BRITAIN.value: 2}
    snapshot.ocean_node_states[0].controller = CountryCode.BRITAIN.value
    snapshot.ocean_node_states[0].is_blockaded = False
    snapshot.ocean_node_states[0].reachable_routes = ["channel"]
    snapshot.ranking = [
        {
            "rank": 1,
            "playerId": "player-1",
            "countryId": CountryCode.BRITAIN,
            "cumulativeNationalIncome": 54,
            "tieBreak": {"productionCapacity": 4, "controlledRegions": 1, "budgetPoolsTotal": 180},
        }
    ]
    snapshot.last_settlement_summary = {
        "settledPhase": "market",
        "headline": "市场回款已进入国家收入。",
        "summaryLines": ["player-1 获得 18 点国家收入。"],
    }
    hydrate_snapshot_workspaces(snapshot)
    return snapshot.to_payload()


def build_turn_input_payload(
    player_id: str = "player-1",
    *,
    round_no: int = 3,
    phase: GamePhase = GamePhase.MARKET,
    submission_status: PlayerSubmissionStatus = PlayerSubmissionStatus.SUBMITTED,
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
                {"goodsId": "tea", "market": "domestic", "quantity": 3 if player_id == "player-1" else 1}
            ]
        },
        "submittedAt": "2026-03-29T12:05:00Z",
        "isTimeoutGenerated": is_timeout_generated,
    }


def build_game_log_payload(
    kind: str = "phase_settled",
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
        "details": {"delta": {"player-1": 18}},
        "createdAt": "2026-03-29T12:10:00Z",
    }


class PersistenceRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "test.sqlite3"
        self.connection = connect_database(self.database_path)
        initialize_database(self.connection)

        self.room_repository = RoomRepository(self.connection)
        self.session_repository = SessionRepository(self.connection)
        self.game_repository = GameRepository(self.connection)
        self.snapshot_repository = SnapshotRepository(self.connection)
        self.turn_input_repository = PlayerTurnInputRepository(self.connection)
        self.game_log_repository = GameLogRepository(self.connection)
        self.recovery_repository = RecoveryRepository(self.connection)

    def tearDown(self) -> None:
        self.connection.close()
        self.temp_dir.cleanup()

    def test_room_and_session_round_trip(self) -> None:
        room_payload = build_room_payload()
        session_payload = build_session_payload()

        self.room_repository.save(room_payload)
        self.session_repository.save(session_payload)

        self.assertEqual(self.room_repository.get("ROOM01"), room_payload)
        self.assertEqual(self.session_repository.get("session-1"), session_payload)

    def test_game_and_snapshot_round_trip(self) -> None:
        game_payload = build_game_payload()
        snapshot_payload = build_snapshot_payload()

        self.game_repository.save(game_payload)
        self.snapshot_repository.save(snapshot_payload)

        self.assertEqual(self.game_repository.get("game-1"), game_payload)
        loaded = self.snapshot_repository.get("snapshot-1")
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["snapshotId"], snapshot_payload["snapshotId"])
        self.assertEqual(loaded["round"], snapshot_payload["round"])
        self.assertEqual(loaded["phase"], snapshot_payload["phase"])
        self.assertEqual(set(loaded["nationalStateByPlayer"].keys()), set(snapshot_payload["nationalStateByPlayer"].keys()))
        for pid in loaded["nationalStateByPlayer"]:
            self.assertEqual(loaded["nationalStateByPlayer"][pid]["cumulativeNationalIncome"], snapshot_payload["nationalStateByPlayer"][pid]["cumulativeNationalIncome"])
        self.assertEqual(
            loaded["nationalStateByPlayer"]["player-1"]["unlockedTalents"],
            ["ind_basic_metallurgy"],
        )
        self.assertEqual(
            loaded["nationalStateByPlayer"]["player-1"]["establishedDiplomacy"],
            ["africa"],
        )
        self.assertTrue(loaded["nationalStateByPlayer"]["player-1"]["colonizationUnlocked"])

    def test_turn_input_round_trip_and_phase_listing(self) -> None:
        first_turn_input = build_turn_input_payload(player_id="player-1")
        second_turn_input = build_turn_input_payload(
            player_id="player-2",
            submission_status=PlayerSubmissionStatus.TIMEOUT_AUTO_SUBMITTED,
            is_timeout_generated=True,
        )

        self.turn_input_repository.save(first_turn_input)
        self.turn_input_repository.save(second_turn_input)

        self.assertEqual(
            self.turn_input_repository.get("game-1", 3, GamePhase.MARKET, "player-1"),
            first_turn_input,
        )
        self.assertEqual(
            self.turn_input_repository.list_for_phase("game-1", 3, GamePhase.MARKET),
            [first_turn_input, second_turn_input],
        )

    def test_game_log_append_and_game_listing(self) -> None:
        phase_log = build_game_log_payload()
        final_log = build_game_log_payload(
            kind="game_finished",
            round_no=15,
            phase=None,
            message="Game finished.",
        )

        self.game_log_repository.save(phase_log)
        self.game_log_repository.save(final_log)

        self.assertEqual(
            self.game_log_repository.list_for_game("game-1"),
            [phase_log, final_log],
        )
        self.assertEqual(
            self.game_log_repository.list_for_phase("game-1", 3, GamePhase.MARKET),
            [phase_log],
        )

    def test_room_context_uses_room_active_game_and_snapshot(self) -> None:
        first_snapshot = build_snapshot_payload(snapshot_id="snapshot-1", round_no=3)
        second_snapshot = build_snapshot_payload(snapshot_id="snapshot-2", round_no=4)
        game_payload = build_game_payload(active_snapshot_id="snapshot-2")
        room_payload = build_room_payload(current_game_id="game-1")

        self.room_repository.save(room_payload)
        self.game_repository.save(game_payload)
        self.snapshot_repository.save(first_snapshot)
        self.snapshot_repository.save(second_snapshot)

        context = self.recovery_repository.get_room_context("ROOM01")

        self.assertIsNotNone(context)
        self.assertEqual(context["room"], room_payload)
        self.assertEqual(context["activeGame"], game_payload)
        self.assertEqual(context["activeSnapshot"]["snapshotId"], second_snapshot["snapshotId"])
        self.assertEqual(context["activeSnapshot"]["round"], second_snapshot["round"])

    def test_restore_session_context_returns_session_room_and_active_state(self) -> None:
        room_payload = build_room_payload(current_game_id="game-1")
        session_payload = build_session_payload()
        game_payload = build_game_payload(active_snapshot_id="snapshot-1")
        snapshot_payload = build_snapshot_payload()
        turn_input_payload = build_turn_input_payload()
        game_log_payload = build_game_log_payload()

        self.room_repository.save(room_payload)
        self.session_repository.save(session_payload)
        self.game_repository.save(game_payload)
        self.snapshot_repository.save(snapshot_payload)
        self.turn_input_repository.save(turn_input_payload)
        self.game_log_repository.save(game_log_payload)

        restored = self.recovery_repository.restore_session("session-1")

        self.assertIsNotNone(restored)
        self.assertEqual(restored["session"], session_payload)
        self.assertEqual(restored["room"], room_payload)
        self.assertEqual(restored["activeGame"], game_payload)
        self.assertEqual(restored["activeSnapshot"]["snapshotId"], snapshot_payload["snapshotId"])
        self.assertEqual(restored["activeSnapshot"]["round"], snapshot_payload["round"])
        self.assertEqual(restored["activeTurnInputs"], [turn_input_payload])
        self.assertEqual(restored["gameLogs"], [game_log_payload])

    def test_restore_session_without_room_returns_session_only(self) -> None:
        session_payload = build_session_payload(room_code=None)
        self.session_repository.save(session_payload)

        restored = self.recovery_repository.restore_session("session-1")

        self.assertEqual(restored, {"session": session_payload})

    def test_load_active_state_returns_current_room_session_game_snapshot_and_records(self) -> None:
        room_payload = build_room_payload(current_game_id="game-1")
        session_payload = build_session_payload()
        game_payload = build_game_payload(active_snapshot_id="snapshot-1")
        snapshot_payload = build_snapshot_payload()
        turn_input_payload = build_turn_input_payload()
        game_log_payload = build_game_log_payload()

        self.room_repository.save(room_payload)
        self.session_repository.save(session_payload)
        self.game_repository.save(game_payload)
        self.snapshot_repository.save(snapshot_payload)
        self.turn_input_repository.save(turn_input_payload)
        self.game_log_repository.save(game_log_payload)

        active_state = self.recovery_repository.load_active_state()

        self.assertEqual(active_state["rooms"], [room_payload])
        self.assertEqual(active_state["sessions"], [session_payload])
        self.assertEqual(active_state["games"], [game_payload])
        self.assertEqual(len(active_state["snapshots"]), 1)
        self.assertEqual(active_state["snapshots"][0]["snapshotId"], snapshot_payload["snapshotId"])
        self.assertEqual(active_state["turnInputs"], [turn_input_payload])
        self.assertEqual(active_state["gameLogs"], [game_log_payload])
        self.assertEqual(len(active_state["roomContexts"]), 1)
        self.assertEqual(active_state["roomContexts"][0]["room"], room_payload)
        self.assertEqual(active_state["roomContexts"][0]["activeTurnInputs"], [turn_input_payload])
        self.assertEqual(active_state["roomContexts"][0]["gameLogs"], [game_log_payload])

    def test_load_active_state_preserves_duplicate_game_logs_with_same_payload(self) -> None:
        room_payload = build_room_payload(current_game_id="game-1")
        session_payload = build_session_payload()
        game_payload = build_game_payload(active_snapshot_id="snapshot-1")
        snapshot_payload = build_snapshot_payload()
        first_log_payload = build_game_log_payload()
        second_log_payload = build_game_log_payload()

        self.room_repository.save(room_payload)
        self.session_repository.save(session_payload)
        self.game_repository.save(game_payload)
        self.snapshot_repository.save(snapshot_payload)
        self.game_log_repository.save(first_log_payload)
        self.game_log_repository.save(second_log_payload)

        active_state = self.recovery_repository.load_active_state()

        self.assertEqual(active_state["gameLogs"], [first_log_payload, second_log_payload])
        self.assertEqual(
            active_state["roomContexts"][0]["gameLogs"],
            [first_log_payload, second_log_payload],
        )

    def test_load_active_state_skips_legacy_game_phase_payloads(self) -> None:
        room_payload = build_room_payload(current_game_id="legacy-game")
        session_payload = build_session_payload(room_code="ROOM01")
        legacy_game_payload = {
            "gameId": "legacy-game",
            "roomCode": "ROOM01",
            "currentRound": 7,
            "totalRounds": 15,
            "currentPhase": "military",
            "isFinished": False,
            "activeSnapshotId": "legacy-snapshot",
        }

        self.room_repository.save(room_payload)
        self.session_repository.save(session_payload)
        self.connection.execute(
            """
            INSERT INTO games (
                game_id,
                room_code,
                current_round,
                total_rounds,
                current_phase,
                is_finished,
                active_snapshot_id,
                payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "legacy-game",
                "ROOM01",
                7,
                15,
                "military",
                0,
                "legacy-snapshot",
                json.dumps(legacy_game_payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True),
            ),
        )
        self.connection.commit()

        context = self.recovery_repository.get_room_context("ROOM01")
        self.assertEqual(context, {"room": room_payload})

        active_state = self.recovery_repository.load_active_state()
        self.assertEqual(active_state["games"], [])
        self.assertEqual(active_state["snapshots"], [])
        self.assertEqual(active_state["turnInputs"], [])
        self.assertEqual(active_state["roomContexts"], [{"room": room_payload}])


if __name__ == "__main__":
    unittest.main()
