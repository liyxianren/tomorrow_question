You are executing one bounded implementation task inside this repository.

TASK ID:
task-4-settlement-rules

OBJECTIVE:
Implement Phase 3 research progress and breakthrough logic in the settlement phase — the core mechanic of the new tech tree system.

WHY / CONTEXT:
Task 3 added the research target selection. Now in settlement, each player's `active_research` target should accumulate progress from their research facilities, and when progress reaches the threshold, a breakthrough dice roll occurs. This is the core game mechanic: research facilities → progress → breakthrough → tech unlock.

THE MECHANIC:
Each settlement turn, for each player with an active research target:
1. Accumulate: `research_progress[target] += sum(research_facilities.values())`
2. Check threshold: effective = `max(1, tech.threshold - breakthrough_attempts.get(target, 0))`
3. If progress < effective threshold: stop (not enough yet)
4. If tech is "discovered" (unlocked by ANY other player) AND progress >= 2× threshold: direct-unlock (consume 2× threshold progress, no dice)
5. Otherwise: roll D10 (balance.technology.breakthrough_die_sides = 10)
   - Success (roll >= effective threshold): unlock tech, clear progress, clear breakthrough_attempts
   - Failure: breakthrough_attempts[target] += 1 (soft pity, lowers threshold for next try)

DO:
1. Read settlement.py fully to understand the loop structure.

2. Add `import random` at the top of settlement.py.

3. Implement `_apply_phase3_research_progress(player_state, snapshot, balance)`:
   - Get active = player_state.active_research
   - If None or already unlocked: return
   - Find the tech in balance.technology.chains (search all chains)
   - If tech not found: return
   - Accumulate progress: research_progress[active] += sum(research_facilities.values())
   - Calculate effective_threshold = max(1, tech.threshold - breakthrough_attempts.get(active, 0))
   - If progress < effective_threshold: return
   - Check if discovered (any other player_state.unlocked_techs has this tech):
     * Build a set from all snapshot.player_states: `all_unlocked = {tech for ps in snapshot.player_states for tech in ps.unlocked_techs}`
     * is_discovered = active in all_unlocked
   - If discovered AND progress >= tech.threshold * 2:
     * Direct-unlock: research_progress[active] -= tech.threshold * 2
     * unlocked_techs.append(active)
     * Clear breakthrough_attempts for this tech
     * return
   - Roll D10: roll = random.randint(1, balance.technology.breakthrough_die_sides)
   - If roll >= effective_threshold: SUCCESS
     * unlocked_techs.append(active)
     * research_progress[active] = 0
     * Clear breakthrough_attempts for this tech
   - Else: FAILURE — soft pity
     * breakthrough_attempts[active] = breakthrough_attempts.get(active, 0) + 1
     * Progress KEPT (retry next turn with lower threshold)

4. Insert `_apply_phase3_research_progress` call in settlement.py's main loop:
   - Inside the `for player_state in updated_snapshot.player_states:` loop
   - AFTER `_apply_permanent_reform_effects(player_state, balance)` (line 81)
   - BEFORE the income ratio reset (line 82)
   - Pass `updated_snapshot` so the function can check all players for discovery

5. Write comprehensive unit tests in `backend/tests/test_phase3_research_settlement.py` (NEW):
   - Test 1: progress accumulation — set active_research, call function, verify research_progress increased by facility count
   - Test 2: progress below threshold — set progress just below threshold with no attempts, verify function returns without unlocking
   - Test 3: successful breakthrough — set progress at threshold, mock random.randint to return high value, verify tech unlocked + progress cleared
   - Test 4: failed breakthrough — set progress at threshold, mock random.randint to return low value, verify tech NOT unlocked, breakthrough_attempts += 1, progress kept
   - Test 5: soft pity — failed 2 times (attempts=2), threshold=4, effective=2, verify roll 2 succeeds
   - Test 6: direct unlock — tech previously unlocked by another player, progress >= 2× threshold, verify no dice roll, 2× threshold consumed
   - Test 7: no active research — active_research=None, verify no-op
   - Test 8: multiple facilities — 3 facilities, verify progress += 3
   - Test 9: breakthrough at effective threshold of 1 (max pity) — verify guaranteed success

DO NOT:
- Do not change income allocation or budget logic
- Do not modify the decision phase code (Task 3 territory)
- Do not change workspace rendering (Task 5)
- Do not touch frontend code
- Do not commit or push
- Do not remove the _apply_tech_research call (already no-opped)

FILES IN SCOPE:
- backend/app/modules/rules/settlement.py
- backend/tests/test_phase3_research_settlement.py (NEW)

IMPLEMENTATION RULES:
- Make the smallest change that satisfies the objective
- Read settlement.py fully before editing
- For tests that need mock random, use `unittest.mock.patch('random.randint')` or `monkeypatch`
- Use existing test patterns from test_phase3_research_decision.py as reference
- The balance.technology.chains structure: dict[chain_id] → ResearchChainConfig (.techs: list[ChainTechConfig])
- ChainTechConfig has: .tech_id, .label, .threshold
- PlayerState has: .active_research, .research_progress (dict), .breakthrough_attempts (dict), .research_facilities (dict), .unlocked_techs (list)

VERIFICATION TIER / BUDGET:
- Tier: T1 (feature implementation with unit tests)
- Time cap before checkpoint: 20 minutes
- Do run: new test file + full test suite
- Do not run: frontend, browser dogfood, live API

VERIFICATION:
- cd backend && python -m pytest tests/test_phase3_research_settlement.py -v (all pass)
- cd backend && python -m pytest tests/ -q (all existing pass + new tests pass)
- python -m py_compile app/modules/rules/settlement.py

STOP CONDITIONS:
- Stop and report if the chains data structure differs from ChainTechConfig described above
- Stop and report if random mocking approach doesn't work with the existing test framework
- Stop and report if inserting the call breaks existing settlement behavior

RETURN FORMAT:
1. Summary
2. Files changed
3. Verification run
4. Verification budget
5. Open issues / assumptions
6. Suggested next step
