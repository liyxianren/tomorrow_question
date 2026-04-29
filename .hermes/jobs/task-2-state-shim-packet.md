You are executing one bounded implementation task inside this repository.

TASK ID:
task-2-state-shim

OBJECTIVE:
Two goals: (A) patch all downstream consumers broken by the Task 1 config rename to restore the 262-test green baseline, (B) add three new PlayerState fields for Phase 3 research.

WHY / CONTEXT:
Task 1 rewrote technology.json, replacing tech_tree with chains. This broke 6 downstream files that still reference the old dataclass fields. All 137 test failures trace back to factory.py:99 (AttributeError on .tech_tree). We need to shim these consumers minimally so tests pass, then add the PlayerState model fields needed for Phase 3 (active_research, research_progress, breakthrough_attempts).

DO PART A — Consumer Shims (restore green baseline):
1. backend/app/modules/game_state/factory.py (~line 99):
   - Find: `technology_tracks = tuple(balance_config.technology.tech_tree)`
   - Replace with: derive from `chains` — flat list of every ChainTechConfig.tech_id across all chains
   - This is a 1-2 line change that unblocks ~137 failing tests

2. backend/app/modules/game_state/workspaces.py (lines 213, 669-686):
   - Find `_build_tech_tree` — it iterates `technology.tech_tree.items()` and reads `budget_pool/budget_cost/unlocks_goods/unlocks_actions`
   - Make it return an empty list `[]` (Task 5 will rewrite it properly with chain progress)
   - Also check line 213 for any tech_tree reference in the workspace dict — replace with empty list

3. backend/app/modules/game_state/factory_economy.py (lines 110-138):
   - Functions `is_goods_tech_locked`, `is_action_tech_locked`, `tech_for_id`, `is_tech_researchable` all walk `tech_tree`
   - Make them no-ops:
     * `is_tech_researchable` → always return False
     * `is_goods_tech_locked` → always return False (not locked)
     * `is_action_tech_locked` → always return False
     * `tech_for_id` → always return None
   - These will be properly replaced in Tasks 3-4

4. backend/app/modules/rules/decision.py (lines ~300, 342-352):
   - Fix `balance.technology.facility_cost` → `balance.technology.research_facility_cost` (field was renamed)
   - Make `_apply_tech_research` a no-op (just return early / skip, no crash). It will be replaced in Task 3.

5. backend/app/modules/settlement/phase_submission.py (lines ~678, 821-849):
   - Fix `facility_cost` → `research_facility_cost` references
   - If `_apply_tech_research` is called here, make it skip (same as #4)

6. backend/tests/test_balance_config.py (lines ~45, 116-124):
   - Change assertions from `config.technology.tech_tree["spinning_jenny"]` to `config.technology.chains["mechanical"].techs[0]` (it's the first tech in the mechanical chain)
   - Change the mutation test from `payload["techTree"]` to `payload["chains"]`

DO PART B — PlayerState Model Additions:
7. backend/app/modules/game_state/models.py:
   - Add three new fields to PlayerState dataclass:
     * `active_research: Optional[str] = None`
     * `research_progress: dict[str, int] = field(default_factory=dict)`
     * `breakthrough_attempts: dict[str, int] = field(default_factory=dict)`
   - Add them to `to_payload()` serialization (key names: "activeResearch", "researchProgress", "breakthroughAttempts")
   - Add them to `from_payload()` deserialization
   - Update the payload schema validation at lines 438, 472: replace "techTree" key requirement or add the new keys (the workspace validation checks for "techTree" in decision phase — this can stay as-is since _build_tech_tree returns [] now)

8. backend/app/modules/game_state/factory.py:
   - Initialize the three new fields in `create_initial_snapshot` / PlayerState creation (active_research=None, empty dicts for the other two)

DO NOT:
- Do not implement research logic (that's Tasks 3-4)
- Do not rewrite _build_tech_tree fully (that's Task 5)
- Do not touch frontend code
- Do not change routeUnlocks behavior
- Do not commit or push
- Do not refactor unrelated code
- Do not run frontend tests or tsc

FILES IN SCOPE:
- backend/app/modules/game_state/factory.py
- backend/app/modules/game_state/workspaces.py
- backend/app/modules/game_state/factory_economy.py
- backend/app/modules/rules/decision.py
- backend/app/modules/settlement/phase_submission.py
- backend/tests/test_balance_config.py
- backend/app/modules/game_state/models.py

IMPLEMENTATION RULES:
- Make the smallest change that satisfies the objective
- Match existing project style
- Read each file before editing to confirm the exact line numbers and context
- After all shims are in place, run the full test suite to verify 262 green
- Do not expand verification beyond the tier below

VERIFICATION TIER / BUDGET:
- Tier: T1 (model + consumer shim, behavior-restoring)
- Time cap before checkpoint: 15 minutes
- Do run: full backend test suite (262 must all pass) + py_compile for all touched files
- Do not run: frontend tests, browser dogfood, live API

VERIFICATION:
- cd backend && python -m pytest tests/ -q --tb=short (must be 262 passed, 0 failed)
- python -m py_compile for each touched .py file
- Quick sanity: confirm the new PlayerState fields serialize/deserialize correctly in the test output (any roundtrip test already covers this)

STOP CONDITIONS:
- Stop and report if more than 8 files need changes to reach 262 green
- Stop and report if shimming requires changing business logic behavior
- Stop and report if you're unsure about the factory.py technology_tracks derivation

RETURN FORMAT:
1. Summary: what changed
2. Files changed: list with line counts
3. Verification run: commands actually run + result (exact pass count)
4. Verification budget: tier used, whether checkpoint threshold was exceeded
5. Open issues / assumptions: if any
6. Suggested next step for Hermes
