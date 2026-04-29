You are executing one bounded frontend implementation task inside this repository.

TASK ID:
task-fe-military-types-naval

OBJECTIVE:
Extend frontend types and draft to support Phase 4 military actions (navalDeployment, conquestActions, lootingActions), then add ocean node display and naval deployment UI to MilitaryPanel.

WHY / CONTEXT:
Backend Phase 4 is complete (309 tests). The frontend needs type definitions updated to match the new backend workspace payload, then UI for the naval system.

KEY CHANGES NEEDED:

1. **types/domain.ts — Extend MilitaryPlan**:
   Current:
   ```ts
   interface MilitaryPlan {
     unlockColonization: boolean;
     militaryActions: MilitaryActionSelection[];
     diplomacyActions: DiplomacyActionSelection[];
     colonizationActions: ColonizationActionSelection[];
   }
   ```
   Add:
   ```ts
   navalDeployment: Record<string, number>;  // nodeId → fleetCount
   conquestActions: ConquestActionSelection[];
   lootingActions: LootingActionSelection[];
   ```

2. **types/domain.ts — Add new interfaces**:
   ```ts
   export interface ConquestActionSelection {
     regionId: string;
     infantry: number;
     artillery: number;
   }
   export interface LootingActionSelection {
     regionId: string;
     resourceType: string;
   }
   export interface OceanNodeOption {
     nodeId: string;
     navyByCountry: Record<string, number>;
     controller: string | null;
     isBlockaded: boolean;
     myFleet: number;
   }
   ```

3. **types/domain.ts — Extend MilitaryWorkspace**:
   Add `oceanNodes: OceanNodeOption[];` to the militaryWorkspace interface.

4. **types/domain.ts — Extend ColonizationOption**:
   Add:
   ```ts
   independence?: number;
   garrison?: Record<string, number>;
   resourceLimit?: Record<string, number>;
   ```

5. **features/game/forms.ts — Update initial draft**:
   Add to the militaryPlan initial state:
   ```ts
   navalDeployment: {},
   conquestActions: [],
   lootingActions: [],
   ```

6. **components/game/panels/MilitaryPanel.tsx — Add ocean node section**:
   - Display each ocean node with its name, your fleet count, blockade status
   - Add a section "🌊 海洋节点" before the overseas regions section
   - Show fleet deployment status: how many fleets deployed, total available
   - Add build_fleet button in military actions (it will appear automatically from availableMilitaryActions)

7. **MilitaryPanel.tsx — Add naval deployment controls**:
   - For each ocean node, show: "your fleet: N / total: M"
   - Let user adjust fleet count with +/- buttons
   - Callback: `onNavalDeploymentChange(nodeId: string, count: number)`
   - Add this callback to MilitaryPanelProps

8. **Wire NavalDeployment changes through decisionDrafts.ts**:
   - Add `setNavalDeployment(draft, nodeId, count)` helper

9. **Wire the parent component**:
   - Read `GamePhasePanelContent.tsx` to see how MilitaryPanel is wired
   - Add the new callback handler in the parent

DO NOT:
- Do not add conquest or looting UI (Packet 2)
- Do not add independence/garrison display (Packet 2)
- Do not change backend code
- Do not commit or push

FILES IN SCOPE:
- frontend/src/types/domain.ts
- frontend/src/features/game/forms.ts
- frontend/src/features/game/decisionDrafts.ts
- frontend/src/components/game/panels/MilitaryPanel.tsx
- frontend/src/components/game/panels/MilitaryPanel.test.tsx (update tests)
- frontend/src/components/game/panels/GamePhasePanelContent.tsx (wire new props)

IMPLEMENTATION RULES:
- Read each file before editing
- Match existing UI patterns (military-action-card, military-section-label, etc.)
- Chinese labels for all user-facing text
- Icon for ocean nodes: 🌊
- The build_fleet action (50$) will appear in availableMilitaryActions from backend — no special UI needed beyond the existing action card list
- For naval deployment, show a compact per-node control (not a full card)

VERIFICATION TIER / BUDGET:
- Tier: T1 (frontend feature implementation)
- Time cap: 20 minutes
- Do run: npx tsc --noEmit + npx vitest run (check for type errors and test failures)
- Do not run: browser dogfood, live API

VERIFICATION:
- cd frontend && npx tsc --noEmit
- cd frontend && npx vitest run --passWithNoTests (check existing tests still pass)

RETURN FORMAT:
1. Summary
2. Files changed
3. Verification run
4. Verification budget
5. Open issues
6. Suggested next step
