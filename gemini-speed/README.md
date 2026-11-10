# gemini-speed（速度模式执行 Agent，v1.2.1）

OpenCode / OpenChamber 的全局速度 Agent 套装：主 Agent `gemini-speed` + 专属探索子代理 `gs-explore`，绑定 `cpa-native/gemini-3.8-flash-high`（native 思考流车道，约 83% 请求 2-5 秒可见思考流）。

## v1.2.1 要点

- **思考锚点执行模式**（铁律 0 升级）：实测最优措辞——执行类任务思考量中位 4850 → 125（-95%），正确率不伤（代码修复 3/3）；穷举/证明类子任务有逃生舱（先声明再深想）
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

- 落点（两个文件）：`~/.config/opencode/agents/gemini-speed.md` 与 `~/.config/opencode/agents/gs-explore.md`
- 已有同名文件会先备份为 `<名>.md.bak-<日期>` 再覆盖，不静默
- 卸载：删除上述两个文件（连同 .bak）并重启即可，零残留

## 注意

- 绑定模型前缀 `cpa-native/`（Google 原生协议车道，需在 `opencode.json` 配置该 provider）。若某台设备没有 `cpa-native`，把两个文件里的 `model:` 改为 `cpa/gemini-3.8-flash-high`，或删掉该行让它跟随当前选择
- 本模块**不**安装任何斜杠命令；需要 `.handoff` 接力那套（`/start`、`/wrapup`）请自行维护
- `install.ps1` 的 `-Project` / `-Force` 参数仅为兼容 `remote-install.ps1` 透传，实际被忽略（本模块装用户全局，不装进项目）
- `gs-explore` 为 `mode: subagent`，仅在会话中被主动派活时运行，不影响全局 explore 等既有子代理
