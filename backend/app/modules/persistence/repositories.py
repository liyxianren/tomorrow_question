from __future__ import annotations

import json
import sqlite3
from copy import deepcopy
from typing import Any, Callable

from ...contracts.enums import (
    ConnectionStatus,
    CountryCode,
    GamePhase,
    PlayerSubmissionStatus,
    RegionAccessLevel,
    RoomStatus,
)
from ...contracts.models import (
    GameLogPayload,
    GamePayload,
    GameSnapshotPayload,
    PlayerSessionPayload,
    PlayerTurnInputPayload,
    RoomPayload,
)


PayloadNormalizer = Callable[[dict[str, Any]], dict[str, Any]]


def _dump_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def _load_payload(payload_json: str) -> dict[str, Any]:
    return json.loads(payload_json)


def _coerce_enum(value: Any, enum_type: type) -> Any:
    if value is None or isinstance(value, enum_type):
        return value
    return enum_type(value)


def _normalize_room_payload(payload: dict[str, Any]) -> RoomPayload:
    members: list[dict[str, Any]] = []
    for member in payload["members"]:
        members.append(
            {
                "playerId": member["playerId"],
                "nickname": member["nickname"],
                "selectedCountry": _coerce_enum(member["selectedCountry"], CountryCode),
                "connectionStatus": _coerce_enum(member["connectionStatus"], ConnectionStatus),
                "isReady": bool(member["isReady"]),
                "memberType": str(member.get("memberType") or "human"),
                "botProfileKey": member.get("botProfileKey"),
            }
        )

    return {
        "roomCode": payload["roomCode"],
        "status": _coerce_enum(payload["status"], RoomStatus),
        "hostPlayerId": payload["hostPlayerId"],
        "memberPlayerIds": list(payload["memberPlayerIds"]),
        "members": members,
        "countrySlots": dict(payload["countrySlots"]),
        "currentGameId": payload["currentGameId"],
        "lastActivityAt": payload.get("lastActivityAt"),
    }


def _normalize_session_payload(payload: dict[str, Any]) -> PlayerSessionPayload:
    return {
        "playerId": payload["playerId"],
        "sessionId": payload["sessionId"],
        "nickname": payload["nickname"],
        "roomCode": payload["roomCode"],
        "selectedCountry": _coerce_enum(payload["selectedCountry"], CountryCode),
        "connectionStatus": _coerce_enum(payload["connectionStatus"], ConnectionStatus),
        "lastSeenAt": payload["lastSeenAt"],
    }


def _normalize_game_payload(payload: dict[str, Any]) -> GamePayload:
    return {
        "gameId": payload["gameId"],
        "roomCode": payload["roomCode"],
        "currentRound": int(payload["currentRound"]),
        "totalRounds": int(payload["totalRounds"]),
        "currentPhase": _coerce_enum(payload["currentPhase"], GamePhase),
        "isFinished": bool(payload["isFinished"]),
        "activeSnapshotId": payload["activeSnapshotId"],
    }


def _normalize_turn_input_payload(payload: dict[str, Any]) -> PlayerTurnInputPayload:
    return {
        "gameId": payload["gameId"],
        "roundNo": int(payload["roundNo"]),
        "phase": _coerce_enum(payload["phase"], GamePhase),
        "playerId": payload["playerId"],
        "submissionStatus": _coerce_enum(payload["submissionStatus"], PlayerSubmissionStatus),
        "payload": dict(payload["payload"]),
        "submittedAt": payload["submittedAt"],
        "isTimeoutGenerated": bool(payload["isTimeoutGenerated"]),
    }


def _normalize_game_log_payload(payload: dict[str, Any]) -> GameLogPayload:
    phase = payload["phase"]
    return {
        "gameId": payload["gameId"],
        "roundNo": int(payload["roundNo"]),
        "phase": _coerce_enum(phase, GamePhase) if phase is not None else None,
        "kind": payload["kind"],
        "message": payload["message"],
        "details": dict(payload["details"]),
        "createdAt": payload["createdAt"],
    }


def _normalize_snapshot_payload(payload: dict[str, Any]) -> GameSnapshotPayload:
    rules_version = str(payload.get("rulesVersion") or "")
    if rules_version != "v2":
        raise ValueError("Legacy snapshot is not compatible with rulesVersion v2. Please restart the room.")

    national_state_by_player: dict[str, Any] = {}
    for player_id, player_state in payload["nationalStateByPlayer"].items():
        national_state_by_player[str(player_id)] = {
            "countryId": _coerce_enum(player_state["countryId"], CountryCode),
            "domesticSalesRevenue": int(player_state["domesticSalesRevenue"]),
            "overseasSalesRevenue": int(player_state["overseasSalesRevenue"]),
            "nationalIncome": int(player_state["nationalIncome"]),
            "cumulativeNationalIncome": int(player_state["cumulativeNationalIncome"]),
            "incomeAllocationRatio": {
                "domesticMarket": float(player_state["incomeAllocationRatio"]["domesticMarket"]),
                "factory": float(player_state["incomeAllocationRatio"]["factory"]),
                "governmentFiscal": float(player_state["incomeAllocationRatio"]["governmentFiscal"]),
            },
            "budgetPools": {
                "domesticMarket": int(player_state["budgetPools"]["domesticMarket"]),
                "factory": int(player_state["budgetPools"]["factory"]),
                "governmentFiscal": int(player_state["budgetPools"]["governmentFiscal"]),
            },
            "techPoints": int(player_state["techPoints"]),
            "militaryPoints": int(player_state["militaryPoints"]),
            "productionCapacity": dict(player_state["productionCapacity"]),
            "pendingProductionCapacity": dict(player_state["pendingProductionCapacity"]),
            "goodsStock": dict(player_state["goodsStock"]),
            "rawMaterialUsage": dict(player_state["rawMaterialUsage"]),
            "research": dict(player_state["research"]),
            "researchFacilities": dict(player_state["researchFacilities"]),
            "unlockedTechs": list(player_state["unlockedTechs"]),
            "unlockedTalents": list(player_state.get("unlockedTalents", [])),
            "goodsAllocation": dict(player_state["goodsAllocation"]),
            "army": dict(player_state["army"]),
            "navy": dict(player_state["navy"]),
            "establishedDiplomacy": list(player_state.get("establishedDiplomacy", [])),
            "colonizationUnlocked": bool(player_state.get("colonizationUnlocked", False)),
            "administrationCapacity": int(player_state["administrationCapacity"]),
            "ideologyLevels": dict(player_state["ideologyLevels"]),
            "reforms": list(player_state["reforms"]),
            "policies": list(player_state["policies"]),
            "incomeSummary": deepcopy(player_state["incomeSummary"]),
            "usedAbilities": list(player_state.get("usedAbilities", [])),
            "temporaryEffects": deepcopy(player_state.get("temporaryEffects", {})),
            "phase1Economy": deepcopy(player_state["phase1Economy"]) if "phase1Economy" in player_state else None,
        }

    region_states: list[dict[str, Any]] = []
    for region_state in payload["regionStates"]:
        region_states.append(
            {
                "regionId": region_state["regionId"],
                "accessLevel": _coerce_enum(region_state["accessLevel"], RegionAccessLevel),
                "marketSupply": dict(region_state["marketSupply"]),
                "marketPrice": dict(region_state["marketPrice"]),
                "controller": region_state["controller"],
                "garrison": dict(region_state["garrison"]),
                "independence": int(region_state["independence"]),
                "resourceLimit": dict(region_state["resourceLimit"]),
            }
        )

    ocean_node_states: list[dict[str, Any]] = []
    for ocean_node_state in payload["oceanNodeStates"]:
        ocean_node_states.append(
            {
                "nodeId": ocean_node_state["nodeId"],
                "navyByCountry": dict(ocean_node_state["navyByCountry"]),
                "controller": ocean_node_state["controller"],
                "isBlockaded": bool(ocean_node_state["isBlockaded"]),
                "reachableRoutes": list(ocean_node_state["reachableRoutes"]),
            }
        )

    snapshot_payload: GameSnapshotPayload = {
        "snapshotId": payload["snapshotId"],
        "gameId": payload["gameId"],
        "round": int(payload["round"]),
        "maxRounds": int(payload["maxRounds"]),
        "phase": _coerce_enum(payload["phase"], GamePhase),
        "rulesVersion": rules_version,
        "phaseDeadlineAt": payload["phaseDeadlineAt"],
        "nationalStateByPlayer": national_state_by_player,
        "regionStates": region_states,
        "oceanNodeStates": ocean_node_states,
        "ranking": deepcopy(payload["ranking"]),
        "phaseWorkspace": deepcopy(payload.get("phaseWorkspace", {})),
        "rankingWorkspace": deepcopy(payload.get("rankingWorkspace", {})),
        "lastSettlementSummary": deepcopy(payload.get("lastSettlementSummary", {})),
        "lastSettlementWorkspace": deepcopy(payload.get("lastSettlementWorkspace")),
        "activeEvents": deepcopy(payload.get("activeEvents", [])),
        "marketPriceAdjustments": dict(payload.get("marketPriceAdjustments", {})),
        "eventDeck": list(payload.get("eventDeck", [])),
    }
    from ..game_state.models import GameSnapshot

    return GameSnapshot.from_payload(snapshot_payload).to_payload()


class _BasePayloadRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def _commit(self, commit: bool) -> None:
        if commit:
            self.connection.commit()

    def _fetch_payload(self, sql: str, params: tuple[Any, ...], normalizer: PayloadNormalizer) -> dict[str, Any] | None:
        row = self.connection.execute(sql, params).fetchone()
        if row is None:
            return None
        return normalizer(_load_payload(row["payload_json"]))

    def _fetch_payloads(self, sql: str, params: tuple[Any, ...], normalizer: PayloadNormalizer) -> list[dict[str, Any]]:
        rows = self.connection.execute(sql, params).fetchall()
        return [normalizer(_load_payload(row["payload_json"])) for row in rows]


class RoomRepository(_BasePayloadRepository):
    def save(self, room: RoomPayload, *, commit: bool = True) -> None:
        payload = _normalize_room_payload(room)
        self.connection.execute(
            """
            INSERT INTO rooms (
                room_code,
                status,
                host_player_id,
                current_game_id,
                last_activity_at,
                payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(room_code) DO UPDATE SET
                status = excluded.status,
                host_player_id = excluded.host_player_id,
                current_game_id = excluded.current_game_id,
                last_activity_at = excluded.last_activity_at,
                payload_json = excluded.payload_json
            """,
            (
                payload["roomCode"],
                payload["status"],
                payload["hostPlayerId"],
                payload["currentGameId"],
                payload["lastActivityAt"],
                _dump_payload(payload),
            ),
        )
        self._commit(commit)

    def get(self, room_code: str) -> RoomPayload | None:
        payload = self._fetch_payload(
            "SELECT payload_json FROM rooms WHERE room_code = ?",
            (room_code,),
            _normalize_room_payload,
        )
        return payload  # type: ignore[return-value]

    def list_active(self) -> list[RoomPayload]:
        payloads = self._fetch_payloads(
            """
            SELECT payload_json
            FROM rooms
            WHERE status != ?
            ORDER BY room_code
            """,
            (RoomStatus.FINISHED,),
            _normalize_room_payload,
        )
        return payloads  # type: ignore[return-value]

    def list_waiting_visible(self, visible_after: str) -> list[RoomPayload]:
        payloads = self._fetch_payloads(
            """
            SELECT payload_json
            FROM rooms
            WHERE status = ?
              AND current_game_id IS NULL
              AND last_activity_at IS NOT NULL
              AND last_activity_at >= ?
            ORDER BY last_activity_at DESC, room_code
            """,
            (RoomStatus.WAITING, visible_after),
            _normalize_room_payload,
        )
        return payloads  # type: ignore[return-value]

    def delete_inactive_waiting(self, delete_before: str, *, commit: bool = True) -> int:
        cursor = self.connection.execute(
            """
            DELETE FROM rooms
            WHERE status = ?
              AND current_game_id IS NULL
              AND (last_activity_at IS NULL OR last_activity_at < ?)
            """,
            (RoomStatus.WAITING, delete_before),
        )
        self._commit(commit)
        return int(cursor.rowcount or 0)


class SessionRepository(_BasePayloadRepository):
    def save(self, session: PlayerSessionPayload, *, commit: bool = True) -> None:
        payload = _normalize_session_payload(session)
        self.connection.execute(
            """
            INSERT INTO sessions (
                session_id,
                player_id,
                room_code,
                selected_country,
                connection_status,
                last_seen_at,
                payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                player_id = excluded.player_id,
                room_code = excluded.room_code,
                selected_country = excluded.selected_country,
                connection_status = excluded.connection_status,
                last_seen_at = excluded.last_seen_at,
                payload_json = excluded.payload_json
            """,
            (
                payload["sessionId"],
                payload["playerId"],
                payload["roomCode"],
                payload["selectedCountry"],
                payload["connectionStatus"],
                payload["lastSeenAt"],
                _dump_payload(payload),
            ),
        )
        self._commit(commit)

    def get(self, session_id: str) -> PlayerSessionPayload | None:
        payload = self._fetch_payload(
            "SELECT payload_json FROM sessions WHERE session_id = ?",
            (session_id,),
            _normalize_session_payload,
        )
        return payload  # type: ignore[return-value]

    def list_recoverable(self, active_room_codes: list[str]) -> list[PlayerSessionPayload]:
        if active_room_codes:
            placeholders = ",".join("?" for _ in active_room_codes)
            sql = f"""
                SELECT payload_json
                FROM sessions
                WHERE room_code IS NULL OR room_code IN ({placeholders})
                ORDER BY session_id
            """
            params: tuple[Any, ...] = tuple(active_room_codes)
        else:
            sql = """
                SELECT payload_json
                FROM sessions
                WHERE room_code IS NULL
                ORDER BY session_id
            """
            params = ()

        payloads = self._fetch_payloads(sql, params, _normalize_session_payload)
        return payloads  # type: ignore[return-value]


class GameRepository(_BasePayloadRepository):
    def save(self, game: GamePayload, *, commit: bool = True) -> None:
        payload = _normalize_game_payload(game)
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
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(game_id) DO UPDATE SET
                room_code = excluded.room_code,
                current_round = excluded.current_round,
                total_rounds = excluded.total_rounds,
                current_phase = excluded.current_phase,
                is_finished = excluded.is_finished,
                active_snapshot_id = excluded.active_snapshot_id,
                payload_json = excluded.payload_json
            """,
            (
                payload["gameId"],
                payload["roomCode"],
                payload["currentRound"],
                payload["totalRounds"],
                payload["currentPhase"],
                int(payload["isFinished"]),
                payload["activeSnapshotId"],
                _dump_payload(payload),
            ),
        )
        self._commit(commit)

    def get(self, game_id: str) -> GamePayload | None:
        payload = self._fetch_payload(
            "SELECT payload_json FROM games WHERE game_id = ?",
            (game_id,),
            _normalize_game_payload,
        )
        return payload  # type: ignore[return-value]


class SnapshotRepository(_BasePayloadRepository):
    def save(self, snapshot: GameSnapshotPayload, *, commit: bool = True) -> None:
        payload = _normalize_snapshot_payload(snapshot)
        self.connection.execute(
            """
            INSERT INTO snapshots (
                snapshot_id,
                game_id,
                round_no,
                phase,
                phase_deadline_at,
                payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(snapshot_id) DO UPDATE SET
                game_id = excluded.game_id,
                round_no = excluded.round_no,
                phase = excluded.phase,
                phase_deadline_at = excluded.phase_deadline_at,
                payload_json = excluded.payload_json
            """,
            (
                payload["snapshotId"],
                payload["gameId"],
                payload["round"],
                payload["phase"],
                payload["phaseDeadlineAt"],
                _dump_payload(payload),
            ),
        )
        self._commit(commit)

    def get(self, snapshot_id: str) -> GameSnapshotPayload | None:
        payload = self._fetch_payload(
            "SELECT payload_json FROM snapshots WHERE snapshot_id = ?",
            (snapshot_id,),
            _normalize_snapshot_payload,
        )
        return payload  # type: ignore[return-value]

    def delete_for_game_except(self, game_id: str, snapshot_id: str, *, commit: bool = True) -> None:
        self.connection.execute(
            """
            DELETE FROM snapshots
            WHERE game_id = ? AND snapshot_id != ?
            """,
            (game_id, snapshot_id),
        )
        self._commit(commit)


class PlayerTurnInputRepository(_BasePayloadRepository):
    def save(self, turn_input: PlayerTurnInputPayload, *, commit: bool = True) -> None:
        payload = _normalize_turn_input_payload(turn_input)
        self.connection.execute(
            """
            INSERT INTO turn_inputs (
                game_id,
                round_no,
                phase,
                player_id,
                submission_status,
                submitted_at,
                is_timeout_generated,
                payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(game_id, round_no, phase, player_id) DO UPDATE SET
                submission_status = excluded.submission_status,
                submitted_at = excluded.submitted_at,
                is_timeout_generated = excluded.is_timeout_generated,
                payload_json = excluded.payload_json
            """,
            (
                payload["gameId"],
                payload["roundNo"],
                payload["phase"],
                payload["playerId"],
                payload["submissionStatus"],
                payload["submittedAt"],
                int(payload["isTimeoutGenerated"]),
                _dump_payload(payload),
            ),
        )
        self._commit(commit)

    def get(
        self,
        game_id: str,
        round_no: int,
        phase: GamePhase,
        player_id: str,
    ) -> PlayerTurnInputPayload | None:
        payload = self._fetch_payload(
            """
            SELECT payload_json
            FROM turn_inputs
            WHERE game_id = ? AND round_no = ? AND phase = ? AND player_id = ?
            """,
            (game_id, round_no, phase, player_id),
            _normalize_turn_input_payload,
        )
        return payload  # type: ignore[return-value]

    def list_for_phase(
        self,
        game_id: str,
        round_no: int,
        phase: GamePhase,
    ) -> list[PlayerTurnInputPayload]:
        payloads = self._fetch_payloads(
            """
            SELECT payload_json
            FROM turn_inputs
            WHERE game_id = ? AND round_no = ? AND phase = ?
            ORDER BY player_id
            """,
            (game_id, round_no, phase),
            _normalize_turn_input_payload,
        )
        return payloads  # type: ignore[return-value]

    def delete_for_game(self, game_id: str, *, commit: bool = True) -> None:
        self.connection.execute(
            """
            DELETE FROM turn_inputs
            WHERE game_id = ?
            """,
            (game_id,),
        )
        self._commit(commit)


class GameLogRepository(_BasePayloadRepository):
    def save(self, game_log: GameLogPayload, *, commit: bool = True) -> None:
        payload = _normalize_game_log_payload(game_log)
        self.connection.execute(
            """
            INSERT INTO game_logs (
                game_id,
                round_no,
                phase,
                kind,
                created_at,
                payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                payload["gameId"],
                payload["roundNo"],
                payload["phase"],
                payload["kind"],
                payload["createdAt"],
                _dump_payload(payload),
            ),
        )
        self._commit(commit)

    def list_for_game(self, game_id: str) -> list[GameLogPayload]:
        payloads = self._fetch_payloads(
            """
            SELECT payload_json
            FROM game_logs
            WHERE game_id = ?
            ORDER BY
                round_no,
                CASE phase
                    WHEN 'decision' THEN 1
                    WHEN 'market' THEN 2
                    WHEN 'settlement' THEN 3
                    ELSE 5
                END,
                created_at,
                log_id
            """,
            (game_id,),
            _normalize_game_log_payload,
        )
        return payloads  # type: ignore[return-value]

    def list_for_phase(
        self,
        game_id: str,
        round_no: int,
        phase: GamePhase,
    ) -> list[GameLogPayload]:
        payloads = self._fetch_payloads(
            """
            SELECT payload_json
            FROM game_logs
            WHERE game_id = ? AND round_no = ? AND phase = ?
            ORDER BY created_at, log_id
            """,
            (game_id, round_no, phase),
            _normalize_game_log_payload,
        )
        return payloads  # type: ignore[return-value]

    def delete_for_game(self, game_id: str, *, commit: bool = True) -> None:
        self.connection.execute(
            """
            DELETE FROM game_logs
            WHERE game_id = ?
            """,
            (game_id,),
        )
        self._commit(commit)
