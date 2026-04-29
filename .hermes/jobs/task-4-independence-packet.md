You are executing one bounded implementation task inside this repository.

TASK ID:
task-4-independence

OBJECTIVE:
Implement colony independence dynamics: each turn, each controlled region's independence fluctuates based on market supply/demand balance, garrison presence, and whether looting occurred. When independence hits the threshold (10), the colony revolts.

WHY / CONTEXT:
Phase 4 military system. Tasks 2-3 added naval blockade and army conquest. This task adds the "cost of empire" mechanic: colonies are valuable but require military presence to maintain. Without garrison, colonies become unstable and eventually revolt.

KEY CONSTANTS (from military.json):
- `balance.military.independence_threshold` = 10

KEY FIELDS:
- `RegionState.independence: int` — current independence level (0 = stable)
- `RegionState.controller: str | None` — country value of controller
- `RegionState.garrison: dict[str, int]` — {"infantry": N, "artillery": M} (garrison units)
- `RegionState.market_supply: dict[str, int]` — goods sold to this region this turn
- `RegionState.resource_limit: dict[str, int]` — resource caps per goods type
- `RegionState.access_level` — RegionAccessLevel (COLONY or CONCESSION)

INDEPENDENCE FORMULA (per region per turn):

```
delta = 0

# 1. Market imbalance
supply_total = sum(market_supply.values())
demand_total = sum(resource_limit.values())
if demand_total > 0:
    ratio = supply_total / demand_total
    if ratio > 2.0 or ratio < 0.5:
        delta += 2  # severe imbalance
    elif ratio > 1.3 or ratio < 0.7:
        delta += 1  # mild imbalance

# 2. Looting penalty (check if region was looted this turn)
if region was looted this turn:
    delta += 2

# 3. Garrison suppression
garrison_total = sum(garrison.values())
delta -= garrison_total

# 4. Apply
independence = max(0, independence + delta)

# 5. Revolt check
if independence >= independence_threshold:
    revolt!
```

REVOLT EFFECTS:
- `region.controller = None`
- `region.garrison = {}`  
- `region.independence = 0`
- `region.access_level = RegionAccessLevel.CONCESSION` (downgrade from COLONY)

NOTE ON LOOTING:
The looting penalty (+2) requires knowing if the region was looted this turn. For this task, use a simple flag: add a `was_looted_this_turn: set[str]` parameter to the function. Task 5 will add the actual looting mechanics that populates this set. For now, just pass an empty set and test the formula.

NOTE ON SETTLEMENT ORDER:
This should run AFTER income allocation (which uses region controller for colony income) and BEFORE the end of the turn. Insert in settlement.py's main loop after `_apply_permanent_reform_effects` and before the reset block.

DO:

1. Add `_apply_independence_progression(snapshot, balance)` in settlement.py:
   - Iterate all `snapshot.region_states`
   - For each region with a controller: apply the formula above
   - For regions without controller: reset independence to 0
   - The function needs `looted_regions: set[str]` parameter — for now, pass empty set from caller
   - When revolt: set all revolt effects and log the event

2. Insert call in `resolve_settlement_phase`:
   - After `_apply_permanent_reform_effects(player_state, balance)` (line ~81)
   - This is called ONCE per settlement (not per player), so put it AFTER the per-player loop
   - Actually: put it INSIDE the per-player loop but check ALL regions (not just current player's)
   - OR: put it after the loop entirely — this is cleaner since independence affects all players

3. Write tests in `backend/tests/test_independence.py` (NEW):
   - Test 1: normal economic activity (ratio ~1.0) + no garrison → independence stable (0 change)
   - Test 2: mild market imbalance (ratio 1.5) → independence +1 per turn
   - Test 3: severe market imbalance (ratio 3.0) → independence +2 per turn
   - Test 4: garrison present → independence decreases
   - Test 5: looting penalty → independence +2
   - Test 6: revolt at threshold (10) → controller = None, garrison = {}, independence = 0, access = CONCESSION
   - Test 7: independence never goes below 0 (test with large garrison)
   - Test 8: uncontrolled region → independence stays 0
   - Test 9: garrison suppresses looting penalty (2 garrison + looting → net 0)

DO NOT:
- Do not add actual looting logic (Task 5)
- Do not change resource_limit (Task 5)
- Do not touch frontend
- Do not commit or push

FILES IN SCOPE:
- backend/app/modules/rules/settlement.py
- backend/tests/test_independence.py (NEW)
- backend/app/modules/game_state/models.py (read only)

IMPLEMENTATION RULES:
- Match existing code style
- Read settlement.py before editing — especially the main loop structure
- Independence calculation is region-level, not player-level
- The looted_regions set is passed as a parameter (empty for now)
- Insert the call after the per-player loop ends (so it runs once per settlement)
- Remember: revolt changes access_level, which may affect market access next turn

VERIFICATION TIER / BUDGET:
- Tier: T1 (small feature — independence mechanics)
- Time cap: 15 minutes
- Do run: new tests + full test suite
- Do not run: frontend, browser, live API

VERIFICATION:
- cd backend && python -m pytest tests/test_independence.py -v
- cd backend && python -m pytest tests/ -q (292 + new tests all pass)
- python -m py_compile app/modules/rules/settlement.py

RETURN FORMAT:
1. Summary
2. Files changed
3. Verification run
4. Verification budget
5. Open issues
6. Suggested next step
