# Task: Military Panel Packet 2 — 征服 + 掠夺 + 独立度/驻军 UI

## Context
Branch: `feature/phase4-military-colonies`
Frontend dir: `/Users/limou/Desktop/tomorrow_question/frontend`

Phase 4 military panel Packet 1 is committed (ocean nodes + naval deployment + types).
Now add: conquest UI, looting UI, independence/garrison display on colonized regions.

## Types already available (in domain.ts)
```ts
interface ConquestActionSelection {
  regionId: string;
  infantry: number;
  artillery: number;
}

interface LootingActionSelection {
  regionId: string;
  resourceType: string;
}

interface ColonizationOption {
  // ... existing fields ...
  independence?: number;      // 0-100
  garrison?: Record<string, number>;  // { "countryA": 3, "countryB": 1 }
  resourceLimit?: Record<string, number>; // { "coal": 5, "iron": 3 }
}
```

MilitaryPlan already has: `conquestActions: ConquestActionSelection[]`, `lootingActions: LootingActionSelection[]`.

## Backend config reference
- build_fleet: 50$ fiscal, +1 fleet
- artillery: 16$ fiscal each
- Conquest: infantry (free, from militaryPoints) + artillery (16$ each, militaryPoints+2 per)
- Garrison formula: militaryPoints / 10, min 1
- Blockade threshold: 2 (unique highest)
- Looting: resourceLimit -1 per loot, independence +10 per loot
- Independence 60+: revolt risk (diplomacy downgraded to "特许")

## What to implement

### 1. Add callback props to MilitaryPanelProps
```ts
onConquestChange: (regionId: string, infantry: number, artillery: number) => void;
onLootingToggle: (regionId: string, resourceType: string) => void;
```

### 2. Colonized region card enhancements
For each colonizationOption where `isColonized === true`, ADD below the existing card content:
- **Independence bar**: show `independence` as a colored bar (green < 40, yellow 40-60, red 60+)
  - Use inline styles, no new CSS file changes needed
  - Label: `独立度 {independence}%`
  - If >= 60, show warning emoji ⚠️
- **Garrison display**: show garrison breakdown
  - Label: `驻军: 国A×3 国B×1` (format each country with its count)
- **Resource display + looting**: if `resourceLimit` exists and has entries > 0
  - Show resources: `资源: 煤炭×5 铁矿×3`
  - For each resource with limit > 0, add a toggle button "掠夺"
  - Track which resources are selected for looting in `draft.militaryPlan.lootingActions`

### 3. Conquest UI (on non-colonized colonizationOptions)
For colonizationOptions where `isColonized === false` and the region is accessible:
- Below the existing colonize button, add a "⚔️ 征服" section
- Infantry selector: 0 to `Math.floor(mil.militaryPoints / 10)` (min 1 if any)
  - Show: `步兵: X (消耗 militaryPoints)` where cost = infantry * 10 militaryPoints
  - +/- buttons to adjust
- Artillery selector: 0 to max affordable (budget / 16)
  - Show: `炮兵: X (消耗 $Y)` where Y = artillery * 16
  - +/- buttons to adjust
- Display total conquest power: `战力 = 步兵 + 炮兵×2`
- Defender display: `守军 = {defenderGarrison}` if available from backend
- Track in `draft.militaryPlan.conquestActions`

### 4. Wire callbacks in GamePhasePanelContent
In the GamePhasePanelContent.tsx where MilitaryPanel is rendered, add the new callback handlers:
- `onConquestChange`: update `draft.militaryPlan.conquestActions` (add/update/remove entry for regionId)
- `onLootingToggle`: toggle entry in `draft.militaryPlan.lootingActions`

### 5. Tests
- MilitaryPanel.test.tsx: add test for conquest section rendering on accessible non-colonized regions
- MilitaryPanel.test.tsx: add test for independence bar on colonized regions
- MilitaryPanel.test.tsx: add test for looting toggle on colonized regions with resources

## Constraints
- ALL UI TEXT MUST BE CHINESE
- Use existing CSS classes (military-action-card, military-region, etc.) + inline styles for new elements
- Do NOT create new CSS files
- Keep the code minimal — no speculative features
- tsc must pass after changes
- Existing tests must still pass

## Verification
1. `cd /Users/limou/Desktop/tomorrow_question/frontend && npx tsc --noEmit` — 0 errors
2. `cd /Users/limou/Desktop/tomorrow_question/frontend && npx vitest run` — 102 passed (or more with new tests), 6 e2e fails (pre-existing)
3. `git log --oneline -3` to verify clean commits
