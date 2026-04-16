from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

from app.contracts.enums import ErrorCode
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

PHASE_LABELS: dict[str, str] = {
    "decision": "国家决策",
    "market": "市场出售",
    "settlement": "财政结算",
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
    return {
        "game": game.to_payload(),
        "snapshot": snapshot.to_payload(),
        "finalRanking": final_ranking,
        "finalLogs": list(final_logs),
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
        lines = [f"你最终位列第 1 名，核心原因是累计国家收入 {viewer_income} 为全场最高。"]
        if runner_up is not None:
            gap = viewer_income - _safe_int(runner_up.get("cumulativeNationalIncome"))
            lines.append(f"你领先第 2 名 {gap} 点累计国家收入，这意味着产销兑现链是这局最直接的分差来源。")
        lines.append(
            "即使回流被追平，你的总产能 "
            f"{_safe_int(viewer_tie_break.get('productionCapacity'))}、控制区域 "
            f"{_safe_int(viewer_tie_break.get('controlledRegions'))}、期末国库 "
            f"{_safe_int(viewer_tie_break.get('budgetPoolsTotal'))} 也会继续在同分比较里提供优势。"
        )
        return lines

    leader_income = _safe_int(leader.get("cumulativeNationalIncome"))
    gap_to_leader = leader_income - viewer_income
    previous_entry = final_ranking[viewer_rank - 2] if viewer_rank >= 2 and len(final_ranking) >= viewer_rank - 1 else None
    lines = [
        f"你最终位列第 {viewer_rank} 名，核心原因是累计国家收入 {viewer_income} 仍落后榜首 {gap_to_leader} 点。",
        f"当前榜首是 {str(leader.get('nickname') or leader.get('playerId'))}，这说明决定胜负的主分差仍是经营收入总量。",
    ]
    if previous_entry is not None:
        previous_income = _safe_int(previous_entry.get("cumulativeNationalIncome"))
        lines.append(
            f"你距离前一名还差 {previous_income - viewer_income} 点累计国家收入，想再上一个名次，先补最稳定的收入兑现链。"
        )
    return lines


def build_turning_point_cards(
    *,
    snapshot: GameSnapshot,
    final_logs: list[dict[str, object]],
    final_ranking: list[dict[str, object]],
) -> list[dict[str, str]]:
    cards: list[dict[str, str]] = []
    phase_label = PHASE_LABELS.get(snapshot.phase.value, snapshot.phase.value)
    if final_logs:
        cards.append(
            {
                "title": f"最后结算定格在{phase_label}",
                "detail": str(final_logs[-1].get("message") or "终局结算已经完成。"),
            }
        )

    if len(final_ranking) >= 2:
        leader = final_ranking[0]
        runner_up = final_ranking[1]
        lead = _safe_int(leader.get("cumulativeNationalIncome")) - _safe_int(runner_up.get("cumulativeNationalIncome"))
        cards.append(
            {
                "title": f"终局领先差被锁定在 {lead}",
                "detail": (
                    f"{str(leader.get('nickname') or leader.get('playerId'))} 以 "
                    f"{_safe_int(leader.get('cumulativeNationalIncome'))} 的累计国家收入领先 "
                    f"{str(runner_up.get('nickname') or runner_up.get('playerId'))} 的 "
                    f"{_safe_int(runner_up.get('cumulativeNationalIncome'))}。"
                ),
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
            "下次如果想继续稳住榜首，优先把国库回款节奏保持到每一轮，不要让库存积压打断收入曲线。",
            "当你已经领先时，继续守住产能、区域和国库三项同分比较，会比盲目冒险更稳。",
        ]

    return [
        "下次先把前几轮最稳定的产销链做出来，别让高门槛动作挤掉当回合真实回款。",
        "一旦市场回款开始落后，优先检查是不是内需、航线或行政支撑拖慢了经营节奏。",
    ]


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


__all__ = [
    "FinalResultApplicationError",
    "FinalResultApplicationService",
    "build_final_ranking",
    "build_final_result_payload",
    "build_replay_guidance",
    "build_turning_point_cards",
    "build_why_rank_changed",
]
