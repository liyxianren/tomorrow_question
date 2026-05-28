from __future__ import annotations

from typing import Any

from .route_utils import explain_route_access


COLONIZATION_ARMY_COST = 3
COUNTRY_LABELS = {
    "britain": "英国",
    "france": "法国",
    "prussia": "普鲁士",
    "austria": "奥地利",
    "russia": "俄罗斯",
}


def colony_raw_material_yield(region_state) -> int:
    total_resource_limit = sum(
        max(0, int(value)) for value in getattr(region_state, "resource_limit", {}).values()
    )
    return max(1, total_resource_limit // 4)


def colony_raw_materials_per_turn(snapshot, country_id: str) -> int:
    return sum(
        colony_raw_material_yield(region)
        for region in snapshot.region_states
        if region.controller == country_id
    )


def colonization_status(snapshot, player_state, region_state, balance) -> dict[str, Any]:
    blueprint = balance.regions.region_blueprints.get(region_state.region_id)
    route_status = explain_route_access(
        player_state.country.value,
        region_state.region_id,
        snapshot,
        balance,
    )
    locked_reason = None
    if blueprint is None:
        locked_reason = "未知地区"
    elif not bool(blueprint.colonizable):
        locked_reason = "该地区不可殖民"
    elif region_state.controller is not None:
        locked_reason = f"已被{COUNTRY_LABELS.get(str(region_state.controller), str(region_state.controller))}控制"
    elif not bool(route_status.get("isAccessible")):
        locked_reason = "地区被封锁，当前不可进入"
    elif int(player_state.army.get("army", 0)) < COLONIZATION_ARMY_COST:
        locked_reason = f"陆军不足，需要 {COLONIZATION_ARMY_COST}"

    is_colonizable = bool(blueprint.colonizable) if blueprint is not None else False

    return {
        "canColonize": locked_reason is None,
        "lockedReason": locked_reason,
        "armyCost": COLONIZATION_ARMY_COST,
        "rawMaterialsPerTurn": colony_raw_material_yield(region_state) if is_colonizable else 0,
        "isColonizable": is_colonizable,
    }


def can_colonize_region(snapshot, player_state, region_state, balance) -> tuple[bool, str | None]:
    status = colonization_status(snapshot, player_state, region_state, balance)
    return bool(status["canColonize"]), status["lockedReason"]
