You are executing a frontend architecture analysis task. You are NOT writing code. You are producing a restructuring plan document.

## TASK ID
phase1-layout-restructure-plan

## OBJECTIVE
Analyze the current Phase 1 Decision page layout and produce a comprehensive restructuring plan as a markdown document.

## WHY / CONTEXT
The Phase 1 "国家决策" (National Decision) page is the core gameplay interface. It has 6 sub-panels (tabs):
- 工厂 (Factory)
- 国内市场 (Domestic Market)
- 议会大厅 (Government/Parliament)
- 军事要塞 (Military Fortress)
- 研究院 (Research Institute)
- 天赋树 (Talent Tree)

**Current problems:**

1. **Shared fiscal pool not visualized**: GovernmentPanel and MilitaryPanel BOTH draw from `governmentFiscal` budget pool, but each shows its own `剩余 {budget}` badge independently. Player cannot see "these are the same money."

2. **Card-stacking layout everywhere**: FactoryPanel, GovernmentPanel, MilitaryPanel all use vertical card stacks (`*-action-card`), creating a monotonous scrolling experience with no visual hierarchy.

3. **ResearchPanel uses a binary-split layout** (left: info, right: actions) which is much more readable. The map/colonial regions use image+overlay layering which is also superior.

4. **Stats are buried**: Each panel has its own `*-stats` row at the top, but there's no unified dashboard showing cross-panel relationships.

5. **Tab switching is blind**: When you switch tabs, you lose context of other panels. Player needs to mentally reconstruct the budget situation.

**Design references (good patterns):**
- ResearchPanel: binary split → left column = info/status, right column = actions/selection
- Map/Colonial regions: layered layout → background image/map + positioned overlays for interactive elements
- The user specifically said: "研究院则是通过二分法排布。或者像我们的地图一样，在图片上面继续二次排布。后两者显示效果比第一种好的多。"

## DO
1. **Read ALL relevant frontend files** in the project to understand the current architecture:
   - `frontend/src/components/game/panels/GamePhasePanelContent.tsx` (host component)
   - `frontend/src/components/game/panels/DecisionStepTabs.tsx` + CSS
   - `frontend/src/components/game/panels/factory/FactoryPanel.tsx` + CSS
   - `frontend/src/components/game/panels/factory/Phase1ProductionPanel.tsx` + CSS
   - `frontend/src/components/game/panels/DomesticPanel.tsx` + CSS
   - `frontend/src/components/game/panels/GovernmentPanel.tsx` + CSS
   - `frontend/src/components/game/panels/MilitaryPanel.tsx` + CSS
   - `frontend/src/components/game/panels/ResearchPanel.tsx` + CSS
   - `frontend/src/components/game/panels/TalentTreePanel.tsx` + CSS
   - `frontend/src/components/game/panels/Phase1MarketPanel.tsx` + CSS
   - `frontend/src/styles.css` (global styles, CSS classes with gp-* prefix)
   - Any shared layout component files

2. **Analyze the current layout patterns**:
   - Which panels use which layout pattern?
   - What CSS classes are shared vs panel-specific?
   - How does data flow from workspace to panels?
   - What cross-panel relationships exist (shared budgets, shared resources)?
   - What is the tabbing mechanism (DecisionStepTabs)?

3. **Produce a restructuring plan** saved to `docs/plans/phase1-layout-restructure-plan.md` with:
   - **Section A: Current State Analysis** — what each panel does, what layout pattern it uses, what data it shows, what problems it has
   - **Section B: Proposed Layout Architecture** — the new overall layout design, wireframe-like description
   - **Section C: Cross-cutting System** — how shared fiscal pool, shared resources (tech points, military points) will be visualized across panels
   - **Section D: Per-Panel Redesign** — for each of the 6+ panels, describe:
     - What changes from current
     - What new layout pattern to use (binary split, overlay, dashboard, etc.)
     - What information architecture changes
     - CSS approach
   - **Section E: Implementation Plan** — ordered list of changes, from foundational to cosmetic
   - **Section F: Component Refactoring Strategy** — which components to keep, modify, or rewrite; how to avoid breaking tests
   - **Section G: Risks & Constraints** — backward compatibility, test impact, existing CSS class naming conventions

4. **Design principles to follow in the plan**:
   - The player should see their fiscal budget ONCE and understand it's shared across government and military
   - Binary-split layouts (left info + right actions) where appropriate
   - Map-style overlays for geographical/military content
   - Unified resource dashboard at the top showing all pools at a glance
   - Reduce vertical scrolling; use horizontal space better
   - Visual hierarchy: important numbers big, details smaller

## DO NOT
- Do NOT write any code or modify any files except the output plan document
- Do NOT change game mechanics or data models
- Do NOT propose removing any functionality
- Do NOT change the backend
- Do NOT refactor unrelated code

## FILES IN SCOPE (read only, do not modify)
- frontend/src/components/game/panels/*.tsx, *.css
- frontend/src/components/game/panels/factory/*.tsx, *.css
- frontend/src/styles.css
- frontend/src/pages/GamePage.tsx (or similar page component)
- frontend/src/features/game/decisionFlow.ts
- frontend/src/features/game/decisionDrafts.ts

## OUTPUT
Write the complete plan to: `docs/plans/phase1-layout-restructure-plan.md`

This is the ONLY file you should create or modify.

The document should be comprehensive, well-structured, and serve as the single source of truth for the implementation phase.

## VERIFICATION TIER
- Tier: T0 (read-only analysis + document creation)
- Do run: confirm the output file exists and has content
- Do not run: any code tests, build, lint

## RETURN FORMAT
1. Summary: brief description of the plan produced
2. Files created: only `docs/plans/phase1-layout-restructure-plan.md`
3. Key design decisions: top 3-5 most important decisions in the plan
4. Estimated implementation effort: rough breakdown by section
5. Suggested first step for implementation
