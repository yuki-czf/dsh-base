# DSH 自动派生探路 · 批次计划

- **PROGRESS 登记**：节点 #8，状态 **进行中·批2/2**（批1 探路落地 2026-08-28，会话 v8-b1）
- **阈值**：单批材料 ≤30K tokens（沿用既有校准）
- **校准日志**：
  - 批1 实测 ~85K，超 30K 预算。原因：契约分散在 4 层代码（webserver→client-connection→client-runtime→host-apiproxy），逐层定位耗材料；`lib/client.js`（1.2MB）与 app.asar（104MB）只做 grep 不整读是控量关键。**同型任务捷径：直奔 `dsh-host-apiproxy/lib/index.js` 的 `UNARY_ROUTES` 表 + 各 `*RequestSchema`，一次拿全契约**。批2 实现预计 ≤20K（契约已明，只写 pwsh + 实测）。
- **会话标识**：批1 = `v8-b1`（已用）；批2 用 `v8-b2`
- **背景**：DSH 手动链的唯一痛点=批末要用户手动开下一批会话。已实证：DSH 桌面版跑本地 web 服务（127.0.0.1:43120，会话系统提示可见 DSH_WEB_URL 注入）；app 本体在 `E:\Program Files\DSH Desktop\resources\app.asar\`；本机无 dsh CLI；~/.dsh/plugins/ 支持自定义 cordis 插件（dsh-mcp-ls 样例）。

| 批 | 名称 | 范围 | 验收标准 | 预估材料K | 前置批 |
|---|------|------|----------|-----------|--------|
| 1 | web API 反推 | 只读调研：①解包/检索 `app.asar` 定位会话创建端点与鉴权方式（token/本地免鉴权）②探测 127.0.0.1:43120（GET 类端点；POST 实测须用户知情）③产出 API 契约笔记（端点/请求体：preset/model/prompt/cwd/工作目录） | API 契约笔记落本文件「批1 产出」节：能明确回答"能否程序化创建 DSH 会话（含 preset+模型指定）"——能/不能都算完成 | 15 | - |
| 2 | 实现或关闭 | 分支 A（端点可用）：实现派生——优先 pwsh Invoke-RestMethod 直调（写入 batch-executor preset 纪律 7 的 DSH 分支或独立派生脚本）；SKILL bump + pack 出新 zip；DSH 实测：真批末自动开出下一批会话（preset/模型/prompt 正确）。分支 B（不可用）：DECISIONS 归档结论=维持手动档 + 记录障碍，节点关闭 | 分支 A：真批末自动派生实测通过 + 镜像 diff=0 + 新 zip；分支 B：结论归档 + PROGRESS 关闭 | 15 | 1 |

## 批间衔接说明

- 批1 产出决定批2 走 A/B 分支；两分支都算节点完成（探路节点的验收=拿到确定性答案，不承诺一定做成）
- 分支 A 的实现形态优先级：pwsh 直调（零安装面）> cordis 插件工具（需摸插件 API，成本高）

## 边界（禁做）

- 只读 app.asar，不修改 DSH 应用本体；不逆向再分发
- POST 类实测（会真实创建会话）执行前须用户知情同意
- 不动 opencode/DSH 两侧既有 batch-executor 交付物（节点 6/7 产物）

## 批1 产出（2026-08-28 · 会话 v8-b1 · 对象 DSH Desktop 2.0.3）

> **结论：分支 A —— 能程序化创建 DSH 会话（含 preset+模型指定）。**
> 唯一前置 = 用户一次性在 DSH 设置里放行浏览器访问；之后任意本地进程（pwsh/curl）可直调全部 API。
> 方法：只读解包 `app.asar`（解包件在 `%TEMP%\dsh-asar\app`，未动 DSH 本体）+ GET 探测（零 POST）。

### 1. 线协议

- 端点：`POST http://127.0.0.1:<port>/api/<method>`；port 默认 43120（`desktop-port`：EADDRINUSE 时 +1 重试，至多 32 次，故实测前先确认实际端口）
- 请求体：`{"type":"client-request","rpcId":"<uuid>","method":"<method>","payload":{...}}`
- 响应体：`{"rpcId":"...","result":{"ok":true,"value":{...}}}`；业务错误恒为 HTTP 200 + `{"ok":false,"error":{"code","message","details"}}`（HTTP 状态只表达载体层：404 未知方法 / 415 非 JSON / 400 坏 JSON）
- 事件流：`GET /api/events.mux`（升级 WebSocket）订阅会话事件（`turn/start`、`assistant/message`、`tool/call`…）；approval/question 应答经 `POST /api/respond` 回传。**纯 fire-and-forget 派生可不开 WS**：prompt 返回 `{accepted:true}` 即已入队。

### 2. 派生三连（批2 要用的全部）

```
① POST /api/session.create     payload: { "cwd": "E:\\www\\dsh-base", "agentPreset": "batch-executor" }
                               （workspaceId 与 cwd 二选一；sessionId 可选自定义；返回 {sessionId, agentPreset?}）
② POST /api/session.selectModel payload: { "sessionId": "...", "provider": "...", "model": "..." }   ← 可选，模型指定；可选项先查 /api/session.models 或 /api/llm.models
③ POST /api/session.prompt      payload: { "sessionId": "...", "mode": "queue", "content": [{"type":"text","text":"<批末派生指令>"}] }
                               （mode: "queue"|"steer"；content 支持 image 块；返回 {accepted:true}）
```

- preset 双通道：创建时带 `agentPreset`，或事后 `agentPreset.select {sessionId, agentPreset}`；`agentPreset.list {}` 可枚举
- 完整方法面（同栅栏后全部可用，源 `dsh-host-apiproxy` UNARY_ROUTES）：`session.list/search/history/rename/fork/cancel/updateQueue/attachment`、`subagent.*`、`workspace.*`、`llm.models/providers/discoverModels`、`settings.*`、`credentials.*`、`goal.*`、`skill.list`、`host.*`、`agentPreset.*`
- 系统提示内 `DSH_WEB_URL` 变量由 `dsh-web-app` 注入（与既有实证吻合）

### 3. 鉴权（两道栅栏，反推自 `webserver.js` + `desktop-browser-access` + `client-connection`）

1. **DesktopWebServer permits（唯一硬闸，当前 403 的来源）**：请求带 `x-dsh-desktop-renderer: <token>` 头 = renderer 全权。token 为 32B base64url（43 字符），每次启动 `randomBytes` 生成、仅存主进程内存、只随 `runtime.schedule` 注入 Electron 原生窗口——**进程外不可获取，此路不通**。剩余判定：`ordinaryBrowserEnabled = (mode==="compatibility" && openBrowser)`，默认 false → 一律 403 "forbidden"。
   - **放行方式（用户一次性操作，批2 前置）**：DSH 设置 → shell 切 **compatibility** + 开 **浏览器访问**（settings 命名空间 `dsh-desktop`：`mode:"compatibility"`、`openBrowser:true`、`networkExposure:"loopback"`），重启生效（这类启动设置改动会自动触发重启）。
   - **安全红线：networkExposure 保持 loopback，勿选 lan**——放行后本机任意进程都能驱动 DSH，选 lan 等于暴露到局域网。
2. **isTrustedApiRequest（对本地进程形同虚设）**：Host 头为 loopback 即通过；curl/pwsh 不带 Origin/sec-fetch-site 天然通过；特权方法（`settings.update`、`credentials.*`、`agentPreset.read` 等）的空信任表校验在 loopback 下同样放行。
- 坑：URL 带 `dsh-desktop-*` 查询参数的请求即使浏览器访问开着也会被拒（Electron renderer 专用 marker，普通进程勿用）。

### 4. GET 实测（本批零 POST）

`/`、`/api/session.list`、`/api/llm.models`、`/?dsh-desktop-probe=1`、WS 升级 `/api/events.mux` —— 当前全部 403，与代码结论一致（栅栏关闭时全路由拦截，含 WebSocket 与 marker URL）。

### 5. 备选通道（仅记录，未走）

- `~/.dsh/plugins/` cordis 插件：进程内直调 `ctx.sessions.create()`，绕开 HTTP 栅栏；需摸插件 API，成本高——栅栏放行方案失败时的 fallback
- `dsh-headless` 包存在于 app.asar：独立无头通道，批2 如需再探

### 6. 批2 分支 A 执行序（待启动，会话 v8-b2）

1. 用户在 DSH 设置开 compatibility+浏览器访问（loopback）→ 重启 → 确认端口
2. pwsh `Invoke-RestMethod` 封装派生三连（落 batch-executor preset 纪律 7 的 DSH 分支或独立脚本 `derive-next-batch.ps1`）
3. **首个真 POST 实测前须用户知情**：实测 `session.create`+`prompt` 真开出会话
4. DSH 真批末自动派生实测（preset/模型/prompt 正确）→ 母版 bump（v1.3.3）+ install 同步 + pack zip
