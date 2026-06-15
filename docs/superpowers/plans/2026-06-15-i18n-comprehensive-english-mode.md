# Comprehensive English Mode i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** English mode must render every player-facing frontend string and every backend-provided frontend prompt in English, with English as default and fallback.

**Architecture:** English is the canonical fallback. Frontend code must render through i18n resource keys or `translateBackend`; long-lived UI state stores raw domain/API data and derives localized view models from the current language. Backend responses either return stable codes/structured data or strings covered by backend i18n and frontend translation audits.

**Tech Stack:** React 18, TypeScript, Vite, i18next, Vitest, Flask, pytest, static Node audit scripts, real-browser player-view verification.

---

## Scope And Invariants

- English default: `resolveInitialLanguage()` returns `en` unless `app_locale` explicitly starts with `zh`.
- English fallback: `fallbackLng` remains `en`; no missing key can fall back to Chinese.
- Frontend visible text: no hardcoded Chinese in player-facing source, JSX, CSS generated content, aria labels, or `t()` fallback/defaultValue.
- Backend config text: every Chinese string in `backend/config/balance/*.json` must have an English `game.backendLabels` entry or be migrated to structured localized fields.
- Backend runtime text: API errors, submission rejection reasons, generated logs, guidance cards, settlement summaries, and settings helper text must use backend i18n keys or structured codes.
- Language switch reactivity: switching `zh -> en` must rebuild view models and not keep stale Chinese snapshots.

---

### Task 1: Close The Current Lobby Language-Switch Regression

**Files:**
- Modify: `frontend/src/pages/LobbyPage.tsx`
- Modify: `frontend/src/features/lobby/flow/useLobbyFlowController.ts`
- Modify: `frontend/src/components/lobby/LobbyWaitingRoomsSection.tsx`
- Test: `frontend/src/pages/LobbyPage.test.tsx`
- Record: `docs/playtests/2026-06-15-i18n-lobby-language-switch-regression.md`

- [x] **Step 1: Record the defect before changing code**

Add `I18N-EN-002` to `docs/playtests/2026-06-15-i18n-lobby-language-switch-regression.md`.

- [x] **Step 2: Store raw Lobby API data and derive localized view models by language**

Use this pattern in `useLobbyFlowController`:

```ts
const { i18n: reactI18n } = useTranslation();
const currentLanguage = reactI18n.resolvedLanguage ?? reactI18n.language;
const waitingRooms = useMemo(
  () => waitingRoomSummaries.map(buildWaitingRoomCardViewModel),
  [currentLanguage, waitingRoomSummaries],
);
```

- [x] **Step 3: Add language dependencies to Lobby memoized view models**

Use `currentLanguage` in `LobbyPage.tsx` dependencies for `buildInviteEntryViewModel` and `buildLobbyPrimaryActionViewModel`.

- [x] **Step 4: Prove the old bug cannot return**

Run:

```bash
cd frontend
npm test -- LobbyPage
```

Expected: `6 passed`.

---

### Task 2: Harden Static i18n Audits For Backend Config Text

**Files:**
- Modify: `frontend/scripts/audit-i18n-cjk.mjs`
- Modify: `frontend/src/i18n/resources/en/game.json`
- Test: `frontend/src/i18n/index.test.ts`

- [x] **Step 1: Audit `backend/config/balance/*.json` strings**

Add `auditBackendBalanceConfigLabels()` to `frontend/scripts/audit-i18n-cjk.mjs`. It must collect all CJK strings from balance config JSON and fail when any string is missing from `en.game.backendLabels`.

- [x] **Step 2: Add missing English backend labels**

Add translations for the currently missing 20 backend config strings, including suppress-policy labels, equality/national reform descriptions, and `军民融合发展，提升军事能力。`.

- [x] **Step 3: Verify the audit**

Run:

```bash
cd frontend
npm run test:i18n-cjk
```

Expected: `i18n CJK audit passed.`

---

### Task 3: Make Test Defaults Match Product Defaults

**Files:**
- Modify: `frontend/src/test/setup.ts`
- Modify: tests that intentionally assert Chinese copy

- [ ] **Step 1: Change test setup default language to English**

Replace:

```ts
await i18n.changeLanguage("zh");
beforeEach(async () => {
  await i18n.changeLanguage("zh");
});
```

with:

```ts
await i18n.changeLanguage("en");
beforeEach(async () => {
  await i18n.changeLanguage("en");
});
```

- [ ] **Step 2: Mark Chinese-specific tests explicitly**

In each test file that asserts Chinese UI, add a local setup:

```ts
beforeEach(async () => {
  await i18n.changeLanguage("zh");
});
```

Only add this where the test is intentionally verifying Chinese behavior. English-mode tests should not opt into Chinese.

- [ ] **Step 3: Run the full frontend suite**

Run:

```bash
cd frontend
npm test
```

Expected: all tests pass with English as the default test language.

---

### Task 4: Remove Frontend Chinese Fallbacks And Hardcoded Player-Facing Chinese

**Files To Sweep:**
- `frontend/src/features/flow/routeFlow.ts`
- `frontend/src/features/game/flow/gameFlow.ts`
- `frontend/src/features/game/flow/gameWorkbench.ts`
- `frontend/src/features/game/flow/settlementFlow.ts`
- `frontend/src/features/game/decisionShared.ts`
- `frontend/src/features/game/forms.ts`
- `frontend/src/features/game/commandDeck/viewModel.ts`
- `frontend/src/components/game/panels/GamePhasePanelContent.tsx`
- `frontend/src/components/game/panels/GovernmentPanel.tsx`
- `frontend/src/components/game/panels/MilitaryPanel.tsx`
- `frontend/src/components/game/panels/military/MilitaryNodeDrawer.tsx`
- `frontend/src/components/settings/DecisionParameterSandbox.tsx`
- `frontend/src/i18n/resources/en/*.json`
- `frontend/src/i18n/resources/zh/*.json`

- [ ] **Step 1: Generate the current source fallback report**

Run:

```bash
cd frontend
rg -n "[\\p{Han}]" src -g '!src/i18n/resources/zh/**' -g '!**/*.test.*'
```

Expected: every result is either a backend matching regex in `translateDynamicBackendText`, an English resource `backendLabels` key, or a defect to migrate.

- [ ] **Step 2: Migrate each `t(key, "中文")` call**

For each call, add the key to both English and Chinese resource JSON, then call `t(key)` or `i18n.t(key, options)` without a Chinese default.

Required replacement pattern:

```ts
// before
i18n.t("game:flow.statusEditable", "当前可以填写并提交本阶段操作。");

// after
i18n.t("game:flow.statusEditable");
```

- [ ] **Step 3: Localize list separators and punctuation**

Use current language for generated separators:

```ts
const separator = i18n.language.startsWith("zh") ? "、" : ", ";
items.join(separator);
```

Do this for `join("、")`, Chinese colons, Chinese parentheses, and aria labels.

- [ ] **Step 4: Turn strict source fallback audit on**

After the report is clean, update `frontend/scripts/audit-i18n-cjk.mjs` so any non-resource source string containing CJK in player-facing code fails CI.

Run:

```bash
cd frontend
npm run test:i18n-cjk
npm test
npm run build
```

Expected: all three commands pass.

---

### Task 5: Localize Backend Runtime API Messages

**Files:**
- Modify: `backend/app/i18n.py`
- Modify: `backend/app/api/routes.py`
- Modify: `backend/app/modules/room/service.py`
- Modify: `backend/app/modules/session/application.py`
- Modify: `backend/app/modules/settlement/phase_submission.py`
- Modify: `backend/app/modules/game_state/workspaces.py`
- Modify: `backend/app/modules/game_state/factory_economy.py`
- Modify: `backend/app/modules/rules/*.py`
- Test: create `backend/tests/test_i18n_api_messages.py`

- [ ] **Step 1: Extend backend errors with message keys**

Add `message_key` and `message_args` to application error types. Keep `message` for compatibility, but API handlers should prefer `t(error.message_key, **error.message_args)` when present.

- [ ] **Step 2: Localize route error handlers**

Use this handler pattern in `backend/app/api/routes.py`:

```py
def _error_message(error) -> str:
    key = getattr(error, "message_key", None)
    args = getattr(error, "message_args", {}) or {}
    return t(key, **args) if key else error.message
```

Then pass `_error_message(error)` into `error_response(...)`.

- [ ] **Step 3: Convert runtime Chinese reasons to keys**

Convert strings such as `工厂预算超支`, `政策前置改革未完成`, `未知军事动作`, `殖民需要 ... 陆军`, generated guidance card text, and settlement log headlines into `backend/app/i18n.py` keys with English and Chinese values.

- [ ] **Step 4: Add backend API language tests**

Create `backend/tests/test_i18n_api_messages.py` with tests that send `Accept-Language: en` and assert error payloads contain no Han characters:

```py
def assert_no_han(value: object) -> None:
    assert not re.search(r"[\u4e00-\u9fff]", json.dumps(value, ensure_ascii=False))
```

- [ ] **Step 5: Run backend verification**

Run:

```bash
cd backend
.venv/bin/python -m pytest tests/test_i18n_api_messages.py
```

Expected: all English API message tests pass.

---

### Task 6: Add Real-Browser English DOM Leak Verification

**Files:**
- Create: `frontend/e2e/i18n-english-no-cjk.spec.ts`
- Update: `docs/playtests/2026-06-15-i18n-lobby-language-switch-regression.md`

- [ ] **Step 1: Add browser-side DOM scanner**

The scan should set `localStorage.app_locale = "en"`, reload, and evaluate:

```ts
const visibleText = document.body.innerText.replace("中文", "");
expect(visibleText).not.toMatch(/[\u4e00-\u9fff]/);
```

- [ ] **Step 2: Cover normal routes**

Scan `/`, `/lobby`, `/room/:roomCode`, `/game/:gameId`, `/settlement/:gameId`, and `/setting` after each page has loaded enough data to show its main UI.

- [ ] **Step 3: Record real-page evidence**

Use the real local page after fixes and update the playtest markdown with:

- URL tested
- language state
- screenshot/DOM scan result
- remaining exceptions, if any

---

## Final Release Gate

Before claiming the comprehensive i18n fix is complete, all commands must pass:

```bash
cd frontend
npm run test:i18n-cjk
npm test
npm run build
```

```bash
cd backend
.venv/bin/python -m pytest
```

And real browser verification must show no Chinese text in English mode except the language option label `中文`.
