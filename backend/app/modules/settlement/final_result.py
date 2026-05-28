from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

from app.contracts.enums import ErrorCode
from app.i18n import t as i18n_t
from app.modules.game_state.models import Game, GameSnapshot
from app.modules.persistence import (
    GameLogRepository,
    GameRepository,
    RoomRepository,
    SessionRepository,
    SnapshotRepository,
)
from app.modules.room.models import Room
from app.modules.session.models import PlayerSession
from app.modules.session.service import SessionError, connect_session

PHASE_LABEL_KEYS: dict[str, str] = {
    "decision": "phase_decision",
    "market": "phase_market",
    "settlement": "phase_settlement",
}


@dataclass(slots=True)
class FinalResultApplicationError(Exception):
    error_code: ErrorCode
    message: str

    def __str__(self) -> str:
        return self.message


@dataclass(slots=True)
class FinalResultApplicationService:
    connection: sqlite3.Connection
    sessions: SessionRepository = field(init=False)
    rooms: RoomRepository = field(init=False)
    games: GameRepository = field(init=False)
    snapshots: SnapshotRepository = field(init=False)
    game_logs: GameLogRepository = field(init=False)

    def __post_init__(self) -> None:
        self.sessions = SessionRepository(self.connection)
        self.rooms = RoomRepository(self.connection)
        self.games = GameRepository(self.connection)
        self.snapshots = SnapshotRepository(self.connection)
        self.game_logs = GameLogRepository(self.connection)

    def get_final_result(self, *, game_id: str, session_id: str | None) -> dict[str, object]:
        session = self._require_session(session_id)
        game = self._require_game(game_id)
        if not game.is_finished:
            raise FinalResultApplicationError(
                ErrorCode.RECOVERY_NOT_AVAILABLE,
                "Final result is not available yet.",
            )

        room = self._require_room(game.room_code)
        if not room.has_member(session.player_id):
            raise FinalResultApplicationError(ErrorCode.NOT_ROOM_MEMBER, "Player is not a member of this room.")

        snapshot = self._require_active_snapshot(game)
        final_logs = self.game_logs.list_for_game(game.game_id)
        return build_final_result_payload(
            game=game,
            snapshot=snapshot,
            room=room,
            final_logs=final_logs,
            viewer_player_id=session.player_id,
        )

    def _require_session(self, session_id: str | None) -> PlayerSession:
        if session_id is None or not session_id.strip():
            raise SessionError(ErrorCode.INVALID_SESSION, "Session could not be found.")

        payload = self.sessions.get(session_id)
        if payload is None:
            raise SessionError(ErrorCode.INVALID_SESSION, "Session could not be found.")

        session = PlayerSession.from_payload(payload)
        connect_session(session)
        self.sessions.save(session.to_payload())
        return session

    def _require_game(self, game_id: str) -> Game:
        payload = self.games.get(game_id)
        if payload is None:
            raise FinalResultApplicationError(ErrorCode.GAME_NOT_FOUND, "Game could not be found.")
        return Game.from_payload(payload)

    def _require_room(self, room_code: str) -> Room:
        payload = self.rooms.get(room_code)
        if payload is None:
            raise FinalResultApplicationError(ErrorCode.GAME_NOT_FOUND, "Game room could not be found.")
        return Room.from_payload(payload)

    def _require_active_snapshot(self, game: Game) -> GameSnapshot:
        if game.active_snapshot_id is None:
            raise FinalResultApplicationError(ErrorCode.GAME_NOT_FOUND, "Game snapshot could not be found.")

        payload = self.snapshots.get(game.active_snapshot_id)
        if payload is None:
            raise FinalResultApplicationError(ErrorCode.GAME_NOT_FOUND, "Game snapshot could not be found.")
        return GameSnapshot.from_payload(payload)


def build_final_result_payload(
    *,
    game: Game,
    snapshot: GameSnapshot,
    room: Room,
    final_logs: list[dict[str, object]],
    viewer_player_id: str | None = None,
) -> dict[str, object]:
    final_ranking = build_final_ranking(snapshot=snapshot, room=room)
    sanitized_final_logs = sanitize_final_logs(final_logs)
    return {
        "game": game.to_payload(),
        "snapshot": snapshot.to_payload(),
        "finalRanking": final_ranking,
        "finalLogs": sanitized_final_logs,
        "whyRankChanged": build_why_rank_changed(final_ranking=final_ranking, viewer_player_id=viewer_player_id),
        "turningPointCards": build_turning_point_cards(
            snapshot=snapshot,
            final_logs=final_logs,
            final_ranking=final_ranking,
        ),
        "replayGuidance": build_replay_guidance(final_ranking=final_ranking, viewer_player_id=viewer_player_id),
    }


def build_final_ranking(*, snapshot: GameSnapshot, room: Room) -> list[dict[str, object]]:
    nickname_by_player_id = {member.player_id: member.nickname for member in room.members}

    return [
        {
            "rank": int(entry.get("rank", 0)),
            "playerId": str(entry.get("playerId")),
            "country": getattr(entry.get("countryId"), "value", entry.get("countryId")),
            "nickname": nickname_by_player_id.get(str(entry.get("playerId")), str(entry.get("playerId"))),
            "totalIncome": int(entry.get("cumulativeNationalIncome", 0)),
            "cumulativeNationalIncome": int(entry.get("cumulativeNationalIncome", 0)),
            "tieBreak": {
                "productionCapacity": int(entry.get("tieBreak", {}).get("productionCapacity", 0)),
                "controlledRegions": int(entry.get("tieBreak", {}).get("controlledRegions", 0)),
                "budgetPoolsTotal": int(entry.get("tieBreak", {}).get("budgetPoolsTotal", 0)),
            },
        }
        for entry in snapshot.ranking
    ]


def build_why_rank_changed(
    *,
    final_ranking: list[dict[str, object]],
    viewer_player_id: str | None,
) -> list[str]:
    if not final_ranking:
        return []

    viewer = _find_ranking_entry(final_ranking, viewer_player_id) or final_ranking[0]
    leader = final_ranking[0]
    runner_up = final_ranking[1] if len(final_ranking) > 1 else None
    viewer_rank = _safe_int(viewer.get("rank"))
    viewer_income = _safe_int(viewer.get("cumulativeNationalIncome"))
    viewer_tie_break = _as_mapping(viewer.get("tieBreak"))

    if viewer_rank == 1:
        lines = [i18n_t("final_rank_winner_reason", income=viewer_income)]
        if runner_up is not None:
            gap = viewer_income - _safe_int(runner_up.get("cumulativeNationalIncome"))
            if gap > 0:
                lines.append(i18n_t("final_rank_winner_income_lead", gap=gap))
            else:
                lines[0] = i18n_t("final_rank_winner_tied", income=viewer_income)
        tiebreak_values = {
            "production": _safe_int(viewer_tie_break.get("productionCapacity")),
            "regions": _safe_int(viewer_tie_break.get("controlledRegions")),
            "budget": _safe_int(viewer_tie_break.get("budgetPoolsTotal")),
        }
        tiebreak_key = (
            "final_rank_winner_tied_detail"
            if runner_up is not None
            and viewer_income == _safe_int(runner_up.get("cumulativeNationalIncome"))
            else "final_rank_winner_tiebreak"
        )
        lines.append(i18n_t(tiebreak_key, **tiebreak_values))
        return lines

    leader_income = _safe_int(leader.get("cumulativeNationalIncome"))
    gap_to_leader = leader_income - viewer_income
    previous_entry = final_ranking[viewer_rank - 2] if viewer_rank >= 2 and len(final_ranking) >= viewer_rank - 1 else None
    lines = [
        i18n_t(
            "final_rank_loser_tied_reason" if gap_to_leader == 0 else "final_rank_loser_reason",
            rank=viewer_rank,
            income=viewer_income,
            gap=gap_to_leader,
        ),
        i18n_t("final_rank_loser_leader", leader=str(leader.get("nickname") or leader.get("playerId"))),
    ]
    if previous_entry is not None:
        previous_income = _safe_int(previous_entry.get("cumulativeNationalIncome"))
        previous_gap = previous_income - viewer_income
        lines.append(
            i18n_t(
                "final_rank_loser_previous_tied" if previous_gap == 0 else "final_rank_loser_previous_gap",
                gap=previous_gap,
            )
        )
    return lines


def build_turning_point_cards(
    *,
    snapshot: GameSnapshot,
    final_logs: list[dict[str, object]],
    final_ranking: list[dict[str, object]],
) -> list[dict[str, str]]:
    cards: list[dict[str, str]] = []
    phase_label = _phase_label(snapshot.phase.value)
    leader = final_ranking[0] if final_ranking else None
    if leader is not None:
        cards.append(
            {
                "title": i18n_t("final_turning_last_phase", phase=phase_label),
                "detail": i18n_t(
                    "final_turning_leader_detail",
                    country=_country_label(str(leader.get("country") or "")),
                    income=_safe_int(leader.get("cumulativeNationalIncome")),
                ),
            }
        )

    if len(final_ranking) >= 2:
        leader = final_ranking[0]
        runner_up = final_ranking[1]
        leader_income = _safe_int(leader.get("cumulativeNationalIncome"))
        runner_up_income = _safe_int(runner_up.get("cumulativeNationalIncome"))
        lead = leader_income - runner_up_income
        if lead == 0:
            cards.append(
                {
                    "title": i18n_t("final_turning_tie_title"),
                    "detail": i18n_t(
                        "final_turning_tie_detail",
                        leader=_country_label(str(leader.get("country") or "")),
                        runnerUp=_country_label(str(runner_up.get("country") or "")),
                        income=leader_income,
                    ),
                }
            )
        else:
            cards.append(
                {
                    "title": i18n_t("final_turning_income_lead_title", lead=lead),
                    "detail": i18n_t(
                        "final_turning_income_lead_detail",
                        leader=_country_label(str(leader.get("country") or "")),
                        runnerUp=_country_label(str(runner_up.get("country") or "")),
                        lead=lead,
                        leaderIncome=leader_income,
                        runnerUpIncome=runner_up_income,
                    ),
                }
            )
    curated_log = _pick_curated_turning_log(final_logs)
    if curated_log is not None:
        cards.append(
            {
                "title": i18n_t(
                    "final_turning_log_title",
                    round=_safe_int(curated_log.get("roundNo")),
                    title=_log_card_title(curated_log),
                ),
                "detail": _sanitize_log_message(curated_log),
            }
        )
    return cards


def build_replay_guidance(
    *,
    final_ranking: list[dict[str, object]],
    viewer_player_id: str | None,
) -> list[str]:
    if not final_ranking:
        return []

    viewer = _find_ranking_entry(final_ranking, viewer_player_id) or final_ranking[0]
    viewer_rank = _safe_int(viewer.get("rank"))
    if viewer_rank == 1:
        return [
            i18n_t("final_replay_winner_1"),
            i18n_t("final_replay_winner_2"),
        ]

    return [
        i18n_t("final_replay_loser_1"),
        i18n_t("final_replay_loser_2"),
    ]


def sanitize_final_logs(final_logs: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_sanitize_final_log(log) for log in final_logs]


def _find_ranking_entry(
    final_ranking: list[dict[str, object]],
    viewer_player_id: str | None,
) -> dict[str, object] | None:
    if viewer_player_id is None:
        return None
    return next((entry for entry in final_ranking if str(entry.get("playerId")) == viewer_player_id), None)


def _safe_int(value: object) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _as_mapping(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        return {}
    return {str(key): item for key, item in value.items()}


def _country_label(country: str) -> str:
    country = str(country or "").lower()
    key = {
        "britain": "country_britain",
        "france": "country_france",
        "prussia": "country_prussia",
        "austria": "country_austria",
        "russia": "country_russia",
    }.get(country)
    if key is not None:
        return i18n_t(key)
    return country or i18n_t("country_leading")


def _phase_label(phase: str) -> str:
    key = PHASE_LABEL_KEYS.get(phase)
    return i18n_t(key) if key is not None else phase


def _pick_curated_turning_log(final_logs: list[dict[str, object]]) -> dict[str, object] | None:
    for log in reversed(final_logs):
        kind = str(log.get("kind") or "")
        message = str(log.get("message") or "")
        if kind == "settlement.resolved" or "completed national income allocation" in message:
            continue
        if any(token in kind for token in ("naval", "revolt", "policy", "reform", "market")):
            return log
    return None


def _log_card_title(log: dict[str, object]) -> str:
    kind = str(log.get("kind") or "")
    if "revolt" in kind:
        return i18n_t("final_log_title_overseas")
    if "naval" in kind:
        return i18n_t("final_log_title_naval")
    if "colon" in kind:
        return i18n_t("final_log_title_colony")
    if "market" in kind:
        return i18n_t("final_log_title_market")
    if "policy" in kind or "reform" in kind:
        return i18n_t("final_log_title_policy")
    return i18n_t("final_log_title_default")


def _sanitize_log_message(log: dict[str, object]) -> str:
    message = str(log.get("message") or "").strip()
    if not message or "completed national income allocation" in message:
        return i18n_t("final_log_system_settlement")
    return message


def _sanitize_final_log(log: dict[str, object]) -> dict[str, object]:
    sanitized = dict(log)
    message = str(log.get("message") or "").strip()
    phase = str(log.get("phase") or "")
    round_no = _safe_int(log.get("roundNo"))

    if (
        "completed national income allocation" in message
        or (" completed Round " in message and message.endswith(" fiscal allocation."))
    ):
        country_key = message.split(" ", 1)[0].strip()
        sanitized["message"] = i18n_t(
            "final_log_income_allocation",
            country=_country_label(country_key),
            round=round_no,
        )
        return sanitized

    if message == "settlement settled." or message == "settlement.phase_resolved":
        sanitized["message"] = i18n_t("final_log_settlement_complete")
        return sanitized

    if message == "market settled.":
        sanitized["message"] = i18n_t("final_log_market_complete")
        return sanitized

    if message == "decision settled.":
        sanitized["message"] = i18n_t("final_log_decision_complete")
        return sanitized

    if phase in PHASE_LABEL_KEYS and message.endswith(" settled."):
        sanitized["message"] = i18n_t("final_log_phase_complete", phase=_phase_label(phase))
        return sanitized

    return sanitized


__all__ = [
    "FinalResultApplicationError",
    "FinalResultApplicationService",
    "build_final_ranking",
    "build_final_result_payload",
    "build_replay_guidance",
    "build_turning_point_cards",
    "build_why_rank_changed",
    "sanitize_final_logs",
]
