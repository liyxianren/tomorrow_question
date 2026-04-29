You are executing one bounded implementation task inside this repository.

TASK ID:
task-5-workspace

OBJECTIVE:
Rewrite `_build_tech_tree()` in workspaces.py to output the new Phase 3 chain progress structure, replacing the old empty-list shim from Task 2.

WHY / CONTEXT:
Task 2 made `_build_tech_tree` return `[]` as a shim. Now with the full model (active_research, research_progress, breakthrough_attempts) and rules (Tasks 3-4) in place, we need the workspace to expose the research state to the frontend so the player can see chain progress, set targets, and track breakthroughs.

DESIRED OUTPUT FORMAT (per design doc):
```python
{
    "chains": [
        {
            "chainId": "mechanical",
            "label": "机械链",
            "techs": [
                {
                    "techId": "spinning_jenny",
                    "label": "珍妮纺纱机",
                    "threshold": 3,
                    "progress": 5,
                    "effectiveThreshold": 3,     # threshold - breakthrough_attempts
                    "isUnlocked": True,
                    "isActive": False,
                    "canResearch": False,         # prereqs met and not unlocked
                    "isDiscovered": False,        # unlocked by any OTHER player
                    "breakthroughAttempts": 0,
                }
            ]
        }
    ],
    "researchFacilities": 2,
    "facilityCost": 12,
    "progressPerFacility": 1,
    "activeResearch": "lathe",                    # or None
}
```

DO:
1. Read the current state of `backend/app/modules/game_state/workspaces.py`:
   - Line ~213: where `"techTree": _build_tech_tree(player)` is called and inserted into workspace
   - Lines ~669-686: the current `_build_tech_tree` function (now returning [] from Task 2 shim)

2. Rewrite `_build_tech_tree(player: PlayerState) -> dict`:
   - Iterate `balance.technology.chains` (dict of chain_id → ResearchChainConfig)
   - For each chain, iterate its techs
   - For each tech, compute:
     * progress = player.research_progress.get(tech_id, 0)
     * effectiveThreshold = max(1, tech.threshold - player.breakthrough_attempts.get(tech_id, 0))
     * isUnlocked = tech_id in player.unlocked_techs
     * isActive = (player.active_research == tech_id)
     * canResearch = not isUnlocked AND (first in chain OR predecessor is in player.unlocked_techs)
     * isDiscovered = check all players... wait, we don't have snapshot in _build_tech_tree
       → For the workspace output, use the player itself only. The discovery-check requires ALL players, which is a snapshot-level concern. Define isDiscovered as "unlocked by at least one OTHER player" using a set from all player_states. But we don't have snapshot in _build_tech_tree...
       → Solution: HARDCODE `isDiscovered = False` for now. We'll wire the cross-player check in a follow-up if needed. The frontend doesn't need it for v1.
     * breakthroughAttempts = player.breakthrough_attempts.get(tech_id, 0)
   - Build the return dict with chains, researchFacilities (total from dict values), facilityCost, progressPerFacility, activeResearch

3. Update the workspace dict key at line ~213:
   - CURRENT: `"techTree": _build_tech_tree(player)` — returns a list
   - NEW: the function now returns a dict (not a list). The workspace validation in models.py (line ~472) checks `isinstance(player_workspace.get("techTree"), list)` — this needs to be updated to accept dict
   - Change the models.py validation from `isinstance(..., list)` to `isinstance(..., (list, dict))` for the techTree key

4. Update `backend/tests/test_game_state_workspaces.py`:
   - The test `test_decision_workspace_exposes_active_events_national_ability_and_price_trend` is already skipped
   - Find any other test that accesses workspace["techTree"] and update assertions for the new dict structure
   - If tests iterate over techTree as a list, update to iterate over techTree["chains"] instead

5. Run the full test suite and fix any failing tests

DO NOT:
- Do not implement frontend UI (follow-up Task 5b)
- Do not add /setting entries for tech params (follow-up Task 5b)
- Do not change the snapshot/workspace structure beyond techTree
- Do not commit or push

FILES IN SCOPE:
- backend/app/modules/game_state/workspaces.py
- backend/app/modules/game_state/models.py (workspace validation)
- backend/tests/test_game_state_workspaces.py (update assertions)

IMPLEMENTATION RULES:
- Make the smallest change that satisfies the objective
- Read workspaces.py fully before editing (especially lines 200-220 and 669-686)
- Follow existing code style in workspaces.py
- The balance.technology.chains structure: dict[chain_id] → ResearchChainConfig (.techs: list[ChainTechConfig])
- ChainTechConfig has: .tech_id, .label, .threshold

VERIFICATION TIER / BUDGET:
- Tier: T1 (backend workspace rewrite)
- Time cap before checkpoint: 15 minutes
- Do run: full test suite + py_compile
- Do not run: frontend, browser dogfood, live API

VERIFICATION:
- cd backend && python -m pytest tests/ -q (269 passed + 8 skipped + any test updates all pass)
- python -m py_compile app/modules/game_state/workspaces.py
- Quick manual check: the workspace dict has "techTree" as a dict with "chains" key

STOP CONDITIONS:
- Stop and report if more than 5 tests need assertion updates
- Stop and report if workspace validation changes cascade unexpectedly
- Stop and report if the chains data structure differs from described

RETURN FORMAT:
1. Summary + output format
2. Files changed
3. Verification run
4. Verification budget
5. Open issues
6. Suggested next step
