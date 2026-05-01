# 明日之问 - 自动修复进度

## 当前状态
- Branch: feature/game-balance-rebalance
- **359 passed**, 12 skipped (was 358 → +1 comprehensive 5-round E2E)
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
  - `phase_submission.py` 不持久化 `lootingActions`、`navalDeployment`、`conquestActions`
  - 通过 API 提交的掠夺行动被静默丢弃，resolver 从 DB 加载时得到空列表
  - 修复: 在 `_normalize_decision_submission` 中增加这三个字段的持久化
- [x] **多回合殖民掠夺E2E验证** ✅
  - 3回合完整链路: colonize(R1) → loot cotton(R2) → loot cotton(R3)
  - raw_materials 每回合 +1, resource_limit 每回合 -1
  - independence ≥ 2 (looting + supply/demand imbalance)
- [x] **天赋系统链路E2E验证** ✅
  - 购买科技点 (pointPurchases tech) → 解锁天赋 (talentUnlocks)
  - 序列依赖: 不解锁 node[1] 不能解锁 node[2]
  - 3节点连续解锁: ind_basic_metallurgy → ind_process_improvement → ind_standardization
  - 跨分支独立: industry/domestic/government/military 各自独立
  - 科技点不足阻止解锁
- [x] **五国差异化E2E验证** ✅
  - Britain workshop_of_the_world: 产出翻倍 (4→8 goods)
  - France code_napoleon: 意识形态重置为3, 目标+3
  - Prussia krupp_steel: mechanized→steam 免费升级 (max 2)
  - Austria ausgleich_1867: domestic+3, overseas+2 临时效果
  - Russia emancipation_reform: idle→handicraft, egalitarianism+2
  - 错误国家不能使用能力 / 能力不能重复使用
- [x] **完整5回合API级E2E测试 (殖民+掠夺+天赋+能力 综合)** ✅
  - R1: 生产+军事招募+解锁殖民+建立外交+殖民美洲+使用workshop能力
  - R2: 掠夺棉花+解锁天赋链(ind_basic_metallurgy, ind_process_improvement)+法国code_napoleon+普鲁士krupp_steel
  - R3: 二次掠夺+深度天赋(ind_standardization)+跨分支天赋
  - R4: 三次掠夺+能力重复使用被拒(workshop_of_the_world)
  - R5: 最终状态累积验证
  - 殖民地因持续掠夺独立度升高后叛乱 (independence mechanics verified)
  - 所有5国累积收入非负

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

## 下一步
1. 前端集成验证 (确保前端发送的 lootingActions/talentPlan/abilitySelection 正确到达后端)
2. 性能测试 (多玩家并发提交)
3. 边界场景测试 (殖民地资源耗尽、天赋树满级、同时殖民多区域)
