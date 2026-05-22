from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from flask import Blueprint, current_app, request

from app.contracts.api import error_response

from app.contracts.api import ok_response
from app.contracts.enums import CountryCode, ErrorCode, GamePhase
from app.extensions import socketio
from app.modules import MODULE_BOUNDARIES
from app.modules.persistence import RecoveryRepository
from app.modules.realtime import emit_room_updated
from app.modules.room.models import Room
from app.modules.room.application import RoomApplicationService
from app.modules.room.service import RoomError
from app.modules.session.models import PlayerSession
from app.modules.session.application import SessionApplicationService
from app.modules.session.service import SessionError
from app.modules.settlement import attempt_start_game
from app.modules.settlement import FinalResultApplicationError, FinalResultApplicationService
from app.modules.settlement.phase_submission import PhaseSubmissionError
from app.modules.settlement.submission_application import (
    SubmissionApplicationError,
    SubmissionApplicationService,
)

from .dependencies import get_db_connection, get_request_json, get_session_id


api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.get("/health")
def api_health():
    return ok_response(
        {
            "service": "tomorrow-question-api",
            "modules": sorted(MODULE_BOUNDARIES.keys()),
        }
    )


@api_bp.post("/v1/rooms")
def create_room():
    payload = get_request_json()
    nickname = _read_string(payload, "nickname")

    data = RoomApplicationService(get_db_connection()).create_room_context(nickname=nickname)
    return ok_response(data, status=201)


@api_bp.post("/v1/rooms/join")
def join_room():
    payload = get_request_json()
    nickname = _read_string(payload, "nickname")
    room_code = _read_string(payload, "roomCode")
    connection = get_db_connection()

    try:
        data = RoomApplicationService(connection).join_room_context(
            room_code=room_code,
            nickname=nickname,
            session_id=get_session_id(),
        )
    except RoomError as error:
        return _handle_room_error(error)
    _emit_room_update_from_storage(connection=connection, room_code=room_code)
    return ok_response(data)


@api_bp.post("/v1/rooms/<string:room_code>/leave")
def leave_room(room_code: str):
    connection = get_db_connection()
    try:
        data = RoomApplicationService(connection).leave_room_context(
            room_code=room_code,
            session_id=get_session_id(),
        )
    except RoomError as error:
        return _handle_room_error(error)

    updated_room = data.get("room")
    if isinstance(updated_room, dict):
        emit_room_updated(socketio=socketio, room=Room.from_payload(updated_room))
    return ok_response(data)


@api_bp.post("/v1/sessions/restore")
def restore_session():
    try:
        data = SessionApplicationService(get_db_connection()).restore_session_context(get_session_id())
    except SessionError as error:
        return _handle_session_error(error)
    return ok_response(data)


@api_bp.get("/v1/lobby/waiting-rooms")
def list_waiting_rooms():
    data = RoomApplicationService(get_db_connection()).list_waiting_rooms()
    return ok_response(data)


@api_bp.post("/v1/rooms/<string:room_code>/country")
def select_country(room_code: str):
    payload = get_request_json()
    selected_country = _parse_country_code(payload.get("selectedCountry"))
    connection = get_db_connection()

    try:
        data = RoomApplicationService(connection).select_country(
            room_code=room_code,
            session_id=get_session_id(),
            selected_country=selected_country,
        )
    except RoomError as error:
        return _handle_room_error(error)
    _emit_room_update_from_storage(connection=connection, room_code=room_code)
    return ok_response(data)


@api_bp.post("/v1/rooms/<string:room_code>/ready")
def set_ready(room_code: str):
    payload = get_request_json()
    raw_is_ready = bool(payload.get("isReady"))
    connection = get_db_connection()

    try:
        data = RoomApplicationService(connection).set_ready(
            room_code=room_code,
            session_id=get_session_id(),
            is_ready=raw_is_ready,
        )
    except RoomError as error:
        return _handle_room_error(error)
    _emit_room_update_from_storage(connection=connection, room_code=room_code)
    _attempt_start_game_from_storage(connection=connection, room_code=room_code)
    return ok_response(data)


@api_bp.post("/v1/rooms/<string:room_code>/bots/fill")
def fill_room_bots(room_code: str):
    connection = get_db_connection()
    try:
        data = RoomApplicationService(connection).fill_room_with_bots(
            room_code=room_code,
            session_id=get_session_id(),
        )
    except RoomError as error:
        return _handle_room_error(error)
    _emit_room_update_from_storage(connection=connection, room_code=room_code)
    _attempt_start_game_from_storage(connection=connection, room_code=room_code)
    return ok_response(data)


@api_bp.delete("/v1/rooms/<string:room_code>/bots/<string:player_id>")
def remove_room_bot(room_code: str, player_id: str):
    connection = get_db_connection()
    try:
        data = RoomApplicationService(connection).remove_room_bot(
            room_code=room_code,
            session_id=get_session_id(),
            bot_player_id=player_id,
        )
    except RoomError as error:
        return _handle_room_error(error)
    _emit_room_update_from_storage(connection=connection, room_code=room_code)
    return ok_response(data)


@api_bp.get("/v1/rooms/<string:room_code>/context")
def get_room_context(room_code: str):
    try:
        data = RoomApplicationService(get_db_connection()).get_room_context(room_code)
    except RoomError as error:
        return _handle_room_error(error)
    return ok_response(data)


@api_bp.post("/v1/games/<string:game_id>/phases/<string:phase>/submit")
def submit_phase(game_id: str, phase: str):
    payload = get_request_json()
    requested_phase = _parse_game_phase(phase)
    submitted_payload = payload.get("payload")
    if not isinstance(submitted_payload, dict):
        submitted_payload = {}

    try:
        data = SubmissionApplicationService(get_db_connection()).submit(
            game_id=game_id,
            requested_phase=requested_phase,
            session_id=_get_submit_session_id(),
            payload=submitted_payload,
            submitted_at=datetime.now(UTC),
            phase_duration_seconds=int(current_app.config.get("PHASE_DURATION_SECONDS", 180)),
            socketio=socketio,
        ).to_payload()
    except SessionError as error:
        return _handle_session_error(error)
    except PhaseSubmissionError as error:
        return _handle_submission_error(error)
    except SubmissionApplicationError as error:
        return _handle_submission_application_error(error)
    return ok_response(data)


@api_bp.get("/v1/games/<string:game_id>/final-result")
def get_final_result(game_id: str):
    try:
        data = FinalResultApplicationService(get_db_connection()).get_final_result(
            game_id=game_id,
            session_id=get_session_id(),
        )
    except SessionError as error:
        return _handle_session_error(error)
    except FinalResultApplicationError as error:
        return _handle_final_result_error(error)
    return ok_response(data)


def _emit_room_update_from_storage(*, connection, room_code: str) -> None:
    recovery = RecoveryRepository(connection)
    room_payload = recovery.rooms.get(room_code)
    if room_payload is None:
        return
    emit_room_updated(socketio=socketio, room=Room.from_payload(room_payload))


def _attempt_start_game_from_storage(*, connection, room_code: str) -> None:
    recovery = RecoveryRepository(connection)
    room_payload = recovery.rooms.get(room_code)
    if room_payload is None:
        return

    room = Room.from_payload(room_payload)
    human_member_ids = {member.player_id for member in room.members if member.member_type != "bot"}
    session_payloads = [
        payload
        for payload in recovery.sessions.list_recoverable([room_code])
        if payload["roomCode"] == room_code and payload["playerId"] in human_member_ids
    ]
    sessions = [PlayerSession.from_payload(payload) for payload in session_payloads]
    if len({session.player_id for session in sessions}) != len(human_member_ids):
        return

    phase_duration_seconds = int(current_app.config.get("PHASE_DURATION_SECONDS", 180))
    started = attempt_start_game(
        room=room,
        sessions=sessions,
        recovery_repository=recovery,
        socketio=socketio,
        phase_deadline_at=_resolve_phase_deadline_at(phase_duration_seconds),
    )
    if started is not None:
        emit_room_updated(socketio=socketio, room=started.room)


def _resolve_phase_deadline_at(phase_duration_seconds: int) -> datetime | None:
    # 开局第一阶段是 decision，不需要 deadline（玩家手动提交）
    # 只有 settlement 阶段需要 deadline，由阶段转换时设置
    return None


def _handle_room_error(error: RoomError):
    return error_response(error.error_code, error.message, _error_status(error.error_code))


def _handle_session_error(error: SessionError):
    return error_response(error.error_code, error.message, _error_status(error.error_code))


def _handle_submission_error(error: PhaseSubmissionError):
    return error_response(
        error.error_code,
        error.message,
        _error_status(error.error_code),
        details=error.details,
    )


def _handle_submission_application_error(error: SubmissionApplicationError):
    return error_response(error.error_code, error.message, _error_status(error.error_code))


def _handle_final_result_error(error: FinalResultApplicationError):
    return error_response(error.error_code, error.message, _error_status(error.error_code))


def _error_status(error_code: ErrorCode) -> int:
    if error_code == ErrorCode.INVALID_SUBMISSION:
        return 400
    if error_code == ErrorCode.INVALID_SESSION:
        return 401
    if error_code in {ErrorCode.NOT_ROOM_MEMBER, ErrorCode.ROOM_ACTION_FORBIDDEN}:
        return 403
    if error_code in {ErrorCode.ROOM_NOT_FOUND, ErrorCode.GAME_NOT_FOUND}:
        return 404
    return 409


def _read_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str):
        return ""

    return value.strip()


def _parse_country_code(raw_value: Any) -> CountryCode | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, CountryCode):
        return raw_value
    if isinstance(raw_value, str):
        normalized = raw_value.strip()
        if normalized in {country.value for country in CountryCode}:
            return CountryCode(normalized)
    return None


def _parse_game_phase(raw_value: Any) -> GamePhase | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, GamePhase):
        return raw_value
    if isinstance(raw_value, str):
        normalized = raw_value.strip()
        if normalized in {phase.value for phase in GamePhase}:
            return GamePhase(normalized)
    return None


def _get_submit_session_id() -> str | None:
    header_value = request.headers.get("X-Session-Id")
    return header_value if header_value else None
