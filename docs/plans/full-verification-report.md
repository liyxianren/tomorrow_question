# 全模块自动验证报告 — 2026-05-01

## 修复的Bug (6个)

### 存储链修复 (repositories.py `_normalize_snapshot_payload`)
1. **研究字段丢失**: activeResearch/researchProgress/breakthroughAttempts 未包含
2. **改革字段名错**: 用 reforms/policies 而非 completedReforms/activePolicies
3. **殖民/外交字段**: colonizationUnlocked/establishedDiplomacy 缺失 (已确认存在)

### 提交验证容错 (phase_submission.py)
4. **market saleOrders**: None时报错 → 默认空列表
5. **factoryPlan子列表**: None时报错 → 默认空列表

### 能力系统 (decision.py)
6. **abilitySelection死代码**: `_apply_ability_selection` 定义但从未被调用
   - 添加调用到 resolve_decision_phase
   - 移到 production 之前执行
   - production 中应用 productionOutputMultiplier

## 验证通过的系统

| 系统 | 功能 | 状态 | 验证方式 |
|------|------|------|---------|
| 生产 | handicraft模式 8raw→8goods | ✅ | API R1-R3 |
| 生产 | workshop_of_the_world 2x | ✅ | 8raw→16goods |
| 市场 | phase1Market domestic | ✅ | domestic=15/24/33 |
| 市场 | phase1Market overseas | ✅ | overseas=6/9 |
| 市场 | supply-demand定价 | ✅ | 价格随供需变化 |
| 结算 | 收入分配 | ✅ | cumulative=57 |
| 结算 | 消费池30%衰减 | ✅ | budget递减 |
| 研究 | researchTarget | ✅ | leyden_jar 2回合解锁 |
| 研究 | researchProgress累积 | ✅ | 0→1→解锁 |
| 改革 | constitution | ✅ | admin 4→2, ideology变化 |
| 政策 | adminPurchases | ✅ | 3→4 |
| 外交 | establish_diplomacy | ✅ | asia_pacific, americas |
| 天赋 | ind_basic_metallurgy | ✅ | techPoints 1→0 |
| 能力 | workshop_of_the_world | ✅ | productionOutputMultiplier=2 |
| 殖民 | unlockColonization | ✅ | fiscal 16→6, colon=True |
| 军事 | recruit_infantry | ⚠️ | 给militaryPoints不创建army |
| 军事 | build_fleet | ✅ | fleets+1 |

## 设计问题（非代码Bug）

1. **army单位无法创建**: recruit_infantry只给Points，infantry/artillery永远=0
2. **saleOrders对phase1无效**: 旧multi-good系统遗留，phase1用phase1Market
3. **殖民需先建外交**: colonize africa需要先establish_africa
4. **天赋树techPoints不足**: 初始1点只能解锁T1

## Commits
- `ac28040`: snapshot normalize + market/decision 容错
- `41e82c9`: 国家能力系统修复

## 未push (GitHub认证未配置)
需要手动 `git push origin feature/game-balance-rebalance`
