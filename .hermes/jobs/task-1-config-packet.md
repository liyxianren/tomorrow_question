You are executing one bounded implementation task inside this repository.

TASK ID:
task-1-config

OBJECTIVE:
Rewrite technology.json configuration and adapt the balance config loader for Phase 3 tech tree system.

WHY / CONTEXT:
Phase 3 replaces the old "budget-buy tech" system (techTree with nodes like textile_tech, tea_craft, mining_dev, admin_reform, etc.) with a research-over-time three-chain system (electrical, mechanical, steam). The routeUnlocks mapping is kept unchanged because Phase 1 consumes it. The full design is at docs/第三阶段-科技树与研究突破.md.

DO:
- Rewrite backend/config/balance/technology.json:
  * KEEP routeUnlocks exactly as-is (Phase 1 depends on it)
  * REMOVE the entire techTree section (all 9 old nodes: textile_tech, tea_craft, mining_dev, spinning_jenny, steam_engine, electrification, admin_reform, imperial_system, global_hegemony, market_economy, consumer_society)
  * ADD chains section with three chains: electrical (leyden_jar→voltaic_pile→power_generation), mechanical (spinning_jenny→lathe), steam (bessemer_process→watt_engine→combustion_engine)
  * ADD researchFacilityCost: 12, researchFacilityProgressPerTurn: 1, breakthroughDieSides: 10
  * Each tech in chains has: id, label, threshold (3/4/5 as specified in the design doc)
  * Remove old facilityCost and breakthroughRequirement top-level keys
  * The routeUnlocks entires should map to tech IDs that exist in the new chains (mechanized→spinning_jenny, steam→watt_engine, electrified→power_generation) — these are already correct

- Adapt backend/app/modules/balance_config/loader.py:
  * The _build_technology_config function currently reads facilityCost, breakthroughRequirement, routeUnlocks, and techTree
  * Replace: facilityCost→researchFacilityCost, breakthroughRequirement→remove, techTree→chains
  * Create new data classes or adapt existing ones for ResearchChain and ChainTech (with id, label, threshold)
  * Remove the old _build_tech_tree function that parses TechTreeNodeConfig (budget_pool, budget_cost, prerequisites, unlocks_goods, unlocks_actions, unlocks_routes fields)
  * Instead, build a dict of chain_id → ResearchChain with nested techs
  * Keep routeUnlocks parsing exactly as-is
  * The TechnologyBalanceConfig dataclass needs updating: replace facility_cost→research_facility_cost, breakthrough_requirement→breakthrough_die_sides, tech_tree→chains

- Check if any OTHER code references the old technology.tech_tree structure (searches like tech.budget_pool, tech.budget_cost, tech.prerequisites, tech.unlocks_goods) and report what would break — but DO NOT fix them in this task, only the config + loader

DO NOT:
- Do not change routeUnlocks values or the way they are parsed
- Do not touch any code outside config/balance_config except for the loader and config files listed
- Do not change any production, market, settlement, or decision logic
- Do not run frontend tests or tsc
- Do not commit or push
- Do not refactor unrelated code

FILES IN SCOPE:
- backend/config/balance/technology.json
- backend/app/modules/balance_config/loader.py
- backend/app/modules/balance_config/models.py (if TechTreeNodeConfig is defined there, check and adapt)

IMPLEMENTATION RULES:
- Make the smallest change that satisfies the objective
- Match existing project style
- Read the current technology.json and loader.py fully before editing
- After editing technology.json, verify it's valid JSON
- After editing loader.py, run py_compile

VERIFICATION TIER / BUDGET:
- Tier: T0 (config-only)
- Time cap before checkpoint: 10 minutes
- Do run: python -m py_compile on loader.py + the full backend tests (262 tests must still pass) + search for old tech_tree references
- Do not run: frontend tests, browser dogfood, live API, full regression beyond 262

VERIFICATION:
- python3 -c "import json; json.load(open('backend/config/balance/technology.json')); print('JSON valid')"
- cd backend && python -m py_compile app/modules/balance_config/loader.py
- cd backend && python -m pytest tests/ -q --tb=short (262 must pass)
- cd backend && grep -rn "tech_tree\|techTree\|TechTreeNode\|unlocks_goods\|unlocks_actions\|budget_pool\|budget_cost" app/ --include="*.py" | grep -v "route_unlocks\|__pycache__\|.pytest_cache" (report what still references old fields)

STOP CONDITIONS:
- Stop and report if more than 3 additional files need changes to make tests pass
- Stop and report if rewriting technology.json breaks more than 10 tests
- Stop and report if you're unsure about the loader data model architecture

RETURN FORMAT:
1. Summary: what changed
2. Files changed: list
3. Verification run: commands actually run + result
4. Verification budget: tier used, whether checkpoint threshold was exceeded
5. Open issues / assumptions: if any
6. Suggested next step for Hermes: next bounded packet or "done"
