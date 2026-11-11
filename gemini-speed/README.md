# gemini-speed（速度模式执行 Agent，v1.2.3）

OpenCode / OpenChamber 的全局速度 Agent 套装：主 Agent `gemini-speed` + 专属探索子代理 `gs-explore`，绑定 `cpa-native/gemini-3.8-flash-high`（native 思考流车道，约 83% 请求 2-5 秒可见思考流）。

## v1.2.3 要点

- **校准实验裁决：锚点留任**。为验证"复杂任务是否需要放开思考"，跑了 24 发对照实验（3 个业务向任务 × 4 措辞 × 2 发）：多条件定价 bug、React 闭包、跨函数重构。结果：30 锚点在复杂任务上 **6/6 全对、思考中位 109、每题约 3 秒**；两段式放行零正确率增益，思考量却涨 2.2-6 倍（最坏 6421）、耗时翻倍——假设被证伪，锚点保留
- **逃生舱扩宽**：在穷举/证明/安全之外，新增"多模块业务联动、隐蔽状态 bug（闭包/时序）拿不准该改哪一处"——复杂任务该深想时先声明、看得见地升级
- **安装器分发 cpa-native provider**：自动从本机 `cpa` 克隆（baseURL 后缀 `/v1`→`/v1beta`，apiKey 引用原样复制、不进仓库），隧道前缀机器（如 hy2 本地转发 9443）一次装齐；`-NativeBaseURL` 可覆盖、`-ForceNative` 强制重套
- gs-explore 的 30 锚点不动（探索任务实测完美）

## 沿革要点

- **标题税修复（v1.2.2）**：V2 的隐藏 `title` agent 会继承会话模型——在 Gemini 免费车道上实测 3/3 赌中深思考（387 token 标题请求思考 3700+，串行堵住新会话首条回复 20-34 秒）。安装器自动把 `agents.title` 合并进 `opencode.json`：钉死 chat 车道模型 + 锚点系统提示
- **思考锚点执行模式**（铁律 0，v1.2.1 引入）：执行类任务思考量中位 4850 → 125（-95%），正确率不伤
- **native 车道绑定**：`cpa-native/` 走 Google 原生协议，思考流实时可见
- **200K 上下文红线**：200K 是本车道舒适上限（首字约 11s）；300K+ 每百 K 多付约 18 秒
- **专属子代理 gs-explore**：探索活外包（独立上下文用完即焚），只回结论摘要；不占用、不修改任何全局子代理
- **读档规则**：项目有 `.nodes/` 时只读 `.nodes/CONTEXT.md` 一页纸快照

## 云端安装

在任意机器的 PowerShell 里（装到当前用户全局，对所有项目生效）：

```
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1))) -Module gemini-speed
```

或在本目录内手动安装：

```
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

装完重启 OpenChamber，Agent 选择器里选 **gemini-speed**。

## 行为

- 落点：`~/.config/opencode/agents/gemini-speed.md` 与 `gs-explore.md`，外加把 `agents.title` 与 `providers.cpa-native` 合并进 `~/.config/opencode/opencode.json`
- 已有同名文件会先备份为 `<名>.md.bak-<日期>` 再覆盖，不静默；opencode.json 改前备份为 `opencode.json.bak-gs-<日期>`（两处合并共用一份备份）
- 两个合并均幂等：已有 `agents.title` / `cpa-native` 则跳过（`-ForceTitle` / `-ForceNative` 强制重套；`-NativeBaseURL` 手动指定 native 车道地址）
- 卸载：删除两个 agent 文件 + 从 opencode.json 移除 `agents.title` 与 `cpa-native`（或还原 bak-gs 备份），零残留

## 注意

- 安装器会自动克隆 `cpa` → `cpa-native`（含 apiKey 引用，密钥不进仓库）；若设备没有 `cpa` provider 则跳过并提示，先配好 `cpa` 再重跑即可
- 隧道/转发机器（如 hy2 本地 9443 端口）：默认推导即适用（仅换路径后缀）；装完可验证：`curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:9443/v1beta/models` 返回 200/401 即通（404 = 隧道后端没有 native 路由）
- 本模块**不**安装任何斜杠命令；需要 `.handoff` 接力那套（`/start`、`/wrapup`）请自行维护
- `install.ps1` 的 `-Project` / `-Force` 参数仅为兼容 `remote-install.ps1` 透传，实际被忽略（本模块装用户全局，不装进项目）
- `gs-explore` 为 `mode: subagent`，仅在会话中被主动派活时运行，不影响全局 explore 等既有子代理
