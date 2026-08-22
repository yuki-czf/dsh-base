# 项目快照 CONTEXT

> 本文件是项目的一页纸快照，任何会话开工前必读。永远保持一屏以内，细节放 archive/。
> 最后更新：2026-08-22（由 node-architect 存档流程维护）

## 项目一句话

dsh-base：AI Agent 基础设施孵化仓（skill / MCP / 插件），已产出 node-architect v1.2.0 与 mcp-ssh-runner v0.2.0（跨客户端 SSH MCP 统一源，凭据平文件隔离），remote-install.ps1 已泛化为多模块云端分发入口。

## 当前节点

- **节点**：#4 云端分发入口：remote-install 泛化多模块
- **验收标准**：-Module 路由向后兼容 / -ZipPath 离线 / 本地 zip 双模块模拟测试 / README 命令
- **状态**：已完成（2026-08-22，详见 archive/云端分发入口：remote-install 泛化多模块.md）
- **下一步**（下个节点怎么做的设计要点，开工前敲定）：
  - 节点 #2 dsh-mcp skill：AI 纪律层（禁读 .secrets、排障/升级走 installer、凭据泄露自查）
  - 已推送 main（c1b48e5 功能 + 1f48925 BOM 修复），云端安装 API 通道全功能验证通过；raw CDN 缓存过期后正式一行式即可用
  - 遗留：cursor/zed/claude 三端真机回归；多客户端并发（MaxSessions）候选节点

## 活跃会话

| 会话 | 负责 | 更新时间 |
|---|---|---|
| opencode-main | 节点 #1/#3/#4 已存档，待命 | 2026-08-22 |

## 关键路径提醒

- 云端一行式（ssh-runner）：`& ([scriptblock]::Create((irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1))) -Module ssh-runner`
- 凭据在 `.secrets/` 平文件（gitignore + ACL）；AI 会话禁读 `.secrets/` 任何文件；分发包/测试 zip 永远排除 `.secrets/`
- 编码铁律：**入口脚本（remote-install.ps1）纯 ASCII 无 BOM**（字符串管道消费）；内层 installer 中文+BOM（文件执行）；PS1 改完注意 raw CDN 缓存 ~5min
