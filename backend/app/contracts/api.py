from __future__ import annotations

from typing import Any, TypedDict

from flask import jsonify

from .enums import ErrorCode


class ApiSuccessPayload(TypedDict):
    ok: bool
    data: Any


class ApiErrorBody(TypedDict, total=False):
    code: str
    message: str
    details: dict[str, Any]


class ApiErrorPayload(TypedDict):
    ok: bool
    error: ApiErrorBody


def ok_response(data: Any, status: int = 200):
    payload: ApiSuccessPayload = {"ok": True, "data": data}
    return jsonify(payload), status


def error_response(
    code: ErrorCode,
    message: str,
    status: int,
    *,
    details: dict[str, Any] | None = None,
):
    error_body: ApiErrorBody = {
        "code": code.value,
        "message": message,
    }
    if details:
        error_body["details"] = details
    payload: ApiErrorPayload = {
        "ok": False,
        "error": error_body,
    }
    return jsonify(payload), status
