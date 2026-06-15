# 2026-06-15 i18n Full Player Browser Run

## 元信息

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-06-15 |
| 测试方式 | Browser 插件控制当前 in-app browser；真实页面点击 + 每步截图 + DOM 可见文本扫描 |
| 前端 | http://127.0.0.1:5173 |
| 后端 | http://127.0.0.1:5001 |
| 游戏 | `/game/d9ee943cc0a242459b7b7d6409605ac2` |
| 玩家 | Britain / `i18n-player-mqezwst3` |
| 范围 | English 模式，从大厅、房间创建、10 回合完整游玩到 Final Archive，检查中文泄露 |
| 备注 | `docs/playtests/QA_SESSION_PROTOCOL.md` 要求 Computer Use；本环境安全策略禁止 Computer Use 控制 Codex/in-app browser，因此使用 Browser 插件连接当前 in-app browser 执行真实页面点击。 |

## 截图索引

截图目录：`docs/playtests/artifacts/2026-06-15-i18n-full-player-browser-run/`

| 范围 | 覆盖 |
| --- | --- |
| `01`-`06` | Lobby、昵称、创建房间、选 Britain、添加 AI、Ready |
| `07`-`52` | 第 1 回合决策、市场、结算；包含提交重试和市场草稿复核 |
| `53`-`67` | 第 2 回合完整决策、市场、结算 |
| `68`-`82` | 第 3 回合完整决策、市场、结算 |
| `83`-`97` | 第 4 回合完整决策、市场、结算 |
| `98`-`113` | 第 5 回合完整决策、市场、结算；`113` 为批量脚本超时后的状态复核 |
| `114`-`128` | 第 6 回合完整决策、市场、结算 |
| `129`-`143` | 第 7 回合完整决策、市场、结算 |
| `144`-`158` | 第 8 回合完整决策、市场、结算 |
| `159`-`173` | 第 9 回合完整决策、市场、结算 |
| `174`-`190` | 第 10 回合完整决策、市场、结算、Final Archive |

## 问题台账

| 编号 | 模块 | 严重程度 | 摘要 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| I18N-FULL-001 | 全局游戏 Shell / 标点 | P3 | English 模式下多处使用中文标点：`：`、`、`、`，`、`（`、`）`、`。`。 | `15-resume-round-1-current-state.png`, `190-final-archive-state.png` | 已修复并复验：`npm run test:i18n-cjk` 通过；Browser 复扫 Final Archive 无中文标点 |
| I18N-FULL-002 | Market Sales 面板 | P1 | 市场面板使用中文国家/区域/统计标签：`英国`、`欧洲`、`美洲`、`非洲`、`中东`、`亚太`、`市场计算核对`、`当前预估`、`国内`、`海外`、`合计`。 | `44-round-1-market-panel-opened.png`, `64-round-2-market-panel.png`, `185-round-10-market-panel.png` | 已修复并复验：新增英文 Market 面板单测覆盖后端中文区域 label、审计区文案和中文标点扫描 |
| I18N-FULL-003 | Fiscal Settlement 面板 | P1 | 结算页标题使用中文国家名，例如 `National Income Distribution Results for 英国`。 | `52-round-1-market-submit-retry-after.png`, `67-round-2-settlement.png`, `188-round-10-settlement.png` | 已修复并复验：新增英文 Settlement heading 单测；Browser 复扫 Final Archive 无汉字 |
| I18N-FULL-004 | 改革 / 阶段效果展示 | P1 | 中后期改革效果名称在 English 模式下显示中文：`劳工保护`、`公共教育`、`国防动员`、`社会保障`。 | `129-round-7-decision-start.png`, `159-round-9-decision-start.png`, `174-round-10-decision-start.png` | 已修复并复验：新增 `GameSituationSummary` 英文改革名单测，覆盖四个后端中文改革标签 |

## 回合记录

| 回合 | 阶段覆盖 | 截图证据 | 中文扫描结论 |
| --- | --- | --- | --- |
| Lobby/Room | 大厅、昵称、创建房间、选国家、添加 AI、Ready | `01`-`06` | 未发现汉字；English 文案正常。 |
| 1 | 决策、市场、结算 | `07`-`52` | 决策面板未发现汉字；市场首次出现 P1 汉字泄露；结算出现 `英国`。 |
| 2 | 决策、市场、结算 | `53`-`67` | 决策未发现汉字；市场和结算重复 P1 泄露。 |
| 3 | 决策、市场、结算 | `68`-`82` | 泄露模式与第 2 回合一致。 |
| 4 | 决策、市场、结算 | `83`-`97` | 泄露模式与第 2 回合一致。 |
| 5 | 决策、市场、结算 | `98`-`113` | 泄露模式与第 2 回合一致。 |
| 6 | 决策、市场、结算 | `114`-`128` | 无可售库存，但市场面板仍泄露中文区域/统计标签；结算仍泄露 `英国`。 |
| 7 | 决策、市场、结算 | `129`-`143` | 新增改革名 `劳工保护` 中文泄露。 |
| 8 | 决策、市场、结算 | `144`-`158` | 泄露模式与第 7 回合一致。 |
| 9 | 决策、市场、结算 | `159`-`173` | 新增 `公共教育`、`国防动员` 中文泄露。 |
| 10 | 决策、市场、结算、Final Archive | `174`-`190` | 新增 `社会保障` 中文泄露；Final Archive 无汉字，但仍有中文冒号。 |

## 扫描汇总

| 项目 | 结果 |
| --- | --- |
| PNG 截图总数 | 190 |
| 严格扫描记录数 | 176 |
| 含汉字记录数 | 83 |
| 含中文标点记录数 | 176 |
| 汉字集合 | `英国`, `欧洲`, `美洲`, `非洲`, `中东`, `亚太`, `市场计算核对`, `当前预估`, `国内`, `海外`, `合计`, `劳工保护`, `公共教育`, `国防动员`, `社会保障` |
| 中文标点集合 | `：`, `、`, `，`, `（`, `）`, `。` |

## 流程备注

- 完整流程已从 Lobby 跑到 `/settlement/d9ee943cc0a242459b7b7d6409605ac2` Final Archive。
- 测试过程中 Browser 插件的标签句柄偶发重建。由于当前决策/市场草稿只存在 React state，页面重载会丢失未提交草稿；测试中通过在同一连续 UI 动作内重新分配并提交完成流程。该风险不作为本次 i18n 缺陷主项，但后续做稳定性测试时应单独跟踪。
- 第 6 回合后多轮没有可售库存，市场最大分配按钮不可用；仍然打开市场面板截图检查。

## 2026-06-15 修复复验

| 复验项 | 结果 |
| --- | --- |
| 前端全量单测 | `npm test` 通过，38 test files passed，202 passed / 6 skipped |
| 定向前端单测 | `npm test -- GamePage PhaseAnnounce playwrightHooks GameSituationSummary GamePhasePanelContent SettlementPage panelGlossary` 通过，51 passed / 6 skipped |
| i18n 静态审计 | `npm run test:i18n-cjk` 通过 |
| 前端构建 | `npm run build` 通过 |
| 后端终局英文链路 | `python3 -m pytest backend/tests/test_final_result_api.py -q` 未能执行：本机 `python3 --version` 为 3.9.6，不支持项目 `@dataclass(slots=True)`；需用 Python 3.10+ 环境运行 |
| Browser Lobby 复扫 | `/lobby` English 模式仅发现语言切换按钮文字 `中文`；业务内容无汉字、无中文标点 |
| Browser Final Archive 复扫 | `/settlement/d9ee943cc0a242459b7b7d6409605ac2` English 模式 DOM 扫描 `cjk=[]`、`punct=[]` |
| Browser Market 复扫 | 当前本地可恢复游戏已结束，`/game/d9ee943cc0a242459b7b7d6409605ac2` 自动跳转 Final Archive；Market 面板由组件级英文单测覆盖 |

## 最终结论

- 是否完成从头到尾流程：已完成，10 回合结束并进入 Final Archive。
- English 模式中文泄露：已完成本轮整改。Lobby/Final Archive 浏览器复扫通过；Market Sales、Fiscal Settlement、改革/阶段效果由定向单测覆盖。
- 阻断问题：无阻断完整流程的问题；本轮发现的 English 模式 i18n 泄露已完成整改并通过复验。
