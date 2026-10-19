# Adapters: 数据源实测固化

> 实测时间 2026-10-16，全部字段来自本机真实数据，可直接照此实现。

## 1. OpenChamber（HTTP API，免鉴权 GET）

基址 `http://127.0.0.1:{port}`（默认 **57123**，Express，SPA 兜底路由注意 404 判定）。

| 端点 | 方法 | 返回 |
|---|---|---|
| `/api/sessions/status` | GET | `{"sessions": {"<ses_id>": {"status":"idle"\|"running", "lastUpdateAt":<ms>, "metadata":{}}}, ...}` |
| `/api/session/active` | GET | `{"data": {"<ses_id>": {"type":"running"}}}`（当前运行中集合） |
| `/api/session/<sessionID>` | GET | `{"data": {<详情>}}`（见下） |

`/api/session/<id>` 详情字段：
```json
{
  "id": "ses_...", "projectID": "<hash>", "agent": "build",
  "model": {"id":"glm-5.3","providerID":"zai-coding-plan","variant":"max"},
  "cost": 0, "tokens": {"input":N,"output":N,"reasoning":N,"cache":{"read":N,"write":0}},
  "outcome": "succeeded",           // 会话级结果
  "time": {"created":<ms>,"updated":<ms>,"idle":<ms>},
  "title": "...",
  "metadata": {"openchamber":{"assist":{"recap":"<摘要文本>"}}},
  "location": {"directory":"E:\\www\\xxx"}
}
```

**注意**：
- 路由是参数式的：`/api/session/list` 会把 "list" 当 sessionID 报 400（`Expected a string starting with "ses"`）——这不是列表端点
- POST 需要 401 鉴权，但监控所需 GET 全部免鉴权
- 项目名：`location.directory` 末段（projects 接口非必须）
- MCP 层的 `status:"busy"` 在 HTTP 层叫 `"running"`

**轮询策略**：`/api/sessions/status` 每轮必拉（轻量）；对 status=running 或 lastUpdateAt 变化的会话拉 `/api/session/<id>` 详情（节流：每会话每轮最多 1 次）。

## 2. PI-Desktop（SQLite 只读）

库：`~/.pi-desktop/pi.sqlite`（WAL，**必须 `file:...?mode=ro` 打开，禁 immutable=1**）。时间戳 epoch ms。

```sql
-- 项目
SELECT id, path, name FROM projects;            -- id INTEGER, path "E:/www/dsh-base", name "dsh-base"
-- 会话
SELECT id, title, project_id, model_id, created_at, updated_at, deleted_at
  FROM sessions;                                 -- project_id → projects.id
-- 回合（权威状态源）
SELECT id, session_id, status, model_id, error_code,
       input_tokens, output_tokens, started_at, ended_at
  FROM turns;                                    -- status: 'running' | 完成态（ended_at 非空）
```
- `turns.status` 默认 `'running'`；完成回合 `ended_at` 非空。增量水位：`started_at > ?`
- 辅助信号：`~/.pi-desktop/sessions/*.inflight.json` 存在 = 该回合进行中
- 索引验证：按 session_id 过滤走主键；无全表扫描需求（水位增量）
- 末条 assistant 摘要：`messages` 表（session_id + role 过滤，按 seq 倒序取 1）

## 3. ZCode（SQLite 只读）

库：`~/.zcode/cli/db/db.sqlite`（705MB，WAL，**mode=ro**）。`.tables` 秒回。

```sql
-- 会话
SELECT id, project_id, directory, title, time_created, time_updated, task_type
  FROM session;                                  -- directory 如 "D:\www\sales-agent\agent-mail-server"
                                                 -- task_type: interactive | subagent_child
-- 回合（权威状态源）
SELECT session_id, turn_id, status, started_at, completed_at, duration_ms,
       input_tokens, output_tokens, computed_total_tokens,
       error_code, error_type, cancelled_by_user
  FROM turn_usage
  WHERE started_at > ?                           -- 走 turn_usage_started_idx 索引
  ORDER BY started_at DESC;
```
- `turn_usage.status`: `running | completed | error | cancelled`
- 索引：`turn_usage_started_idx(started_at)`、`session_project_idx(project_id)`、PK autoindex(session_id,turn_id)
- 增量必须带 `started_at > 水位`，禁止全表扫
- 项目名：`session.directory` 末段；标题空回退 id 前 8 位
- 心跳兜底：`~/.zcode/cli/exec/sess_*/` 目录 mtime

## 4. DSH Desktop（zstd 会话文件）

文件：`~/.dsh/sessions/<工作区>/<会话目录>/session.v4.jsonl.zstd`，fzstd 纯 JS 解压（python zstandard 0.23.0 为备用方案）。

首行（session 头）：
```json
{"type":"session","version":4,"id":"session-...","createdAt":1791973141095,
 "cwd":"E:\\www\\reddit\\reddit-trend-tc","isSeeded":false,"delegationDepth":0,"agentPreset":"standard"}
```
关键事件（`type` 字段区分）：
| type | data 关键字段 | 用途 |
|---|---|---|
| `session/title` | title | 会话标题 |
| `turn/start` | turn | 回合开始 |
| `turn/end` | `{"turn":1,"reason":{"kind":"completed"}}`；error 时 `reason.error.code`（如 `PI_AI_ERROR`） | **回合完成/失败权威判定** |
| `approval/asked` | id, toolName, reason | 等审批 → blocked |
| `approval/decided` | id | 解除 blocked |
| `assistant/message` | 文本内容 | 末条摘要截取 |

- 项目名：首行 `cwd` 末段（**不依赖目录名解码**）
- 状态机：有 asked 无 decided → blocked；turn/end completed → 该回合完成
- **不支持 v3 旧格式**（检测 `version!=4` 跳过 + debug 日志）
- 无 `session-` 前缀目录 = delegation 子会话，正常采集（delegationDepth>0）
- 文件轮转/删除（ENOENT）：该会话按完成处理，优雅降级

## 5. 环境与运行时

- node v24.0.2 / npm 11.3.0；sqlite3 CLI（miniconda）；python 3.x + zstandard 0.23.0
- 依赖已装：fastify、better-sqlite3、chokidar、fzstd、@larksuiteoapi/node-sdk、@fastify/static、yaml（273 packages）
- OpenChamber 端口发现：`~/.config/openchamber/managed-opencode/<pid>.json` 含 opencode 端口（非 OpenChamber 自身端口）；OpenChamber 自身端口默认 57123 走配置
