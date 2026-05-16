# Plan: 行政力 → 行政点数/行政力上限 拆分

**Date**: 2026-05-16 17:20 CST
**Status**: 确认中

## 最终模型

```
行政力上限 (admin_capacity) = 每回合恢复的行政点数池容量
  ├─ 初始: 1（countries.json 的 administrationCapacity）
  ├─ 途径: 扩张行政机构 → +1（永久）
  └─ 回合 START: admin_points = admin_capacity

行政点数 = 每回合的行动货币
  ├─ 花在: 策略行动（1 点/个）+ 激活政策（1 点/个）
  ├─ 政策单回合生效（SETTLEMENT 后自动清空）
  └─ 未用完的行政点数回合结束丢弃
```

## 新政策/策略列表

### 现有政策（4 个，改为单回合+行政点数消耗）

| ID | 名称 | 行政点数 | 财政 | 效果 |
|----|------|---------|------|------|
| `raise_commercial_tax` | 增收商业税 | 1 | 0 | ratioDelta: factory:-1, gov:+1, 平等主义+1 |
| `lower_commercial_tax` | 降低商业税 | 1 | 0 | ratioDelta: factory:+1, gov:-1, 平等主义-1 |
| `expand_army` | 扩充军队 | 1 | 8 | 每回合军事点+1（改为本回合+1军事点？） |
| `reduce_army` | 缩减军队 | 1 | 0 | 每回合军事点-1，财政+5（改为本回合？） |
| `expand_administration` | 扩张行政机构 | 1 | 15 | 行政力上限+1（永久） |

### 新增市场策略（3 个，融入 GovernmentPanel 策略区）

| ID | 名称 | 行政点数 | 财政 | 效果 |
|----|------|---------|------|------|
| TBD | 待用户定义 | | | |

## 后端改动

### 1. models.py — PlayerState

```
+ base_admin_capacity: int = 1  # permanent cap, grows via expand_administration
  administration_capacity: int = 1  # current pool (reset each turn to base)
```

### 2. factory.py — 初始化

```
+ base_admin_capacity = countries.json.administrationCapacity (1)
+ administration_capacity = base_admin_capacity
```

### 3. balance_config/models.py — CountryBalanceConfig

```
NO CHANGE — administration_capacity stays, semantics become "base admin cap"
```

### 4. countries.json — 数值调整

```
administrationCapacity: 3 → 1 （初始行政力上限为 1）
```

### 5. decision.py — resolve_decision_phase（回合开始时）

```
# 新增：清空上回合政策 + 重置行政点数
player_state.active_policies.clear()
player_state.administration_capacity = player_state.base_admin_capacity
```

### 6. decision.py — _apply_government_plan（移除+新增）

```
移除：adminPurchases 购买逻辑（第 373-384 行）
新增：strategySelections 每个消耗 1 行政点数
  if player_state.administration_capacity < 1 → skip
  player_state.administration_capacity -= 1
```

### 7. decision.py — _apply_policy_plan（简化）

```
移除：admin_cost_per_turn 检查（第 1013 行）
新增：每个政策消耗 1 行政点数
  if player_state.administration_capacity < 1 → skip
  player_state.administration_capacity -= 1
移除：admin_cost ← 不再从 admin 池中扣除维护费
```

### 8. settlement.py — _apply_active_policy_effects（大幅简化）

```
移除：admin_capacity 不足自动撤销逻辑（第 400-404 行）
保留：policy.effects 应用（recurring + permanent）
     注意：ratioDelta 不再需要 "recurring" 概念
```

### 9. decision_actions.json — expand_administration 改效果

```
旧: effects.administrationCapacityDelta: 1
新: effects.baseAdministrationCapacityDelta: 1
```

### 10. decision.py — _apply_reform_or_policy_effects

```
新增: baseAdministrationCapacityDelta 处理
  base_admin_capacity = max(0, base_admin_capacity + delta)
```

### 11. workspaces.py — 预览计算更新

```
"administrationCapacity": 改为显示 base_admin_capacity（上限）
新增: "adminPointsAvailable": 显示当前可用的行政点数
```

## 前端改动

### GovernmentPanel.tsx

- 移除 "购买行政力" UI（adminPurchases）
- 行政力显示改为 `当前点数/上限` 格式（如 `2/3`）
- 策略行动卡片新增行政点数消耗显示
- 政策激活时消耗 1 行政点数

### gameWorkbench.ts

- 提交数据移除 `adminPurchases` 字段

### domain.ts

- `administrationCapacity` 保持（语义变为上限）
- 新增 `baseAdminCapacity` 字段

## 测试改动

### test_rules_settlement.py

- 移除 admin_purchase 相关测试
- 更新策略激活的行政点数消耗断言

### test_government_reforms.py

- 更新行政力消耗模型（1 点/政策）
- 验证回合结束后政策自动清空

### test_regular_policies_e2e.py

- 适配新激活逻辑

## 实施步骤

1. models.py + factory.py: 新增 base_admin_capacity
2. countries.json: 3 → 1
3. decision.py: 回合重置 + 移除购买 + 策略/政策消耗行政点数
4. settlement.py: 简化 _apply_active_policy_effects
5. decision_actions.json: expand_administration 效果改键
6. decision.py effects: 处理 baseAdministrationCapacityDelta
7. workspaces.py: 预览适配
8. frontend: GovernmentPanel.tsx + gameWorkbench.ts + domain.ts
9. tests: 逐文件适配
10. 新增市场策略（待用户定义后追加）

## 待确认

1. 市场策略名称/效果：请提供 3 个新市场策略的具体名称和效果
2. 现有政策 `expand_army`/`reduce_army` 的效果（`每回合军事点+1`）与单回合语义冲突——改为本回合一次性增加军事点？
3. 回合结束时 active_policies 是在 DECISION 开局清空，还是在 SETTLEMENT 结尾清空？
