# Phase 1 决策页布局重构计划

> **Scope**: 仅前端布局与信息架构，不修改后端、不改动游戏机制、不改动数据模型。
> **目标产物**: 这份计划是实施阶段（写代码、改 CSS、改测试）前的唯一真理来源。

---

## 0. 背景与既有架构速览

Phase 1 「国家决策」页面的真实运行结构（不是用户描述里假设的纯 Tab 系统，而是 **Map + Modal + Tab** 三层叠加）：

```
GamePage (frontend/src/pages/GamePage.tsx)
└─ GameMapView                 ← 国家地图全屏背景，左侧 300px sidebar
   ├─ 左 sidebar
   │  ├─ GameSituationSummary  ← 已经显示三池预算 (resourceStrip)、回合阶段、意识形态
   │  └─ UnifiedSubmitPanel    ← 提交按钮 (gp-submit)
   └─ map canvas
      ├─ 5 个 MapBuilding 大头针   ← 工业区/市民广场/议会厅/军事要塞/研究院
      └─ GameMapModal             ← 点击建筑后弹出
         └─ GamePhasePanelContent (DecisionWorkbench)
            ├─ DecisionStepTabs   ← 5 个 tab，与建筑一一映射
            ├─ {Active}Panel      ← FactoryPanel / DomesticPanel / GovernmentPanel / MilitaryPanel / ResearchPanel
            └─ DecisionStepFooter ← 上一步 / 下一步
```

地图背景：`/images/map-{country}.png`，每个国家 5 个建筑坐标定义在 `frontend/src/features/game/flow/useMapViewState.ts:49-90`。

侧边栏的 `GameSituationSummary` 已经把三个预算池作为 `resourceStrip` 渲染过一次（`gameWorkbench.ts:193-197`），但是每个 Panel 的 header 又渲染了一次自己的「剩余预算」徽章——这就是用户反映的「财政池在两个面板里被重复显示，但视觉上看不出共享」的根源。

> **核心数据流：每个 Panel 接收的 `remainingXxxBudget` 都是从同一个 workspace.budgetPools 减去 spendSummary 得到的。
> GovernmentPanel 与 MilitaryPanel 共用 `governmentFiscal - spendSummary.governmentSpend`**（见 `GamePhasePanelContent.tsx:232 与 :250`），但视觉上无关联。

---

## A. 当前状态分析

### A.1 6 个面板的现状（注意：第 6 个 TalentTreePanel 当前是死代码）

| # | Panel | 入口 | 布局模式 | 主要数据 | 主要问题 |
|---|---|---|---|---|---|
| 1 | **FactoryPanel** (`factory/FactoryPanel.tsx`) | tab `factory` | `factory-panel__header` + `factory-actions` 双列网格 + 嵌套 `Phase1ProductionPanel` | 工厂预算、建设/升级卡、Phase1 生产模式分配 | header 单独显示「工厂预算」徽章，与侧栏重复；Phase1 子面板有自己的 summary bar（原材料/库存/投资池/产能），又叠加一层 stat 行 |
| 2 | **DomesticPanel** (`DomesticPanel.tsx`) | tab `domestic` | `domestic-panel__header` + `domestic-stats` + `domestic-actions` 单维卡片堆 | 国内预算、民生政策卡 | 头部 `domestic-panel__budget` 显示「国内预算 X」、底下 `domestic-stats` 第一格又显示「💰 X 预算剩余」——同一个数字两次；其余空间全是垂直卡片堆叠 |
| 3 | **GovernmentPanel** (`GovernmentPanel.tsx`) | tab `government` | `government-panel__header` + `government-stats` 4 格 + 多个 `government-actions` 双列网格区段 | 政府财政、行政力、改革三路、政策、本回合策略 | 页面长度极大（约 560 行 TSX）；改革三路径完全垂直堆叠，玩家在「自由 vs 平等 vs 民族」之间没有横向比较视图；与 MilitaryPanel 共用 governmentFiscal 但毫无视觉提示 |
| 4 | **MilitaryPanel** (`MilitaryPanel.tsx`) | tab `military` | 一连串 `military-section-label` + 各种网格（海洋节点、海外区域、军事行动、外交、殖民） | 共用 `governmentFiscal`、军事点、舰队、海外承接、建交、海洋节点、殖民选项、征服、掠夺 | 单页面信息密度最高（约 625 行 TSX），但被强迫塞进卡片堆；地理元素（海洋/区域/殖民）应该是地图 overlay 而不是卡片；与 GovernmentPanel 抢同一个 governmentFiscal 但视觉孤立 |
| 5 | **ResearchPanel** (`ResearchPanel.tsx`) | tab `research` | 三链科技树：顶部小型状态条 + 三个 chain 列表 | 研究设施数、当前研究、三条科技链进度 | **当前唯一参考布局**——左侧 status icon + 右侧 info 的二分行式布局，明显比其它面板可读；但还是单列，没用到右侧空间 |
| 6 | **TalentTreePanel** (`TalentTreePanel.tsx`) | **目前在生产中不可达** | branch grid → branch detail（链式节点列表） | 4 个天赋分支，每个 5 个节点 | `DECISION_STEP_ORDER` 只列出了 5 个 tab，`TalentTreePanel` 仅作为 `GamePhasePanelContent.tsx:267` 的 `else` 分支存在；TS 类型导致此分支永远不会渲染。代码已写完但被孤立 |

> **关键不一致**：用户描述了 6 个 sub-panels，但 `DECISION_STEP_ORDER` (`flow/decisionFlow.ts:12`) 只有 5 个步骤。第 6 个 TalentTreePanel 必须在重构期间正式纳入或显式作为 ResearchPanel 的子模块。

### A.2 共享 CSS 与共有模式

`frontend/src/styles.css` 的 `gp-*` 命名空间提供：

- `gp-section` / `gp-card` / `gp-card--primary` / `gp-card--footer`：通用容器
- `gp-grid`：`repeat(auto-fit, minmax(240px, 1fr))` 的弹性网格
- `gp-metric` / `gp-metric__label/value/hint`：统计卡（设计 token：value 24px 粗体）
- `gp-input-card` / `gp-toggle` / `gp-step-pill` / `gp-step-eyebrow` / `gp-step-title` / `gp-step-desc` / `gp-collapse`
- `gp-stepper` / `gp-stepper-btn` / `gp-stepper-value`：共享步进器（市场和决策卡通用）

但每个 Panel 又自定义了 `factory-action-card`、`domestic-action-card`、`government-action-card`、`military-action-card`——四套几乎一模一样的卡片样式（对比 `FactoryPanel.css:49-67` 与 `MilitaryPanel.css:273-291` 与 `GovernmentPanel.css:81-104`：底色、border、selected/disabled 修饰符全部重复定义）。这是 CSS 上最大的 DRY 漏洞。

### A.3 数据流关系（用于 Section C 设计跨面板系统）

| 资源池 | 由谁消费（draft 字段） | 上限 | UI 当前显示位置 |
|---|---|---|---|
| `budgetPools.factory` | `factoryPlan.expansionOrders/upgradeOrders/newFactoryOrders/productionOrders` | workspace.budgetPools.factory | sidebar resourceStrip + `factory-panel__budget` |
| `budgetPools.domesticMarket` | `domesticMarketPlan.domesticMarketActions` | workspace.budgetPools.domesticMarket | sidebar resourceStrip + `domestic-panel__budget` + `domestic-stats` 第一格 |
| `budgetPools.governmentFiscal` | `governmentPlan.pointPurchases` + `governmentPlan.strategySelections` + `militaryPlan.militaryActions` + `militaryPlan.diplomacyActions` + `militaryPlan.unlockColonization` + `conquestActions.artillery × 16` | workspace.budgetPools.governmentFiscal | sidebar resourceStrip + `government-panel__budget` + `military-panel__budget` （**同一个数字三处显示**） |
| `militaryPoints` | `conquestActions.infantry × 10` + 殖民执行 (`militaryPointCost`) | workspace.militaryPoints | `military-stats` |
| `techPoints`（计算预览） | `governmentPlan.pointPurchases`（购买）+ `governmentPlan.strategySelections`（消耗） | computed via `calculateGovernmentPointPreview` | `talent-tree__budget` |
| 行政力 (administrationCapacity) | `governmentPlan.adminPurchases` + `reforms` + 政策维护 | workspace.governmentReforms.administrationCapacity | `government-stats` |
| 原材料 (rawMaterials) | `phase1Production.rawMaterialAssignments` | workspace.phase1Economy.rawMaterials | `phase1-panel__summary` |
| 商品库存 (goodsInventory) | （消费阶段）`phase1Market.domesticAllocation/externalAllocations` | workspace.phase1Economy.goodsInventory | `phase1-panel__summary` |

**关键洞察**：`governmentFiscal` 是 6 类不同支出的共享池，`techPoints` 是研究院与天赋树的桥梁，`军事点` 是军事面板内部资源——这三条横向关系是当前最缺的信息。

### A.4 测试约束（实施时不能破坏的契约）

来自 `GamePhasePanelContent.test.tsx`、`MilitaryPanel.test.tsx`、`GamePage.test.tsx`：

- **保留 testid**：`decision-workbench`、`decision-step-tabs`、`decision-step-tab-{factory|domestic|government|military|research}`、`factory-panel`、`domestic-panel`、`government-panel`、`military-panel`、`phase1-production-panel`、`phase1-market-panel`
- **保留可访问名**：`getByRole("button", { name: "下一步：国民消费" })` 等"上一步/下一步"按钮文案
- **保留具体文本**：`"工厂预算 15"`、`"🏭 工业区"`、`"中东 已建交"`、`"橡胶·棉花·矿产"`、`"🔒 需先解锁殖民 + 建立外交关系 + 3军事点"` 等具体出现的字符串
- **保留 aria-pressed 行为**：tab 激活态
- **可改 CSS 类名**：测试不依赖 `factory-action-card` 等类名

---

## B. 提议的整体布局架构

### B.1 北极星原则

1. **一处显示规则**：每个数字（特别是预算池）在同一时刻只在 UI 上的一个权威位置显示完整版；其它位置最多显示 delta 或上下文化版本（"花费 X / 剩余 Y"）。
2. **二分布局优先**：除非内容天然是地理/二维的，所有面板默认采用 ResearchPanel 风格的「左 info / 右 actions」二分。
3. **地理优先**：MilitaryPanel 中的海洋节点、海外区域、殖民目标必须能放回地图上（叠加在 country map 之上），而不是变成卡片网格。
4. **横向用足**：弹出 modal 当前是 `min(90%, 860px)`（见 `game-map-canvas__inline`）——这条限制要先放宽（详见 E.1），让面板有足够横向空间。
5. **跨面板可见性**：政府 + 军事共用的 `governmentFiscal` 必须在两个面板里都看到「来自 X 的本轮花费 / 还剩 Y」，而不是各自显示一个总数。

### B.2 整体 wireframe（决策阶段 Modal 内）

打开任一建筑后，Modal 内容从上到下：

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚙️ Cross-Panel Resource Bar  (NEW — 永远在 modal 顶部)             │  ← 见 C.1
│  [国内 12/40] [工厂 8/30] [政府 24/60: -gov 8 / -mil 4] [科技 6 ▲2]│
├─────────────────────────────────────────────────────────────────────┤
│ 🏛 议会厅       决策步骤 1 / 5                              [✓ 已决策]│  ← 复用 gp-step-header
│ DecisionStepTabs (现有)                                              │
├──────────────────────┬──────────────────────────────────────────────┤
│  LEFT — INFO/STATUS  │  RIGHT — ACTIONS / SELECTION                  │
│                      │                                                │
│  [核心指标，玩家必须  │  [本面板可执行的操作，按子分类滚动]            │
│   持续盯着的内容]     │                                                │
│                      │                                                │
│  ResearchPanel 已经   │  e.g. GovernmentPanel：[改革三路并列]         │
│  天然是这种结构      │                                                │
├─────────────────────────────────────────────────────────────────────┤
│ DecisionStepFooter (上一步 / 下一步) — 不变                           │
└─────────────────────────────────────────────────────────────────────┘
```

例外：MilitaryPanel 因为含地理内容，转向「**地图 overlay**」布局（见 D.4）。

### B.3 三种核心布局模式

重构后所有面板使用其中之一：

1. **Binary Split（默认）** — `[info column 38% | actions column 62%]`
   - 适用：FactoryPanel、DomesticPanel、GovernmentPanel、ResearchPanel、TalentTreePanel
2. **Map Overlay** — 国家地图作为背景，行动作为可点击的 hotspot 与 tooltip
   - 适用：MilitaryPanel（海洋节点 + 海外区域 + 殖民）
3. **Three-Column Compare** — 用于改革三路径的横向对比（B.2 中标注的 GovernmentPanel 内部模式）
   - 适用：GovernmentPanel 改革段、TalentTreePanel branch overview

---

## C. 跨面板系统（Cross-Cutting）

### C.1 决议中的 `<DecisionResourceBar />`（新组件）

**目标**：让玩家在任何一个 Panel 里都能看到三池现况、看到本面板正在花的钱来自哪个池、看到与其他面板的"借方"。

**位置**：`frontend/src/components/game/panels/DecisionResourceBar.tsx`（新建）

**渲染时机**：放在 `DecisionWorkbench` 的 `DecisionStepTabs` 上方（见 `GamePhasePanelContent.tsx:191`），永远显示，不随 tab 切换隐藏。

**Props**:
```ts
type DecisionResourceBarProps = {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  activeStep: DecisionStepId;        // 当前面板用于高亮
};
```

**视觉规格（每个 chip 内部）**:
```
┌────────────────────────────────────────────────┐
│ 政府财政                              60        │  ← label + total
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░  剩余 24             │  ← progress bar
│ 政府支出 8 · 军事支出 28                        │  ← cross-panel breakdown
│ ↑ 当前面板（高亮）                              │  ← only on the active pool
└────────────────────────────────────────────────┘
```

总共 4 个 chip：
- **国内消费市场**：来源 = `domesticMarketPlan` 的开销
- **工厂**：来源 = `factoryPlan` 各 orders 的开销
- **政府财政**：必须**展开为 `政府支出 X · 军事支出 Y`**（两行 / 两标签），让玩家看到 GovernmentPanel + MilitaryPanel 是同一个池子的两个消费方
- **科技点（preview）**：使用 `calculateGovernmentPointPreview(workspace, draft).techPoints`，让 ResearchPanel/TalentTreePanel 可见科技点变动

**计算复用**：`calculateDecisionSpendSummary(workspace, draft)` 返回 `factorySpend / domesticSpend / governmentSpend`——但 `governmentSpend` 当前是政府 + 军事 + 殖民 + 研究的合计。需要在 `decisionShared.ts` 增加一个 `calculateGovernmentSpendBreakdown` 函数（保持 `calculateDecisionSpendSummary` 现有签名不变以兼容其它消费者），返回：
```ts
type GovernmentSpendBreakdown = {
  total: number;
  government: number;        // governmentPlan.pointPurchases + strategySelections + adminPurchases × adminCost
  military: number;          // militaryActions + diplomacyActions + unlockColonization + conquestArtillery
};
```

**高亮规则**：当前 `activeStep` 命中 chip 时，加 `decision-resource-bar__chip--active`（金色 border）。GovernmentPanel/MilitaryPanel 都会高亮"政府财政" chip，但下方破碎只对当前面板的部分加 `--current`。

**对侧栏的影响**：`GameSituationSummary` 的 `resourceStrip` 与新 bar 信息重叠。处理方式：**保留 sidebar 的 resourceStrip**（它在 modal 关闭、市场阶段、结算阶段都会显示），但在 modal 打开时给 modal 内的 ResourceBar 一个更详细的版本（带破碎），sidebar 保持总览。这样不会引入回归。

### C.2 修改 `DecisionStepTabs` —— 引入 6 个步骤、显示 review state

在 tab 上添加状态徽章（`unreviewed/checked/no_op/needs_recheck`），并将 talent 提升为正式 tab：

```
[🏭 工厂决策][🏛 国民消费][⚖️ 政府政策][⚔️ 军事要塞][🔬 研究院][🌳 天赋树]
              ✓ 已决策     ! 已修改                   未决策
```

`DECISION_STEP_ORDER` 在 `decisionFlow.ts:12` 改为 `["factory", "domestic", "government", "military", "research", "talent"]`，新增 `talent` 的 review state。

**对 `useMapViewState.ts` 的连锁影响**：地图上加第 6 个建筑大头针（"天赋树"）；或者将 talent 折叠为研究院的子区段（见 D.5/D.6）。

> 推荐方案：合并到研究院（D.5/D.6 详细讨论，理由：保持地图上"5 区"现状即可）。如果合并，`DECISION_STEP_ORDER` 不变，但 ResearchPanel 内部需要加一个 sub-tab 切换 chains/talents。

### C.3 共享卡片组件 `<DecisionActionCard />`（新组件）

**目标**：消除 `factory-action-card`、`domestic-action-card`、`government-action-card`、`military-action-card` 四套几乎相同的样式。

**位置**：`frontend/src/components/game/panels/shared/DecisionActionCard.tsx`（新建）+ 同名 CSS。

**Props**:
```ts
type DecisionActionCardProps = {
  icon?: string | ReactNode;
  title: string;
  costLabel?: string;            // e.g. "💰 12 预算"
  description?: string;
  effects?: EffectMetric[];      // reuse buildEffectMetrics
  warning?: string;              // e.g. "⚠️ 触发革命"
  status: "available" | "selected" | "disabled" | "danger" | "done";
  statusText?: string;           // e.g. "✓ 已部署"
  control: 
    | { kind: "stepper"; value: number; min?: number; max: number; onChange: (n: number) => void }
    | { kind: "toggle"; checked: boolean; onChange: (v: boolean) => void; label: string }
    | { kind: "confirm-cancel"; isSelected: boolean; isDisabled: boolean; onConfirm: () => void; onCancel: () => void; confirmLabel?: string };
  testId?: string;
};
```

CSS 类名：`.dac` / `.dac--selected` / `.dac--disabled` / `.dac--danger` / `.dac__head` / `.dac__cost` / `.dac__desc` / `.dac__effects` / `.dac__effect-tag` / `.dac__footer` / `.dac__status` / `.dac__btn` / `.dac__btn--active`...（全部新增到 styles.css 的 gp-* 区块下面，作为 gp-* 的姊妹命名空间）。

**迁移策略**：先实现 `<DecisionActionCard />` 与 CSS，再在每个 Panel 中**逐张卡片替换**（详见 E.5）。**测试不会破**因为测试匹配的是文本和 testid，不是类名。

**注意一个边界情况**：MilitaryPanel 的殖民卡片包含独立度进度条、驻军、资源掠夺按钮等内嵌元素——这部分作为 `children` 透传，不强行塞进 props。

### C.4 共享 stat strip 组件 `<DecisionStatStrip />`

四个面板都有"4 格统计 stat 行"（行政力、改革数、激活政策…），各自重写一套（`military-stats` / `government-stats` / `domestic-stats` / `phase1-panel__summary`）。

**新组件**：`frontend/src/components/game/panels/shared/DecisionStatStrip.tsx`，内部使用现有的 `gp-metric` 类。

```ts
type StatItem = {
  icon?: string;
  value: string | number;
  label: string;
  tone?: "default" | "warning" | "critical";
};
type DecisionStatStripProps = { items: StatItem[]; testId?: string };
```

迁移：每个 Panel 把 `xxx-stats` 替换为 `<DecisionStatStrip items={…} />`。

---

## D. 各面板重设计

> **共同规则**：
> - 每个 Panel 删除自己的 `xxx-panel__header` + `xxx-panel__budget` 徽章（C.1 ResourceBar 已统一显示）
> - 每个 Panel 的 stat 行改用 `<DecisionStatStrip />`
> - 每个 Panel 的卡片改用 `<DecisionActionCard />`
> - 保留所有现有 `data-testid` 与已被测试断言的文本

### D.1 FactoryPanel —— Binary Split（生产 + 建设）

**当前**：`factory-panel__header` + 嵌套 `Phase1ProductionPanel` + 「建设与升级」垂直堆。

**新结构**：
```
┌─────────────────────────────────────────────────────────────┐
│ <DecisionStatStrip>                                          │
│  [原材料 12/40] [库存 25] [投资池 18] [总产能 48]            │
├──────────────────────────┬──────────────────────────────────┤
│  生产分配（左 38%）        │  建设 / 升级 / 新建工厂（右 62%）  │
│  Phase1 5 个生产模式       │  expansion + upgrade + new      │
│  竖向 stack of stepper    │  factory 的统一卡片网格           │
│                          │  使用 <DecisionActionCard>        │
│  + 总产出预览 sticky 底     │                                 │
└──────────────────────────┴──────────────────────────────────┘
```

**信息层级变化**：
- 删除 `factory-panel__header`（重复显示工厂预算）
- `Phase1ProductionPanel` 的 `phase1-panel__summary` 提升到顶层 `<DecisionStatStrip />`
- 生产模式列表从「`auto-fill minmax(200px, 1fr)` 网格」改为左列 vertical stack，因为 5 个模式天然可竖排，且左列比单行更易于扫描"哪些已分配"
- 建设选项从「2 列网格」继续保持，但右列宽度更充裕

**CSS**：
- 新增 `.factory-panel--v2` 顶层 grid `grid-template-columns: 38fr 62fr; gap: 22px;`
- 保留 `factory-panel` testid 一致

**保留测试断言**：`getByTestId("factory-panel")`、`getByTestId("phase1-production-panel")`、`getByText("🏭 工业区")`（**这点要保留**——把 "🏭 工业区" 作为 Binary Split 左侧的 `gp-step-eyebrow`/title）。`getByText("工厂预算 15")` 必须保留——把它放进新 ResourceBar 里的工厂 chip 的 expanded breakdown，但更稳妥的做法是在 FactoryPanel 内保留一个 visually-hidden span 或者把"工厂预算 15"改写到 stat strip 第一格的 hint。**实施时与测试同步更新**（详见 F.4）。

### D.2 DomesticPanel —— Binary Split（民生政策双列）

**当前**：单列 6 张民生政策卡。

**新结构**：
```
┌─────────────────────────────────────────────────────────────┐
│ <DecisionStatStrip>                                          │
│  [本回合需求 X] [本回合供给 Y] [国内购买力 Z] [已选动作 N]    │
├──────────────────────────┬──────────────────────────────────┤
│  本面板影响 (左 38%)       │  民生政策 (右 62%)               │
│                          │                                  │
│  - 国内市场动态 mini chart │  <DecisionActionCard> grid       │
│    （needs/supply/price）  │  2 列                            │
│  - 已选动作叠加效果总览    │                                  │
│  - 经济警示（如供过于求）  │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

**新增信息**（不改数据模型，只是重新展示已有 `workspace.phase1Economy` 字段）：
- `equilibriumPrice`、`domesticDemand`、`domesticPricePreview`、`consumptionPool` 全部已经在 workspace 里——左侧聚合显示
- 已选动作的累计效果用 `buildEffectMetrics` 已有逻辑

**CSS**：复用 `gp-grid` 给右侧（auto-fit minmax(240, 1fr)），左侧使用 `gp-card` + `gp-metric`。新增 `.domestic-panel--v2` 二分容器。

### D.3 GovernmentPanel —— Binary Split + Three-Column Compare

GovernmentPanel 是当前最长、信息密度最不合理的面板。重构后分为三段：

**段 1：行政力 + 思潮信号**（顶部 stat strip + ideology bar）
```
[行政力 12/15] [本轮剩余 8] [完成改革 2] [现行政策 3]
[🗽 自由 5/10 ▓▓▓▓▓░░░░░] [⚖️ 平等 3/10] [🛡 民族 7/10 ▲]
```
ideology 进度条横向并列，其中 ≥`revolutionThreshold` 的格子用 `--critical` 高亮。复用 `government-stat--critical` 颜色规则。

**段 2：改革三路径 (Three-Column Compare)**（核心改动，对应用户建议「research 院的二分法」+ 横向比较）
```
┌────────────────┬────────────────┬────────────────┐
│ 🗽 自由之路     │ ⚖️ 平等之路     │ 🛡 民族之路     │
│ ─────────────  │ ─────────────  │ ─────────────  │
│ □ 工业革命     │ □ 工人保障     │ □ 国有化       │
│   行政 4       │   行政 3       │   行政 5       │
│   ⚠️ 革命警告  │                │                │
│ □ 自由贸易     │ □ ...          │ □ ...          │
└────────────────┴────────────────┴────────────────┘
```
玩家可在三个路径中横向扫视、做权衡。每张卡使用 `<DecisionActionCard variant="reform">`（增加 `path` 与 `wouldTriggerRevolution` 数据展示）。

CSS：`.gov-reform-tracks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }`；窄屏 ≤900px 时降级为 1 列。

**段 3：政策 + 行政力购买 + 本回合策略**（剩余三类放在 Binary Split）
```
┌──────────────────────────┬──────────────────────────────────┐
│  现行政策（左）            │  可激活政策 + 行政力购买 + 策略   │
│  状态总览                 │  （右）                          │
│                          │                                  │
│  - 已激活 N 项             │  <DecisionActionCard> grid 2 col │
│  - 维护成本预警            │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

**保留测试断言**：`getByTestId("government-panel")`、`getByText("🏛️ 议会大厅")`、改革革命警告的 `data-testid="reform-revolution-warning-${reformId}"`、`data-testid="ideology-${key}"`。

### D.4 MilitaryPanel —— Map Overlay（最大改动）

**核心理念**：海洋节点 / 海外区域 / 殖民目标都是地理实体，应该叠加在背景地图上而不是塞进卡片网格。

**新结构**：
```
┌─────────────────────────────────────────────────────────────┐
│ <DecisionStatStrip>                                          │
│  [军事点 6] [舰队 4] [海外承接 8] [建交 2 区]                 │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │  /images/world-map.png（新资源）作为背景               │  │  ← Map Overlay
│  │                                                        │  │
│  │  [🌊 北大西洋]      [🌊 印度洋]      [🌊 太平洋]      │  │
│  │   2/4 (己方)         1/4 ⚠️被法封锁    0/4              │  │
│  │                                                        │  │
│  │  [🦁 非洲 🔒外交]   [🕌 中东 ✅已建交]  [🏯 亚太]      │  │
│  │   要求外交+军事点    可殖民                             │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│  点击任一节点/区域 → 右侧抽屉打开「该节点的部署/建交/殖民动作」│
├─────────────────────────────────────────────────────────────┤
│  军事行动（陆军 / 海军 / 兵种征募）—— Binary Split 网格       │
│  这部分不是地理性的，保持卡片网格                              │
└─────────────────────────────────────────────────────────────┘
```

**实现关键**：
- 复用 `MapBuilding` 组件（`frontend/src/components/game/map/MapBuilding.tsx`）的 pin 模式，新增"海洋节点"和"区域"两种 pin 变体
- 新建 `<MilitaryWorldMap />` 组件位于 `frontend/src/components/game/panels/military/MilitaryWorldMap.tsx`，接受 `oceanNodes` + `regionAccessStatus` + `colonizationOptions` 三类数据
- 点击节点弹出 `<MilitaryNodeDrawer />`（侧滑或 popover），内部使用 `<DecisionActionCard />` 显示部署/夺控/建交/殖民等动作
- 当前的 `military-ocean-nodes` grid + `military-regions` grid + 殖民目标 grid 全部退役（合并入 map overlay）
- 保留 `military-action-card` 的"军事行动"段（`recruit_infantry / train_artillery / naval_drill`）作为底部 Binary Split—— 这些不是地理操作

**世界地图资源**：当前只有 5 张国家地图（uk/france/prussia/austria/russia），没有世界地图。**需要新增 `/public/images/world-map.png`**（或重用现有国家地图作为占位，标注 TODO）。如果资源不可得，先用 SVG/CSS 模拟「彩色区域分块」也可以。

**保留测试断言**：
- `getByTestId("military-panel")`（外层）
- `getByText("🔒 需先解锁殖民 + 建立外交关系 + 3军事点")`、`getByText("🔒 需先解锁殖民 + 3军事点")`：**必须放在新的 region popover 里，文本保持完全一致**
- `getByText("橡胶·棉花·矿产")`：保留区域 tooltip
- `getByText("中东 已建交")`：保留 region label
- `data-testid="ocean-node-${nodeId}"`：保留
- `data-testid="conquest-${option.regionId}"`：保留（在 region drawer 内部）
- `screen.queryByRole("button", { name: "与中东建交" })` 仍然不应该出现（已建交时）

**风险标注**：这是 6 个面板里改动最大、回归风险最高的一个。建议在 E.6 单独处理。

### D.5 ResearchPanel —— Binary Split（科技链 + 当前进度）

**当前**：3 条 chain 单列堆叠。

**新结构**：
```
┌─────────────────────────────────────────────────────────────┐
│ <DecisionStatStrip>                                          │
│  [研究设施 3] [本回合进度 +9] [当前研究 蒸汽机] [科技点 6]    │
├──────────────────────────┬──────────────────────────────────┤
│  当前研究状态 (左)        │  三条科技链 (右)                  │
│                          │                                  │
│  - 当前 active tech       │  使用 tabs（[chain1][chain2][3]）│
│  - 进度条 + ETA          │  或 Three-Column Compare         │
│  - 维护成本（设施数 ×    │                                  │
│    facilityCost 财政）    │  每条链内部仍然是 ResearchPanel  │
│                          │  现有的 `research-panel__tech`   │
│                          │  二分行                          │
└──────────────────────────┴──────────────────────────────────┘
```

**子 tab 引入天赋树（推荐方案）**：
```
[🔬 科技研究][🌳 天赋树]    ← 在 ResearchPanel 内部
```
点击「天赋树」切换到 `<TalentTreePanel />` 的内容（已存在的组件直接复用），这样不动 `DECISION_STEP_ORDER`、不动 useMapViewState 的 5 个建筑布局，但终于让天赋树可达。

实现位置：`ResearchPanel` 内部加 `useState<"tech" | "talent">`，或把 active sub-tab 提升到 `decisionFlowState.activeResearchView`（需要扩展 `DecisionFlowState`）。**推荐后者**——其它 dirty marker / review state 也能复用。

### D.6 TalentTreePanel —— Binary Split（分支选择 + 节点详情）

**当前**：BranchGrid → BranchDetail 二阶切换（先选分支，再看节点链）。

**新结构（在 ResearchPanel 子 tab 内）**：
```
┌──────────────────────────┬──────────────────────────────────┐
│  4 个分支 column 卡 (左)   │  当前分支节点链 (右)              │
│  - ⚒️ 工业  3/5 ━━━━━━░░│                                  │
│  - 🏘️ 民生  1/5 ━━░░░░░░│   <talent-node> 链表               │
│  - 🏛️ 政府  0/5 ░░░░░░░░│   带前置箭头连线                  │
│  - ⚔️ 军事  2/5 ━━━━░░░░│                                  │
│  点击切换 active branch  │   每个节点：                      │
│                          │   - 名称 + cost                  │
│                          │   - 永久效果 tags                │
│                          │   - 锁/可解锁/已选状态            │
└──────────────────────────┴──────────────────────────────────┘
```

不再使用 `BranchGrid` → `BranchDetail` 的两阶切换，而是左右**始终**同时显示 4 个分支与当前分支节点链。这样玩家可以横向比较 4 个分支的进度。

**保留测试断言**：目前 talent panel 没有专门的测试（因为是死代码），重构后不需要额外约束。

---

## E. 实施计划（有序）

> 每一步都是可独立验证、可独立提交的；建议每完成一步就跑一次测试 + 手动浏览验证。

### E.1 先决：放宽 modal 宽度
**文件**：`frontend/src/components/game/map/GameMap.css:252-261`
- 把 `width: min(90%, 860px)` 改为 `min(96%, 1280px)`
- 把 `max-height: 80vh` 保留，但内部允许滚动
- 验证：所有 panel 在 modal 中不溢出，测试不破

### E.2 提取共享组件 + 新增 ResourceBar
1. 创建 `panels/shared/DecisionStatStrip.tsx` + `.css`
2. 创建 `panels/shared/DecisionActionCard.tsx` + `.css`，导出 `DecisionActionCard` 与 `DecisionActionCardChildren`
3. 在 `decisionShared.ts` 增加 `calculateGovernmentSpendBreakdown(workspace, draft): GovernmentSpendBreakdown` 函数（带单元测试）
4. 创建 `panels/DecisionResourceBar.tsx` + `.css`，使用 (3) 计算 government 拆分
5. 在 `GamePhasePanelContent.tsx:191` 之上插入 `<DecisionResourceBar workspace={workspace} draft={draft} activeStep={activeStep} />`
6. 验证：现有 panel 不变，但 modal 顶部多了一条信息带；测试不破（没有任何测试断言新 bar 之外的元素）

### E.3 各 Panel 用 `<DecisionStatStrip />` 替换 stat 行
按顺序：
1. `DomesticPanel` — `domestic-stats` 替换；删除 header `domestic-panel__budget`
2. `GovernmentPanel` — `government-stats` 替换；删除 header `government-panel__budget`；ideology 行单独留 (D.3)
3. `MilitaryPanel` — `military-stats` 替换；删除 `military-panel__budget`
4. `Phase1ProductionPanel` — `phase1-panel__summary` 替换
5. `FactoryPanel` — header 工厂预算徽章删除
6. `ResearchPanel` — `research-panel__header` 三行的内容合并为一个 stat strip

每完成一步：跑 `pnpm test`，确认所有测试通过。

### E.4 各 Panel 引入 Binary Split 容器
1. `FactoryPanel` 顶层加 `factory-panel--v2` 二分（左 = Phase1ProductionPanel，右 = 建设/升级/新建工厂）
2. `DomesticPanel` 顶层加 `domestic-panel--v2` 二分（左 = 经济信息聚合，右 = 现有动作网格）
3. `GovernmentPanel` 段 3 用 `gov-policy-split`；段 2 改革用 `gov-reform-tracks` 三列
4. `ResearchPanel` 顶层加 `research-panel--v2` 二分（左 = 当前研究状态，右 = chain tabs）

### E.5 用 `<DecisionActionCard />` 替换四套自定义卡片
按面板顺序逐张迁移（每个 commit 一个面板）：
1. DomesticPanel（最简单，6 张卡）
2. FactoryPanel 建设卡（保留 Phase1ProductionPanel 内卡片不动——它们是 stepper 模式，可以晚迁移）
3. GovernmentPanel 政策卡 + 策略卡
4. GovernmentPanel 改革卡（最复杂，含革命警告 + 路径标识 children）
5. MilitaryPanel 陆军/海军/外交卡（保留军事段为卡片）

每张卡迁移后确认 `getByText / getByRole` 类的测试仍通过。**类名变了不影响测试**——这是 testid + role + text 选择器的优势。

### E.6 MilitaryPanel 地图 overlay 改造（独立 PR）
1. 新增 `panels/military/MilitaryWorldMap.tsx` + `panels/military/MilitaryNodeDrawer.tsx` + CSS
2. 准备世界地图占位资源（`/public/images/world-map-placeholder.png` 或 SVG）
3. 把现有 `military-ocean-nodes` / `military-regions` / `military-action-card` (殖民目标段) 全部从 MilitaryPanel.tsx 移走，由 `MilitaryWorldMap` 渲染
4. 保留底部「军事行动 / 外交行动」卡片网格作为 D.4 段尾的 Binary Split
5. **重点**：保留所有具体文本断言："🔒 需先解锁殖民 + 建立外交关系 + 3军事点"、"中东 已建交"、"橡胶·棉花·矿产"

### E.7 ResearchPanel 内部子 tab + 引入 TalentTreePanel
1. 扩展 `DecisionFlowState`，加 `activeResearchView: "tech" | "talent"`
2. ResearchPanel 顶部加 sub-tab strip
3. 当 `activeResearchView === "talent"` 时渲染 `<TalentTreePanel />`
4. 移除 `GamePhasePanelContent.tsx:267` 的 `else` 分支（死代码清理）
5. 验证测试中点击「研究院」tab 仍然默认显示科技链（行为兼容）

### E.8 优化与清理
1. 删除每个面板 CSS 文件中废弃的类名：`factory-action-card*`、`domestic-action-card*`、`government-action-card*`、`military-action-card*`（保留必要的 children 样式如殖民地的进度条）
2. 删除每个面板的 `xxx-panel__header` 样式
3. 把通用类提到 styles.css 里，按 `dac-*` 命名空间归档
4. 跑一次 `pnpm test` + `pnpm build` 确认零破坏

### E.9 视觉验证
跑 dev server，用 5 个国家分别打开决策阶段：
- ResourceBar 顶部三池显示正确，government chip 显示拆分
- 切 Tab 时 ResourceBar 高亮当前面板
- 工厂 / 国民 / 政府 / 研究院的二分布局横向用足
- 改革三路径横向并列
- 军事面板地图 overlay 正确渲染节点 + 区域
- ResearchPanel 内部子 tab 切换天赋树

---

## F. 组件重构策略（Keep / Modify / Rewrite）

| 组件 | 处理 | 原因 |
|---|---|---|
| `GamePhasePanelContent.tsx` | **Modify** —— 仅在 DecisionWorkbench 顶部插入 `<DecisionResourceBar />`，删除 `:267` 死分支 | 它是路由分发器，结构稳定；导出多个组件被 GamePage 直接 import |
| `DecisionStepTabs.tsx` | **Keep** | 当前简洁，testid 与文本契约太多直接改动风险大；如要加 review 徽章，做小幅 patch |
| `factory/FactoryPanel.tsx` | **Modify** —— 改为 binary-split 容器，内部子组件不动 | Phase1ProductionPanel 的卡片复杂度高，独立改动 |
| `factory/Phase1ProductionPanel.tsx` | **Keep**（仅 stat 行替换为 `DecisionStatStrip`） | 内部 stepper 模式专用，不通用化 |
| `DomesticPanel.tsx` | **Rewrite**（小，只 107 行） | binary split + DecisionActionCard 替换简单；最适合先做 |
| `GovernmentPanel.tsx` | **Modify**（重构，但 keep 文件） | 体量大（558 行），分段改动，每段一个 commit |
| `MilitaryPanel.tsx` | **Modify**（大手术） | 体量最大（625 行），地理段抽到 `MilitaryWorldMap` 子组件 |
| `ResearchPanel.tsx` | **Modify** —— 加 binary split + 子 tab | 现有结构最接近目标，改动最小 |
| `TalentTreePanel.tsx` | **Modify**（解掉两阶切换，做成 binary split） | 复用现有 BranchDetail 渲染逻辑，仅改容器 |
| `Phase1MarketPanel.tsx` | **Keep** | Market 阶段，不在本次重构范围 |
| `DecisionCommandDeck.tsx` | **Keep**（仅在 DecisionCardDemoPage 使用） | 本次不动；它是另一个尚未集成的概念原型，不要相互干扰 |
| **新建**: `DecisionResourceBar.tsx` | New | 跨面板资源可见性 |
| **新建**: `shared/DecisionActionCard.tsx` | New | DRY 四套卡片 |
| **新建**: `shared/DecisionStatStrip.tsx` | New | DRY 四套 stat 行 |
| **新建**: `military/MilitaryWorldMap.tsx` | New | 地图 overlay 容器 |
| **新建**: `military/MilitaryNodeDrawer.tsx` | New | 节点 popover |

**测试不破策略**：
- 不改 `data-testid`
- 不改测试已断言的文本（"🏭 工业区"、"工厂预算 15"、各 lock reason 字符串）
- 不改 `aria-pressed` / `aria-label` 行为
- 改 CSS 类名时跑测试确认零回归（测试不依赖类名，但 styled-test 偶有例外，扫一遍）

---

## G. 风险与约束

### G.1 测试回归风险
- **GamePhasePanelContent.test.tsx** 含约 15+ 个文本断言。每次迁移后必须跑测试。
- **MilitaryPanel.test.tsx** 含 4 个具体 lock reason 字符串，**地图 overlay 改造时这些字符串必须出现在节点 drawer 里**——不能改文案。
- **GamePage.test.tsx** 检查 sidebar 与 modal 协同；改动 sidebar resourceStrip 显示逻辑时小心。

### G.2 视觉回归
- 当前 modal 宽度 860px，放宽到 1280px 可能在小笔记本（13" MBP, 1280×800 实际可用 ~1100）露出贴边。CSS 用 `min(96%, 1280px)` 避免。
- 三列改革对比在 ≤900px 视口降级为单列（match `@media (max-width: 900px)` 既有断点 `GameMap.css:265`）。
- 黑暗主题色板（`--color-bg-top` / `--color-accent`）在重构中务必复用 CSS 变量，不要硬编码颜色。

### G.3 Modal vs Inline 模式
当前 GamePage 的设计是地图建筑 → modal 弹出。如果未来切换到「inline 在地图右侧持续显示决策面板」，本次重构的 binary split 设计依然适用——layout 不依赖 modal 容器。但**当前必须假设 modal 模式**。

### G.4 Talent Tree 集成方案
两条路：
1. **作为 ResearchPanel 子 tab**（推荐，本计划默认）：影响最小，地图建筑数不变，`DECISION_STEP_ORDER` 不变。
2. **作为第 6 个独立 tab + 第 6 个建筑**：需要新增 talent 建筑坐标到 5 个国家配置；`DECISION_STEP_ORDER` 加 `"talent"`；review state 多一个 key。

如选择方案 2，所有 `decisionFlow` 测试需要更新；`useMapViewState.ts:31-46` 的 `BuildingPositions` 类型也要扩展。**仅在产品方明确要求"天赋树是平级 step"时才采纳**。

### G.5 CSS 命名空间冲突
现有命名空间：
- `gp-*`：通用 game phase（保留）
- `factory-*` / `domestic-*` / `government-*` / `military-*` / `research-*` / `talent-*` / `phase1-*` / `phase1-market-*`：面板专用
- `decision-*`：tabs / footer
- `decision-command-deck-*`：DecisionCardDemo 专用，互不干扰

新增：
- `dac-*` (DecisionActionCard)
- `dss-*` (DecisionStatStrip)
- `drb-*` (DecisionResourceBar)

避免使用 `panel-*` 前缀（`.panel` 已用于全局通用容器，见 styles.css）。

### G.6 性能
- DecisionResourceBar 每次 draft 变更都重新 `calculateDecisionSpendSummary`——目前已经在每个面板里调用一次，再加一次成本可忽略；如果需要可在 `DecisionWorkbench` 提到 `useMemo` 顶层计算一次后透传。

### G.7 i18n / Locale
所有面板文案为简体中文 hardcoded。本次重构不引入 i18n，但保持文本与现有测试断言完全一致。

### G.8 不在范围
- 不改后端、不改 workspace 数据形状
- 不改 DecisionCommandDeck（独立的 demo 路径）
- 不改 Market / Settlement 阶段的布局
- 不改地图建筑坐标布局
- 不引入新的依赖（无 chart 库等）；如需 mini chart，CSS gradient 或简单 SVG 即可

---

## 附录：文件清单

### 将要新建
- `frontend/src/components/game/panels/DecisionResourceBar.tsx` + `.css`
- `frontend/src/components/game/panels/shared/DecisionActionCard.tsx` + `.css`
- `frontend/src/components/game/panels/shared/DecisionStatStrip.tsx` + `.css`
- `frontend/src/components/game/panels/military/MilitaryWorldMap.tsx` + `.css`
- `frontend/src/components/game/panels/military/MilitaryNodeDrawer.tsx` + `.css`
- `/public/images/world-map.png`（或 SVG 占位）

### 将要修改
- `frontend/src/components/game/panels/GamePhasePanelContent.tsx`（插入 ResourceBar、移除死分支）
- `frontend/src/components/game/panels/factory/FactoryPanel.tsx` + `.css`（binary split）
- `frontend/src/components/game/panels/factory/Phase1ProductionPanel.tsx`（仅 stat strip 替换）
- `frontend/src/components/game/panels/DomesticPanel.tsx` + `.css`（binary split + DecisionActionCard）
- `frontend/src/components/game/panels/GovernmentPanel.tsx` + `.css`（三段重构）
- `frontend/src/components/game/panels/MilitaryPanel.tsx` + `.css`（地图 overlay 改造）
- `frontend/src/components/game/panels/ResearchPanel.tsx` + `.css`（binary split + 子 tab）
- `frontend/src/components/game/panels/TalentTreePanel.tsx` + `.css`（binary split）
- `frontend/src/features/game/decisionShared.ts`（增加 `calculateGovernmentSpendBreakdown`）
- `frontend/src/features/game/flow/decisionFlow.ts`（如选择方案 1，扩展 `activeResearchView`）
- `frontend/src/components/game/map/GameMap.css`（modal 宽度放宽）
- `frontend/src/styles.css`（删除废弃类名，新增 dac/dss/drb 命名空间）

### 必须保持兼容
- 所有 `data-testid` 字符串
- 所有被测试断言的中文文本
- 所有 `aria-label` / `aria-pressed` 行为
- workspace / draft 数据形状
- `DecisionFlowState`（除非选择 G.4 方案 2）

---

**计划终。下一步**：用户确认后进入实施阶段，按 E.1 → E.9 顺序推进，每步独立提交并验证。
