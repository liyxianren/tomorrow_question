# Docker + Zeabur 发布说明

当前发布拓扑固定为：`Zeabur 单服务同容器`。  
前端在镜像构建阶段执行 `npm run build`，后端运行时直接托管 `frontend/dist`。

## 1. 交付文件

- 根目录 [Dockerfile](/C:/Users/Administrator/Desktop/tomorrow_question/Dockerfile)
- 根目录 [.dockerignore](/C:/Users/Administrator/Desktop/tomorrow_question/.dockerignore)
- 环境变量模板 [deploy/.env.production.example](/C:/Users/Administrator/Desktop/tomorrow_question/deploy/.env.production.example)

## 2. 运行时约定

- 容器入口：`python run.py`
- 默认监听：`0.0.0.0:$PORT`
- 前端静态目录：`/app/frontend/dist`
- SQLite 建议挂到 Zeabur 持久化卷：`/data/tomorrow_question.sqlite3`
- 健康检查：`GET /healthz`

当前 `/healthz` 会返回：

- `service`
- `appEnv`
- `databaseReady`
- `frontendReady`
- `balanceConfigReady`
- `phaseDurationSeconds`

## 3. Zeabur 部署步骤

1. 在 Zeabur 里从当前仓库创建一个新服务。
2. 使用仓库根目录的 [Dockerfile](/C:/Users/Administrator/Desktop/tomorrow_question/Dockerfile) 作为构建入口。
3. 挂载一个持久化卷，并让 SQLite 落在 `/data/tomorrow_question.sqlite3`。
4. 按 [deploy/.env.production.example](/C:/Users/Administrator/Desktop/tomorrow_question/deploy/.env.production.example) 配置环境变量。
5. 部署完成后先检查 `/healthz`，确认：
   - `databaseReady = true`
   - `frontendReady = true`
   - `balanceConfigReady = true`

## 4. 发布前演练清单

发布前至少做一次完整演练：

1. 构建镜像
2. 启动容器
3. 访问首页与大厅
4. 创建房间并凑满 `5` 人
5. 进入第 `1` 回合
6. 完整跑过 `国家决策 -> 市场出售 -> 财政结算` 一轮
7. 刷新任意一个玩家页面，验证恢复
8. 触发一次 timeout 自动补交
9. 重启容器后验证房间和对局仍能恢复

## 5. 本地容器验证

在仓库根目录执行：

```powershell
docker build -t tomorrow-question .
docker run --rm -p 8080:8080 -e SECRET_KEY=local-dev -v ${PWD}/data:/data tomorrow-question
```

然后访问：

- [http://127.0.0.1:8080/](http://127.0.0.1:8080/)
- [http://127.0.0.1:8080/healthz](http://127.0.0.1:8080/healthz)

## 6. 当前边界

- 这版仍然是单容器、单进程、SQLite 持久化
- 不包含 Redis、多实例协同和复杂监控
- 上线策略应按“受控内测”执行，而不是按成熟正式版承诺稳定性
