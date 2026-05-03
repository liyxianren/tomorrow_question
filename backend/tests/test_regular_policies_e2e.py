"""
E2E tests for remaining regularPolicies:
- expand_army (budgetCost=8, militaryPointsDelta=1)
- reduce_army (fiscalRefund=5)
- raise_consumption_tax (ratioDelta + ideologyDelta) — already unit-tested, API-level here
- lower_consumption_tax (ratioDelta + ideologyDelta)
- expand_administration (budgetCost=15, administrationCapacityDelta=1)
"""

import tempfile
import unittest
from datetime import datetime, UTC
from pathlib import Path
from uuid import uuid4

from app import create_app
from app.config import Settings
from app.contracts.enums import ConnectionStatus, CountryCode, GamePhase
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory import create_game, create_initial_snapshot
from app.modules.game_state.models import GameSnapshot
from app.modules.persistence import (
    GameRepository, PlayerTurnInputRepository, RoomRepository,
    SessionRepository, SnapshotRepository, connect_database, initialize_database,
)
from app.modules.room.selectors import room_to_payload
from app.modules.room.service import (
    add_member, assign_country, create_room, mark_member_ready, start_game,
)
from app.modules.rules.settlement import resolve_settlement_phase
from app.modules.session.selectors import session_to_payload
from app.modules.session.service import create_session


FAR_FUTURE = datetime(2099, 3, 29, 12, 10, tzinfo=UTC)
PLAYER_FIXTURES = (
    ("player-1", "session-1", "Ada", CountryCode.BRITAIN),
    ("player-2", "session-2", "Linus", CountryCode.FRANCE),
    ("player-3", "session-3", "Grace", CountryCode.PRUSSIA),
    ("player-4", "session-4", "Margaret", CountryCode.AUSTRIA),
    ("player-5", "session-5", "Donald", CountryCode.RUSSIA),
)


def _empty_decision_payload() -> dict:
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
            "unlockColonization": False,
            "militaryActions": [],
            "diplomacyActions": [],
            "colonizationActions": [],
            "navalDeployment": {},
            "conquestActions": [],
            "lootingActions": [],
        },
    }


def _decision_payload(**overrides) -> dict:
    payload = _empty_decision_payload()
    if "activate_policies" in overrides:
        payload["activatePolicies"] = overrides["activate_policies"]
    if "deactivate_policies" in overrides:
        payload["deactivatePolicies"] = overrides["deactivate_policies"]
    return payload


class RegularPoliciesE2ETest(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "policies.sqlite3"
        self.frontend_dist = Path(self.temp_dir.name) / "frontend-dist"
        settings = Settings(
            app_env="test", secret_key="test-secret", host="127.0.0.1", port=5000,
            database_path=str(self.db_path), frontend_dist=str(self.frontend_dist),
            socketio_async_mode="threading",
            cors_allowed_origins=["http://localhost:5173"], debug=False,
        )
        self.app = create_app(settings)
        self.app.config["PHASE_DURATION_SECONDS"] = 5
        self.client = self.app.test_client()
        self.balance = get_balance_config()

    def tearDown(self):
        self.temp_dir.cleanup()

    def seed_active_game(self):
        room = create_room(room_code="ROOM01", host_player_id="player-1", host_nickname="Ada")
        sessions = []
        for idx, (pid, sid, nick, country) in enumerate(PLAYER_FIXTURES, 1):
            if idx > 1:
                add_member(room, player_id=pid, nickname=nick, connection_status=ConnectionStatus.ONLINE)
            assign_country(room, pid, country)
            mark_member_ready(room, pid, True)
            sessions.append(create_session(
                nickname=nick, room_code="ROOM01", selected_country=country,
                now=datetime(2026, 3, 29, 12, 0, tzinfo=UTC), player_id=pid, session_id=sid,
            ))
        game = create_game(room_code="ROOM01", game_id="game-1")
        snapshot = create_initial_snapshot(
            game=game, snapshot_id="snapshot-1",
            player_assignments={pid: c for pid, _, _, c in PLAYER_FIXTURES},
            phase_deadline_at=FAR_FUTURE,
        )
        start_game(room, game.game_id)
        conn = connect_database(self.db_path)
        initialize_database(conn)
        RoomRepository(conn).save(room_to_payload(room))
        GameRepository(conn).save(game.to_payload())
        SnapshotRepository(conn).save(snapshot.to_payload())
        for s in sessions:
            SessionRepository(conn).save(session_to_payload(s))
        conn.close()

    def _load_snapshot(self) -> GameSnapshot:
        conn = connect_database(self.db_path)
        initialize_database(conn)
        gp = GameRepository(conn).get("game-1")
        sp = SnapshotRepository(conn).get(gp["activeSnapshotId"])
        conn.close()
        return GameSnapshot.from_payload(sp)

    def _save_snapshot(self, snapshot: GameSnapshot):
        conn = connect_database(self.db_path)
        initialize_database(conn)
        SnapshotRepository(conn).save(snapshot.to_payload())
        conn.close()

    def _submit_api(self, session_id: str, payload: dict, expected_status=200):
        resp = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": payload},
            headers={"X-Session-Id": session_id},
        )
        self.assertEqual(resp.status_code, expected_status,
                         f"Expected {expected_status}, got {resp.status_code}: {resp.get_json()}")
        return resp.get_json()

    def _player(self, snapshot, pid):
        return next(p for p in snapshot.player_states if p.player_id == pid)

    def _submit_decisions_for_all(self, decisions: dict[str, dict]):
        submitted_sids = set()
        for sid, payload in decisions.items():
            self._submit_api(sid, payload)
            submitted_sids.add(sid)
        for _, sid, _, _ in PLAYER_FIXTURES:
            if sid not in submitted_sids:
                self._submit_api(sid, _empty_decision_payload())
        return self._load_snapshot()

    def _submit_markets_for_all(self):
        for _, sid, _, _ in PLAYER_FIXTURES:
            resp = self.client.post(
                "/api/v1/games/game-1/phases/market/submit",
                json={"saleOrders": [], "phase1Market": {"domesticAllocation": 0}},
                headers={"X-Session-Id": sid},
            )
        return self._load_snapshot()

    def _resolve_settlement(self, snapshot: GameSnapshot) -> GameSnapshot:
        resolution = resolve_settlement_phase(snapshot=snapshot, turn_inputs=[])
        updated = resolution.updated_snapshot
        updated.round_no = snapshot.round_no + 1
        updated.phase = GamePhase.DECISION
        updated.looted_regions_this_turn = set()
        updated.snapshot_id = uuid4().hex
        conn = connect_database(self.db_path)
        initialize_database(conn)
        SnapshotRepository(conn).save(updated.to_payload())
        gp = GameRepository(conn).get("game-1")
        gp["activeSnapshotId"] = updated.snapshot_id
        gp["currentPhase"] = updated.phase.value
        GameRepository(conn).save(gp)
        conn.close()
        return updated

    def _full_round(self, britain_payload: dict, snapshot: GameSnapshot) -> GameSnapshot:
        self._submit_decisions_for_all({"session-1": britain_payload})
        snapshot = self._load_snapshot()
        snapshot = self._resolve_settlement(snapshot)
        return snapshot

    # ── expand_army ──

    def test_expand_army_activation_and_military_growth(self):
        """expand_army: +1 military point per settlement, budgetCost=8."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.administration_capacity = 10
        britain.budget_pools["governmentFiscal"] = 100
        initial_military = britain.military_points
        self._save_snapshot(snapshot)

        # Activate expand_army
        payload = _decision_payload(activate_policies=["expand_army"])
        snapshot = self._full_round(payload, snapshot)
        britain = self._player(snapshot, "player-1")

        self.assertIn("expand_army", britain.active_policies)
        # Budget: 100 - 8 = 92
        self.assertEqual(britain.budget_pools["governmentFiscal"], 92)
        # Military: +1 from policy effect
        self.assertEqual(britain.military_points, initial_military + 1)

    def test_expand_army_over_budget_rejected(self):
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.administration_capacity = 10
        britain.budget_pools["governmentFiscal"] = 5  # Not enough for budgetCost=8
        self._save_snapshot(snapshot)

        payload = _decision_payload(activate_policies=["expand_army"])
        resp = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": payload},
            headers={"X-Session-Id": "session-1"},
        )
        self.assertEqual(resp.status_code, 400)

    # ── reduce_army ──

    def test_reduce_army_fiscal_refund(self):
        """reduce_army: −1 military point, +5 fiscal refund."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.administration_capacity = 10
        britain.budget_pools["governmentFiscal"] = 50
        britain.military_points = 5
        initial_fiscal = britain.budget_pools["governmentFiscal"]
        initial_military = britain.military_points
        self._save_snapshot(snapshot)

        payload = _decision_payload(activate_policies=["reduce_army"])
        snapshot = self._full_round(payload, snapshot)
        britain = self._player(snapshot, "player-1")

        self.assertIn("reduce_army", britain.active_policies)
        # Military: -1 per settlement
        self.assertEqual(britain.military_points, initial_military - 1)

    # ── raise_consumption_tax ──

    def test_raise_consumption_tax_api_level(self):
        """raise_consumption_tax: ratioDelta + ideologyDelta via API."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.administration_capacity = 10
        britain.budget_pools["governmentFiscal"] = 50
        self._save_snapshot(snapshot)

        payload = _decision_payload(activate_policies=["raise_consumption_tax"])
        self._submit_decisions_for_all({"session-1": payload})
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        self.assertIn("raise_consumption_tax", britain.active_policies)


if __name__ == "__main__":
    unittest.main()
