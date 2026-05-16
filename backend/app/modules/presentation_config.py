from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from flask import request

DEFAULT_PRESENTATION_CONFIG_DIR = Path(__file__).resolve().parents[2] / "config" / "presentation"
GROUP_FILE_NAMES: tuple[str, ...] = (
    "phases",
    "countries",
)
DEFAULT_LANG = "zh"


def _resolve_lang() -> str:
    try:
        header = request.headers.get("Accept-Language", "")
        if header:
            primary = header.split(",")[0].split(";")[0].strip().lower()
            if primary in ("en", "zh"):
                return primary
    except RuntimeError:
        pass
    return DEFAULT_LANG


def load_presentation_config(config_dir: str | Path = DEFAULT_PRESENTATION_CONFIG_DIR) -> dict[str, Any]:
    resolved_dir = Path(config_dir).resolve()
    return _load_presentation_config_cached(str(resolved_dir))


def get_presentation_config(config_dir: str | Path | None = None) -> dict[str, Any]:
    if config_dir is None:
        return load_presentation_config(DEFAULT_PRESENTATION_CONFIG_DIR)
    return load_presentation_config(config_dir)


@lru_cache(maxsize=8)
def _load_presentation_config_cached(config_dir: str) -> dict[str, Any]:
    lang = _resolve_lang()
    resolved_dir = Path(config_dir)
    return {
        group_name: _read_group_json(resolved_dir, group_name, lang)
        for group_name in GROUP_FILE_NAMES
    }


def _read_group_json(config_dir: Path, group_name: str, lang: str) -> dict[str, Any]:
    group_path = config_dir / f"{group_name}.{lang}.json"
    if not group_path.exists():
        group_path = config_dir / f"{group_name}.json"
    payload = json.loads(group_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Presentation config group must be a JSON object: {group_path}")
    return payload
