from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from flask import Blueprint, current_app, request

from app.contracts.api import error_response, ok_response
from app.contracts.enums import ErrorCode
from app.modules.balance_config.loader import _load_balance_config_cached


settings_bp = Blueprint("settings", __name__, url_prefix="/api/v1")


_PRODUCTION_NEW_FACTORY_KEYS = ("handicraft", "mechanized", "steam", "electrified")
_PRODUCTION_UPGRADE_KEYS = ("mechanized", "steam", "electrified")
_COUNTRY_KEYS = ("britain", "france", "prussia", "austria", "russia")
_IDEOLOGY_KEYS = ("liberalism", "egalitarianism", "nationalism")


class _ValidationError(ValueError):
    pass


@settings_bp.get("/settings")
def get_settings():
    config_dir = _config_dir()
    production = _read_json(config_dir / "production.json")
    countries = _read_json(config_dir / "countries.json")
    global_cfg = _read_json(config_dir / "global.json")
    regions = _read_json(config_dir / "regions.json")
    politics = _read_json(config_dir / "politics.json")

    politics_shift_rules = politics.get("naturalShiftRules", {})
    payload = {
        "production": {
            "newFactoryCosts": {
                key: int(production.get("newFactoryCosts", {}).get(key, 0))
                for key in _PRODUCTION_NEW_FACTORY_KEYS
            },
            "upgradeCosts": {
                key: int(production.get("upgradeCosts", {}).get(key, 0))
                for key in _PRODUCTION_UPGRADE_KEYS
            },
        },
        "countries": {
            country: {
                "initialRawMaterials": int(
                    countries.get("countries", {}).get(country, {}).get("initialRawMaterials", 0)
                ),
                "rawMaterialsPerTurn": int(
                    countries.get("countries", {}).get(country, {}).get("rawMaterialsPerTurn", 0)
                ),
            }
            for country in _COUNTRY_KEYS
        },
        "global": {
            "baseIncomePerRound": int(global_cfg.get("baseIncomePerRound", 0)),
        },
        "regions": {
            str(region["regionId"]): float(region.get("priceMultiplier", 1.0))
            for region in regions.get("regions", [])
            if isinstance(region, dict) and "regionId" in region
        },
        "government": {
            "administrationCost": int(politics.get("administrationCost", 0)),
            "ideologyMin": int(politics.get("ideologyMin", 0)),
            "ideologyMax": int(politics.get("ideologyMax", 10)),
            "naturalShiftRules": {
                ideology: {
                    "highThreshold": int(
                        politics_shift_rules.get(ideology, {}).get("highThreshold", 0)
                    ),
                    "lowThreshold": int(
                        politics_shift_rules.get(ideology, {}).get("lowThreshold", 0)
                    ),
                }
                for ideology in _IDEOLOGY_KEYS
            },
        },
    }
    return ok_response(payload)


@settings_bp.post("/settings")
def update_settings():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error_response(ErrorCode.INVALID_SUBMISSION, "Body must be a JSON object.", 400)

    try:
        production_in = _validate_dict(body.get("production", {}), "production")
        countries_in = _validate_dict(body.get("countries", {}), "countries")
        global_in = _validate_dict(body.get("global", {}), "global")
        regions_in = _validate_dict(body.get("regions", {}), "regions")
        government_in = _validate_dict(body.get("government", {}), "government")

        new_factory = _validate_int_map(
            production_in.get("newFactoryCosts", {}),
            _PRODUCTION_NEW_FACTORY_KEYS,
            "production.newFactoryCosts",
        )
        upgrade = _validate_int_map(
            production_in.get("upgradeCosts", {}),
            _PRODUCTION_UPGRADE_KEYS,
            "production.upgradeCosts",
        )
        country_values: dict[str, dict[str, int]] = {}
        for country, raw in countries_in.items():
            if country not in _COUNTRY_KEYS:
                raise _ValidationError(f"countries.{country} is not a recognized country.")
            country_dict = _validate_dict(raw, f"countries.{country}")
            country_values[country] = {
                "initialRawMaterials": _validate_non_negative_int(
                    country_dict.get("initialRawMaterials"),
                    f"countries.{country}.initialRawMaterials",
                ),
                "rawMaterialsPerTurn": _validate_non_negative_int(
                    country_dict.get("rawMaterialsPerTurn"),
                    f"countries.{country}.rawMaterialsPerTurn",
                ),
            }
        base_income = _validate_non_negative_int(
            global_in.get("baseIncomePerRound"), "global.baseIncomePerRound"
        )
        region_values: dict[str, float] = {}
        for region_id, raw_multiplier in regions_in.items():
            region_values[str(region_id)] = _validate_non_negative_float(
                raw_multiplier, f"regions.{region_id}"
            )

        admin_cost = _validate_non_negative_int(
            government_in.get("administrationCost"), "government.administrationCost"
        )
        ideology_min = _validate_int(
            government_in.get("ideologyMin"), "government.ideologyMin"
        )
        ideology_max = _validate_int(
            government_in.get("ideologyMax"), "government.ideologyMax"
        )
        if ideology_min > ideology_max:
            raise _ValidationError("government.ideologyMin must be <= government.ideologyMax.")
        shift_rules_in = _validate_dict(
            government_in.get("naturalShiftRules", {}), "government.naturalShiftRules"
        )
        shift_values: dict[str, dict[str, int]] = {}
        for ideology, raw_rule in shift_rules_in.items():
            if ideology not in _IDEOLOGY_KEYS:
                raise _ValidationError(
                    f"government.naturalShiftRules.{ideology} is not a recognized ideology."
                )
            rule_dict = _validate_dict(
                raw_rule, f"government.naturalShiftRules.{ideology}"
            )
            shift_values[ideology] = {
                "highThreshold": _validate_int(
                    rule_dict.get("highThreshold"),
                    f"government.naturalShiftRules.{ideology}.highThreshold",
                ),
                "lowThreshold": _validate_int(
                    rule_dict.get("lowThreshold"),
                    f"government.naturalShiftRules.{ideology}.lowThreshold",
                ),
            }
    except _ValidationError as exc:
        return error_response(ErrorCode.INVALID_SUBMISSION, str(exc), 400)

    config_dir = _config_dir()

    production_path = config_dir / "production.json"
    production_data = _read_json(production_path)
    production_data.setdefault("newFactoryCosts", {}).update(new_factory)
    production_data.setdefault("upgradeCosts", {}).update(upgrade)
    _write_json(production_path, production_data)

    countries_path = config_dir / "countries.json"
    countries_data = _read_json(countries_path)
    for country, values in country_values.items():
        country_block = countries_data.setdefault("countries", {}).setdefault(country, {})
        country_block["initialRawMaterials"] = values["initialRawMaterials"]
        country_block["rawMaterialsPerTurn"] = values["rawMaterialsPerTurn"]
    _write_json(countries_path, countries_data)

    global_path = config_dir / "global.json"
    global_data = _read_json(global_path)
    global_data["baseIncomePerRound"] = base_income
    _write_json(global_path, global_data)

    regions_path = config_dir / "regions.json"
    regions_data = _read_json(regions_path)
    for region in regions_data.get("regions", []):
        if not isinstance(region, dict):
            continue
        region_id = str(region.get("regionId", ""))
        if region_id in region_values:
            region["priceMultiplier"] = region_values[region_id]
    _write_json(regions_path, regions_data)

    politics_path = config_dir / "politics.json"
    politics_data = _read_json(politics_path)
    politics_data["administrationCost"] = admin_cost
    politics_data["ideologyMin"] = ideology_min
    politics_data["ideologyMax"] = ideology_max
    for ideology, values in shift_values.items():
        rule_block = politics_data.setdefault("naturalShiftRules", {}).setdefault(ideology, {})
        rule_block["highThreshold"] = values["highThreshold"]
        rule_block["lowThreshold"] = values["lowThreshold"]
    _write_json(politics_path, politics_data)

    _load_balance_config_cached.cache_clear()

    return ok_response({"updated": True})


def _config_dir() -> Path:
    raw = current_app.config.get("BALANCE_CONFIG_DIR")
    if not raw:
        raise RuntimeError("BALANCE_CONFIG_DIR is not configured.")
    return Path(str(raw)).resolve()


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _validate_dict(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise _ValidationError(f"{field_name} must be an object.")
    return value


def _validate_int_map(
    value: Any, allowed_keys: tuple[str, ...], field_name: str
) -> dict[str, int]:
    mapping = _validate_dict(value, field_name)
    result: dict[str, int] = {}
    for key in allowed_keys:
        if key not in mapping:
            continue
        result[key] = _validate_non_negative_int(mapping[key], f"{field_name}.{key}")
    return result


def _validate_non_negative_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _ValidationError(f"{field_name} must be a non-negative number.")
    if value < 0:
        raise _ValidationError(f"{field_name} must be >= 0.")
    return int(value)


def _validate_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _ValidationError(f"{field_name} must be a number.")
    return int(value)


def _validate_non_negative_float(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _ValidationError(f"{field_name} must be a non-negative number.")
    if value < 0:
        raise _ValidationError(f"{field_name} must be >= 0.")
    return float(value)
