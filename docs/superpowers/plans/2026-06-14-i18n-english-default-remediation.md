# i18n English Default Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make English the default and fallback language, then remove current English-mode Chinese leakage from normal player-facing routes.

**Architecture:** Treat English as the canonical fallback language in `i18next`, then make missing translation keys impossible to ship. Fixes are resource-first: add missing keys to `en` and `zh` resource files, keep backend label translation through `translateBackend`, and use an audit script to block future `t()` calls that rely on Chinese fallback text.

**Tech Stack:** React 18, TypeScript, Vite, i18next, react-i18next, Vitest, Playwright/Computer Use for final player-view verification.

---

## Context And Scope

Current evidence:

- `frontend/src/i18n/index.ts` uses `fallbackLng: "zh"` and `lng: "zh"`.
- `en/*.json` values do not currently contain Chinese text.
- `zh/game.json` has 6 keys missing from `en/game.json`.
- Non-test source has 508 `t()` calls where the key is missing from English resources and the fallback/default text is Chinese.
- `/setting` explanation text is allowed to remain Chinese per `docs/当前状态总览.md`; do not treat it as a normal gameplay i18n defect unless the user changes that requirement.
- Bug-fix execution must follow `docs/playtests/QA_SESSION_PROTOCOL.md`: record the issue in a playtest markdown, fix, then re-open the real page with Computer Use and record evidence.

## File Structure

- Modify `frontend/src/i18n/index.ts`: default language and fallback language.
- Modify `frontend/src/i18n/index.test.ts`: default/fallback assertions and audit-adjacent regression checks.
- Create `frontend/scripts/audit-i18n-cjk.mjs`: deterministic static check for missing English keys, Chinese defaults, and CJK in English resource values.
- Modify `frontend/package.json`: add an i18n audit script.
- Modify `frontend/src/i18n/resources/en/game.json`: add missing gameplay keys and English copy.
- Modify `frontend/src/i18n/resources/zh/game.json`: keep matching key structure and Chinese copy where new keys are introduced.
- Later batches may modify:
  - `frontend/src/i18n/resources/en/pages.json`
  - `frontend/src/i18n/resources/zh/pages.json`
  - `frontend/src/features/game/commandDeck/viewModel.ts`
  - `frontend/src/features/game/demo/seed.ts`
  - `frontend/src/features/game/demo/decisionCardDemo.ts`
  - `frontend/src/components/game/panels/GamePhasePanelContent.tsx`
  - `frontend/src/components/game/panels/GovernmentPanel.tsx`
  - `frontend/src/components/game/panels/military/MilitaryNodeDrawer.tsx`
  - `frontend/src/components/game/panels/MilitaryPanel.tsx`
  - `frontend/src/components/game/panels/Phase1MarketPanel.tsx`
  - `frontend/src/components/game/panels/DomesticPanel.tsx`
  - `frontend/src/components/game/panels/ResearchPanel.tsx`
  - `frontend/src/components/game/status/GameSituationSummary.tsx`
  - `frontend/src/features/game/decisionShared.ts`
  - `frontend/src/features/game/forms.ts`
  - `frontend/src/features/game/flow/gameWorkbench.ts`
  - `frontend/src/features/game/flow/decisionFlow.ts`
  - `frontend/src/features/game/runtime/useGameRuntime.ts`
- Create `docs/playtests/2026-06-14-i18n-english-mode-regression.md`: player-view bug ledger and verification evidence.

---

### Task 1: Add Tests For English Default And Fallback

**Files:**
- Modify: `frontend/src/i18n/index.test.ts`

- [ ] **Step 1: Add failing tests before changing config**

Append these tests inside the existing `describe("game i18n additions", () => { ... })` block:

```ts
  it("defaults to English when no persisted language has been chosen", () => {
    expect(i18n.options.fallbackLng).toBe("en");
    expect(i18n.options.lng).toBe("en");
  });

  it("uses English resources for previously missing gameplay keys in English mode", async () => {
    await withLanguage("en", () => {
      expect(i18n.t("game:government.reformPendingActivation")).toBe("Implemented, active next round");
      expect(i18n.t("game:government.policyUnlocksNextRound")).toBe("Unlocks next round");
    });
  });
```

The first assertion fails on the current config. The second assertion fails until Task 4 adds the missing English keys.

- [ ] **Step 2: Run the targeted test and confirm the default-language test fails**

Run:

```bash
cd frontend
npm test -- index
```

Expected before implementation:

```text
FAIL src/i18n/index.test.ts
expected 'zh' to be 'en'
```

- [ ] **Step 3: Keep both tests as permanent regressions**

After Tasks 2 and 4 pass, keep both tests. They prove default startup language and real previously-missing gameplay keys now resolve in English.

---

### Task 2: Switch Default And Fallback To English

**Files:**
- Modify: `frontend/src/i18n/index.ts`
- Test: `frontend/src/i18n/index.test.ts`

- [ ] **Step 1: Change i18next defaults**

In `frontend/src/i18n/index.ts`, change:

```ts
    fallbackLng: "zh",
    lng: "zh",
```

to:

```ts
    fallbackLng: "en",
    lng: "en",
```

Keep `detection.order = ["localStorage", "navigator"]` so an explicit `app_locale=zh` still opens Chinese.

- [ ] **Step 2: Run the targeted test**

Run:

```bash
cd frontend
npm test -- index
```

Expected after Task 3 also adds the missing resource keys:

```text
PASS src/i18n/index.test.ts
```

- [ ] **Step 3: Manually verify language persistence contract**

Run in a browser console during final verification:

```js
localStorage.removeItem("app_locale");
location.reload();
```

Expected: default UI opens in English.

Then run:

```js
localStorage.setItem("app_locale", "zh");
location.reload();
```

Expected: UI opens in Chinese.

---

### Task 3: Add Static i18n Leakage Audit

**Files:**
- Create: `frontend/scripts/audit-i18n-cjk.mjs`
- Modify: `frontend/package.json`

- [ ] **Step 1: Create the audit script**

Create `frontend/scripts/audit-i18n-cjk.mjs`:

```js
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const srcDir = path.join(root, "src");
const resourcesRoot = path.join(srcDir, "i18n", "resources");
const cjkPattern = /[\u4e00-\u9fff]/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walkFiles(dir, predicate, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, output);
    } else if (predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output;
}

function flattenJson(value, prefix = "", output = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenJson(child, prefix ? `${prefix}.${key}` : key, output);
    }
    return output;
  }
  output[prefix] = value;
  return output;
}

function hasPath(object, key) {
  let cursor = object;
  for (const part of key.split(".")) {
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, part)) {
      return false;
    }
    cursor = cursor[part];
  }
  return true;
}

function loadResources(language) {
  const languageDir = path.join(resourcesRoot, language);
  const bundles = {};
  for (const fileName of fs.readdirSync(languageDir).filter((file) => file.endsWith(".json"))) {
    bundles[fileName.replace(/\.json$/, "")] = readJson(path.join(languageDir, fileName));
  }
  return bundles;
}

function keyExists(resources, key, namespaceHint) {
  if (key.includes(":")) {
    const [namespace, nestedKey] = key.split(/:(.*)/s);
    return Boolean(resources[namespace] && hasPath(resources[namespace], nestedKey));
  }
  if (namespaceHint && resources[namespaceHint] && hasPath(resources[namespaceHint], key)) {
    return true;
  }
  return Object.values(resources).some((bundle) => hasPath(bundle, key));
}

function getStringLiteral(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function getDefaultValue(node) {
  const literal = getStringLiteral(node);
  if (literal !== undefined) {
    return literal;
  }
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return undefined;
  }
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const name = property.name;
    const isDefaultValue =
      (ts.isIdentifier(name) && name.text === "defaultValue")
      || (ts.isStringLiteral(name) && name.text === "defaultValue");
    if (isDefaultValue) {
      return getStringLiteral(property.initializer);
    }
  }
  return undefined;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

function auditEnglishResourceValues(enResources) {
  const findings = [];
  for (const [namespace, bundle] of Object.entries(enResources)) {
    for (const [key, value] of Object.entries(flattenJson(bundle))) {
      if (typeof value === "string" && cjkPattern.test(value)) {
        findings.push({
          type: "english-resource-cjk",
          file: `src/i18n/resources/en/${namespace}.json`,
          key,
          value,
        });
      }
    }
  }
  return findings;
}

function auditResourceParity(enResources, zhResources) {
  const findings = [];
  const namespaces = new Set([...Object.keys(enResources), ...Object.keys(zhResources)]);
  for (const namespace of namespaces) {
    const enFlat = flattenJson(enResources[namespace] ?? {});
    const zhFlat = flattenJson(zhResources[namespace] ?? {});
    for (const key of Object.keys(zhFlat)) {
      if (!Object.prototype.hasOwnProperty.call(enFlat, key)) {
        findings.push({
          type: "missing-en-resource-key",
          file: `src/i18n/resources/en/${namespace}.json`,
          key,
          value: String(zhFlat[key]),
        });
      }
    }
  }
  return findings;
}

function auditMissingKeysWithChineseDefaults(enResources) {
  const findings = [];
  const files = walkFiles(srcDir, (filePath) => /\.(ts|tsx)$/.test(filePath) && !/\.test\.(ts|tsx)$/.test(filePath));
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    let namespaceHint;

    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expressionText = node.expression.getText(sourceFile);
        if (expressionText === "useTranslation") {
          const firstArg = getStringLiteral(node.arguments[0]);
          if (firstArg) {
            namespaceHint = firstArg;
          }
        }
        if (expressionText === "t" || expressionText === "i18n.t" || expressionText.endsWith(".t")) {
          const key = getStringLiteral(node.arguments[0]);
          const defaultValue = getDefaultValue(node.arguments[1]);
          if (key && defaultValue && cjkPattern.test(defaultValue) && !keyExists(enResources, key, namespaceHint)) {
            findings.push({
              type: "missing-key-with-chinese-default",
              file: path.relative(root, filePath),
              line: lineOf(sourceFile, node),
              key,
              value: defaultValue,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }
  return findings;
}

const enResources = loadResources("en");
const zhResources = loadResources("zh");
const findings = [
  ...auditEnglishResourceValues(enResources),
  ...auditResourceParity(enResources, zhResources),
  ...auditMissingKeysWithChineseDefaults(enResources),
];

if (findings.length > 0) {
  console.error(`i18n CJK audit failed with ${findings.length} finding(s):`);
  for (const finding of findings) {
    const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    console.error(`[${finding.type}] ${location} ${finding.key}: ${finding.value}`);
  }
  process.exit(1);
}

console.log("i18n CJK audit passed.");
```

- [ ] **Step 2: Add an npm script**

In `frontend/package.json`, add:

```json
"test:i18n-cjk": "node ./scripts/audit-i18n-cjk.mjs"
```

Keep JSON valid by adding a comma to the previous script line.

- [ ] **Step 3: Run audit and capture the baseline failure**

Run:

```bash
cd frontend
npm run test:i18n-cjk
```

Expected before resource cleanup:

```text
i18n CJK audit failed with ...
```

This failure is required at this stage. Use it as the worklist for Tasks 4-8.

---

### Task 4: Patch Known Resource Parity Gaps

**Files:**
- Modify: `frontend/src/i18n/resources/en/game.json`
- Test: `frontend/src/i18n/index.test.ts`

- [ ] **Step 1: Add the 6 known missing English keys**

Add these values to the matching existing objects in `frontend/src/i18n/resources/en/game.json`:

```json
{
  "domestic": {
    "effectCapacityDelta": "Domestic Capacity Change",
    "effectPriceBonus": "Domestic Price Bonus",
    "effectOverseasCapacity": "Overseas Capacity Change"
  },
  "government": {
    "reformPendingActivation": "Implemented, active next round",
    "reformEffectsNextRound": "Effects and policy unlocks apply next round",
    "policyUnlocksNextRound": "Unlocks next round"
  }
}
```

Do not replace the whole object; insert the keys into the existing `domestic` and `government` sections.

- [ ] **Step 2: Run i18n tests**

Run:

```bash
cd frontend
npm test -- index
```

Expected:

```text
PASS src/i18n/index.test.ts
```

- [ ] **Step 3: Run the static audit**

Run:

```bash
cd frontend
npm run test:i18n-cjk
```

Expected: the `missing-en-resource-key` findings for those 6 keys are gone. Other findings can remain until later tasks.

---

### Task 5: Fix Main Gameplay Route Resources First

**Files:**
- Modify:
  - `frontend/src/i18n/resources/en/game.json`
  - `frontend/src/i18n/resources/zh/game.json`
  - targeted call sites only when the key name is wrong or too broad
- Primary source files to clear:
  - `frontend/src/components/game/panels/GamePhasePanelContent.tsx`
  - `frontend/src/components/game/panels/GovernmentPanel.tsx`
  - `frontend/src/components/game/panels/military/MilitaryNodeDrawer.tsx`
  - `frontend/src/components/game/panels/MilitaryPanel.tsx`
  - `frontend/src/components/game/panels/Phase1MarketPanel.tsx`
  - `frontend/src/components/game/panels/DomesticPanel.tsx`
  - `frontend/src/components/game/panels/ResearchPanel.tsx`
  - `frontend/src/components/game/status/GameSituationSummary.tsx`
  - `frontend/src/features/game/decisionShared.ts`
  - `frontend/src/features/game/forms.ts`
  - `frontend/src/features/game/flow/gameWorkbench.ts`
  - `frontend/src/features/game/flow/decisionFlow.ts`
  - `frontend/src/features/game/runtime/useGameRuntime.ts`

- [ ] **Step 1: Generate current audit output for gameplay files**

Run:

```bash
cd frontend
npm run test:i18n-cjk 2> /tmp/tomorrow-question-i18n-audit.txt
rg "GamePhasePanelContent|GovernmentPanel|MilitaryNodeDrawer|MilitaryPanel|Phase1MarketPanel|DomesticPanel|ResearchPanel|GameSituationSummary|decisionShared|forms|gameWorkbench|decisionFlow|useGameRuntime" /tmp/tomorrow-question-i18n-audit.txt
```

Expected: findings for only the listed gameplay files.

- [ ] **Step 2: For each finding, add resource keys in both languages**

For every reported key:

1. Add the English text to `frontend/src/i18n/resources/en/game.json`.
2. Add the Chinese text to `frontend/src/i18n/resources/zh/game.json` if it is not already there.
3. Preserve interpolation names exactly, for example `{{count}}`, `{{reason}}`, `{{cost}}`.
4. Keep keys in the same namespace section implied by the key, for example `game:military.colonizationAction` belongs in the `military` object.

Concrete examples from the current audit:

```json
{
  "military": {
    "colonizationYieldNotApplicable": "N/A",
    "colonizationNotAllowed": "This region cannot be colonized",
    "colonizationControlled": "Colonized by {{country}}",
    "colonizationInaccessible": "Currently inaccessible",
    "colonizationArmyShortage": "Army insufficient; requires {{cost}}",
    "regionBlockadeByYou": "You are blockading this region; you may still sell here, while other countries cannot.",
    "regionBlockadeNone": "No country is currently blockading this region.",
    "regionBlockadeAction": "Regional Blockade",
    "colonizationAction": "Colonization",
    "colonizationArmyCost": "Costs {{cost}} Army",
    "colonizationYield": "Raw Materials per Round",
    "colonizationController": "Current Controller",
    "noController": "None",
    "colonizationDisabledReason": "Cannot colonize: {{reason}}.",
    "colonizationRuleHint": "After submission, permanently colonize this region and receive raw-material returns from next round.",
    "cancelColonization": "Cancel Colonization",
    "colonizeRegion": "Colonize Region"
  },
  "government": {
    "reformAndPolicy": "Reforms and Policies",
    "reformAndPolicyTitle": "Government Reforms / Regular Policies",
    "reformAndPolicyDesc": "Reforms advance one of the three national paths; regular policies consume this round's admin capacity and budget.",
    "adminCapacityLabel": "Admin Capacity",
    "remainingThisRoundLabel": "Remaining This Round",
    "reformQueueLabel": "Reform Queue",
    "policyChangeLabel": "Policy Changes",
    "statusImplemented": "Implemented",
    "statusBlocked": "Blocked",
    "statusQueued": "Queued This Round",
    "statusInsufficientCapacity": "Insufficient Admin Capacity",
    "btnImplemented": "Implemented",
    "btnBlocked": "Blocked",
    "btnRevoke": "Revoke",
    "btnImplement": "Implement"
  },
  "market": {
    "incomeAllocationRatio": "Income Allocation This Round",
    "allocated": "Allocated",
    "actualSold": "Sold",
    "sharedCapacity": "Shared Capacity",
    "competitionCapacity": "Competition Capacity"
  }
}
```

- [ ] **Step 3: Replace only unsafe dynamic defaults**

When a call uses template-literal Chinese fallback through `defaultValue`, replace it with an English `defaultValue`. Example:

```ts
i18n.t("game:government.statusCanImplement", {
  cost: reform.adminCost,
  defaultValue: `Can implement (Admin ${reform.adminCost})`,
});
```

Do not rewrite translated backend labels such as `translateBackend(reform.label)`; those remain data labels and must keep going through `translateBackend`.

- [ ] **Step 4: Run the audit for gameplay files again**

Run:

```bash
cd frontend
npm run test:i18n-cjk 2> /tmp/tomorrow-question-i18n-audit.txt || true
rg "GamePhasePanelContent|GovernmentPanel|MilitaryNodeDrawer|MilitaryPanel|Phase1MarketPanel|DomesticPanel|ResearchPanel|GameSituationSummary|decisionShared|forms|gameWorkbench|decisionFlow|useGameRuntime" /tmp/tomorrow-question-i18n-audit.txt
```

Expected: no output from `rg`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd frontend
npm test -- GamePhasePanelContent GovernmentPanel MilitaryPanel Phase1MarketPanel ResearchPanel GameSituationSummary decisionShared gameWorkbench decisionFlow index
```

Expected:

```text
Test Files ... passed
Tests ... passed
```

---

### Task 6: Fix Demo And Command Deck Resources

**Files:**
- Modify:
  - `frontend/src/i18n/resources/en/game.json`
  - `frontend/src/i18n/resources/zh/game.json`
  - `frontend/src/i18n/resources/en/pages.json`
  - `frontend/src/i18n/resources/zh/pages.json`
  - `frontend/src/features/game/commandDeck/viewModel.ts`
  - `frontend/src/features/game/demo/seed.ts`
  - `frontend/src/features/game/demo/decisionCardDemo.ts`

- [ ] **Step 1: Generate current command deck findings**

Run:

```bash
cd frontend
npm run test:i18n-cjk 2> /tmp/tomorrow-question-i18n-audit.txt || true
rg "commandDeck|demo/seed|demo/decisionCardDemo" /tmp/tomorrow-question-i18n-audit.txt
```

Expected: only command-deck and demo findings remain after Task 5.

- [ ] **Step 2: Add command deck keys by section**

Move these groups into resource files:

- `game.commandDeck.factory.*`
- `game.commandDeck.domestic.*`
- `game.commandDeck.government.*`
- `game.commandDeck.military.*`
- `game.commandDeck.research.*`
- `game.demo.*`
- `pages.decisionCardDemo.*`

Use this style for both languages:

```json
{
  "commandDeck": {
    "stepEyebrow": "Step {{current}} / 5",
    "factory": {
      "subtitle": "What orders does your factory need today?",
      "description": "Plan this round's production, expand factories by industrial stage, upgrade production lines, or adjust output temporarily.",
      "budgetLabel": "Factory Budget",
      "plannedBatches": "{{count}} batches planned",
      "rawMaterialPurchasePill": "Material Purchase +{{count}}",
      "rawMaterialCapPill": "Material Purchase Cap {{count}}",
      "remainingCapacity": "{{count}} batches remaining",
      "productionTitle": "Production This Round",
      "productionDesc": "Choose production batches; budget and shared capacity update immediately."
    }
  }
}
```

Keep adding keys until the audit has no findings for command deck and demo files.

- [ ] **Step 3: Run demo-focused tests**

Run:

```bash
cd frontend
npm test -- decisionCardDemo
```

Expected:

```text
PASS src/features/game/demo/decisionCardDemo.test.ts
```

---

### Task 7: Verify Backend Label Translation Coverage

**Files:**
- Modify: `frontend/src/i18n/index.test.ts`
- Modify as needed: `frontend/src/i18n/resources/en/game.json`

- [ ] **Step 1: Add regression test for representative backend labels**

Append to `frontend/src/i18n/index.test.ts`:

```ts
  it("does not leak Chinese for representative backend gameplay labels in English", async () => {
    await withLanguage("en", () => {
      const samples = [
        "手工业",
        "机械化工业",
        "贸易促进",
        "军国体制",
        "美洲",
        "非洲",
        "陆军 +1",
        "政府预算 -3",
      ];

      for (const sample of samples) {
        expect(translateBackend(sample)).not.toMatch(/[\u4e00-\u9fff]/);
      }
    });
  });
```

- [ ] **Step 2: Run the test**

Run:

```bash
cd frontend
npm test -- index
```

Expected: PASS. If it fails, add the missing sample to `game.backendLabels` in `frontend/src/i18n/resources/en/game.json`.

---

### Task 8: Full Static Verification

**Files:**
- No new source files unless the audit exposes remaining misses.

- [ ] **Step 1: Run i18n audit**

Run:

```bash
cd frontend
npm run test:i18n-cjk
```

Expected:

```text
i18n CJK audit passed.
```

- [ ] **Step 2: Run frontend unit tests**

Run:

```bash
cd frontend
npm test -- index GamePhasePanelContent GovernmentPanel MilitaryPanel Phase1MarketPanel ResearchPanel GameSituationSummary decisionShared gameWorkbench decisionFlow decisionCardDemo
```

Expected: all targeted files pass.

- [ ] **Step 3: Run full frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected:

```text
vite build ...
✓ built
```

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

---

### Task 9: Player-View Regression With Computer Use

**Files:**
- Create: `docs/playtests/2026-06-14-i18n-english-mode-regression.md`

- [ ] **Step 1: Create the playtest record before browser testing**

Create `docs/playtests/2026-06-14-i18n-english-mode-regression.md` with:

```markdown
# 2026-06-14 i18n English Mode Regression

## 元信息

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-06-14 |
| 测试方式 | Computer Use 控制真实本地浏览器页面 |
| 前端 | http://127.0.0.1:5173 |
| 后端 | http://127.0.0.1:5001 |
| 范围 | 默认英文、fallback 英文、普通玩家路径不漏中文 |

## 问题台账

| 编号 | 来源 | 模块 | 严重程度 | 摘要 | 状态 | 复验要求 |
| --- | --- | --- | --- | --- | --- | --- |
| I18N-EN-001 | 本轮审查 | i18n / 英文模式 | P2 | 英文模式下部分游戏 UI 显示中文，根因是中文 fallback 和缺失英文 key。 | 已修复待复验 | Computer Use 打开真实页面，英文模式进入大厅、房间、对局、政府/军事/工厂/市场/研究面板，记录无中文泄漏。 |

## 复验记录

| 顺序 | 页面 / 模块 | 操作 | 期望 | 实际 | 结论 |
| --- | --- | --- | --- | --- | --- |
```

- [ ] **Step 2: Start services**

Run:

```bash
./scripts/start-local.ps1
```

If PowerShell is unavailable locally, start backend and frontend separately with the existing project scripts:

```bash
./scripts/start-backend.ps1
./scripts/start-frontend.ps1
```

Expected:

```text
backend healthz available on http://127.0.0.1:5001/healthz
frontend available on http://127.0.0.1:5173
```

- [ ] **Step 3: Use Computer Use, not API-only verification**

With Computer Use controlling the real browser:

1. Open `http://127.0.0.1:5173`.
2. Clear `localStorage.app_locale`.
3. Reload.
4. Confirm home/lobby opens in English by default.
5. Create or enter a room.
6. Start a game.
7. Open Factory, Government, Military, Domestic/Market, Research panels.
8. Search visible text for Chinese characters by visual inspection and browser console:

```js
document.body.innerText.match(/[\u4e00-\u9fff]+/g)
```

Expected for normal English gameplay routes: no Chinese matches except intentional language switcher label if it is visible outside game routes.

- [ ] **Step 4: Record evidence**

Append rows to `docs/playtests/2026-06-14-i18n-english-mode-regression.md` for each page/module. Close `I18N-EN-001` only after real browser evidence confirms no Chinese leakage in the tested normal gameplay path.

---

### Task 10: Final Commit Boundary

**Files:**
- All files changed in Tasks 1-9.

- [ ] **Step 1: Review diff**

Run:

```bash
git diff -- frontend/src/i18n/index.ts frontend/src/i18n/index.test.ts frontend/src/i18n/resources frontend/scripts frontend/package.json docs/playtests/2026-06-14-i18n-english-mode-regression.md
```

Expected:

- Default/fallback changed to English.
- English resource keys added.
- No unrelated UI refactor.
- Static audit script added.
- Playtest record updated with real browser evidence.

- [ ] **Step 2: Run final verification**

Run:

```bash
cd frontend
npm run test:i18n-cjk
npm test -- index GamePhasePanelContent GovernmentPanel MilitaryPanel Phase1MarketPanel ResearchPanel GameSituationSummary decisionShared gameWorkbench decisionFlow decisionCardDemo
npm run build
cd ..
git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Commit only if requested**

If the user asks for a commit:

```bash
git add frontend/src/i18n/index.ts frontend/src/i18n/index.test.ts frontend/src/i18n/resources frontend/scripts/audit-i18n-cjk.mjs frontend/package.json docs/playtests/2026-06-14-i18n-english-mode-regression.md
git commit -m "fix: default to english and audit i18n fallbacks"
```

Do not commit without explicit user approval.

---

## Self-Review Checklist

- The plan directly implements `lng: "en"` and `fallbackLng: "en"`.
- The plan treats English resource coverage as the real fix, not only a config change.
- The plan adds an automated audit so future Chinese fallback defaults cannot silently ship.
- The plan preserves Chinese mode by keeping `zh` resources and language switcher behavior.
- The plan excludes `/setting` from ordinary gameplay leakage unless requirements change.
- The plan includes Computer Use player-view verification and a playtest issue ledger.
