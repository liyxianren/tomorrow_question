# 明日之问 - 自动修复进度

## 当前状态
- Branch: feature/game-balance-rebalance
- **407 passed** (unit), **32 passed** (API E2E), 12 skipped
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
- [x] **策略选择 (strategySelections) 完整验证** ✅ (4个测试)
  - 效果应用、比率调整、预算扣除、超预算拒绝
- [x] **expand_research 策略完整链路E2E验证** ✅ (7个测试, test_expand_research_e2e.py)
  - 政策激活 (activatePolicies API → active_policies)
  - 设施增长 (每settlement +1 academy)
  - 去激活停止增长
  - 行政能力不足阻止激活
  - 激活时扣除行政成本
  - 多回合累积 (3回合 = +3 academies)
  - 已激活策略不可重复激活
- [x] **Bug Fix: policy budgetCost 未被验证和扣除** ✅
  - `_apply_policy_plan` 从不扣除 budgetCost (expand_research=12, expand_administration=15 等)
  - `_validate_decision_payload` 从不验证 activatePolicies 的预算
  - 修复: 验证 + 扣除 budgetCost
  - 2个E2E测试验证: 预算扣除 + 超预算拒绝
- [x] **expand_administration 策略完整链路E2E验证** ✅ (6个测试, test_expand_administration_e2e.py)
  - 政策激活 + 行政成本扣除
  - 结算净行政能力为0 (−1 cost + 1 delta)
  - 跨回合保持活跃
  - 行政能力不足阻止激活
  - 预算成本扣除 (15)
  - 超预算拒绝 (400)
- [x] **剩余 regularPolicies 完整链路E2E验证** ✅ (8个测试, test_regular_policies_e2e.py)
  - expand_army: 激活 + 军事增长 + 预算扣除 + 超预算拒绝
  - reduce_army: 财政退款机制
  - raise_consumption_tax: API级激活
  - public_offering: requiresReform 门控 (stock_market)
  - social_welfare: requiresReform 门控 (social_relief) + welfareTransfer
- [x] **战争系统完整链路API级E2E验证** ✅ (5个测试, test_war_system_e2e.py)
  - 军队征兵→征服未占领区域 (recruit→conquest via API)
  - 殖民→掠夺完整管线 (unlock→diplomacy→colonize→loot)
  - 海军部署持久化验证 (build_fleet→navalDeployment→ocean node)
  - 征服+掠夺同回合提交验证
  - 跨回合多次掠夺资源转移验证
- [x] **独立运动系统完整链路API级E2E验证** ✅ (2个测试, test_independence_e2e.py)
  - 独立性增长验证: 每次掠夺+2独立性 (2→4→6→8)
  - 起义阈值验证: 独立性达10触发起义 (controller→None, access→concession, indep→0)
  - 殖民→反复掠夺→起义→失去殖民地 完整链路
  - 注: 起义日志通过game_logs表持久化，不在lastSettlementSummary中

## 已知API格式
- productionOrders: `[{"goodsId": "phase1_goods", "quantity": N}]`
- militaryActions: `[{"actionId": "recruit_infantry"}]`
- diplomacyActions: `[{"actionId": "establish_africa"}]`
- colonizationActions: `[{"targetRegionId": "africa"}]`
- conquestActions: `[{"regionId": "americas", "infantry": N, "artillery": N}]`
- lootingActions: `[{"regionId": "americas", "resourceType": "cotton"}]`
- navalDeployment: `{"north_atlantic": N, "mediterranean": M}`
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
