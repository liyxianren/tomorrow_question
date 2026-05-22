# 当前进度

> 更新时间：2026-05-21
> 本文件从今天开始只记录当前状态和下一步，不再继续追加长流水账。旧文档和旧记录已合并归档到 `docs/archive/旧文档总汇-2026-05-21.md`。

## 当前结论

- GitHub `origin/main` 与本地已提交版本一致，当前提交为 `e5ad3f8`。
- 本地仍有未提交改动：海外市场固定区域价、`贸易促进` 只加海外容量、市场竞争只加额外出售容量、建交逻辑从海外出售/竞争链路移除；国内市场软上限定价、收入 3:3:4 回流、工厂/材料调整和文档归档也已在本地落地。
- 暂不推送这些改动。后续继续按新的用户需求做规则和体验调整，先以本地状态为基线统一文档和代码口径。

## 当前文档入口

- 当前状态和下一步：`docs/当前状态总览.md`
- 本轮修改索引：`docs/修改索引.md`
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

- 一局固定 15 回合，核心流程是 `国家决策 -> 市场出售 -> 财政结算`。
- 经济主线是 `原材料 -> 统一商品 -> 国内/海外销售 -> 三资源池回流`。
- 工厂系统以总池和阶段产能为核心：`工厂增加` 从闲置工厂直接建成目标阶段并本回合生效，不再有每类型扩建次数上限，也不再有单个行业工厂上限；直接扩建成本当前为 13 / 26 / 40 / 56；`产业升级` 是把低级产能逐级转成高级产能并可同回合使用。
- 政府系统以行政力约束改革、常规政策和市场政策；当前政府市场政策只保留 `贸易促进` 增加海外容量，不再提供国内价格/容量政策或海外价格加成。
- 研究系统以研究设施、研究进展、首研突破和后发直解锁为核心。
- 军事当前主要服务于陆军、舰队、地区封锁和海外市场通路；`海军演练` 已从当前玩家动作中删除，建交不再作为海外出售或市场争夺前置，旧殖民/征服/掠夺链不再作为当前玩家可见主线。
- 海外封锁已改为“点开具体海外地区后分配舰队封锁该地区”；旧连通点不再作为玩家可见入口，也不再作为海外销售拦截条件。
- 国内市场已按客户补充公式重构：`P0 = 民间购买力 / 定价软上限`，`P = clamp(P0 × (2 - 投放量 / 软上限) + 国内价格加成, 0.1×P0, 2×P0)`；国内投放不再被软上限硬拦截。

## 最新验证

- `git diff --check`：通过。
- 后端：`backend/.venv/bin/python -m pytest backend/tests/test_balance_config.py backend/tests/test_phase1_economy.py backend/tests/test_rules_market.py backend/tests/test_rules_settlement.py backend/tests/test_phase_submission_services.py backend/tests/test_phase_submit_api.py backend/tests/test_rules_v2_features.py backend/tests/test_m3_e2e_phase1_api.py backend/tests/test_m4_workspace_enrich.py backend/tests/test_m4_pipeline_mirror.py -q`，结果 `105 passed, 7 skipped`。
- 前端：`npm test -- Phase1MarketPanel GamePhasePanelContent decisionShared gameWorkbench index`，结果 `39 passed, 6 skipped`。
- 前端构建：`npm run build` 通过。

## 已知风险

- 本地当前已统一为单一政府财政池，不再显示或使用 `+8` 政策专项额度；云端需等本轮改动部署后再复验。
- 云端出售流程曾出现“请确认本地 API 已启动”的错误文案，不适合线上环境。
- 最近云端测试只覆盖到第 6 回合左右，仍需要新的真实浏览器 1-15 回合复测。
- 旧阶段文档和旧 playtest 报告中有大量已过期内容，处理 bug 前必须回到真实页面确认当前是否仍存在。

## 下一步

1. 补真实浏览器关键流程验证：国内超软上限投放、海外固定价、市场竞争额外容量、封锁解释、结算 3:3:4 回流。
2. 检查 setting 页面是否能清楚解释并调到国内最低价、海外固定价、工厂上限、材料上限等参数。
3. 修改代码前，先以 `docs/当前状态总览.md` 作为规则和状态基线。
4. 涉及按钮覆盖、数值验证、bug 修复或 1-15 回合流程时，先读 `docs/playtests/QA_SESSION_PROTOCOL.md`，再用 Computer Use 做真实浏览器验证。
