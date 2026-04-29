You are executing one bounded implementation task inside this repository.

TASK ID:
task-1-ocean-model

OBJECTIVE:
Add OceanNodeState runtime model to track naval power per ocean node and blockade controller.

WHY / CONTEXT:
Phase 4 military system needs runtime state for each ocean node (from regions.json → oceanNodes). Currently only the static config exists. This task creates the runtime model, adds it to GameSnapshot, initializes it in factory, and serializes it.

DO:
1. Read `backend/app/modules/game_state/models.py` to understand existing patterns (RegionState is the closest analog).

2. Add new dataclass in models.py:
```python
@dataclass(slots=True)
class OceanNodeState:
    node_id: str
    naval_power: dict[str, int] = field(default_factory=dict)  # player_id → deployed fleet count
    blockade_controller: str | None = None  # player_id of blockade controller this turn
    
    def total_power(self) -> int:
        return sum(self.naval_power.values())
```

3. Add `ocean_node_states: list[OceanNodeState]` to GameSnapshot dataclass.

4. Update GameSnapshot.to_payload() and from_payload() to serialize/deserialize the new field.

5. In `backend/app/modules/game_state/factory.py`:
   - Find where create_initial_snapshot is created
   - Read `balance.regions.ocean_node_blueprints` (or wherever ocean nodes are stored — check regions.json oceanNodes and the balance_config loader)
   - Initialize `ocean_node_states = [OceanNodeState(node_id=node.node_id) for node in ocean_nodes]`
   - If the ocean node data isn't yet loaded into balance config, you may need to check the RegionsBalanceConfig model and add it if missing.

6. In `backend/app/modules/persistence/repositories.py`:
   - Find where snapshot payloads are built/restored
   - Add ocean_node_states to the serialized payload

7. Write tests in `backend/tests/test_ocean_node_state.py` (NEW):
   - Test 1: OceanNodeState creation with default values
   - Test 2: total_power sums correctly
   - Test 3: snapshot roundtrip preserves ocean_node_states

DO NOT:
- Do not implement naval deployment or blockade logic (Task 2)
- Do not change any rule files
- Do not touch frontend
- Do not commit or push
- Do not run frontend tests

FILES IN SCOPE:
- backend/app/modules/game_state/models.py
- backend/app/modules/game_state/factory.py
- backend/app/modules/persistence/repositories.py
- backend/app/modules/balance_config/models.py (check if ocean nodes need config model)
- backend/app/modules/balance_config/loader.py (if ocean nodes need loading)
- backend/tests/test_ocean_node_state.py (NEW)

IMPLEMENTATION RULES:
- Match existing code style (dataclass with slots=True, to_payload/from_payload pattern)
- Read models.py before editing
- Check if the ocean nodes from regions.json are already loaded into a balance config model — if not, add minimal config loading

VERIFICATION TIER / BUDGET:
- Tier: T0 (model + serialization only, no behavior change)
- Time cap: 10 minutes
- Do run: py_compile + new tests + full test suite (269 must pass)
- Do not run: frontend

VERIFICATION:
- cd backend && python -m pytest tests/test_ocean_node_state.py -v
- cd backend && python -m pytest tests/ -q (269 passed + 8 skipped + new tests)
- python -m py_compile app/modules/game_state/models.py

RETURN FORMAT:
1. Summary
2. Files changed
3. Verification run
4. Verification budget
5. Open issues
6. Suggested next step
