# 2026-05-22 Computer Use Round 3-6 流程测试

## 元信息

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-05-22 |
| 测试方式 | Computer Use 控制真实 Chrome 页面 |
| 前端地址 | http://127.0.0.1:5173 |
| 后端地址 | http://127.0.0.1:5001 |
| 房间 / 对局 | `9UR6UV` / `82c46e96be3f4f32ab93a04894009d61` |
| 国家 | 英国 |
| 起点 | Round 3 国家决策 |
| 目标 | 跑完 Round 3-6，重点观察整体流程和新市场/工厂/封锁逻辑 |
| 开始时间 | 2026-05-22 10:46 CST |
| 结束时间 | 2026-05-22 12:12 CST |

## 关注点

| 模块 | 本轮重点 | 状态 | 证据 |
| --- | --- | --- | --- |
| 整体流程 | Round 3 到 Round 6 阶段流转是否顺畅 | 已测到 Round 6 | Round 3 国内结算、Round 4 海外结算、Round 5 工厂+海外结算后进入 Round 6 |
| 工厂 | 扩建/升级是否继续受总池、类型上限、预算限制；是否本回合生效 | 已复验，发现并修复 1 个阻断 | Round 5 `手工业 → 机械化`、购买 1 原材料、同回合投料后可进入市场，库存变为 4 |
| 市场 | 国内软上限公式、海外固定价、容量继承和结算回流 | 已抽样通过 | Round 4 国内 Q=7 价 5.33 收入 37；Round 4 欧洲 Q=7 固定价 8 收入 56；Round 5 欧洲 Q=4 固定价 8 收入 32 |
| 市场竞争 | 有陆军后是否只增加容量，不加价格 | 待进一步专项 | 本轮未进入竞争操作，只确认海外正常出售仍按固定价 |
| 封锁 | 区域封锁 UI 是否继续可读，不出现旧航线/建交残留 | 已观察 | 军事页显示区域封锁说明；未见建交出售门槛残留 |
| 研究/军事 | 研究延续、陆军/舰队是否不打断流程；确认军事侧不再提供海外扩容动作 | 已复验 | 重启后 Round 3 政府页只剩 `贸易促进`，军事页只剩 `征募陆军` / `建造舰队` |

## 回合记录

### Round 3

| 顺序 | 阶段 | 模块 | 动作 | 点击前数值 | 点击后 UI | 提交后结果 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 决策 | 政府市场政策 | 选择 `贸易促进` | 行政力 `3/3`，政府市场政策区仅 1 张卡 | 行政力 `2/3`，政策占用 `1`，效果为 `海外容量 +2` | - | 国内公式政策入口已移除，海外容量政策保留 |
| 2 | 决策 | 军事 | 选择 `征募陆军` | 政府财政 `32`，军事页仅 `征募陆军` / `建造舰队` | 政府财政预览 `27`，陆军本轮待生效 | - | `海军演练` 已从玩家入口消失 |
| 3 | 决策 | 工厂 | 检查英国工厂池 | 启用/总上限 `10/16`，闲置 `6`，手工业 `10/10`，材料 `15` | 投料 10 后预估产出 10；手工业扩建因类型上限禁用 | - | 工厂总池、类型上限、预算限制显示正常 |
| 4 | 销售 | 国内市场 | 国内 MAX 投放 10 | 库存 `10`，购买力 `80`，K=`24`，事件/政策净值含国内价格 `-1` | UI 价格 `4.28`，预计收入 `42` | 国内销售 `42`，累计收入 `154` | 公式 `floor(10 * (80/24*(2-10/24)-1)) = 42`，结算正确 |

### Round 4

| 顺序 | 阶段 | 模块 | 动作 | 点击前数值 | 点击后 UI | 提交后结果 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 决策 | 工厂 | 检查并跳过工厂 | 启用/总上限 `10/16`，闲置 `6`，手工业 `10/10` | `闲置 → 手工业` 显示为中文；手工业扩建因类型上限禁用 | - | 工厂池、类型上限、升级文案没有 raw `idle` 残留 |
| 2 | 决策 | 政府 | 选择 `贸易促进` | 政府市场政策区只显示 1 张卡 | 政府财政消耗 1，效果为海外容量 `+2` | - | 国内市场政策残留未出现，海外仅保留统一扩容政策 |
| 3 | 决策 | 军事 | 检查军事入口并跳过 | 军事页只显示 `征募陆军` / `建造舰队` | 未选择军事动作 | - | `海军演练` 不再作为玩家动作出现 |
| 4 | 销售 | 国内市场 | 国内 MAX 投放 7，用于公式抽样 | 库存 `7`，民间购买力 `80`，K=`26` | UI 价格 `5.33`，预计收入 `37`，公式窗口 diff `0` | - | 国内公式按当前投放量计算正确 |
| 5 | 销售 | 海外市场 | 清空国内，欧洲投放 7 | 库存 `7`，欧洲固定价 `8` | UI 预计收入 `56` | 国内 `0`，海外 `56`，总收入 `56`，累计 `210` | 海外固定价结算正确，未出现价格加成 |

### Round 5

| 顺序 | 阶段 | 模块 | 动作 | 点击前数值 | 点击后 UI | 提交后结果 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 决策 | 工厂升级 | 选择 `手工业 → 机械化` | 启用/总上限 `10/16`，闲置 `6`，手工业 `10/10`，机械化 `0/7`，工厂预算 `35/37` | 手工业 `9/10`，机械化 `1/7`，工厂预算 `25/37` | - | 升级不增加总工厂数，逐级转换本回合生效 |
| 2 | 决策 | 原材料购买 | 购买 1 原材料 | 原材料 `2/2`，购买上限 `15`，单价 `1` | 原材料 `2 → 3`，工厂预算 `24/37` | - | 购买材料显示为本回合可用 |
| 3 | 决策 | 投料生产 | 给机械化投入 1 原材料 | 可用材料 `3`，机械化产能 `1` | 总投料 `3`，预估产出 `4` | 首次被提交校验误拦截，见 CU-3-004；修复后可提交 | 发现 P1：提交校验未把购买材料计入可用材料 |
| 4 | 决策 | 修复后复验 | 重复升级、购买 1 原材料、机械化投料 | 同上 | 提交阻塞不再出现 `原材料使用 3 超出可用 2` | 成功进入 Round 5 市场，库存待售 `4` | 同回合购买材料已可参与生产和提交 |
| 5 | 销售 | 海外市场 | 欧洲投放 4 | 库存 `4`，欧洲固定价 `8` | UI 预计收入 `32`，解释为 `成交量 4 × 固定价 8 = 32` | 国内 `0`，海外 `32`，总收入 `32`，累计 `242` | 海外固定价结算正确，进入 Round 6 |

### Round 6

| 顺序 | 阶段 | 模块 | 动作 | 点击前数值 | 点击后 UI | 提交后结果 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 决策 | 阶段流转 | 观察进入下一回合 | Round 5 结算国内 `0`、海外 `32`、总收入 `32` | 页面进入 `回合 6：决策`，民间购买力 `124`、工厂 `32`、政府财政 `55` | - | 3-6 回合主流程可继续 |

## 公式抽样

| 回合 | 市场 | 库存 | 民间购买力 | K | Q | 价格/固定价 | 预计收入 | 提交后收入 | 结论 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Round 3 | 国内 | 10 | 80 | 24 | 10 | 4.28 | 42 | 42 | 通过 |
| Round 4 | 国内 | 7 | 80 | 26 | 7 | 5.33 | 37 | 未提交国内 | 公式窗口 diff `0`，通过 |
| Round 4 | 欧洲海外 | 7 | 80 | 26 | 7 | 8 | 56 | 56 | 固定价通过 |
| Round 5 | 欧洲海外 | 4 | 108 | 27 | 4 | 8 | 32 | 32 | 固定价通过 |

## 问题台账

| 编号 | 回合/阶段 | 模块 | 严重程度 | 摘要 | 期望 | 实际 | 证据 | 状态 | 复验 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CU-3-001 | Round 3 / 政府 | 政府市场政策 / 军事 | P1 | 国内市场公式化后仍显示 `市场补贴` / `价格管制`，军事侧仍保留 `海军演练` 扩海外容量 | 国内市场不应再有政策调价/扩国内容量入口；海外仅保留政府 `贸易促进`；军事不再用 `海军演练` 扩容 | Round 3 政府页可见 `市场补贴`、`贸易促进`、`价格管制` 三张市场政策卡；军事配置仍有 `海军演练` | Computer Use 在 Round 3 政府页人工观察 | 已修复 | 重启前后端后复验：政府市场政策区只显示 `贸易促进`；军事页只显示 `征募陆军` / `建造舰队` |
| CU-3-002 | Round 3 / 销售 | 国内市场 UI | P2 | 未投放时国内市场卡片显示“未投放”，但价格预览已按 MAX 投放量显示 | 未投放状态下价格/收入预览口径应和当前 Q 一致，或文案明确为“按最大投放预估” | Q=0 时页面文案仍为“未投放”，价格却显示 Q=10 对应的 `4.28` | Computer Use 在 Round 3 销售页观察；MAX 后公式和结算正确 | 待修复 | 低于阻断级别，后续集中处理 |
| CU-3-003 | Round 1 / 决策 | 旧快照规则缓存 | P1 | 当前对局快照继续输出已删除的 `海军演练` 军事动作 | 旧房间读取时也必须按当前有效配置重建玩家 workspace，军事入口只剩 `征募陆军` / `建造舰队` | 对局 `bc5a6fb52b3b43a29e8e1cbe0f539300` 军事页仍显示 `海军演练 4 政府财政` 和 `海外容量 +1 永久` | Computer Use 进入 Round 1 军事要塞页观察 | 已复验关闭 | 增加旧 workspace 动作 ID 校验，并在前端过滤旧动作；刷新旧房间和当前 Round 4/5 后军事页只剩 `征募陆军` / `建造舰队` |
| CU-3-004 | Round 5 / 决策 | 工厂 / 提交校验 | P1 | 同回合购买的原材料能投料，但提交校验仍按购买前材料数拦截 | `factoryPlan.rawMaterialPurchaseQuantity` 应立即计入可用材料，和生产面板一致 | 购买 1 原材料后可见 `2 → 3` 且机械化投料成功，但全局提交阻塞显示 `原材料使用 3 超出可用 2` | Computer Use Round 5 工厂页：升级机械化、购买材料、投料后点击提交 | 已复验关闭 | 修复 `gameWorkbench` 可用材料计算后，重复同一路径成功进入市场；库存待售变为 `4` |

## 严重问题修复记录

| 编号 | 修复文件 | 验证命令 | Computer Use 复验证据 | 状态 |
| --- | --- | --- | --- | --- |
| CU-3-001 | `backend/config/balance/decision_actions.json`；`backend/config/balance/military_actions.json`；`backend/app/modules/game_state/workspaces.py`；`backend/app/modules/rules/decision.py`；`backend/app/modules/settlement/phase_submission.py`；`backend/app/routes/settings.py`；`frontend/src/components/game/panels/GovernmentPanel.tsx`；`frontend/src/components/game/panels/DomesticPanel.tsx`；`frontend/src/components/game/panels/GamePhasePanelContent.tsx`；`frontend/src/components/game/panels/MilitaryPanel.tsx`；`frontend/src/features/game/commandDeck/viewModel.ts` | `backend/.venv/bin/python -m pytest backend/tests/test_balance_config.py backend/tests/test_rules_decision.py backend/tests/test_strategy_selections.py backend/tests/test_government_reforms.py backend/tests/test_phase_submission_services.py backend/tests/test_settings_routes.py -q`；`npm test -- GamePhasePanelContent decisionShared decisionCardDemo DecisionCardDemoPage`；`git diff --check`；`npm run build` | Round 3 政府页只剩 `贸易促进`；Round 3 军事页只剩 `征募陆军` / `建造舰队` | 已复验 |
| CU-3-003 | `backend/app/modules/game_state/models.py`；`frontend/src/features/game/militaryActions.ts`；`frontend/src/components/game/panels/MilitaryPanel.tsx`；`frontend/src/features/game/commandDeck/viewModel.ts`；`frontend/src/components/game/panels/MilitaryPanel.test.tsx`；`backend/tests/test_game_state_models.py` | `backend/.venv/bin/python -m pytest backend/tests/test_game_state_models.py backend/tests/test_game_state_workspaces.py -q` -> `15 passed, 3 skipped`；`cd frontend && npm test -- MilitaryPanel GamePhasePanelContent gameWorkbench decisionShared` -> `43 passed, 6 skipped` | 旧房间刷新后无 `海军演练`；当前对局 Round 4/5 军事页也无 `海军演练` | 已复验 |
| CU-3-004 | `frontend/src/features/game/flow/gameWorkbench.ts`；`frontend/src/features/game/flow/gameWorkbench.test.ts` | `cd frontend && npm test -- gameWorkbench` -> `7 passed` | Round 5 重复升级、购买 1 原材料、机械化投料后不再出现原材料阻塞，成功进入市场且库存为 `4` | 已复验 |

## 未覆盖 / 后续

- 市场竞争的“只加容量不加价格”本轮未专项点击，需要后续单独覆盖。
- CU-3-002 为国内市场预览文案/显示口径问题，公式结算本身已抽样通过。
