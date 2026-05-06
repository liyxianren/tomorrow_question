from __future__ import annotations


def resolve_naval_blockade(snapshot, balance) -> None:
    threshold = int(balance.military.ocean_control_threshold)
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
