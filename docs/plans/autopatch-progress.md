# 明日之问 - 自动修复进度

## 当前状态
- Branch: feature/game-balance-rebalance
- **384 passed**, 12 skipped (was 372 → +12: 8 production upgrade + 4 strategy selections)
- 后端运行中 (port 5001)

## 已完成
- [x] P0-1 需求系数 (mechanized 2→1.5)
- [x] P0-2 研究进度 (facility×2)
- [x] P0-3 消费池衰减 (30%→40%) ✅ 实际验证通过
- [x] 军事殖民P0 (unlockCost 10→5, colonizationCost 3→2)
- [x] 军事殖民P1 (recruit_infantry + armyDelta)
- [x] 天赋系统P0 (point purchases resolver处理)
- [x] 天赋系统验证 (解锁连锁正常)
- [x] 五国差异化修复 (增大预算/产能/军事/意识形态差异)
- [x] 五国差异化验证 (323 passed)
- [x] 消费池衰减实际验证 (需求9→11, 价格稳定)
- [x] **殖民完整链路验证** (unlock→diplomacy→colonize→loot) ✅ 9个单元测试全部通过
- [x] 测试端口修复 (test_military_system.py: 5000→5001)
- [x] **API级E2E全链路验证** (5回合完整游戏) ✅
- [x] **Bug Fix: API Normalizer 丢失 lootingActions** ✅
- [x] **多回合殖民掠夺E2E验证** ✅
- [x] **天赋系统链路E2E验证** ✅
- [x] **五国差异化E2E验证** ✅
- [x] **完整5回合API级E2E测试 (殖民+掠夺+天赋+能力 综合)** ✅
- [x] **边缘场景E2E测试** ✅ (9个测试, test_edge_cases.py)
- [x] **五国能力全覆盖E2E测试** ✅ (4个测试)
- [x] **生产模式升级链路E2E测试** ✅ (8个测试, test_production_upgrade_chain.py)
  - handicraft→mechanized→steam→electrified 完整升级链
  - 科技解锁→产能升级→产出验证 (×1→×2→×4→×8)
  - 科技锁: 无spinning_jenny不能升级到mechanized
  - 源模式约束: handicraft不能直接升级到steam (API 400拒绝)
  - 预算约束: 超预算请求被API拒绝 (400)
  - 源产能约束: 超源产能请求被API拒绝 (400)
  - 研究进度积累: 失败尝试降低有效阈值
  - 产出倍率验证: mechanized(×2) > handicraft(×1)
- [x] **Bug Fix: strategySelections 未被 resolver 处理** ✅
  - `_apply_government_plan` 不处理 `strategySelections`
  - 政府行动 (trade_agreement, domestic_stimulus 等) 提交后被静默丢弃
  - 修复: 在 resolver 中增加 strategy selections 处理 (预算扣除 + 效果应用 + 比率调整)
  - 修复: 在 submission validator 中增加 strategy selections 预算验证
  - 4个E2E测试验证: 效果应用、比率调整、预算扣除、超预算拒绝

## 已知API格式
- productionOrders: `[{"goodsId": "phase1_goods", "quantity": N}]`
- militaryActions: `[{"actionId": "recruit_infantry"}]`
- diplomacyActions: `[{"actionId": "establish_africa"}]`
- colonizationActions: `[{"targetRegionId": "africa"}]`
- lootingActions: `[{"regionId": "americas", "resourceType": "cotton"}]`
- pointPurchases: `[{"pointType": "military", "quantity": N}]`
- talentUnlocks: `[{"nodeId": "ind_basic_metallurgy"}]`
- abilitySelection: `{"abilityId": "workshop_of_the_world"}` / `{"abilityId": "code_napoleon", "targetIdeology": "liberalism"}`
- market: `{"saleOrders": [], "phase1Market": {"domesticAllocation": N}}`
- strategySelections: `[{"actionId": "trade_agreement"}]` (government actions)
- upgradeOrders: `[{"routeId": "mechanized", "quantity": N}]` (production upgrades)
- newFactoryOrders: `[{"routeId": "handicraft", "quantity": N}]` (build factories)
- researchTarget: `"spinning_jenny"` (set active research)

## 下一步
1. 前端集成验证 (确保前端发送的 lootingActions/talentPlan/abilitySelection/strategySelections/upgradeOrders 正确到达后端)
2. 性能测试 (多玩家并发提交)
3. expand_research 策略 (regularPolicy) 通过 activatePolicies 的完整链路验证
