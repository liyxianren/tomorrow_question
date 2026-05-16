# 取消军事点中间货币 — 直接花政府财政

## 目标

**取消 `militaryPoints` 中间货币，所有军事行动直接消耗 `governmentFiscal`。合并步兵+炮兵为统一"陆军"，增加军事力量上限。**

## 用户需求拆解

1. **取消军事点数值** — 不再有 `militaryPoints` 这个中间货币
2. **军事行动直接花政府财政** — 征募/训练/舰队/殖民都从 `governmentFiscal` 扣
3. **步兵+炮兵合一为"陆军"** — `army.infantry` + `army.artillery` → `army.count`
4. **军事面板顶部增加数值显示** — 显示当前陆军总数
5. **军事力量上限** — 初始有上限，通过政府决策可提升上限

## 当前系统分析

### 军事点流转路径

```
政府面板"购买军事点"(governmentFiscal → militaryPoints)
  ↓
军事面板"征募步兵/训练炮兵/海军演练/建造舰队"(militaryPoints → army/navy)
  ↓
殖民解锁(governmentFiscal) → 殖民执行(militaryPoints)
  ↓
事件/里程碑效果 → militaryPointsDelta
  ↓
market_access 中用 army(infantry/artillery) 计算 army_power 判断海外竞争
```

### 改动范围总览

| 层 | 文件数 | 改动类型 |
|----|--------|---------|
| 配置 JSON | 4 | 移除 militaryPointCost，改为 budgetPoolCost |
| 后端 config 模型 | 2 | MilitaryActionConfig 改字段，MilitaryBalanceConfig 加 armyCap |
| 后端 game_state 模型 | 1 | PlayerState 移除 military_points，加 army_cap |
| 后端 workspace | 1 | 移除 militaryPoints 输出 |
| 后端 decision 规则 | 1 | 军事/殖民从扣 militaryPoints 改为扣 governmentFiscal |
| 后端 effects | 1 | 移除 militaryPointsDelta handler |
| 后端 其他 | 3 | settlement/contracts/factory 中的残留 |
| 前端 types | 1 | workspace 类型移除 militaryPoints |
| 前端 MilitaryPanel | 1 | 移除军事点显示，合并陆军，加 armyCap |
| 前端 GovernmentPanel | 1 | 移除"购买军事点"UI |
| 前端 DecisionResourceBar | 1 | 移除军事点指标 |
| 前端 decisionShared | 1 | calculateGovernmentPointPreview 移除 militaryPoints |
| 前端 commandDeck/gameWorkbench | 2 | 移除军事点引用 |
| 前端 其他面板 | 2 | MilitaryNodeDrawer, GamePhasePanelContent |
| 测试(后端) | 15+ | 更新所有引用 military_points 的测试 |
| 测试(前端) | 3 | 更新 snapshot/mock 数据 |
| 演示数据 | 3 | 移除 militaryPoints |

**预估 30+ 文件改动，这是一个全栈重构。**

## 执行计划

### Phase 1: 配置层 (4 文件，纯 JSON 改动)

| 文件 | 改动 |
|------|------|
| `military_actions.json` | 4 个军事动作：`militaryPointCost` → `budgetPoolCost`。征募步兵/训练炮兵合并为"征募陆军"（`armyDelta: {"army": 1}`），海军演练保留，建造舰队保留 |
| `military.json` | 移除 `colonizationMilitaryPointCost`，殖民消耗改为直接扣 `governmentFiscal`。新增 `armyCapBase: 3`（初始陆军上限） |
| `decision_actions.json` | `expand_army` policy effect 从 `militaryPointsDelta: 1` 改为 `armyCapDelta: 1`（增加军事上限） |
| `politics.json` | milestones 中的 `militaryPointsDelta` 移除或改为其他效果 |
| `countries.json` | 初始值 `militaryPoints` 移除，加 `armyCap: 3` |
| `events.json` | `militaryPoints` 相关效果移除 |

### Phase 2: 后端数据模型 (3 文件)

| 文件 | 改动 |
|------|------|
| `balance_config/models.py` | `MilitaryActionConfig`: `military_point_cost` → `budget_pool_cost`(已有), 合并。`MilitaryBalanceConfig`: 移除 `colonization_military_point_cost`，新增 `army_cap_base: int` |
| `balance_config/loader.py` | 更新 `_build_military_config`: 读取 `armyCapBase`，移除 `colonizationMilitaryPointCost` 字段读取 |
| `game_state/models.py` | `PlayerState`: 移除 `military_points` 字段。新增 `army_cap: int = 3`。序列化/反序列化移除 `militaryPoints`，加 `armyCap`。`army` dict 从 `{infantry, artillery}` 改为 `{army: int}` |

### Phase 3: 后端游戏逻辑 (4 文件)

| 文件 | 改动 |
|------|------|
| `rules/decision.py` | `_apply_military_plan`: 从 `player_state.budget_pools["governmentFiscal"]` 扣款替代 `player_state.military_points`。殖民：同样改扣 governmentFiscal。移除所有 `military_points` 操作 |
| `game_state/workspaces.py` | `_build_military_workspace`: 移除 `"militaryPoints"` 输出。`army` 显示改为 `{"total": count}`。新增 `"armyCap"` 字段。`_build_region_access_status`: army_power 计算改为 `army["army"] * 2`（合并后统一战力系数）。`_build_colonization_options`: `has_military` 检查改为检查 governmentFiscal 余额。`_NESTED_EFFECT_LABELS`: 更新 armyDelta labels |
| `game_state/effects.py` | 移除 `militaryPointsDelta` handler |
| `settlement/phase_submission.py` | 移除 settlement 中 military_points 更新逻辑 |

### Phase 4: 前端类型与逻辑 (4 文件)

| 文件 | 改动 |
|------|------|
| `types/domain.ts` | workspace 类型移除 `militaryPoints`。`MilitaryWorkspace` 中 `army` 改为 `{ army: number }`，新增 `armyCap: number` |
| `decisionShared.ts` | `calculateGovernmentPointPreview`: 移除 `militaryPoints` 返回值和计算。`getBudgetRemaining` 无需再算军事点购买 |
| `commandDeck/viewModel.ts` | 移除军事点显示 |
| `gameWorkbench.ts` | 移除军事点提交字段 |

### Phase 5: 前端面板 (5 文件)

| 文件 | 改动 |
|------|------|
| `GovernmentPanel.tsx` | 移除"购买军事点"卡片（lines ~930-960）。移除 `queuedMilitaryPurchases` 变量。effects 渲染移除 `militaryPointsDelta` handler |
| `MilitaryPanel.tsx` | header 显示: `"⚔️ 陆军 {totalArmy}/{armyCap} · 舰队 {totalFleets}"`。DecisionStatStrip: 军事点 → 陆军数/上限。军事行动卡片: cost 显示为 `{cost} 政府财政`。移除 `remainingMilitaryPoints`，改用 `remainingGovernmentBudget`。`maxInfantryAvailable`/`maxArtilleryAvailable` → `maxArmyAvailable` |
| `DecisionResourceBar.tsx` | 移除军事点指标 |
| `MilitaryNodeDrawer.tsx` | `militaryPoints` prop → `remainingGovernmentBudget` |
| `GamePhasePanelContent.tsx` | 移除军事点传递 |

### Phase 6: 演示/测试数据 (5+ 文件)

| 文件 | 改动 |
|------|------|
| `frontend features/game/demo/seed.ts` | 移除 `militaryPoints` |
| `frontend features/game/demo/types.ts` | 移除 militaryPoints 类型 |
| `frontend test/gameSnapshotFixtures.ts` | 移除 `militaryPoints` |
| `frontend MilitaryPanel.test.tsx` | 更新测试断言 |
| `frontend decisionShared.test.ts` | 更新测试 |

### Phase 7: 后端测试更新 (15+ 文件)

统一模式：将 `military_points` / `militaryPoints` 引用替换为 `budget_pools["governmentFiscal"]` 或移除。

关键测试文件：
- `test_rules_decision.py` — 军事计划测试
- `test_military_system.py` — 军事系统测试
- `test_colonization_chain.py` — 殖民链测试
- `test_game_state_models.py` — 模型序列化
- `test_game_state_workspaces.py` — workspace 输出
- `test_regular_policies_e2e.py` — expand_army 效果变更
- `test_e2e_verification.py` — 端到端验证
- 等

## 军事动作重新定价

| 旧动作 | 旧 cost | 新动作 | 新 cost (governmentFiscal) |
|--------|---------|--------|---------------------------|
| 征募步兵 | 1 军事点 | **(合并) 征募陆军** | 5 政府财政 |
| 训练炮兵 | 2 军事点 | (合并到上面) | — |
| 海军演练 | 1 军事点 | 海军演练 | 4 政府财政 |
| 建造舰队 | 3 军事点 | 建造舰队 | 8 政府财政 |
| 殖民执行 | 2 军事点 | 殖民执行 | 6 政府财政 |

## 陆军上限设计

- 初始 `armyCap: 3`（从 `countries.json` 各国初始值）
- 通过 `expand_army` policy 提升：每激活一次 +1 armyCap（从 `militaryPointsDelta: 1` 改为 `armyCapDelta: 1`，每回合 settlement 时应用）
- 上限显示在军事面板顶部

## 验证步骤

1. **配置加载**: `get_balance_config()` 不报错
2. **后端测试**: 全量 backend tests（重点: military_system, colonization_chain, rules_decision, game_state_models, game_state_workspaces, regular_policies_e2e）
3. **前端构建**: `npm run build`
4. **前端测试**: Vitest（MilitaryPanel, decisionShared, forms）
5. **游戏手动验证**: 
   - 议会大厅不再显示"购买军事点"
   - 军事面板显示"陆军 X/Y · 舰队 Z"
   - 点击"征募陆军"从政府预算扣 5
   - 陆军数不超过 armyCap
   - 殖民执行花政府财政而非军事点

## 不改动

- 舰队系统不变（navy 仍为独立类型）
- 海军封锁判断逻辑不变
- 殖民解锁仍花政府财政（已有逻辑）
- 海外竞争 army_power 计算不变（只是合并后 army.infantry+army.artillery → army.army 并统一战力）

## 风险

- **高**：改动 30+ 文件，涉及全栈。测试覆盖必须全面。
- 建议分 phase 执行，每 phase 完成后验证一轮，不要一次改完所有文件。
- 陆军合并后，已有对局存档中的 `army.infantry` + `army.artillery` 需要迁移逻辑（Phase 3 模型层处理）。
