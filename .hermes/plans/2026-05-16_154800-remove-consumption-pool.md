# 移除消费池，浓缩消费逻辑到政府决策

**状态**: ✅ 方案已确认，待执行  
**日期**: 2026-05-16  
**分支**: 本分支直接改动

---

## 确认的设计决策

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 均衡价格新公式 | **需求驱动**：`基础价格 = 固定基准价(3) + 需求增长加成`，供需再做浮动。工业化越深价格越高。 |
| 2 | 市场调节额度 | 固定值 **5**（当前开局约一半） |
| 3 | domesticMarket 池 | **保留字段，值冻结**。不参与收入分配、不花钱、不衰减。兼容历史存档。 |
| 4 | 增减消费税政策 | **改名**为"提高商业税/降低商业税"，在 **工厂预算 ↔ 政府财政** 之间挪 |
| 5 | 市民广场9个动作 | 全部并入政府决策面板，走政府财政支付 |
| 6 | 40% 衰减 | **删除** |
| 7 | 平等主义思潮 | 挂钩**国内销售总收入**（卖得多卖得贵 → 人民满意 → 平等主义下降） |
| 8 | 收入分配比例 | 保持默认 **3:3:4**（不做任何调整，按用户要求） |
| 9 | 科技树市民分支 | **不动** |

---

## 实施步骤

### Step 1: 后端 — 价格公式解耦 + 消费池冻结

| 文件 | 改什么 |
|------|--------|
| `backend/app/modules/rules/phase1_economy.py` | `calculate_equilibrium_price` 改为基于固定基准价 + 需求加成的公式；不再接受 consumption_pool 参数 |
| `backend/app/modules/rules/market.py` | `_apply_phase1_market` 去掉 consumption_pool 取值，改用固定基准价；`_mirror_phase1_market_metrics` 同样 |
| `backend/app/modules/rules/settlement.py` | 删除第48-51行 drain 逻辑；`_allocate_income_phase1` 改为只向 factory + governmentFiscal 分配（按 33:33 归一化，domesticMarket 固定得 0） |
| `backend/app/modules/game_state/budgeting.py` | `market_regulation_allowance` 返回固定值 5 |
| `backend/app/modules/game_state/workspaces.py` | `_build_phase1_market_preview` 中 `consumption_pool` 替换为固定基准价逻辑；`_settlement_phase1_economy` 中 `consumptionPool` 返回固定初始值；`poolDeltaPreview.consumption` 返回 0 |
| `backend/app/modules/game_state/models.py` | Phase1EconomyState 保留 consumption 相关字段不做破坏性改动 |

### Step 2: 后端 — 市民广场动作整合到政府策略

| 文件 | 改什么 |
|------|--------|
| `backend/app/modules/rules/decision.py` | `_apply_domestic_market_plan` 保留函数签名但不再扣 domesticMarket 预算；domesticMarketActions 已在 `_resolve_government_strategy_action` 中可用，确保走 governmentFiscal 扣费 |
| `backend/app/modules/game_state/workspaces.py` | `_build_decision_player_workspace` 中 domesticMarketActions workspace 字段置空，government_strategies 确保包含全部 market 动作 |
| `backend/config/balance/decision_actions.json` | domesticMarketActions 保留结构不动（向后兼容），不做破坏性删除 |

### Step 3: 后端 — 政策改名 + 思潮挂钩调整

| 文件 | 改什么 |
|------|--------|
| `backend/config/balance/decision_actions.json` | `raise_consumption_tax` → `raise_commercial_tax`，label "提高商业税"，ratioDelta: factory -1.0 / fiscal +1.0；`lower_consumption_tax` → `lower_commercial_tax`，反之 |
| `backend/app/modules/rules/settlement.py` | `_build_ideology_signals` 中 egalitarianism 信号改为 `domesticStrength` = 本回合国内销售总收入 |
| `backend/config/balance/politics.json` | 如 naturalShiftRules 中 egalitarianism 的 signal_key 需匹配 |

### Step 4: 前端

| 文件 | 改什么 |
|------|--------|
| `frontend/src/components/game/panels/GamePhasePanelContent.tsx` | 移除/简化"民间购买力变化"卡片（第778-790行），改为显示"本回合国内销售总收入" |
| `frontend/src/types/domain.ts` | Phase1EconomyWorkspace 中 consumptionPool 保留，poolDeltaPreview.consumption 保留但值变 0 |
| `frontend/src/features/game/demo/seed.ts` | consumptionPool 值不动（demo 页不影响正式游戏） |
| `frontend/src/components/game/panels/GovernmentPanel.tsx` | 如 raise/lower_consumption_tax 改为新 ID，POLICY_EFFECT_FALLBACKS 和 RATIO_NAME_MAP 中的 consumption 映射需更新 |

### Step 5: 测试修复

| 文件 | 改动方向 |
|------|---------|
| `backend/tests/test_phase1_economy.py` | 价格测试适配新公式 |
| `backend/tests/test_rules_settlement.py` | 移除 drain 测试，domesticMarket 分配测试更新 |
| `backend/tests/test_rules_market.py` | 市场测试的价格预期更新 |
| `backend/tests/test_regular_policies_e2e.py` | raise/lower_consumption_tax → 新政策 ID |
| `backend/tests/test_government_reforms.py` | 如有消费池断言需更新 |
| 其它测试 | 按需逐个修复 |

### Step 6: 全量回归

1. `cd backend && python -m pytest tests/ -x --tb=short`
2. `cd frontend && npm test -- --run`
3. 如全部通过，启动本地服务器手动跑一局

---

## 不做的事

- 不删 domesticMarket 字段（向后兼容）
- 不调整 countries.json 初始值（用现有配置）
- 不调整 events.json（domesticMarketBudgetDelta 类事件仍可生效，但不影响价格）
- 不动科技树市民分支
- 不做 UI 重构（市民广场入口暂时保留，后续独立处理）

---

## 预期改动量

约 10-12 个文件改动，其中后端 6-7 个，前端 2-3 个，测试 3-5 个。
