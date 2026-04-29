You are executing one bounded implementation task inside this repository.

TASK ID:
task-6-config-integration

OBJECTIVE:
Wire the Phase 4 military system into the rest of the game: add build_fleet action, update artillery cost, connect route checking to market sales and diplomacy, and expose naval/independence data in workspaces.

WHY / CONTEXT:
Tasks 1-5 built all the core mechanics. This task connects them to the rest of the game engine so the system is fully operational.

DO:

1. **Config: add build_fleet action** in `backend/config/balance/military_actions.json`:
   Add under `militaryActions`:
   ```json
   "build_fleet": {
     "label": "建造舰队",
     "budgetPoolCost": 50,
     "militaryPointCost": 0,
     "maxPerRound": 1,
     "effects": {
       "navyDelta": {"fleets": 1},
       "militaryPointsDelta": 1
     },
     "description": "建造新舰队，增强海军力量。"
   }
   ```
   Check if `effects.py` supports `navyDelta` — if not, add handling for it.

2. **Config: update train_artillery cost** in `backend/config/balance/military_actions.json`:
   Change `"train_artillery"` from `"budgetPoolCost": 8` to `"budgetPoolCost": 16`
   (Reason: artillery = 2× infantry combat power, should cost 2× infantry = 16$)

3. **Market integration**: Wire `check_route_accessible` into `backend/app/modules/rules/market.py`:
   - In `_apply_phase1_market`, the overseas allocation loop already checks `is_region_accessible()`
   - Add an additional check: `check_route_accessible(player_state.country.value, region_id, snapshot, balance)`
   - If route is blocked, skip that region allocation (same as inaccessible)
   - Import `check_route_accessible` from `route_utils.py`

4. **Diplomacy integration**: In `decision.py`, before establishing diplomacy:
   - Already done in Task 2 — verify that `_check_route_accessible` is called before diplomacy actions
   - If not, add it now

5. **Workspace: expose naval states** in `workspaces.py`:
   - In `_build_military_workspace`, add ocean node states:
   ```python
   "oceanNodes": [
       {
           "nodeId": node.node_id,
           "navyByCountry": dict(node.navy_by_country),
           "controller": node.controller,
           "isBlockaded": node.is_blockaded,
           "myFleet": node.navy_by_country.get(player.country.value, 0),
       }
       for node in snapshot.ocean_node_states
   ]
   ```
   - Need to pass `snapshot` to `_build_military_workspace` — check if it's already available

6. **Workspace: expose region independence** in workspaces.py:
   - In `_build_colonization_options` or a new section, expose each region's independence level:
   ```python
   "independence": region.independence,
   "garrison": dict(region.garrison),
   ```

7. **Config: add min_army to region blueprints** in `backend/config/balance/regions.json`:
   - Add `"minArmy": 1` to each region entry (minimum army power to capture unclaimed region)
   - Update `RegionBlueprintConfig` dataclass to include `min_army: int = 1`
   - Update loader to parse this field
   - This was assumed in Task 3's conquest logic (check if it uses this field or defaults to 1)

8. Run the full test suite and fix any failures from the config changes (train_artillery cost change may affect existing tests).

DO NOT:
- Do not change core game logic (Tasks 1-5 are done)
- Do not add frontend UI
- Do not commit or push

FILES IN SCOPE:
- backend/config/balance/military_actions.json
- backend/config/balance/regions.json
- backend/app/modules/rules/market.py
- backend/app/modules/rules/decision.py (verify diplomacy wiring)
- backend/app/modules/game_state/workspaces.py
- backend/app/modules/game_state/effects.py (check navyDelta support)
- backend/app/modules/balance_config/models.py (min_army field)
- backend/app/modules/balance_config/loader.py (min_army loading)

IMPLEMENTATION RULES:
- Match existing code style
- Read each file before editing
- Config changes first, then code wiring, then test fixes
- Effects.py: check if navyDelta handling exists for {"fleets": N} format. If not, add it following the existing armyDelta pattern.

VERIFICATION TIER / BUDGET:
- Tier: T2 (config + wiring across multiple modules)
- Time cap: 20 minutes
- Do run: full test suite + py_compile + tsc --noEmit
- Do not run: frontend vitest (pre-existing failures), browser, live API

VERIFICATION:
- cd backend && python -m pytest tests/ -q (309 + new tests - old artillery cost tests updated)
- cd frontend && npx tsc --noEmit
- python -m py_compile on all touched files

RETURN FORMAT:
1. Summary
2. Files changed
3. Verification run
4. Verification budget
5. Open issues
6. Suggested next step
