# Document Index

## 当前正式开发依据

当前项目已经进入 2.0 经济机制迁移准备阶段。阅读和裁决优先级必须区分“当前迁移依据”和“历史确认文档”。

### 2.0 经济机制迁移层（最高优先级）

用于生产 / 市场 / 价格 / 三资金池相关判断：

1. `docs/用户原始需求-核心机制.md`
2. `docs/2026-04-27-经济机制重构会议纪要.md`
3. `docs/目标经济模型-供需价格机制.md`
4. `docs/第一阶段-市场与生产机制.md`
5. `docs/2.0迁移前逻辑推演与计划.md`

核心口径：当前 Demo 的多具体商品、固定/随机参考价、简单卖货模型不是验收目标；2.0 第一阶段要迁移到 `原材料 -> 商品`、产能结构决定需求、供需决定价格、收入按 `消费:投资:财政 = 5:3:2` 回流。

### 历史用户需求源

保留作为历史需求和客户沟通依据，但不能覆盖上面的 2.0 经济机制迁移层：

- `docs/最终交付确认文档.md`
- `docs/第一版本需求确认文档.md`

### 当前系统说明

- `docs/README.md`
- `docs/当前系统说明.md`
- `docs/接手开发说明.md`

这些文件用于解释当前可运行 Demo 的边界：流程和 UI 可保留，核心经济模型需重构。

### 工程设计 / 实现参考

实现前应先读 2.0 迁移层，再检查当前代码与测试：

- `backend/app/modules/rules/decision.py`
- `backend/app/modules/rules/market.py`
- `backend/app/modules/rules/settlement.py`
- `backend/app/modules/game_state/models.py`
- `backend/app/modules/game_state/workspaces.py`
- `backend/app/contracts/models.py`
- `frontend/src/types/domain.ts`
- `frontend/src/features/game/forms.ts`
- `frontend/src/components/game/panels/factory/FactoryPanel.tsx`
- `frontend/src/components/game/panels/DomesticPanel.tsx`
- `frontend/src/components/game/panels/GamePhasePanelContent.tsx`

### 前端产品化专项层

仅当问题不涉及核心经济机制时使用：

- `docs/前端产品化改造设计.md`
- `docs/前端产品化开发任务清单.md`

### 执行 / 历史过程层

以下仅作背景，不作为当前裁决依据：

- `docs/开发任务清单.md`
- `docs/初始用户文档.md`
- `docs/中期计划方案书.md`
- `docs/V2优化文档.md`
- `docs/V3优化文档.md`
- `docs/superpowers/`

## 回答策略

- 如果用户问“现在 2.0 按什么做”，指向 `docs/第一阶段-市场与生产机制.md` 和 `docs/2.0迁移前逻辑推演与计划.md`。
- 如果用户问“用户原始机制在哪里”，指向 `docs/用户原始需求-核心机制.md`。
- 如果用户问“当前 Demo 能不能验收经济机制”，回答不能；它只能作为流程 / UI 外壳，生产与市场核心要迁移。
- 如果用户要求做需求对齐或演示静态页，必须使用真实运行游戏截图或真实组件内容，不要自创 UI。
- 如果要开始编码迁移，先做后端纯计算模块和测试：`backend/app/modules/rules/phase1_economy.py`、`backend/tests/test_phase1_economy.py`。