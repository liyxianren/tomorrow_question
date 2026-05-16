from __future__ import annotations

from flask import request

STRINGS: dict[str, dict[str, str]] = {
    "en": {
        "session_not_found": "Session not found.",
        "room_not_found": "Room not found.",
        "player_not_in_room": "Player not in this room.",
        "game_already_started": "Game has already started.",
        "invalid_country": "Invalid country selection.",
        "country_taken": "This country is already taken.",
        "not_enough_players": "Not enough players to start.",
        "room_full": "Room is full.",
        "submission_deadline_passed": "Submission deadline has passed.",
        "invalid_phase": "Invalid game phase.",
        "config_load_error": "Failed to load configuration.",
        "config_save_error": "Failed to save configuration.",
        "config_save_success": "Configuration saved successfully.",
    },
    "zh": {
        "session_not_found": "未找到会话。",
        "room_not_found": "未找到房间。",
        "player_not_in_room": "玩家不在该房间中。",
        "game_already_started": "游戏已经开始。",
        "invalid_country": "无效的国家选择。",
        "country_taken": "该国已被选择。",
        "not_enough_players": "玩家数量不足，无法开始。",
        "room_full": "房间已满。",
        "submission_deadline_passed": "提交截止时间已过。",
        "invalid_phase": "无效的游戏阶段。",
        "config_load_error": "加载配置失败。",
        "config_save_error": "保存配置失败。",
        "config_save_success": "配置保存成功。",
    },
}


def t(key: str, **kwargs: object) -> str:
    try:
        header = request.headers.get("Accept-Language", "")
        lang = header.split(",")[0].split(";")[0].strip().lower() if header else "en"
    except RuntimeError:
        lang = "en"

    strings = STRINGS.get(lang, STRINGS["en"])
    message = strings.get(key, key)
    if kwargs:
        return message.format(**kwargs)
    return message
