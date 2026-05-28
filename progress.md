# 当前进度

> 更新时间：2026-05-27
> 本文件从今天开始只记录当前状态和下一步，不再继续追加长流水账。旧文档和旧记录已合并归档到 `docs/archive/旧文档总汇-2026-05-21.md`。

## 当前结论

- GitHub `origin/main` 与本地已提交版本一致，当前提交为 `e5ad3f8`。
- 本地仍有未提交改动：海外市场固定区域价、`贸易促进` 只加海外容量、市场竞争只加额外出售容量、建交逻辑从海外出售/竞争链路移除；国内市场软上限定价、收入 3:3:4 回流、工厂/材料调整和文档归档也已在本地落地。
- 5.27 最终大改已在本地实现：新局 10 回合、政府终点路线锁定、无效果改革补齐、军事地区抽屉恢复殖民行动、规则型 AI 指导已接入。
- 政府改革树已做 5.27 后续重配平：终点锁定严格落在每条路线最后一个改革，即自由线 `托拉斯制度`、平等线 `计划经济`、民族线 `军国体制`；所有改革节点都有直接效果，政策镇压成本降为 3 陆军、目标思潮 -4。
- 暂不推送这些改动。后续继续按新的用户需求做规则和体验调整，先以本地状态为基线统一文档和代码口径。

## 当前文档入口

- 当前状态和下一步：`docs/当前状态总览.md`
- 本轮修改索引：`docs/修改索引.md`
- 5.27 最终大改依据：`docs/5.27_overchange.md`
- 本次核心修改文档：`docs/本次核心修改文档.md`
- 客户版修改说明：`docs/本轮玩法逻辑修改说明-客户版.md`
- 本轮修改计划与验证状态：`docs/plans/2026-05-21-本轮修改计划与验证状态.md`
- 本轮开发规划：`docs/plans/2026-05-21-市场工厂规则重构开发规划.md`
- 市场重构开工逻辑：`docs/plans/2026-05-21-市场重构开工逻辑整理.md`
- 文档索引和历史资料入口：`docs/README.md`
- 旧文档总汇：`docs/archive/旧文档总汇-2026-05-21.md`
- 玩家测试闭环：`docs/playtests/QA_SESSION_PROTOCOL.md`
- 试玩说明：`docs/当前版本用户交接说明.md`

## 当前玩法基线

- 一局固定 10 回合，核心流程是 `国家决策 -> 市场出售 -> 财政结算`。
- 经济主线是 `原材料 -> 统一商品 -> 国内/海外销售 -> 三资源池回流`。
- 工厂系统以总池和阶段产能为核心：`工厂增加` 从闲置工厂直接建成目标阶段并本回合生效，不再有每类型扩建次数上限，也不再有单个行业工厂上限；直接扩建成本当前为 13 / 26 / 40 / 56；`产业升级` 是把低级产能逐级转成高级产能并可同回合使用。
- 政府系统以行政力约束改革、常规政策和市场政策；当前政府市场政策只保留 `贸易促进` 增加海外容量，不再提供国内价格/容量政策或海外价格加成。
- 研究系统以研究设施、研究进展、首研突破和后发直解锁为核心。
- 军事当前主要服务于陆军、舰队、地区封锁、殖民和海外市场通路；`海军演练` 已从当前玩家动作中删除，建交不再作为海外出售或市场争夺前置，旧征服/掠夺链不再作为当前玩家可见主线。
- 海外封锁已改为“点开具体海外地区后分配舰队封锁该地区”；旧连通点不再作为玩家可见入口，也不再作为海外销售拦截条件。
- 国内市场已按客户补充公式重构：`P0 = 民间购买力 / 定价软上限`，`P = clamp(P0 × (2 - 投放量 / 软上限) + 国内价格加成, 0.1×P0, 2×P0)`；国内投放不再被软上限硬拦截。

## 最新验证

- `git diff --check`：通过。
- 后端：`backend/.venv/bin/python -m pytest backend/tests/test_balance_config.py backend/tests/test_phase1_economy.py backend/tests/test_rules_market.py backend/tests/test_rules_settlement.py backend/tests/test_phase_submission_services.py backend/tests/test_phase_submit_api.py backend/tests/test_rules_v2_features.py backend/tests/test_m3_e2e_phase1_api.py backend/tests/test_m4_workspace_enrich.py backend/tests/test_m4_pipeline_mirror.py -q`，结果 `105 passed, 7 skipped`。
- 前端：`npm test -- Phase1MarketPanel GamePhasePanelContent decisionShared gameWorkbench index`，结果 `39 passed, 6 skipped`。
- 前端构建：`npm run build` 通过。
- 5.27 后端定向：`backend/.venv/bin/python -m pytest backend/tests/test_balance_config.py backend/tests/test_game_state_models.py backend/tests/test_government_reforms.py backend/tests/test_rules_settlement.py backend/tests/test_colonization_chain.py backend/tests/test_527_overchange.py backend/tests/test_phase_submission_services.py backend/tests/test_final_result_api.py backend/tests/test_realtime_recovery.py -q`，结果 `81 passed, 2 skipped`。
- 5.27 前端定向：`npm test -- MilitaryPanel GameSituationSummary GamePage SettlementPage gameWorkbench decisionFlow decisionShared`，结果 `51 passed`；殖民抽屉文案修正后补跑 `npm test -- MilitaryPanel`，结果 `7 passed`。
- 5.27 前端构建：`npm run build` 通过；`git diff --check` 通过。
- Codex 内部浏览器基础验收：新开房间 `2FPFP6`，新局显示 `回合 1 / 10` 与 AI 指导；军事地区详情中“殖民行动”位于“地区封锁”下方；征募 3 陆军后可殖民美洲；提交并推进到第 2 回合后，美洲显示 `当前控制 英国（你）`，侧栏 AI 指导中的原材料提示从 25 提升到 30。
- 政府改革重配平定向：`backend/.venv/bin/python -m pytest backend/tests/test_government_reforms.py backend/tests/test_balance_config.py backend/tests/test_527_overchange.py -q`，结果 `37 passed`；`npm test -- GovernmentPanel GamePage gameWorkbench`，结果 `17 passed`。
- 政府改革重配平回归：`backend/.venv/bin/python -m pytest backend/tests/test_balance_config.py backend/tests/test_game_state_models.py backend/tests/test_government_reforms.py backend/tests/test_rules_settlement.py backend/tests/test_colonization_chain.py backend/tests/test_527_overchange.py backend/tests/test_phase_submission_services.py backend/tests/test_final_result_api.py backend/tests/test_realtime_recovery.py -q`，结果 `83 passed, 2 skipped`；`npm test -- MilitaryPanel GameSituationSummary GamePage SettlementPage gameWorkbench decisionFlow decisionShared GovernmentPanel`，结果 `51 passed`；`npm run build` 通过；`git diff --check` 通过。
- Codex 内部浏览器政府面板验收：新开房间 `8VP8MD`，进入新局后确认民族线展示 `义务教育 每回合科技点 +1`、`法西斯国 军事力量上限 +3 / 海外容量 +2`、旧名 `特务机关` 的终点效果；镇压政策展示 `消耗 3 陆军，目标思潮 -4`，且不再标成本效果为本轮临时。
- 路线终点纠偏后浏览器复验：新开房间进入新局，确认民族线 `法西斯国` 不再显示最终锁定，最后一个旧名 `特务机关` 显示 `自由/平等/民族 思潮 -3`、`行政力上限 +2`、`解锁 3 项政策`、`最终改革：实施后锁定自由之路、平等之路`；平等线 `苏维埃国` 显示 `国内容量 +2` 且不锁线，最后一个 `计划经济` 显示 `国内容量 +3` 与 `最终改革：实施后锁定自由之路、民族之路`。随后玩家要求终点名称改为 `军国体制`，内部 id 保持 `secret_police`。
- 民族终点改名后补验：`backend/.venv/bin/python -m pytest backend/tests/test_government_reforms.py backend/tests/test_527_overchange.py backend/tests/test_balance_config.py -q`，结果 `38 passed`；`npm test -- GovernmentPanel GamePage`，结果 `9 passed`；`npm run build` 通过；`git diff --check` 通过。Codex 内部浏览器新开房间 `L8DAYJ`，进入新局后确认民族线最后一个改革显示 `军国体制`，无 `特务机关` / `秘密警察` / `当前不会立刻给预算或点数` 玩家可见残留，三项镇压政策均显示 `需改革：军国体制`。
- Computer Use 本地真实浏览器 5.27 重点测试：新开房间 `RGPUUF` / 对局 `ad2c09ce57654721b7cdd2ceef41a69d`，从第 1 回合推进到第 2 回合；确认新局 `1 / 10`、第 2 回合 `2 / 10`、AI 指导显示、政府改革可见效果、军事抽屉“地区封锁”下方殖民入口、美洲殖民消耗 3 陆军并在第 2 回合永久控制。第 2 回合原材料为 `25 - 8 + 2 + 3 = 22`，数值闭合。记录 playtest：`docs/playtests/2026-05-27-computer-use-527-overchange-local.md`。
- 5.27 Computer Use 测试发现的三个问题已修：欧洲不可殖民时殖民原材料收益改为“不适用”；活跃前端 e2e/静态演示从 15 回合同步到 10 回合；`backend/tests/test_regular_policies_e2e.py` 旧 `military_points` 字段断言改为当前 `army_cap` 口径。修复后 `backend/.venv/bin/python -m pytest backend/tests/test_527_overchange.py backend/tests/test_government_reforms.py backend/tests/test_colonization_chain.py backend/tests/test_regular_policies_e2e.py backend/tests/test_phase_submit_api.py -q` 结果 `50 passed, 5 skipped`，`npm test -- MilitaryPanel GamePage gameWorkbench` 结果 `25 passed`，`npm run build` 与 `git diff --check` 通过。Computer Use 复验同一对局第 2 回合：欧洲显示 `每回合原材料 不适用`，美洲仍显示 `+3`。
- Computer Use 继续同一对局推进到第 3 回合：第 2 回合实施 `制定宪法`、选择 `贸易促进`、升级并多投 1 手工业、建立研究院、选择 `珍妮纺纱机`；出售阶段欧洲 7 件、国内 2 件，总收入 61。第 3 回合显示民间 55、工厂 22、政府 43、原材料 18，按 `22 - 9 + 2 + 3 = 18` 闭合；美洲仍由英国控制且殖民收益 +3。新增已记录问题 `527-CU-003`：研究院建设同回合是否参与研究产出的真实效果和 UI 文案不够统一。

## 已知风险

- 本地当前已统一为单一政府财政池，不再显示或使用 `+8` 政策专项额度；云端需等本轮改动部署后再复验。
- 云端出售流程曾出现“请确认本地 API 已启动”的错误文案，不适合线上环境。
- 最近云端测试只覆盖到第 6 回合左右；本地已做 5.27 基础浏览器验收，但仍需要完整 1-10 回合玩家流程复测。
- 5.27 本地 Computer Use 已跑完第 10 回合并进入终局档案页，确认美洲和非洲两块殖民地永久控制、原材料叠加返还连续闭合；未消耗行政力可跨回合保留；自由终点 `托拉斯制度` 已让收入比例跨回合保持 `3/4/3`，平等与民族路线显示 `路径已封锁`，相关政策显示 `已被最终改革锁定`；机械化升级成本从 10 降到 7 并按 7 实扣；`527-CU-004` 已确认为投料规则反馈问题并复验关闭；第 10 回合国内卖出 10 件，收入 133，累计收入 869，终局页显示 `最终回合 10 / 10`；`527-CU-005` 终局英文日志已修复并复验为中文日志。
- 旧阶段文档和旧 playtest 报告中有大量已过期内容，处理 bug 前必须回到真实页面确认当前是否仍存在。

## 下一步

1. 补完整真实浏览器 1-10 回合玩家流程复测，并覆盖终局页。
2. 检查 setting 页面是否能清楚解释并调到国内最低价、海外固定价、工厂上限、材料上限等参数。
3. 修改代码前，先以 `docs/当前状态总览.md` 作为规则和状态基线。
4. 涉及按钮覆盖、数值验证、bug 修复或 1-10 回合流程时，先读 `docs/playtests/QA_SESSION_PROTOCOL.md`，再用真实浏览器验证。
