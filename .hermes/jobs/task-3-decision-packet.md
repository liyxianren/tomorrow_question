You are executing one bounded implementation task inside this repository.

TASK ID:
task-3-decision-rules

OBJECTIVE:
Add Phase 3 research decision rules: (a) new `_apply_phase3_research_plan()` function that lets players set a research target, (b) wire it into the main decision flow, (c) update `expand_research` cost to 12.

WHY / CONTEXT:
Phase 3 replaces the old budget-buy tech system with research-over-time. The decision phase is where players choose their active research target. The function validates the target (exists in chains, prerequisites met, not already unlocked) and sets `player_state.active_research`. The "build research facility" action already exists as `expand_research` in decision_actions.json — we only need to change its cost from 10 to 12.

DO:
1. Read the current state of `backend/app/modules/rules/decision.py` fully to understand the flow (especially lines 26-88, the main `resolve_decision_phase` loop).

2. Add new function `_apply_phase3_research_plan(player_state, payload: dict, balance)`:
   - Read `payload.get("researchTarget")` — this is a string (tech_id) or None
   - If None or empty string: return (no-op, player didn't set a target)
   - Look up the tech_id in `balance.technology.chains` (iterate all chains, all techs)
   - If tech_id not found in any chain: return (invalid target, silently ignore)
   - If tech_id is already in `player_state.unlocked_techs`: return (already unlocked)
   - Check prerequisites: the tech must be the first in its chain OR its predecessor in the chain must be in `player_state.unlocked_techs`. Chain order matters — techs within a chain are sequential.
   - If prerequisites not met: return
   - Set `player_state.active_research = tech_id`

3. Insert call to `_apply_phase3_research_plan` in the main `resolve_decision_phase` loop (around line 51), AFTER the existing `_apply_tech_research` call (which is now a no-op). Order: the phase3 research plan should run after government/reform/policy/talent/tech calls.

4. Update `backend/config/balance/decision_actions.json`:
   - Find `expand_research` action
   - Change `"budgetCost": 10` to `"budgetCost": 12`

5. Write focused unit tests:
   - Create `backend/tests/test_phase3_research_decision.py`
   - Test 1: setting a valid research target (first tech in a chain)
   - Test 2: setting a valid research target (second tech, prerequisite met by mocking unlocked_techs)
   - Test 3: setting an invalid target (not in any chain) → active_research stays None
   - Test 4: setting a target whose prerequisite is not unlocked → active_research stays None
   - Test 5: setting target=None → no-op
   - Test 6: switching targets → active_research changes, old progress should NOT be affected (just check active_research changes)

DO NOT:
- Do not implement settlement-phase progress/breakthrough logic (Task 4)
- Do not change routeUnlocks behavior
- Do not touch workspace rendering (Task 5)
- Do not change any existing non-tech decision logic
- Do not commit or push
- Do not run frontend tests

FILES IN SCOPE:
- backend/app/modules/rules/decision.py
- backend/config/balance/decision_actions.json
- backend/tests/test_phase3_research_decision.py (NEW FILE)

IMPLEMENTATION RULES:
- Make the smallest change that satisfies the objective
- Read decision.py fully before editing
- The new function should follow the style of existing functions (e.g., _apply_talent_plan)
- The balance.technology.chains structure is: dict of chain_id → ResearchChainConfig (which has .techs: list of ChainTechConfig, each with .tech_id, .label, .threshold)
- Tests should use the existing test infrastructure (BalanceConfig, create_initial_snapshot, etc.)
- import Optional from typing if needed for active_research

VERIFICATION TIER / BUDGET:
- Tier: T1 (small feature — research target selection)
- Time cap before checkpoint: 15 minutes
- Do run: the new test file + decision.py py_compile + full test suite (254 passed + 8 skipped + new tests all pass)
- Do not run: frontend tests, browser dogfood, live API

VERIFICATION:
- python -m py_compile app/modules/rules/decision.py
- cd backend && python -m pytest tests/test_phase3_research_decision.py -v (all new tests pass)
- cd backend && python -m pytest tests/ -q (all existing 254 passed + 8 skipped + new tests pass)

STOP CONDITIONS:
- Stop and report if the chains data structure is different than described
- Stop and report if existing tests break beyond the 8 already-skipped ones
- Stop and report if you need to change the decision payload contract schema (contracts/models.py)

RETURN FORMAT:
1. Summary: what changed
2. Files changed: list
3. Verification run: commands + results
4. Verification budget: tier used
5. Open issues / assumptions
6. Suggested next step
