from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app
from app.config import Settings
from app.contracts.enums import ConnectionStatus, CountryCode, ErrorCode, GamePhase, RoomStatus
from app.modules.game_state.models import Game, GameSnapshot, PlayerState
from app.modules.persistence import (
    GameLogRepository,
    GameRepository,
    RoomRepository,
    SessionRepository,
    SnapshotRepository,
    connect_database,
    initialize_database,
)
from app.modules.room.models import Room, RoomMember
from app.modules.session.models import PlayerSession


def build_finished_snapshot_payload(*, tied_income: bool = False) -> dict[str, object]:
    runner_up_income = 88 if tied_income else 77
    snapshot = GameSnapshot(
        snapshot_id="snapshot-finished",
        game_id="game-1",
        round_no=10,
        max_rounds=10,
        phase=GamePhase.SETTLEMENT,
        rules_version="v2",
        player_states=[
            PlayerState(
                player_id="player-1",
                country=CountryCode.BRITAIN,
                domestic_sales_revenue=0,
                overseas_sales_revenue=0,
                national_income=0,
                cumulative_national_income=88,
                income_allocation_ratio={"domesticMarket": 3.0, "factory": 3.0, "governmentFiscal": 4.0},
                budget_pools={"domesticMarket": 10, "factory": 11, "governmentFiscal": 14},
                tech_points=2,
                production_capacity={"handicraft": 2, "mechanized": 1},
                pending_production_capacity={"steam": 0},
                goods_stock={"steel": 0},
                raw_material_usage={},
                research={"steam_engine": 3},
                research_facilities={"academy": 1},
                unlocked_techs=["steam_engine"],
                goods_allocation={},
                army={"infantry": 1},
                navy={"fleets": 2},
                administration_capacity=0,
                ideology_levels={"liberalism": 2, "egalitarianism": 0, "nationalism": 1},
                reforms=[],
                policies=[],
                income_summary={"domesticSalesRevenue": 0, "overseasSalesRevenue": 0, "nationalIncome": 0},
            ),
            PlayerState(
                player_id="player-2",
                country=CountryCode.FRANCE,
                domestic_sales_revenue=0,
                overseas_sales_revenue=0,
                national_income=0,
                cumulative_national_income=runner_up_income,
                income_allocation_ratio={"domesticMarket": 3.0, "factory": 3.0, "governmentFiscal": 4.0},
                budget_pools={"domesticMarket": 8, "factory": 9, "governmentFiscal": 11},
                tech_points=1,
                production_capacity={"handicraft": 2},
                pending_production_capacity={"mechanized": 0},
                goods_stock={"grain": 0},
                raw_material_usage={},
                research={"steam_engine": 2},
                research_facilities={"academy": 0},
                unlocked_techs=[],
                goods_allocation={},
                army={"infantry": 1},
                navy={"fleets": 1},
                administration_capacity=0,
                ideology_levels={"liberalism": 1, "egalitarianism": 1, "nationalism": 1},
                reforms=[],
                policies=[],
                income_summary={"domesticSalesRevenue": 0, "overseasSalesRevenue": 0, "nationalIncome": 0},
            ),
        ],
        ranking=[
            {
                "rank": 1,
                "playerId": "player-1",
                "countryId": CountryCode.BRITAIN,
                "cumulativeNationalIncome": 88,
                "tieBreak": {"productionCapacity": 3, "controlledRegions": 2, "budgetPoolsTotal": 35},
            },
            {
                "rank": 2,
                "playerId": "player-2",
                "countryId": CountryCode.FRANCE,
                "cumulativeNationalIncome": runner_up_income,
                "tieBreak": {"productionCapacity": 2, "controlledRegions": 1, "budgetPoolsTotal": 28},
            },
        ],
        last_settlement_summary={
            "settledPhase": "settlement",
            "headline": "财政结算完成，国家收入已按比例回流三类预算池。",
            "totalSettledIncome": 22,
            "summaryLines": ["英国累计国家收入领先。"],
        },
    )
    return snapshot.to_payload()


class FinalResultApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "final-result.sqlite3"
        settings = Settings(
            app_env="test",
            secret_key="test-secret",
            host="127.0.0.1",
            port=5000,
            database_path=str(self.database_path),
            frontend_dist=str(Path(self.temp_dir.name) / "frontend-dist"),
            socketio_async_mode="threading",
            cors_allowed_origins=["http://localhost:5173"],
            debug=False,
        )
        self.app = create_app(settings)
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def seed_finished_game(self, *, tied_income: bool = False) -> None:
        connection = connect_database(self.database_path)
        initialize_database(connection)

        room = Room(
            room_code="ROOM01",
            host_player_id="player-1",
            members=[
                RoomMember(
                    player_id="player-1",
                    nickname="Ada",
                    selected_country=CountryCode.BRITAIN,
                    connection_status=ConnectionStatus.ONLINE,
                    is_ready=True,
                ),
                RoomMember(
                    player_id="player-2",
                    nickname="Linus",
                    selected_country=CountryCode.FRANCE,
                    connection_status=ConnectionStatus.ONLINE,
                    is_ready=True,
                ),
            ],
            status=RoomStatus.FINISHED,
            current_game_id="game-1",
        )
        game = Game(
            game_id="game-1",
            room_code="ROOM01",
            current_round=10,
            total_rounds=10,
            current_phase=GamePhase.SETTLEMENT,
            is_finished=True,
            active_snapshot_id="snapshot-finished",
        )
        session = PlayerSession(
            player_id="player-1",
            session_id="session-1",
            nickname="Ada",
            room_code="ROOM01",
            selected_country=CountryCode.BRITAIN,
            connection_status=ConnectionStatus.ONLINE,
        )

        RoomRepository(connection).save(room.to_payload())
        GameRepository(connection).save(game.to_payload())
        SnapshotRepository(connection).save(build_finished_snapshot_payload(tied_income=tied_income))
        SessionRepository(connection).save(session.to_payload())
        GameLogRepository(connection).save(
            {
                "gameId": "game-1",
                "roundNo": 10,
                "phase": GamePhase.SETTLEMENT,
                "kind": "settlement.phase_resolved",
                "message": "settlement settled.",
                "details": {"settledPhase": "settlement"},
                "createdAt": "2026-03-29T12:12:00+00:00",
            }
        )
        GameLogRepository(connection).save(
            {
                "gameId": "game-1",
                "roundNo": 10,
                "phase": GamePhase.SETTLEMENT,
                "kind": "settlement.resolved",
                "message": "Britain completed Round 10 fiscal allocation.",
                "details": {"playerId": "player-1"},
                "createdAt": "2026-03-29T12:12:01+00:00",
            }
        )
        connection.close()

    def test_final_result_returns_structured_ranking_and_logs_for_room_member(self) -> None:
        self.seed_finished_game()

        response = self.client.get(
            "/api/v1/games/game-1/final-result",
            headers={"X-Session-Id": "session-1", "Accept-Language": "zh-CN"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["game"]["currentPhase"], GamePhase.SETTLEMENT.value)
        self.assertEqual(payload["data"]["finalRanking"][0]["cumulativeNationalIncome"], 88)
        self.assertEqual(payload["data"]["finalRanking"][0]["tieBreak"]["budgetPoolsTotal"], 35)
        self.assertGreaterEqual(len(payload["data"]["finalLogs"]), 1)
        log_messages = [entry["message"] for entry in payload["data"]["finalLogs"]]
        self.assertIn("终局财政结算已完成。", log_messages)
        self.assertIn("英国完成第 10 回合财政分配。", log_messages)
        self.assertNotIn("settlement settled.", log_messages)
        self.assertNotIn("britain completed national income allocation.", log_messages)
        self.assertNotIn("Britain completed Round 10 fiscal allocation.", log_messages)

    def test_final_result_tied_income_uses_tie_break_copy_in_zh(self) -> None:
        self.seed_finished_game(tied_income=True)

        response = self.client.get(
            "/api/v1/games/game-1/final-result",
            headers={"X-Session-Id": "session-1", "Accept-Language": "zh-CN"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()["data"]
        self.assertEqual(data["finalRanking"][0]["cumulativeNationalIncome"], 88)
        self.assertEqual(data["finalRanking"][1]["cumulativeNationalIncome"], 88)
        self.assertEqual(data["turningPointCards"][1]["title"], "终局同分由同分规则裁定")
        self.assertIn("同为 88 累计国家收入", data["turningPointCards"][1]["detail"])
        self.assertNotIn("领先 法国 的 88", data["turningPointCards"][1]["detail"])

    def test_final_result_respects_english_accept_language(self) -> None:
        self.seed_finished_game(tied_income=True)

        response = self.client.get(
            "/api/v1/games/game-1/final-result",
            headers={"X-Session-Id": "session-1", "Accept-Language": "en-US,en;q=0.9"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()["data"]
        self.assertEqual(data["turningPointCards"][1]["title"], "Final tie decided by tie-breaks")
        self.assertIn("both finished with 88 cumulative national income", data["turningPointCards"][1]["detail"])
        self.assertIn("Final fiscal settlement is complete.", [entry["message"] for entry in data["finalLogs"]])
        self.assertIn("Britain completed Round 10 fiscal allocation.", [entry["message"] for entry in data["finalLogs"]])

    def test_final_result_rejects_invalid_session(self) -> None:
        self.seed_finished_game()

        response = self.client.get(
            "/api/v1/games/game-1/final-result",
            headers={"X-Session-Id": "missing-session"},
        )

        self.assertEqual(response.status_code, 401)
        payload = response.get_json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], ErrorCode.INVALID_SESSION.value)


if __name__ == "__main__":
    unittest.main()
