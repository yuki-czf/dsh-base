---
name: talk-human-installer
description: 安装或更新 talk-human（说人话输出规范）到本机所有客户端。当用户说"装说人话 / 装 talk-human / 安装输出规范 / 更新说人话 / 更新输出规范"，或要为新机器、新客户端启用平实语言回复规范时使用。
---

# talk-human 安装器（全局引导）

在任意位置运行（脚本自动识别当前客户端、默认装 opencode + claude；`E:\www\dsh-base\talk-human` 由 install.ps1 -Bootstrap 安装时替换为实际母版路径）：

```powershell
powershell -ExecutionPolicy Bypass -File "E:\www\dsh-base\talk-human\install.ps1"
```

**更新语义**：重跑同一条命令即为更新——幂等安全：技能本体覆盖为新版，各客户端 AGENTS.md/CLAUDE.md 只动 `# >>> talk-human` 到 `# <<< talk-human` 之间的标记块，其他内容不动。

装完后立即：
1. 用 read 工具读 `~\.config\opencode\AGENTS.md`（或对应客户端注入文件），确认 `# >>> talk-human` 标记块存在且版本与母版一致
2. 向用户复述"已装版本 + 生效范围"，提示新开会话生效

若上方命令里的路径未替换（仍是 {{MASTER}} 占位符）或已失效（换机/移动目录）：改用实际母版目录（含 install.ps1 的目录）重跑同一命令，并在母版目录重跑 `install.ps1 -Bootstrap` 修复本引导技能。
