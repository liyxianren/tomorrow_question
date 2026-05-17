# 2026-05-17 云端 Zeabur 1-15 一致性测试记录

测试地址：<https://tomorrowtest.zeabur.app/>

测试方式：以 Chrome + Computer Use 作为主要玩家视角操作；终端 API 仅用于辅助定位云端后端是否可用，以及验证被 UI 阻断后无法覆盖的多人阶段推进规则。

## 测试结论

- 本轮无法完成云端玩家视角 1-15 回合。
- 阻断点不是永久性后端不可用，而是云端冷启动/网络延迟缺少清晰提示：创建房间成功后，玩家立即选国会出现 `BACKEND_UNAVAILABLE` 或按钮禁用等待；等待十几秒后，同一房间可成功选国。
- 继续补 AI 并准备后，云端后端已经把房间推进到 `in_game` / R1 decision，但浏览器仍停在房间页 `正在加载...`，没有自动跳转到游戏页，也没有明确告诉玩家需要等待、刷新或重试。
- 云端后端 API 本身不是整体宕机：`/api/v1/lobby/waiting-rooms`、`/api/v1/rooms`、`/api/v1/rooms/{room}/country` 均可通过云端地址返回成功。
- 多人“是否所有真人都提交才推进阶段”在云端后端 API 层验证为正确：2 名真人 + 3 个 AI 时，第一名真人提交后不推进；第二名真人提交后才结算到下一阶段。
- 云端与本地当前不一致：本地最终预上线测试可跑完 1-15；云端玩家 UI 在开房、选国、开局跳转这些网络敏感节点缺少等待/恢复提示，导致玩家会误判为卡死。

## 玩家视角路径

1. 打开 `https://tomorrowtest.zeabur.app/`。
2. 点击 `进入大厅`。
3. 设置昵称为 `cloudQA`。
4. 创建房间成功。
5. 云端房间码：`UNB5TY`。
6. 房间 URL：`https://tomorrowtest.zeabur.app/room/UNB5TY`。
7. 房间显示玩家 `cloudQA`，profile id 显示为 `profile-e148b0277980`，成员数 `1 / 5`，国家未选择。
8. 点击 `英国` 选择国家。
9. 首次和多次重试均未完成选国：
   - 页面出现 `出错了: 后端服务不可用，请确认本地 API 已启动。 (BACKEND_UNAVAILABLE)`。
   - 复测时点击后所有国家按钮会进入禁用/等待状态，随后仍回到未选择国家状态和相同错误。
10. 等待十几秒后再次点击 `英国`，同一房间选国成功，成员栏显示 `cloudQA / 英国`，准备按钮解锁。
11. 点击 `补充 AI 机器人` 后，4 个 AI 正常补齐，房间显示 `5 / 5`。
12. 点击 `准备` 后，页面进入 `正在加载...`，但没有自动跳转游戏页。
13. 辅助查询云端上下文确认，后端已进入 `in_game`，当前游戏为 R1 decision。
14. 因浏览器仍停在房间页加载态，玩家视角仍无法继续完整 1-15。

## 辅助云端 API 证据

### 云端服务健康

- `GET https://tomorrowtest.zeabur.app/` 返回 HTTP 200。
- 首页资源版本：`assets/index-BwCU3a2l.js` / `assets/index-CrIQCphe.css`。
- 响应头显示 `server: gunicorn`，`last-modified: Sun, 17 May 2026 15:30:01 GMT`。
- `GET /api/v1/lobby/waiting-rooms` 返回 `{"data":[],"ok":true}`。

### 后端选国 API 可用

辅助创建 API 房间 `5ES9RP`：

- `POST /api/v1/rooms` 成功创建房间。
- `POST /api/v1/rooms/5ES9RP/country`，payload `{"selectedCountry":"britain"}`，返回 HTTP 200。
- 返回体包含 `{"selectedCountry":"britain"}`。

这说明云端后端选国路由可用，玩家 UI 的 `BACKEND_UNAVAILABLE` 更可能发生在浏览器请求层、连接层、前端运行态恢复逻辑或 Zeabur 网络/冷启动波动处理上。

### 多人提交推进规则

辅助创建 API 房间 `H58537`：

- Host：`apiHost`，选择 `britain`。
- Guest：`apiGuest`，选择 `france`。
- Host 补齐 3 个 AI。
- 两名真人分别 ready 后，游戏进入 R1 decision。
- Host 提交 R1 decision 后，返回 `allSubmitted: false`，房间上下文仍为 `decision / round 1`。
- Guest 再提交 R1 decision 后，返回 `allSubmitted: true`，房间上下文变为 `market / round 1`。

结论：云端后端阶段推进规则正确，至少在 API 层满足“所有真人提交后才推进”。但由于玩家 UI 当前选国阻断，本结论仍需要在修复 UI 后用真实多浏览器/多用户玩家视角复测。

## 问题记录

### CLOUD-001 P1：云端冷启动/网络延迟无明确提示，玩家会误判为失败

位置：`https://tomorrowtest.zeabur.app/room/UNB5TY`

复现步骤：

1. 云端创建房间。
2. 进入房间后立即点击任一国家，例如 `英国`。
3. 或开局后等待自动进入游戏。

实际结果：

- 初次选国时页面提示 `BACKEND_UNAVAILABLE`，或国家按钮进入 disabled 等待态。
- 等待十几秒后同一房间可以继续操作并成功选国。
- 补 AI 并准备后，后端已进入 R1 decision，但浏览器仍停留在房间页 `正在加载...`。
- 页面没有告诉玩家“云端正在启动/连接中，请等待 10-20 秒”，也没有提供明确的重试/刷新/进入游戏入口。

期望结果：

- 云端冷启动或连接未就绪时，页面显示明确等待提示。
- 请求失败后自动重试或提供可理解的重试按钮。
- 房间已进入 `in_game` 时，玩家应自动跳转到游戏页；如果自动跳转失败，应显示 `进入游戏` / `重新连接` 操作。

影响：

- 玩家会以为云端坏了或卡死。
- 本轮云端 1-15 玩家测试仍无法继续。
- 这不是后端规则 P0，但属于云端上线前必须修的高优先级体验/恢复问题。

### CLOUD-002 P1：云端错误文案仍提示“本地 API 已启动”

位置：云端房间页错误条。

实际文案：

`后端服务不可用，请确认本地 API 已启动。 (BACKEND_UNAVAILABLE)`

问题：

- 这是云端环境，提示“本地 API”会误导玩家。
- 即使底层仍是 fetch/network failure，也应按部署环境显示“服务器连接失败 / 请稍后重试”。

### CLOUD-003 P1：开局后后端已进入游戏，但前端停在房间加载态

观察：

- 选国、补 AI、准备后，API 上下文显示房间状态为 `in_game`。
- `currentGameId` 为 `903a321efbf446ac95564325ba19cdfd`。
- `activeGame.currentPhase` 为 `decision`，`activeGame.currentRound` 为 `1`。
- 浏览器仍停在 `/room/UNB5TY`，按钮显示 `正在加载...`。

期望：

- 前端收到房间 `in_game` 或恢复上下文中存在 `activeGame` 时，应跳转到 `/game/{gameId}`。
- 如果实时事件丢失，房间页也应通过轮询/手动恢复按钮进入游戏。
- 加载超过合理时间后，应显示明确错误和恢复操作。

### CLOUD-004 P2：多人全员提交规则尚未完成玩家 UI 复测

状态：

- API 层验证通过。
- 玩家 UI 层未验证。

原因：

- CLOUD-001 阻断房间开局。

后续复测要求：

- 用两个浏览器或两个独立会话进入同一云端房间。
- 两名真人分别选国、补 AI、ready。
- R1 decision 中只让一名真人提交，确认 UI 不推进。
- 第二名真人提交后，确认双方 UI 同步进入 market。

### CLOUD-005 P3：首页可访问性树暴露原始 i18n key

位置：首页主按钮区域的 accessibility label。

观察：

- Computer Use 可访问性树中出现 `home.heroActions.ariaLabel`。

影响：

- 视觉上未确认直接显示给玩家。
- 但辅助功能、自动化测试、读屏器可能读到原始 key。

## 云端/本地一致性判断

- 本地：上一轮 final prelaunch 记录已完成 1-15，未发现 P0 致命阻断。
- 云端：当前部署页面可打开、可进大厅、可创建房间；等待后可选国、补 AI、ready，后端也能进入 R1 decision。
- 当前判断：云端主要问题是冷启动/网络延迟和实时跳转恢复体验不足，不是游戏规则整体不可用。必须先修复 CLOUD-001/CLOUD-003，再重新跑云端 1-15。

## 下一轮云端复测清单

修复后必须重新从玩家视角覆盖：

1. 创建房间。
2. 选国。
3. 补 AI。
4. ready 后开局。
5. 两名真人多人阶段推进。
6. R1-R15 快速决策。
7. 工厂增加 / 产业升级是否真实在下回合生效。
8. 政府政策 / 市场政策行政力和财政是否一致。
9. 市场阶段库存、价格、国内市场容量是否与决策阶段一致。
10. 最终结算是否正常展示。
