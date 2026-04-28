# 生产与市场机制优化 · 实施计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
> **适用分支:** `feature/government-reforms-frontend`（当前分支）

**目标**：对齐用户原始需求的模块框架，由我们担任游戏策划完成数值设计与逻辑补缺，最终切掉旧路径。

**架构**：不改 `phase1_economy.py` 纯计算公式，只改配置 + 规则衔接 + 路径切换。所有改动集中在 `production.json`、`countries.json`、`global.json`、`decision.py`、`market.py`、`settlement.py`。

**设计原则**：框架不动（五种生产方式、投产比、需求系数、供需公式、5:3:2），数值我们自己定。

---

## 任务总览

```
阶段一：数值设计 · 配置层（纯数据，无逻辑改动）
├── Task 1：建厂/升级成本重设计
└── Task 2：原材料国别差异 + 基础收入归零

阶段二：逻辑补缺 · 规则层
├── Task 3：科技门槛锁生产方式
└── Task 4：海外市场独立定价

阶段三：路径清理 · 开关层
├── Task 5：前端默认走 Phase1 + 移除旧路径兜底
└── Task 6：全量测试回归
```

---

## 阶段一：数值设计（配置层）

### Task 1：建厂/升级成本重设计

**目标**：让成本在 15 回合游戏中形成有意义的取舍。

**设计决策**（游戏策划）：
- 新建成本：`20 / 40 / 60 / 80`（手工/机械/蒸汽/电气）
- 升级成本：`10 / 20 / 30 / 40`（严格半价，鼓励升级而非新建）
- 设计理由：初始工厂预算 ~12-14，手工业 20 ≈ 1.5 回合储蓄，电气化 80 ≈ 6-7 回合——需要玩家提前规划工业路线

**文件**：
- 修改：`backend/config/balance/production.json` — `newFactoryCosts` 和 `upgradeCosts`

**Step 1**：修改 `production.json`
```json
"newFactoryCosts": {
    "handicraft": 20,
    "mechanized": 40,
    "steam": 60,
    "electrified": 80
},
"upgradeCosts": {
    "mechanized": 20,
    "steam": 30,
    "electrified": 40
}
```

> 注意：`expansionCosts` 和 `newFactoryCosts` 是两个不同的字段。`expansionCosts` 用于旧路径（扩产），`newFactoryCosts` 用于 Phase1 路径（新建产能）。Task 1 只改 Phase1 路径用的 `newFactoryCosts`。

**Step 2**：检查 `_apply_phase1_production_plan` 确认它读取的是 `newFactoryCosts`
- 在 `decision.py` 第 109 行：`unit_cost = int(balance.production.new_factory_costs.get(mode, 0))` ✅ 正确

**Step 3**：检查 `_apply_phase1_production_plan` 的升级成本读取
- 在 `decision.py` 第 131 行：`unit_cost = int(balance.production.upgrade_costs.get(target_mode, 0))` ✅ 正确

**验证**：`pytest backend/tests/test_phase1_economy.py -q`（纯计算测试不涉及成本，但确保配置加载不报错）

---

### Task 2：原材料国别差异 + 基础收入归零

**目标**：五国原材料不再雷同，且取消市场保底让供需机制真正生效。

**设计决策**（游戏策划）：

| 国家 | 初始原材料 | 每回合增量 | 15回合合计 | 设计意图 |
|------|-----------|-----------|-----------|---------|
| 英国 | 35 | 21 | 329 | 殖民地优势，早期工业强 |
| 普鲁士 | 35 | 21 | 329 | 工业传统，与英国并列 |
| 法国 | 33 | 20 | 313 | 均衡型，中规中矩 |
| 奥地利 | 30 | 20 | 310 | 稳定军政，略低但政府效率补偿 |
| 俄罗斯 | 28 | 23 | 350 | 中后期积累型，长期最强 |

- 基础收入：`baseIncomePerRound: 0`（取消保底，不生产不卖货就没收入）
- 删除 `effective_income = max(base_income, national_income)` 中的 max 逻辑

**文件**：
- 修改：`backend/config/balance/countries.json` — 每国的 `initialRawMaterials`
- 修改：`backend/config/balance/global.json` — `rawMaterialsPerTurn: 0` → 改为按国家配置
- 修改：`backend/app/modules/rules/settlement.py` — 移除 `max(base_income, ...)` 保底

**问题**：当前 `rawMaterialsPerTurn` 在 `global.json` 是全局值（20），但我们需要按国家差异化。有两种做法：
- A. 在 `countries.json` 里加 `rawMaterialsPerTurn` 字段（推荐）
- B. 保持全局但按国家系数乘

**推荐 A**。需要在 `CountryBalanceConfig` 模型中加字段，并在 settlement 中按国家读取。

**详细步骤**：

**Step 1**：`countries.json` 每国加 `initialRawMaterials` 和 `rawMaterialsPerTurn`
- 已有 `initialRawMaterials` 字段（当前全是 30），改数值即可
- 新增 `rawMaterialsPerTurn` 字段

**Step 2**：`backend/config/balance/countries.json` 修改示例
```json
"britain": {
    "initialRawMaterials": 35,
    "rawMaterialsPerTurn": 21,
    ...
}
```

**Step 3**：配置模型 `backend/app/modules/balance_config/models.py`  
`CountryBalanceConfig` 加字段：
```python
raw_materials_per_turn: int = 20
```

**Step 4**：配置加载器 `loader.py` 读 `rawMaterialsPerTurn`

**Step 5**：`backend/app/modules/rules/settlement.py`  
- 移除 `max(base_income, national_income)` → 改为 `effective_income = int(player_state.national_income)`
- 原材料补充改为读 `country_config.raw_materials_per_turn`

**Step 6**：`backend/config/balance/global.json`  
- `baseIncomePerRound: 0`
- 删掉 `rawMaterialsPerTurn` 或保留为默认值

**验证**：
- `pytest backend/tests/ -q -k "phase1 or settlement"` 
- 确认五国初始化原材料值正确

---

## 阶段二：逻辑补缺（规则层）

### Task 3：科技门槛锁生产方式

**目标**：机械/蒸汽/电气三种高级生产方式必须解锁对应科技后才能建造或升级。

**设计决策**：
- 手工和空闲：无需科技，始终可用
- 机械：需要已解锁 `spinning_jenny`（珍妮纺纱机）
- 蒸汽：需要已解锁 `steam_engine`（瓦特蒸汽机）**且** `lathe`（车床）
- 电气：需要已解锁 `power_generation`（发电）**且** `internal_combustion`（内燃机）

**文件**：
- 修改：`backend/app/modules/rules/decision.py` — `_apply_phase1_production_plan`

**Step 1**：在 `_apply_phase1_production_plan` 的 buildOrders 循环中加科技检查

在第 107 行（`if mode not in DEFAULT_PHASE1_CAPACITY_BY_MODE`）之后插入：
```python
if mode not in DEFAULT_PHASE1_CAPACITY_BY_MODE or quantity <= 0:
    continue
# --- 新增：科技门槛检查 ---
if _phase1_mode_requires_tech(mode) and not _phase1_mode_tech_unlocked(mode, player_state):
    continue
# --- 新增结束 ---
unit_cost = int(balance.production.new_factory_costs.get(mode, 0))
```

**Step 2**：在 upgradeOrders 循环中加同样的科技检查（第 129 行之后）

**Step 3**：定义科技映射函数
```python
PHASE1_MODE_TECH_REQUIREMENTS = {
    "mechanized": ["spinning_jenny"],
    "steam": ["steam_engine", "lathe"],
    "electrified": ["power_generation", "internal_combustion"],
}

def _phase1_mode_requires_tech(mode: str) -> bool:
    return mode in PHASE1_MODE_TECH_REQUIREMENTS

def _phase1_mode_tech_unlocked(mode: str, player_state) -> bool:
    required = PHASE1_MODE_TECH_REQUIREMENTS.get(mode, [])
    return all(tech_id in player_state.unlocked_techs for tech_id in required)
```

**验证**：
- `pytest backend/tests/test_phase1_economy.py -q`（纯计算不受影响）
- 手动验证：未解锁科技时 buildOrders 被跳过

---

### Task 4：海外市场独立定价

**目标**：海外市场不再直接复用本国价格，而是有自己的价格体系。

**设计决策**（游戏策划）：
- 海外价格 = 本国均衡价格 × 区域倍率
- 用均衡价格而非最终价格——即不受本国供需波动影响，只看消费池和需求的基准值
- 设计理由：海外市场买家不关心你本国供过于求导致的降价，他们只看"这东西在正常市场值多少钱"

区域倍率：
| 区域 | 倍率 | 设计意图 |
|------|------|---------|
| 欧洲 | 0.9 | 成熟市场，竞争激烈 |
| 美洲 | 1.0 | 新兴市场，标准价 |
| 亚太 | 1.1 | 远洋贸易，高利润 |
| 非洲 | 1.2 | 殖民地市场，高回报 |
| 中东 | 1.2 | 战略要地，溢价 |

**文件**：
- 修改：`backend/config/balance/regions.json` — 每个 region 加 `priceMultiplier` 字段
- 修改：`backend/app/modules/rules/market.py` — `_apply_phase1_market` 海外价格计算

**Step 1**：`regions.json` 每区域加 `priceMultiplier`
```json
{
    "regionId": "europe",
    "priceMultiplier": 0.9,
    ...
}
```

**Step 2**：配置模型 `balance_config/models.py` — `RegionBlueprintConfig` 加 `price_multiplier: float = 1.0`

**Step 3**：`market.py` `_apply_phase1_market` 海外循环中，把 `final_price` 替换为：
```python
region_config = balance.regions.region_blueprints.get(region_id)
multiplier = float(region_config.price_multiplier) if region_config else 1.0
overseas_unit_price = int(Decimal(str(equilibrium_price)) * Decimal(str(multiplier)))
```

**验证**：
- `pytest backend/tests/ -q -k "phase1 or market"` 
- 确认海外价格 ≠ 本国 final_price

---

## 阶段三：路径清理（开关层）

### Task 5：前端默认走 Phase1 + 移除旧路径兜底

**目标**：全系统只走 Phase1 统一商品模型，删除旧 goodsId 路径的兜底逻辑。

**文件**：
- 修改：`backend/app/modules/rules/decision.py` — `resolve_decision_phase`
- 修改：`backend/app/modules/rules/market.py` — `resolve_market_phase`
- 修改：`backend/app/modules/rules/settlement.py` — `resolve_settlement_phase`

**Step 1**：`decision.py`  
移除 `if isinstance(phase1_production, dict)` 分支判断。当 `phase1Production` 不存在时，不再回退到 `_apply_factory_plan`。改为始终走 Phase1 路径（或对空 payload 做 no-op）。

**Step 2**：`market.py`  
同上，移除 `if isinstance(phase1_market, dict)` 分支，始终走 `_apply_phase1_market`。

**Step 3**：`settlement.py`  
移除 `_is_phase1_economy_active` 判断和 else 分支（旧 `_allocate_income`），始终走 `_allocate_income_phase1`。删除 `_mirror_phase1_economy_after_decision`（不再需要镜像旧状态）。

**Step 4**：清理不再使用的 imports 和函数
- `_apply_factory_plan` 可保留（未来可能复用），但不再作为默认路径
- `_mirror_phase1_economy_after_decision` 删除

**验证**：
- `pytest backend/tests/ -q` 全量
- 特别关注旧测试是否仍引用 legacy 路径

---

### Task 6：全量测试回归

**目标**：确保所有改动后 277 个测试全绿。

**命令**：
```bash
cd /Users/limou/Desktop/tomorrow_question
pytest backend/tests/ -q
```

**预期**：277 passed。

**如果出现失败**：按 test 文件逐个定位，优先修测试（因为逻辑改了），其次确认是否为预存问题。

---

## 执行顺序与依赖

```
Task 1 (成本) ──┐
                ├──→ Task 3 (科技门槛) ──→ Task 5 (切路径) ──→ Task 6 (回归)
Task 2 (原材料) ─┘       Task 4 (海外定价) ──┘
```

Task 1/2 可并行（只改配置）。Task 3/4 可并行（改不同文件）。Task 5 依赖 1-4 全部完成。Task 6 收尾。

---

## 设计备忘（不在本次范围）

以下内容属于用户原始需求但明确延后：
- 科研机构+突破机制（V2 科技树）
- 海军封锁影响贸易链路（V3 军事模块）
- 政治改革与分配比例的动态联动
- 海外市场独立供需（目前用均衡价格×倍率，属于简化版）
- 外部市场独立度与驻军互动
