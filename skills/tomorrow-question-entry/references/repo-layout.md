# Repository Layout

## 当前仓库现状

当前仓库已经存在的主入口内容：

- `README.md`
- `docs/`
- `skills/tomorrow-question-entry/`
- `backend/`
- `frontend/`
- `deploy/`
- `scripts/`

其中：

- `README.md` 是面向人的项目入口索引
- `docs/` 是正式项目文档集合
- `docs/` 内已经包含一组前端产品化专项文档，用来与主项目任务树解耦
- `skills/tomorrow-question-entry/` 是面向 Codex 的项目入口 skill 源文件
- `backend/` 是 Flask 后端骨架
- `frontend/` 是 React 前端骨架
- `deploy/` 和 `scripts/` 是后续部署与脚本目录

## 目标目录规划

后续推荐的开发结构如下：

```text
tomorrow_question/
├─ README.md
├─ docs/
├─ frontend/
├─ backend/
├─ skills/
├─ deploy/
└─ scripts/
```

目录职责：

- `docs/`：需求、设计、接口、任务文档
- `docs/` 内的 `前端产品化改造设计.md` 与 `前端产品化开发任务清单.md` 负责前端专项入口
- `frontend/`：React 前端
- `backend/`：Flask 后端
- `skills/`：项目级 skill 源文件
- `deploy/`：Docker / Zeabur 部署文件
- `scripts/`：辅助脚本

## Skill 双轨说明

项目入口 skill 采用双轨方式：

### 仓库内源文件

- `skills/tomorrow-question-entry/`

作用：

- 版本管理
- 团队协作
- 跟随项目文档一起演进

### 本机安装位置

为了让 Codex 自动发现该 skill，需要把它复制到：

- `$CODEX_HOME/skills/tomorrow-question-entry`
- 如果 `CODEX_HOME` 未设置，则默认 `~/.codex/skills/tomorrow-question-entry`

## 回答策略

- 如果用户问“这个仓库为什么既有 README 又有 skill”，回答：README 是给人看的入口，skill 是给模型按需加载的入口。
- 如果用户问“为什么 skill 不直接放在本机目录里”，回答：仓库内需要保留可版本化源文件，但自动发现依赖复制到 `$CODEX_HOME/skills`。
- 如果用户问“前端专项文档为什么不直接塞进总任务清单”，回答：前端产品化已拆成独立工作流，需要与通用开发任务树解耦，便于单独规划和并行分发。
