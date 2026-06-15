# 2026-06-15 i18n Lobby Language Switch Regression

## 元信息

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-06-15 |
| 测试方式 | 本地服务 + 真实浏览器页面复验 |
| 前端 | http://127.0.0.1:5173 |
| 后端 | http://127.0.0.1:5001 |
| 范围 | Lobby / Home 入口在 English 模式下不残留中文 |
| 备注 | Computer Use 无法控制 Codex 应用窗口（安全策略禁止 `com.openai.codex`），本次复验改用本机 Chrome headless 打开同一本地页面并扫描 DOM。 |

## 问题台账

| 编号 | 来源 | 模块 | 严重程度 | 摘要 | 状态 | 复验要求 |
| --- | --- | --- | --- | --- | --- | --- |
| I18N-EN-002 | 用户截图 | Lobby / 语言切换 | P2 | Lobby 切换到 English 后仍显示“可恢复的进度”“回到对局”“创建新房间”“输入房间码加入”等中文。根因：部分 viewModel 在中文状态下生成后被 `useMemo` 或 hook state 固化，没有随 `i18n.resolvedLanguage` 重建。 | 已复验关闭 | 打开真实本地页面，先切中文再切 English；确认恢复横幅、创建房间、房间码加入、等待房间卡片和按钮均显示英文，除语言选项名“中文”外无中文残留。 |

## 复验记录

| 顺序 | 页面 / 模块 | 操作 | 期望 | 实际 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | Lobby | Chrome headless 打开 `http://127.0.0.1:5173/lobby`；创建临时房间 `YNRC5U`，写入本地 profile/session；先用 `app_locale=zh` 加载，再点击 English | English 模式下恢复横幅、创建房间、房间码加入、等待房间卡片和按钮均为英文；允许语言切换器目标语言名 `中文` | 页面显示 `Recoverable Progress`、`Found a room or game you left earlier.`、`Enter Room`、`Create New Room`、`Join with Room Code`、`Host i18n-mqeznpbs`；DOM 文本去掉 `中文` 后 Han 字符扫描结果为 `[]` | 通过 |
