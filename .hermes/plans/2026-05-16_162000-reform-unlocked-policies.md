# 补充 reforms 解锁的 8 个缺失 policy 定义

## 目标

解决「完成改革路径后看不到新政策、始终只有旧 5 个基础 policy」的问题。

## 根因

| 组件 | 状态 |
|------|------|
| `reforms.json` → `unlocksPolicies` | ✅ 正确声明了 8 个解锁关系 |
| `decision_actions.json` → `regularPolicies` | ❌ 只有 5 个基础 policy（均无 `requiresReform`） |
| 后端 workspace `availablePolicies` + `isUnlocked` | ✅ 逻辑正确，但无 locked policy 可解锁 |
| 后端 `_apply_policy_plan` → `requires_reform` 检查 | ✅ 逻辑正确 |

**核心问题**：8 个被 reforms 引用的 policy ID 在配置中**完全不存在**，完成改革后无新 policy 可显示。

## 缺失的 8 个 policy

| policy ID | 中文 | 解锁改革 | 路径 |
|-----------|------|---------|------|
| `people_petition` | 民众请愿 | `parliament`（建立国会） | 自由 |
| `private_research` | 私人研发 | `patent_system`（专利制度） | 自由 |
| `capital_tax_increase` | 提高资本税 | `social_redistribution`（社会再分配） | 平等 |
| `capital_tax_decrease` | 降低资本税 | `social_redistribution`（社会再分配） | 平等 |
| `political_agitation` | 政治鼓动 | `state_media`（国家媒体） | 民族 |
| `open_trade` | 开放贸易 | `modern_customs`（现代海关） | 民族 |
| `close_trade` | 关闭贸易 | `modern_customs`（现代海关） | 民族 |
| `work_relief` | 以工代赈 | `keynesianism`（凯恩斯主义） | 民族 |

## 改动清单

### 唯一改动文件

`backend/config/balance/decision_actions.json` → `regularPolicies` 对象

添加 8 个新的 policy 定义，每个包含 `requiresReform` 字段。

### 设计约束

- 效果必须使用现有 effect engine 支持的 key（`ratioDelta`、`ideologyDelta`、`productionCapacityDelta`、`militaryPointsDelta`、`researchFacilityDelta`）
- ratioDelta 在激活时一次性应用，停用时反转；其他 effect 在每回合结算时循环应用
- `adminCostPerTurn` 从行政力池扣减（每回合结算时）
- `budgetCost` 在激活时一次性从 governmentFiscal 扣除
- 对标第二阶段设计文档 §1.4 中"关键政策效果"列表

### 8 个 policy 效果设计

```json
"people_petition": {
  "label": "民众请愿",
  "adminCostPerTurn": 1,
  "budgetCost": 0,
  "requiresReform": "parliament",
  "effects": {
    "ratioDelta": { "consumption": 0.5, "fiscal": -0.5 },
    "ideologyDelta": { "liberalism": 1 }
  },
  "description": "开放民众请愿渠道，收入向消费池倾斜，自由主义上升。",
  "maxPerRound": 1
},

"private_research": {
  "label": "私人研发",
  "adminCostPerTurn": 1,
  "budgetCost": 3,
  "requiresReform": "patent_system",
  "effects": {
    "ratioDelta": { "factory": 0.5, "fiscal": -0.5 },
    "researchFacilityDelta": { "academy": 1 }
  },
  "description": "鼓励私人资本投入研发，每回合额外推进研究进度，收入向工厂倾斜。",
  "maxPerRound": 1
},

"capital_tax_increase": {
  "label": "提高资本税",
  "adminCostPerTurn": 1,
  "budgetCost": 0,
  "requiresReform": "social_redistribution",
  "effects": {
    "ratioDelta": { "consumption": 1.0, "factory": -1.0 },
    "ideologyDelta": { "egalitarianism": -1, "liberalism": 1 }
  },
  "description": "提高资本税，收入从工厂转向消费池，满足平等诉求但刺激自由主义。",
  "maxPerRound": 1
},

"capital_tax_decrease": {
  "label": "降低资本税",
  "adminCostPerTurn": 1,
  "budgetCost": 0,
  "requiresReform": "social_redistribution",
  "effects": {
    "ratioDelta": { "factory": 1.0, "consumption": -1.0 },
    "ideologyDelta": { "egalitarianism": 1, "liberalism": -1 }
  },
  "description": "降低资本税，收入从消费池转向工厂，刺激投资但激化平等主义。",
  "maxPerRound": 1
},

"political_agitation": {
  "label": "政治鼓动",
  "adminCostPerTurn": 1,
  "budgetCost": 2,
  "requiresReform": "state_media",
  "effects": {
    "ideologyDelta": { "nationalism": 2, "egalitarianism": -1 }
  },
  "description": "通过媒体鼓动民族情绪，提升民族主义，抑制平等主义。",
  "maxPerRound": 1
},

"open_trade": {
  "label": "开放贸易",
  "adminCostPerTurn": 1,
  "budgetCost": 3,
  "requiresReform": "modern_customs",
  "effects": {
    "ratioDelta": { "fiscal": 0.5, "factory": -0.5 },
    "productionCapacityDelta": { "all": 1 }
  },
  "description": "开放贸易口岸，提升全品类产能，收入向财政倾斜。",
  "maxPerRound": 1
},

"close_trade": {
  "label": "关闭贸易",
  "adminCostPerTurn": 1,
  "budgetCost": 3,
  "requiresReform": "modern_customs",
  "effects": {
    "ratioDelta": { "factory": 0.5, "consumption": -0.5 },
    "productionCapacityDelta": { "all": -1 }
  },
  "description": "关闭贸易口岸保护国内市场，产能下降但收入向工厂倾斜。",
  "maxPerRound": 1
},

"work_relief": {
  "label": "以工代赈",
  "adminCostPerTurn": 1,
  "budgetCost": 6,
  "requiresReform": "keynesianism",
  "effects": {
    "ratioDelta": { "fiscal": -0.5, "consumption": 0.5 },
    "productionCapacityDelta": { "handicraft": 2 }
  },
  "description": "政府出资兴办公共工程，提升手工业产能，收入向消费池倾斜。",
  "maxPerRound": 1
}
```

## 验证步骤

1. **配置加载验证**：
   ```bash
   cd /Users/limou/Desktop/tomorrow_question/backend
   .venv/bin/python -c "
   from app.modules.balance_config import get_balance_config
   bc = get_balance_config()
   for pid, p in bc.reforms.regular_policies.items():
       if p.requires_reform:
           print(f'{pid} → requires {p.requires_reform}')
   "
   ```
   预期输出 8 个有 `requires_reform` 的 policy。

2. **后端测试**（已有的改革/政策测试不应 break）：
   ```bash
   .venv/bin/python -m pytest backend/tests/test_strategy_selections.py -q
   ```

3. **前端构建**（验证 TypeScript workspace 类型不报错）：
   ```bash
   cd /Users/limou/Desktop/tomorrow_question/frontend
   npm run build
   ```

4. **游戏内验证**（手动）：
   - 开局 → 进入议会大厅
   - 确认初始只有 5 个基础 policy 可见
   - 完成一项带 `unlocksPolicies` 的改革（如 建立国会）
   - 确认新 policy 出现在列表中，且标注为已解锁
   - 激活新 policy → 确认行政力扣减、效果生效

## 不改动的部分

- `reforms.json` — unlocksPolicies 已正确
- 后端 `workspaces.py` — `availablePolicies` + `isUnlocked` 已正确
- 后端 `decision.py` — `_apply_policy_plan` + `requires_reform` 检查已正确
- 前端 `GovernmentPanel.tsx` — 渲染逻辑已正确（读 `availablePolicies` 并过滤）
- 现有 5 个基础 policy — 保持不变

## 风险

- **无**。这是纯配置补充，不改任何代码逻辑。
- 现有的 5 个基础 policy 不受影响（它们没有 `requiresReform`，永远解锁）。
- 如果 policy effect 数值不平衡，后续可以通过 `/setting` 面板或直接改 JSON 调优。
