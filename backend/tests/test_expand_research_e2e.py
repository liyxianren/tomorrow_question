"""
E2E tests for expand_research regularPolicy via activatePolicies.

Verifies the complete chain:
  1. Activate expand_research via activatePolicies → policy added to active_policies
  2. Settlement phase applies researchFacilityDelta each turn (academy +1)
  3. Deactivate → effects stop accumulating
  4. Budget cost (12) is deducted from governmentFiscal when activated
  5. Admin cost check: insufficient admin → policy not activated
  6. Multiple turns: facilities grow each turn the policy is active
"""

import tempfile
import unittest
from datetime import datetime, timezone, UTC
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
from app.modules.rules.decision import resolve_decision_phase
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


class ExpandResearchE2ETest(unittest.TestCase):
    """Full E2E: activate expand_research → settlement → verify facility growth."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "expand-research.sqlite3"
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

    # ── DB helpers ──

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

    def _submit_market_api(self, session_id: str, payload: dict, expected_status=200):
        resp = self.client.post(
            "/api/v1/games/game-1/phases/market/submit",
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
            self._submit_market_api(sid, {"saleOrders": [], "phase1Market": {"domesticAllocation": 0}})
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
        """Submit decisions for all players, then settlement."""
        self._submit_decisions_for_all({"session-1": britain_payload})
        snapshot = self._load_snapshot()
        snapshot = self._resolve_settlement(snapshot)
        return snapshot

    # ── Tests ──

    def test_expand_research_activation_adds_policy(self):
        """Activating expand_research adds it to active_policies."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        # Ensure enough admin capacity and budget
        britain.administration_capacity = 10
        britain.budget_pools["governmentFiscal"] = 100
        self._save_snapshot(snapshot)

        # Activate expand_research
        payload = _decision_payload(activate_policies=["expand_research"])
        self._submit_decisions_for_all({"session-1": payload})
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        self.assertIn("expand_research", britain.active_policies)

    def test_expand_research_facility_growth_per_settlement(self):
        """Each settlement turn, expand_research adds +1 academy."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        # Set up: enough admin, budget, and initial facilities
        britain.administration_capacity = 20
        britain.budget_pools["governmentFiscal"] = 500
        initial_academies = britain.research_facilities.get("academy", 1)
        self._save_snapshot(snapshot)

        # Turn 1: activate expand_research
        payload = _decision_payload(activate_policies=["expand_research"])
        snapshot = self._full_round(payload, snapshot)
        britain = self._player(snapshot, "player-1")

        # Policy should be active
        self.assertIn("expand_research", britain.active_policies)
        # After settlement: academies should have grown by 1
        self.assertEqual(britain.research_facilities.get("academy", 0), initial_academies + 1)

        # Turn 2: keep policy active (don't re-activate, just submit empty)
        snapshot = self._full_round(_empty_decision_payload(), snapshot)
        britain = self._player(snapshot, "player-1")

        # Still active, academies grow again
        self.assertIn("expand_research", britain.active_policies)
        self.assertEqual(britain.research_facilities.get("academy", 0), initial_academies + 2)

    def test_expand_research_deactivation_stops_growth(self):
        """Deactivating expand_research stops facility growth."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        britain.administration_capacity = 20
        britain.budget_pools["governmentFiscal"] = 500
        initial_academies = britain.research_facilities.get("academy", 1)
        self._save_snapshot(snapshot)

        # Turn 1: activate
        payload = _decision_payload(activate_policies=["expand_research"])
        snapshot = self._full_round(payload, snapshot)
        britain = self._player(snapshot, "player-1")
        self.assertIn("expand_research", britain.active_policies)
        academies_after_1 = britain.research_facilities.get("academy", 0)

        # Turn 2: deactivate
        payload = _decision_payload(deactivate_policies=["expand_research"])
        snapshot = self._full_round(payload, snapshot)
        britain = self._player(snapshot, "player-1")
        self.assertNotIn("expand_research", britain.active_policies)
        # Academies should NOT have grown this turn (policy was deactivated before settlement)
        self.assertEqual(britain.research_facilities.get("academy", 0), academies_after_1)

    def test_expand_research_insufficient_admin_not_activated(self):
        """If admin capacity < adminCostPerTurn, policy is not activated."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        # Set admin to 0
        britain.administration_capacity = 0
        britain.budget_pools["governmentFiscal"] = 100
        self._save_snapshot(snapshot)

        payload = _decision_payload(activate_policies=["expand_research"])
        self._submit_decisions_for_all({"session-1": payload})
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        # Should NOT be activated
        self.assertNotIn("expand_research", britain.active_policies)

    def test_expand_research_admin_cost_deducted_on_activation(self):
        """Activating expand_research deducts adminCostPerTurn from admin capacity."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        britain.administration_capacity = 5
        britain.budget_pools["governmentFiscal"] = 100
        self._save_snapshot(snapshot)

        payload = _decision_payload(activate_policies=["expand_research"])
        self._submit_decisions_for_all({"session-1": payload})
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        # admin_cost_per_turn is now deducted exclusively at settlement, not at activation
        self.assertEqual(britain.administration_capacity, 5)
        self.assertIn("expand_research", britain.active_policies)

    def test_expand_research_multi_turn_accumulation(self):
        """Over 3 turns, academies grow by exactly 3 (one per settlement)."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        britain.administration_capacity = 20
        britain.budget_pools["governmentFiscal"] = 500
        initial_academies = britain.research_facilities.get("academy", 1)
        self._save_snapshot(snapshot)

        # Activate on turn 1
        payload = _decision_payload(activate_policies=["expand_research"])
        snapshot = self._full_round(payload, snapshot)

        # Turn 2 & 3: policy stays active
        for _ in range(2):
            snapshot = self._full_round(_empty_decision_payload(), snapshot)

        britain = self._player(snapshot, "player-1")
        self.assertEqual(britain.research_facilities.get("academy", 0), initial_academies + 3)

    def test_expand_research_already_active_no_double_activation(self):
        """Activating an already-active policy is a no-op (no double effects)."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        britain.administration_capacity = 20
        britain.budget_pools["governmentFiscal"] = 500
        initial_academies = britain.research_facilities.get("academy", 1)
        self._save_snapshot(snapshot)

        # Turn 1: activate
        payload = _decision_payload(activate_policies=["expand_research"])
        snapshot = self._full_round(payload, snapshot)

        # Turn 2: try to activate again (should be no-op since already active)
        payload = _decision_payload(activate_policies=["expand_research"])
        snapshot = self._full_round(payload, snapshot)

        britain = self._player(snapshot, "player-1")
        # Should only be +2 (one per settlement), not +3
        self.assertEqual(britain.research_facilities.get("academy", 0), initial_academies + 2)

    def test_expand_research_budget_cost_deducted(self):
        """expand_research has budgetCost=12 — deducted from governmentFiscal on activation."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.administration_capacity = 10
        britain.budget_pools["governmentFiscal"] = 100
        self._save_snapshot(snapshot)

        payload = _decision_payload(activate_policies=["expand_research"])
        self._submit_decisions_for_all({"session-1": payload})
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")

        self.assertIn("expand_research", britain.active_policies)
        self.assertEqual(britain.budget_pools["governmentFiscal"], 88)  # 100 - 12

    def test_expand_research_over_budget_rejected(self):
        """Activating expand_research with insufficient budget is rejected (400)."""
        self.seed_active_game()
        snapshot = self._load_snapshot()
        britain = self._player(snapshot, "player-1")
        britain.administration_capacity = 10
        britain.budget_pools["governmentFiscal"] = 5  # Not enough for budgetCost=12
        self._save_snapshot(snapshot)

        payload = _decision_payload(activate_policies=["expand_research"])
        resp = self.client.post(
            "/api/v1/games/game-1/phases/decision/submit",
            json={"payload": payload},
            headers={"X-Session-Id": "session-1"},
        )
        self.assertEqual(resp.status_code, 400)


