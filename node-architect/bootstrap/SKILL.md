---
name: node-architect-installer
description: 安装或更新节点协议到当前项目。当用户说"装节点协议 / 初始化节点协议 / 安装节点协议 / 更新节点协议 / 升级节点协议 / 同步节点协议"，或要为长项目建立节点存档体系、对抗上下文压缩时使用。
---

# node-architect 安装器（全局引导）

在当前项目根运行（脚本自动识别当前客户端、默认当前目录，无需传参；`{{MASTER}}` 由 install.ps1 -Bootstrap 安装时替换为实际母版路径）：

```powershell
powershell -ExecutionPolicy Bypass -File "{{MASTER}}\install.ps1"
```

**更新语义**：本项目已装过节点协议时，重跑同一条命令即为更新——幂等安全：技能本体覆盖为新版（本地差异自动备份到 `.agents\backup\`），项目档案 `.nodes\`（CONTEXT/PROGRESS/DECISIONS/SESSIONS/archive/plans）一律保留不动，AGENTS.md 指针版本自动刷新。

若上方命令里的路径未替换（仍显示花括号 MASTER 占位符）或已失效（换机/移动目录）：请改为你机器上 node-architect 母版目录（含 install.ps1 的目录）的实际路径执行同一命令，并重跑该目录的 `install.ps1 -Bootstrap` 修复本引导技能。

装完后立即：
1. 读 `.nodes/CONTEXT.md` 与 `.nodes/PROGRESS.md`
2. 向用户复述"当前节点 / 下一步"，确认后按协议工作
3. 用户说"存档"时，按 `.nodes/PROTOCOL.md` 执行存档（机械动作用 `skill/scripts/save.ps1 save` 一键完成 CONTEXT 落盘与校验；无 PowerShell 用 `save.mjs`）
