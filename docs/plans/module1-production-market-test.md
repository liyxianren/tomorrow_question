# Module 1: 生产系统 + 市场出售 验证报告

**日期**: 2026-05-01
**分支**: feature/game-balance-rebalance

## 测试环境
- 后端: Flask + SQLite, 303 passed, 12 skipped
- 前端: Vite + React
- 测试方式: API + Browser 双验证

## 已验证功能

### ✅ 生产系统 (Phase 1 Economy)
- 原材料消耗: coal/grain/iron/cotton/timber 各工位正确消耗
- 产能产出: 工人分配正确产出商品
- 工厂建设: newFactoryOrders 正确创建工厂
- 扩建订单: expansionOrders 正确处理

### ✅ 市场出售 (Phase 1 Market)  
- 国内市场: domesticMarketActions 正确定价出售
- 海外市场: overseas sale orders + regionId 验证
- 收入计算: domesticSalesRevenue, overseasSalesRevenue 正确

### ✅ 结算分配 (Phase 3 Settlement)
- 收入分配比例: 5:3:2 (国内:工厂:政府) 正确
- 消费池衰减: 30% 正确衰减
- 原材料补充: 每回合正确补充

### ✅ 研究系统 (Phase 3 Research) — **本次修复**
- **Bug #1 (已修复)**: `_normalize_decision_submission` 不传递 researchTarget → 修复: 添加字段传递
- **Bug #2 (已修复)**: `_normalize_snapshot_payload` 丢弃 activeResearch/researchProgress/breakthroughAttempts → 修复: 添加三个字段到规范化函数
- **验证**: 多回合研究进度累积正确 (0→1→解锁)
- **验证**: 科技解锁后 activeResearch 重置, unlockedTechs 正确更新

### ✅ 天赋系统
- talentPlan.talentUnlocks 正确处理
- unlockedTalents 在 snapshot 中正确存储

## 发现的其他问题 (待修)

### 🔴 Browser 大厅按钮 onclick noop
- "创建房间" 按钮 JavaScript 事件未绑定

### 🟡 区域旧数据
- acceptedGoods 显示 coal/grain/steel 而非 phase1_goods

### 🟡 消费池 API 不可见
- 投资池可见但消费池在 context API 中不可见

### 🟡 五国差异化不足
- PM 评估: 差异仅 ±1 产能 ±2 预算
- 需要更显著的国家特色

## 下一步: Module 2 - 政府决策系统
- 测试 governmentPlan 完整流程
- pointPurchases / strategySelections / techResearch / adminPurchases
- 验证预算分配到各池
