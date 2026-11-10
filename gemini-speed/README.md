# gemini-speed（速度模式执行 Agent，v1.2.2）

OpenCode / OpenChamber 的全局速度 Agent 套装：主 Agent `gemini-speed` + 专属探索子代理 `gs-explore`，绑定 `cpa-native/gemini-3.8-flash-high`（native 思考流车道，约 83% 请求 2-5 秒可见思考流）。

## v1.2.2 要点

- **标题税修复**：V2 的隐藏 `title` agent 会继承会话模型——在 Gemini 免费车道上实测 3/3 赌中深思考（387 token 标题请求思考 3700+，串行堵住新会话首条回复 20-34 秒）。安装器现在自动把 `agents.title` 合并进 `opencode.json`：钉死 chat 车道模型 + 锚点系统提示，把标题思考量压到两位数。合并幂等（已存在则跳过，`-ForceTitle` 强制重套）、改前备份
- **思考锚点执行模式**（铁律 0）：实测最优措辞——执行类任务思考量中位 4850 → 125（-95%），正确率不伤；穷举/证明类子任务有逃生舱
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

- 落点：`~/.config/opencode/agents/gemini-speed.md` 与 `gs-explore.md`，外加把 `agents.title` 合并进 `~/.config/opencode/opencode.json`
- 已有同名文件会先备份为 `<名>.md.bak-<日期>` 再覆盖，不静默；opencode.json 改前备份为 `opencode.json.bak-gs-title-<日期>`
- 标题合并幂等：已有 `agents.title` 则跳过（`-ForceTitle` 强制重套）
- 卸载：删除两个 agent 文件 + 从 opencode.json 移除 `agents.title`（或还原 bak-gs-title 备份），零残留

## 注意

- 绑定模型前缀 `cpa-native/`（Google 原生协议车道，需在 `opencode.json` 配置该 provider）。若某台设备没有 `cpa-native`，把两个文件里的 `model:` 改为 `cpa/gemini-3.8-flash-high`，或删掉该行让它跟随当前选择
- 本模块**不**安装任何斜杠命令；需要 `.handoff` 接力那套（`/start`、`/wrapup`）请自行维护
- `install.ps1` 的 `-Project` / `-Force` 参数仅为兼容 `remote-install.ps1` 透传，实际被忽略（本模块装用户全局，不装进项目）
- `gs-explore` 为 `mode: subagent`，仅在会话中被主动派活时运行，不影响全局 explore 等既有子代理
