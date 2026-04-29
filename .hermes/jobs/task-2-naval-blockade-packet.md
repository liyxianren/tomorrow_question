You are executing one bounded implementation task inside this repository.

TASK ID:
task-2-naval-blockade

OBJECTIVE:
Implement naval deployment + blockade determination + route accessibility check. Players assign fleets to ocean nodes during decision phase; the settlement phase determines which nodes are blockaded; market sales and diplomacy are blocked for regions behind blockaded nodes.

WHY / CONTEXT:
Phase 4 military system. OceanNodeState model already exists from Task 1. This task wires the naval power game: deploy fleets → determine blockades → restrict access. Uses country-keyed dicts (not player_id) since each player owns one CountryCode.

KEY FIELD NAMES (from Task 1):
- `OceanNodeState.navy_by_country: dict[str, int]` — keyed by country value (e.g., "britain")
- `OceanNodeState.controller: str | None` — country value of blockade controller
- `OceanNodeState.is_blockaded: bool` — boolean flag
- `player_state.country.value` — country key for accessing navy_by_country
- `balance.military.ocean_control_threshold` — threshold from military.json (value=2)

BLOCKADE RULE (from §4 design):
For each ocean node:
1. Find player with highest `navy_by_country` value
2. That player's fleet count must be >= `ocean_control_threshold` (2)
3. That player's fleet count must be strictly greater than any other single player's fleet count
4. If all conditions met: set `controller = winner_country`, `is_blockaded = True`
5. Otherwise: set `controller = None`, `is_blockaded = False`

DO:

1. Read `backend/app/modules/rules/decision.py` lines 364-430 (the `_apply_military_plan` function) to understand insertion point.

2. Add `_apply_naval_deployment(player_state, military_plan, snapshot, balance)` in decision.py:
   - Read `military_plan.get("navalDeployment")` — dict of `{node_id: fleet_count}`
   - Validate: fleet_count <= `player_state.navy.get("fleets", 0)` AND sum of all deployments <= total fleets
   - Find the matching OceanNodeState in `snapshot.ocean_node_states`
   - Write `node.navy_by_country[player_state.country.value] = fleet_count`
   - NOTE: fleets are NOT consumed — they're position-assigned, like a location pointer

3. Insert call to `_apply_naval_deployment` in `_apply_military_plan` BEFORE the diplomacy loop (before line 379). Pass snapshot parameter.

4. Add `_resolve_naval_blockade(snapshot, balance)` in settlement.py:
   - Iterate all `snapshot.ocean_node_states`
   - For each node: find highest navy player, check threshold, set controller/is_blockaded
   - Call this BEFORE `_apply_ideology_progression` in the settlement main loop (before market settlement — the market phase uses blockade info)

5. Add `_check_route_accessible(player_country, region_id, snapshot, balance)` utility function:
   - Get region blueprint's `required_nodes`
   - If no required_nodes: return True (europe — always accessible)
   - For each required_node: check if any OceanNodeState has `controller != player_country` AND `is_blockaded = True`
   - If any node is blockaded by someone else: return False
   - Otherwise: return True
   - Put this in `decision.py` or a new `app/modules/rules/route_utils.py`

6. Wire `_check_route_accessible` into:
   - Diplomacy actions (line ~379): before establishing diplomacy, check route access. If route not accessible, skip the diplomacy action.
   - Do NOT add it to market.py yet — that's Task 6 integration. Just ensure the utility function exists and is testable.

7. Write tests in `backend/tests/test_naval_blockade.py` (NEW):
   - Test 1: deploy fleets to node → navy_by_country updated
   - Test 2: deploy exceeds total fleets → rejected
   - Test 3: blockade determined correctly (player with most fleets AND >= threshold)
   - Test 4: blockade not determined (too few fleets / no clear leader)
   - Test 5: equal fleet counts → no blockade
   - Test 6: route accessible (no blockade on required nodes)
   - Test 7: route blocked (blockade on required node by other player)
   - Test 8: europe always accessible (no required nodes)
   - Test 9: diplomacy blocked when route inaccessible

DO NOT:
- Do not add market.py route check (Task 6)
- Do not add conquest logic (Task 3)
- Do not add independence logic (Task 4)
- Do not add resource looting (Task 5)
- Do not touch frontend
- Do not commit or push

FILES IN SCOPE:
- backend/app/modules/rules/decision.py
- backend/app/modules/rules/settlement.py
- backend/app/modules/rules/route_utils.py (NEW, if needed)
- backend/app/modules/game_state/models.py (read only, for reference)
- backend/app/modules/game_state/workspaces.py (read only)
- backend/tests/test_naval_blockade.py (NEW)

IMPLEMENTATION RULES:
- Match existing code style
- Read decision.py fully before editing
- For snapshot parameter: the existing `_apply_military_plan` already accepts `snapshot=None`. Naval deployment needs snapshot to access `ocean_node_states`. Ensure `snapshot` is passed correctly from the main decision loop (line ~47).
- Use `player_state.country.value` as key into `navy_by_country` dict
- Route check utility should be importable from both decision.py and (later) market.py

VERIFICATION TIER / BUDGET:
- Tier: T1 (small feature — naval mechanics)
- Time cap: 20 minutes
- Do run: new tests + full test suite
- Do not run: frontend, browser, live API

VERIFICATION:
- cd backend && python -m pytest tests/test_naval_blockade.py -v
- cd backend && python -m pytest tests/ -q (272 + new tests all pass)
- python -m py_compile app/modules/rules/decision.py app/modules/rules/settlement.py

RETURN FORMAT:
1. Summary
2. Files changed
3. Verification run
4. Verification budget
5. Open issues
6. Suggested next step
