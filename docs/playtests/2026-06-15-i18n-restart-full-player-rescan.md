# 2026-06-15 i18n Restart Full Player Rescan

## 元信息

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-06-15 |
| 测试方式 | Browser 插件控制当前 in-app browser；真实页面点击 + 每次点击后截图 + DOM 可见文本扫描 |
| 前端 | http://127.0.0.1:5173 |
| 后端 | http://127.0.0.1:5001 |
| 服务重启 | 已停止旧 5173/5001 进程；前端 `npm run dev -- --host 127.0.0.1`；后端 `PORT=5001 backend/.venv/bin/python backend/run.py` |
| 截图目录 | `docs/playtests/artifacts/2026-06-15-i18n-restart-full-player-rescan/` |
| 范围 | English 模式，从 Lobby 创建房间、进入游戏、模拟玩家推进到 Final Archive，检查每次点击后的中文泄露 |

## 问题台账

| 编号 | 来源 | 模块 | 严重程度 | 摘要 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| I18N-RESCAN-001 | Round 1 / Government Policy | 政府面板 / 可访问名称 | P3 | English 模式下 `Select Trade Promotion` 按钮的可访问名称包含中文冒号 `Select：Trade Promotion`；截图正文未见中文，但 DOM/辅助技术文本仍有中文标点残留。 | `008-round-1-click-next-government.png`；DOM snapshot；修复后 `rg "Select：" frontend/src` 无命中，`npm test -- GovernmentPanel GamePhasePanelContent`、`npm run test:i18n-cjk`、`npm test`、`npm run build` 通过 | 已修复待线上复验 |

## 点击截图扫描汇总

| 项目 | 结果 |
| --- | --- |
| 对局 ID | `d48d07d680f04dbba047b0b128706dea` |
| 房间号 | `J48BDH` |
| 玩家国家 | Britain |
| 完整流程 | Lobby -> Room -> Round 1-10 -> Final Archive |
| 截图数量 | 155 张 PNG |
| 点击后扫描数量 | 120 次点击后扫描 |
| 可见业务文本汉字泄露 | 0 |
| 可见业务文本中文标点泄露 | 0 |
| DOM/辅助属性泄露 | 18 次，均为同一问题：`aria-label=Select：Trade Promotion` |
| 终局 URL | `http://127.0.0.1:5173/settlement/d48d07d680f04dbba047b0b128706dea` |
| 终局截图 | `246-final-archive-url-arrived.png` |

## 回合覆盖

| 范围 | 截图证据 | 结论 |
| --- | --- | --- |
| Lobby / Room | `001`-`005` | 业务内容无汉字、无中文标点；语言切换按钮 `中文` 为预期例外。 |
| Round 1 | `006`-`113` | 决策、市场、结算完成；可见文本无泄露；发现政府面板 aria-label 中文冒号。 |
| Round 2 | `114`-`127` | 决策、市场、结算完成；政府面板 aria-label 问题复现。 |
| Round 3 | `128`-`144` | 决策、市场、结算完成；政府面板 aria-label 问题复现。 |
| Round 4-6 | `145`-`188` | 决策、市场、结算完成；政府面板 aria-label 问题复现。 |
| Round 7-8 | `189`-`216` | 决策、市场、结算完成；政府面板 aria-label 问题复现。 |
| Round 9-10 / Final | `217`-`246` | 进入终局档案页；Final Archive 无汉字、无中文标点、无属性泄露。 |

## 最终结论

- 本地服务已重启：前端 `5173`，后端 `5001`，后端健康检查 `ok: true`。
- 已完成一次真实页面点击的 10 回合英文模式流程，并进入 Final Archive。
- English 模式可见业务文案本轮未发现中文泄露。
- 本轮发现的 P3 级 DOM/辅助属性残留已完成本地修复，等待 GitHub/Zeabur 部署后线上复验。
