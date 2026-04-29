from __future__ import annotations


def check_route_accessible(player_country: str, region_id: str, snapshot, balance) -> bool:
    region_blueprint = balance.regions.region_blueprints.get(region_id)
    if region_blueprint is None:
        return True
    required_nodes = region_blueprint.required_nodes
    if not required_nodes:
        return True

    nodes_by_id = {node.node_id: node for node in snapshot.ocean_node_states}
    for node_id in required_nodes:
        node = nodes_by_id.get(node_id)
        if node is None:
            continue
        if node.is_blockaded and node.controller is not None and node.controller != player_country:
            return False
    return True
