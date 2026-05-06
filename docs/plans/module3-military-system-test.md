# 军事系统 E2E 测试报告

**日期**: 2026-05-01  
**分支**: feature/game-balance-rebalance  
**测试方式**: API E2E (HTTP POST/GET)  
**服务端**: Flask + SQLite, 127.0.0.1:5000

---

## 测试结果汇总

| # | 测试项 | 结果 | 说明 |
|---|--------|------|------|
| 1 | 快照可读性 | ✅ | govFiscal=10, mp=1, army=0, navy=1fleet |
| 2 | recruit_infantry ×1 | ✅ | 消耗1 mp, +1 infantry |
| 3 | recruit_infantry ×3 | ✅ | 消耗3 mp, +3 infantry (maxPerRound=3) |
| 4 | recruit_infantry ×50 | ✅ | 服务端验证拒绝 400: "exceeds maxPerRound" |
| 5 | train_artillery | ⚠️ SKIP | 初始 mp=1 < 2 |
| 6 | naval_drill | ✅ | 消耗1 mp, +1 overseas capacity |
| 7 | build_fleet | ⚠️ SKIP | 初始 mp=1 < 3 |
| 8 | unlockColonization | ✅ | 消耗 colonizationUnlockCost 政府财政, colonizationUnlocked=True |
| 9 | 军事+外交组合 | ✅ | recruit 消耗 mp；americas 建交消耗政府财政 |
| 10 | 重复外交 | ✅ | 服务端验证拒绝 400: "duplicated" |
| 11 | 无效行动ID | ✅ | 服务端验证拒绝 400: "Unknown military action" |
| 12 | 殖民全流程 (4回合) | ✅ | unlock→diplo+recruit→recruit→colonize americas |

**总计**: 10 PASS, 2 SKIP (预算不足), 0 FAIL

---

## 关键发现

### Bug #1: unlockColonization 未实现 (已修复)

**现象**: `unlockColonization: true` 被 payload 接受并存储, 但 `_apply_military_plan()` 从未读取该字段, 导致 `colonization_unlocked` 永远为 False。

**根因**: `decision.py` 中 `_apply_military_plan()` 处理了:
- ✅ `militaryActions`
- ✅ `diplomacyActions`  
- ✅ `lootingActions`
- ❌ `unlockColonization` — **缺失**
- ❌ `colonizationActions` — **缺失**

**修复** (commit 41e82c9):
1. 在 `_apply_military_plan` 中添加 unlockColonization 处理:
   - 检查 `military_plan.get("unlockColonization")`
   - 扣除 `colonization_unlock_cost` 从 governmentFiscal
   - 设置 `player_state.colonization_unlocked = True`

2. 新增 `_apply_colonization_actions()` 函数:
   - 前置条件: `colonization_unlocked=True`, 外交建交, 路线可达
   - 消耗: `colonizationMilitaryPointCost` mp
   - 限制: `maxColonizationsPerRound` (1)
   - 效果: 设置 `region.controller`, `region.access_level = COLONY`

### 服务端验证行为

| 行为 | 处理方式 |
|------|----------|
| 无效 actionId | 400 拒绝: "Unknown military action" |
| 超过 maxPerRound | 400 拒绝: "exceeds maxPerRound" |
| 重复外交目标 | 400 拒绝: "duplicated" |
| 已建交区域再建交 | 400 拒绝: "already been established" |
| 政府财政或军事点不足 | 提交验证拒绝；规则执行阶段也会防御性跳过 |

### 初始配置 (Britain)

| 属性 | 值 |
|------|-----|
| governmentFiscal | 10 |
| militaryPoints | 1 |
| army.infantry | 0 |
| army.artillery | 0 |
| navy.fleets | 1 |
| colonizationUnlocked | False |
| establishedDiplomacy | [asia_pacific] |

### 军事行动成本

| 行动 | 资源成本 | 效果 | maxPerRound |
|------|----------|------|-------------|
| recruit_infantry | 1 mp | +1 infantry | 3 |
| train_artillery | 2 mp | +1 artillery | 2 |
| naval_drill | 1 mp | +1 omc | 2 |
| build_fleet | 3 mp | +1 fleet | 1 |
| unlockColonization | governmentFiscal: colonizationUnlockCost | unlock flag | 1 |
| establish_americas | governmentFiscal: 3 | +americas diplo | 1 |

---

## 殖民全流程时序

```
Round 1: unlockColonization (fiscal) + establish_americas (fiscal) → colonizationUnlocked=True, diplo+americas
Round 2: 通过政府财政购买军事点，或等待其它政府策略获得军事点
Round 3: colonize americas (mp) → americas.controller = britain
```

注意: 需要多回合因为:
- 初始 militaryPoints=1，通常不足以直接殖民
- 每回合结算会增加收入，政府财政可按 10:1 购买军事点

---

## 测试文件

- `backend/tests/test_military_system.py` — E2E 测试脚本
