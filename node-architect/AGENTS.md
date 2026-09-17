# node-architect 安装目录（agent 请读我）

用户说"安装本目录的 skill / 装节点协议"时，你只需做一件事：

**本目录**（即你读到本 AGENTS.md 的目录，含 `install.ps1`）就是安装源。在**目标项目的根目录**（通常就是你当前 shell 的工作目录，不要 cd 进本目录）运行本目录的 install.ps1：

```powershell
& "<本目录实际路径>\install.ps1"
```

- 不需要传任何参数：默认安装到当前目录；自动识别当前客户端并建立对应技能镜像。
- 若 shell 工作目录不在目标项目根，才显式加 `-Project <目标项目路径>`。
- 重复运行安全（幂等更新）。

装完后的验收：
1. 确认目标项目出现 `.agents\skills\node-architect\SKILL.md`、`.nodes\CONTEXT.md`、`AGENTS.md`
2. 读 `.nodes\CONTEXT.md` 与 `.nodes\PROGRESS.md`，向用户复述"当前节点 / 下一步"
3. 之后遵守项目 `AGENTS.md` 的节点协议铁律；用户说"存档"时按 `.nodes\PROTOCOL.md` 执行存档（机械动作走 `skill/scripts/save.ps1 save`，无 PowerShell 用 `save.mjs`）；大节点拆批执行走「批次协议」（PROGRESS 状态 `进行中·批N/M`，立节点先按询问制二选一不混用，批末 `save.ps1 commit` 原子收口、内含 verify-batch 校验）

可选参数（仅特殊场景）：`-Copy`（联接不可用时用拷贝镜像）、`-SkipNodes`（只装 skill）、`-Clients opencode,zcode`（显式指定客户端镜像）。
