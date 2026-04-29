You are executing one bounded implementation task inside this repository.

TASK ID:
task-5-looting

OBJECTIVE:
Implement resource looting for colonies: colony controllers can extract raw materials from their colonies once per turn, depleting the region's resource limit permanently. Looting triggers independence penalties via the existing `looted_regions` mechanism.

WHY / CONTEXT:
Phase 4 military system. Tasks 1-4 added naval blockade, conquest, and independence. This task adds the economic incentive for colonization: looting raw materials from colonies. This is the "掠夺产能与原材料" mechanic from the user requirements.

KEY FIELDS:
- `RegionState.resource_limit: dict[str, int]` — e.g., {"coal": 5, "cotton": 3}
- `RegionState.controller: str | None` — country value
- `RegionState.access_level` — must be COLONY to loot
- `PlayerState.phase1_economy.raw_materials: int` — where looted materials go
- `_apply_independence_progression(snapshot, balance, looted_regions=set())` — Task 4's function accepts a `looted_regions: set[str]` parameter that adds +2 independence penalty

LOOTING RULES:
1. Player submits `lootingActions: [{regionId, resourceType}]` in militaryPlan
2. For each looting action:
   a. Player must own the region (controller == player.country.value)
   b. Region access_level must be COLONY (not CONCESSION)
   c. resourceType must exist in resource_limit for this region
   d. resource_limit[resourceType] must be > 0
   e. If all pass:
      - looted_amount = min(1, resource_limit[resourceType]) — loot 1 unit per action
      - resource_limit[resourceType] -= looted_amount
      - player_state.phase1_economy.raw_materials += looted_amount
      - Add region_id to looted_regions set
3. One looting action per colony per turn (enforced via max_per_colony in code)

LOOTING → INDEPENDENCE INTEGRATION:
- The existing `_apply_independence_progression(snapshot, balance, looted_regions)` already handles the +2 penalty
- This task needs to:
  1. Collect looted_regions during decision phase (store on snapshot or pass to settlement)
  2. Thread the set into the settlement call

STORING LOOTED REGIONS:
- Add `looted_regions_this_turn: set[str]` field to GameSnapshot
- Initialize as empty set
- Decision phase: looting actions add to this set
- Settlement phase: pass to `_apply_independence_progression`
- Reset at turn end (along with other per-turn state)

DO:

1. Add looting field to GameSnapshot:
   - `looted_regions_this_turn: set[str] = field(default_factory=set)`
   - Update to_payload/from_payload (serialize as list, deserialize as set)

2. Add `_apply_looting_actions(player_state, looting_actions, snapshot, balance)` in decision.py:
   - Validate each action per rules above
   - Loot 1 unit per valid action
   - Update resource_limit and raw_materials
   - Add region_id to `snapshot.looted_regions_this_turn`

3. Wire into `_apply_military_plan` (add lootingActions handling after colonization):
   - Call `_apply_looting_actions(player_state, military_plan.get("lootingActions", []), snapshot, balance)`

4. Update settlement.py call to `_apply_independence_progression`:
   - Pass `snapshot.looted_regions_this_turn` as the `looted_regions` parameter

5. Reset `snapshot.looted_regions_this_turn` at the end of settlement (alongside other per-turn resets)

6. Write tests in `backend/tests/test_looting.py` (NEW):
   - Test 1: loot from own colony → raw_materials +1, resource_limit -1
   - Test 2: loot from concession (not colony) → rejected
   - Test 3: loot from uncontrolled region → rejected
   - Test 4: loot from other player's colony → rejected
   - Test 5: resource_limit at 0 → cannot loot
   - Test 6: looted region gets independence penalty (check via _apply_independence_progression)
   - Test 7: multiple looting actions from same colony → only first succeeds (one per colony)
   - Test 8: resource_limit properly decremented (verify persistence across calls)

DO NOT:
- Do not change conquest logic (Task 3)
- Do not change independence formula (Task 4 — just thread the looted_regions)
- Do not touch frontend
- Do not commit or push

FILES IN SCOPE:
- backend/app/modules/game_state/models.py (add looted_regions_this_turn to GameSnapshot)
- backend/app/modules/rules/decision.py (add looting logic)
- backend/app/modules/rules/settlement.py (thread looted_regions parameter)
- backend/tests/test_looting.py (NEW)

IMPLEMENTATION RULES:
- Match existing code style
- Read GameSnapshot class and _apply_military_plan before editing
- Looting amount is 1 unit per action (simple, not configurable)
- One action per colony per turn (enforced by checking if region already in looted set)
- resource_limit changes are PERMANENT (not restored per turn)
- Looting integration with independence is via the existing looted_regions parameter — do NOT duplicate the independence penalty logic

VERIFICATION TIER / BUDGET:
- Tier: T1 (small feature — looting mechanics)
- Time cap: 15 minutes
- Do run: new tests + full test suite
- Do not run: frontend, browser, live API

VERIFICATION:
- cd backend && python -m pytest tests/test_looting.py -v
- cd backend && python -m pytest tests/ -q (301 + new tests all pass)
- python -m py_compile app/modules/rules/decision.py app/modules/rules/settlement.py

RETURN FORMAT:
1. Summary
2. Files changed
3. Verification run
4. Verification budget
5. Open issues
6. Suggested next step
