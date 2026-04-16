from __future__ import annotations

from typing import Any, TypedDict

from flask import jsonify

from .enums import ErrorCode


class ApiSuccessPayload(TypedDict):
    ok: bool
    data: Any


class ApiErrorBody(TypedDict):
    code: str
    message: str


class ApiErrorPayload(TypedDict):
    ok: bool
    error: ApiErrorBody


def ok_response(data: Any, status: int = 200):
    payload: ApiSuccessPayload = {"ok": True, "data": data}
    return jsonify(payload), status


def error_response(code: ErrorCode, message: str, status: int):
    payload: ApiErrorPayload = {
        "ok": False,
        "error": {
            "code": code.value,
            "message": message,
        },
    }
    return jsonify(payload), status
