You are executing one bounded implementation task inside this repository.

TASK ID:
task-3-army-conquest

OBJECTIVE:
Implement army-based region conquest: players spend infantry/artillery to capture regions. Supports capturing unclaimed regions (minimum 1 power) and taking another player's colony (2× defender garrison required). Artillery counts as 2× infantry in combat power.

WHY / CONTEXT:
Phase 4 military. Task 2 added naval blockade and route checking. This task adds the land combat system: army deployment, conquest validation, conflict resolution, and colony capture.

KEY FIELD NAMES:
- `PlayerState.army: dict[str, int]` — {"infantry": N, "artillery": M}
- `RegionState.controller: str | None` — country value of controller
- `RegionState.garrison: dict[str, int]` — {"infantry": N, "artillery": M}
- `RegionState.region_id: str`
- `balance.regions.region_blueprints[region_id].colonizable: bool`
- `balance.regions.region_blueprints[region_id].min_army: int` — minimum power to capture unclaimed region
- `check_route_accessible(player_country, region_id, snapshot, balance)` from Task 2
- `player_state.country.value` — country key

COMBAT POWER CALCULATION:
- 1 infantry = 1 power
- 1 artillery = 2 power
- Total attack power = infantry + artillery × 2
- Garrison power = infantry + artillery × 2

CONQUEST RULES:
1. Player submits `conquestActions: [{regionId, infantry, artillery}]` in militaryPlan
2. For each action:
   a. Check route accessible (using check_route_accessible from route_utils)
   b. Check region is colonizable
   c. Check no controller exists (unclaimed) OR controller != current player
   d. Calculate attack power from submitted infantry + artillery×2
   e. If region unclaimed: need attack_power >= 1
   f. If region controlled by another: need attack_power >= garrison_power × 2
   g. If pass: deduct army, set controller, set garrison
   h. If fail: skip, army NOT consumed
3. CONFLICT RESOLUTION: If multiple players try to capture the same region in the same turn:
   - Only the player with highest attack_power succeeds
   - Tie: nobody succeeds
   - Original controller (if any) loses the region only if a conqueror succeeds

PRE-PROCESSING (collect all conquests before executing):
Since conquests must be resolved simultaneously, the implementation needs to:
1. Collect ALL players' conquestActions first
2. For each target region, find all attackers
3. Resolve each region's conflict independently
4. Execute winners only

This means conquest processing needs to happen in the MAIN decision loop (resolve_decision_phase), not per-player. The function should be called ONCE after all players' military plans are processed.

DO:

1. Add `_resolve_conquest_actions(all_conquest_actions, snapshot, balance)` in decision.py:
   - `all_conquest_actions` is a list of tuples: `(player_state, conquest_actions_list)`
   - For each target region, find all attackers
   - Calculate each attacker's power
   - Determine winner (highest power; ties → nobody wins)
   - Winner: deduct army from player_state, set region.controller = winner.country.value, set garrison
   - If region was controlled by another: set their garrison to {} (defeated)

2. In `resolve_decision_phase` main loop:
   - After processing all players' individual military plans
   - Collect all conquest actions
   - Call `_resolve_conquest_actions` once
   - This requires a two-pass approach: first pass collects conquest actions, second pass resolves them

3. Handle army consumption:
   - Deduct infantry first, then artillery
   - If attacker submits 3 infantry + 2 artillery but only has 2 infantry + 1 artillery:
     → use available (2 infantry + 1 artillery = 4 power), deduct what's used
   - DO NOT silently consume army if conditions aren't met

4. Write tests in `backend/tests/test_army_conquest.py` (NEW):
   - Test 1: capture unclaimed region (sufficient power)
   - Test 2: capture unclaimed region (insufficient power → rejected)
   - Test 3: capture from another player (2× garrison met)
   - Test 4: capture from another player (insufficient power → rejected)
   - Test 5: artillery counts as 2× power (1 artillery = 2 infantry)
   - Test 6: two players attack same unclaimed region — higher power wins
   - Test 7: two players attack same region — tie → nobody wins
   - Test 8: route blocked → conquest rejected
   - Test 9: garrison properly set after capture
   - Test 10: army deducted after conquest

DO NOT:
- Do not change the existing peaceful colonization path (colonizationActions via military_points)
- Do not add independence logic (Task 4)
- Do not add resource looting (Task 5)
- Do not touch frontend
- Do not commit or push
- Do not add min_army to region blueprints config (just use 1 as default if not present)

FILES IN SCOPE:
- backend/app/modules/rules/decision.py
- backend/app/modules/rules/route_utils.py (read only — use check_route_accessible)
- backend/app/modules/game_state/models.py (read only)
- backend/tests/test_army_conquest.py (NEW)

IMPLEMENTATION RULES:
- Match existing code style
- Read decision.py lines 26-90 (main loop) and 364-430 (_apply_military_plan) before editing
- Simultaneous resolution: collect all conquests FIRST, then resolve. Do NOT process per-player.
- The main loop processes players sequentially. To collect all conquests, either:
  a) Process military plans in first pass (collecting conquests), then resolve conquests, OR
  b) Modify the existing _apply_military_plan to NOT process conquestActions, and handle them separately after the loop
  - Option (b) is cleaner: keep _apply_military_plan for military/diplomacy/colonization, add a separate pass for conquest
- When a region is captured, set garrison to the army that was committed (infantry + artillery)

VERIFICATION TIER / BUDGET:
- Tier: T1 (small feature — army conquest)
- Time cap: 20 minutes
- Do run: new tests + full test suite
- Do not run: frontend, browser, live API

VERIFICATION:
- cd backend && python -m pytest tests/test_army_conquest.py -v
- cd backend && python -m pytest tests/ -q (282 + new tests all pass)
- python -m py_compile app/modules/rules/decision.py

STOP CONDITIONS:
- If simultaneous resolution requires major refactoring of resolve_decision_phase, stop and report
- If army deduction logic has ambiguous edge cases, stop and report

RETURN FORMAT:
1. Summary
2. Files changed
3. Verification run
4. Verification budget
5. Open issues
6. Suggested next step
