from __future__ import annotations

from typing import Any


def resolve_naval_blockade(snapshot, balance) -> None:
    threshold = int(balance.military.ocean_control_threshold)
    for region in snapshot.region_states:
        non_zero_regions = [
            (country, count) for country, count in region.navy_by_country.items() if count > 0
        ]
        if not non_zero_regions:
            region.blockade_controller = None
            region.is_blockaded = False
        else:
            non_zero_regions.sort(key=lambda item: item[1], reverse=True)
            top_country, top_count = non_zero_regions[0]
            runner_up_count = non_zero_regions[1][1] if len(non_zero_regions) > 1 else 0
            if top_count >= threshold and top_count > runner_up_count:
                region.blockade_controller = top_country
                region.is_blockaded = True
            else:
                region.blockade_controller = None
                region.is_blockaded = False

    for node in snapshot.ocean_node_states:
        non_zero = [(country, count) for country, count in node.navy_by_country.items() if count > 0]
        if not non_zero:
            node.controller = None
            node.is_blockaded = False
            continue
        non_zero.sort(key=lambda item: item[1], reverse=True)
        top_country, top_count = non_zero[0]
        runner_up_count = non_zero[1][1] if len(non_zero) > 1 else 0
        if top_count >= threshold and top_count > runner_up_count:
            node.controller = top_country
            node.is_blockaded = True
        else:
            node.controller = None
            node.is_blockaded = False


def check_route_accessible(player_country: str, region_id: str, snapshot, balance) -> bool:
    return bool(explain_route_access(player_country, region_id, snapshot, balance)["isAccessible"])


def explain_route_access(player_country: str, region_id: str, snapshot, balance) -> dict[str, Any]:
    region_state = next((region for region in snapshot.region_states if region.region_id == region_id), None)
    if region_state is not None and region_state.is_blockaded and region_state.blockade_controller is not None:
        if region_state.blockade_controller != player_country:
            return {
                "requiredOceanNodes": [],
                "blockedOceanNodes": [
                    {
                        "nodeId": region_id,
                        "controller": region_state.blockade_controller,
                    }
                ],
                "isAccessible": False,
                "lockReason": "route_blocked",
            }

    region_blueprint = balance.regions.region_blueprints.get(region_id)
    if region_blueprint is None:
        return {
            "requiredOceanNodes": [],
            "blockedOceanNodes": [],
            "isAccessible": True,
            "lockReason": None,
        }
    return {
        "requiredOceanNodes": [],
        "blockedOceanNodes": [],
        "isAccessible": True,
        "lockReason": None,
    }
