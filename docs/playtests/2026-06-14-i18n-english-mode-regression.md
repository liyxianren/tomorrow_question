# 2026-06-14 i18n English Mode Regression

## 元信息

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-06-14 |
| 测试方式 | Computer Use 控制真实本地浏览器页面 |
| 前端 | http://127.0.0.1:5173 |
| 后端 | http://127.0.0.1:5001 |
| 范围 | 默认英文、fallback 英文、普通玩家路径不漏中文 |

## 问题台账

| 编号 | 来源 | 模块 | 严重程度 | 摘要 | 状态 | 复验要求 |
| --- | --- | --- | --- | --- | --- | --- |
| I18N-EN-001 | 本轮审查 | i18n / 英文模式 | P2 | 英文模式下部分游戏 UI 显示中文，根因是中文 fallback、缺失英文 key、CSS content 硬编码和后端中文 label 未翻译。 | 已复验关闭 | Computer Use 打开真实页面，英文模式进入大厅、房间、对局、政府/军事/工厂/市场/研究面板，记录无中文泄漏。 |

## 复验记录

| 顺序 | 页面 / 模块 | 操作 | 期望 | 实际 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | 启动配置 | 清除 `app_locale` 后打开本地页面 | 默认英文；`fallbackLng` 为英文 | 页面默认英文；`i18n.options.fallbackLng` 回归测试断言为 `["en"]` | 通过 |
| 2 | Lobby / Room | Computer Use 进入房间准备页 | 英文模式不出现中文 UI；折叠按钮不硬编码中文 | 页面标题为 `Tomorrow Question`；准备页折叠文案为 `Expand` / `Collapse`；语言切换器保留目标语言名 `中文` | 通过 |
| 3 | Game Shell / AI Guidance | 进入英国第 1 回合决策页 | 左侧主流程、AI Guidance、地图入口为英文 | AI Guidance 显示 `Use Raw Materials First`、`Watch Capacity and Blockades`、`Consider Enact Constitution` 等英文文本 | 通过 |
| 4 | Industrial Zone | 打开工厂面板并检查可访问性树 | 工厂建设、调度 action、aria-label 均为英文 | `闲置 -> Handicraft` 修复为 `Idle -> Handicraft`；`SelectFactory Dispatch：加班轮班` 修复为 `Select Factory Dispatch: Overtime Shifts` | 通过 |
| 5 | Parliament Hall | 打开政府面板 | 改革路径标题、改革描述、政策标签/描述均为英文 | 对象误渲染 `key 'government.reformPath (en)' returned an object instead of string.` 修复为 `Reform Path`；`Universal Suffrage`、`Trust System`、`Social Welfare`、`Strike Negotiation`、`General Mobilization Order`、`Suppress Liberalism/Egalitarianism/Nationalism` 均为英文 | 通过 |
| 6 | Citizen Square | 打开市场预览面板 | 单位和价格说明均为英文 | `24 财政`、`24 件` 修复为 `24 Fiscal`、`24 goods`；说明和表格均为英文 | 通过 |
| 7 | Military Fortress | 打开军事面板 | 世界地图区域状态为英文 | `Europe - 开放` 等修复为 `Europe - Open`；所有区域按钮可访问性名称为英文 | 通过 |
| 8 | Research Institute | 打开研究面板 | 研究设施、科技链、按钮为英文 | `Research Institute` 面板显示 `Current Research`、`Breakthrough Rules`、`Research Facilities`、`Research`，未见应用内容中文 | 通过 |
