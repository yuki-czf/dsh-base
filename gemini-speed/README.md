# gemini-speed（速度模式执行 Agent，v1.1.0）

OpenCode / OpenChamber 的全局速度 Agent：绑定 `cpa/gemini-3.8-flash-high`，五条铁律（视野锁死与分段读 / 探索与旁路丢子代理 / 死胡同禁区与先对齐 / 工具精炼与同轮并发 / 按批次收工），压首字延迟与历史体积。纯执行定位：给它计划文件（`execution-contract.md` / `tasks.md` / plan 文档）它照单干，不做架构规划。

## 云端安装

在任意机器的 PowerShell 里（装到当前用户全局，对所有项目生效）：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1))) -Module gemini-speed
```

或在本目录内手动安装：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

装完重启 OpenChamber，Agent 选择器里选 **gemini-speed**。

## 行为

- 落点：`~/.config/opencode/agents/gemini-speed.md`（用户全局，所有项目可见）
- 已有同名文件会先备份为 `gemini-speed.md.bak-<日期>` 再覆盖，不静默
- 卸载：删除上述文件并重启即可，零残留（备份文件一并删）

## 注意

- 绑定模型前缀 `cpa/`，若某台设备的 provider ID 不同，改 agent 文件第 4 行 `model:` 或删掉该行让它跟随当前选择
- 本模块**不**安装任何斜杠命令；需要 `.handoff` 接力那套（`/start`、`/wrapup`）请自行维护
- `install.ps1` 的 `-Project` / `-Force` 参数仅为兼容 `remote-install.ps1` 透传，实际被忽略（本模块装用户全局，不装进项目）
