# 节点归档：node-architect-skill-v1

- **周期**：2026-08-21 → 2026-08-21
- **验收结果**：
  - ✅ 一条命令安装：`install.ps1 -Project <目标>` 完成 skill 复制 + .nodes 初始化 + AGENTS.md 指针
  - ✅ DSH 热发现：skill 目录落盘后，本会话目录消息立即出现 `node-architect` 条目
  - ✅ skill 管线加载：`skill` 工具返回完整渲染的 `<skill_content>`
  - ✅ init 幂等：重复运行对已存在文件"跳过（已存在）"
  - ✅ AGENTS.md 指针：本会话已将其作为工作区指令注入（活体验证）
  - ⏳ 用户验收：待确认
- **改动了什么**：
  - `node-architect/`（母版）：README、install.ps1、skill/（SKILL.md、references/PROTOCOL.md、5 个模板、scripts/init-nodes.ps1）
  - `.dsh/skills/node-architect/`（本项目安装副本）
  - `.nodes/`（本项目数据）、`AGENTS.md`（指针）
- **踩坑记录**：
  1. 无 BOM 的 UTF-8 .ps1 在中文 Windows PowerShell 按 GBK 解析 → 语法错。脚本必须带 BOM；`edit` 工具改文件会丢 BOM，改完要补。
  2. `Copy-Item -Recurse -Force` 目标目录已存在时会把源嵌套拷进目标 → 安装器改为"先删后拷"。
  3. 嵌套 pwsh 不在 PATH，脚本内调用脚本用 `&` 调用运算符。
- **遗留**：
  - ~~二期 L3 自动钩子~~ → **已立项并部分落地**（2026-08-21 节点 3，实证附记见文末）：opencode 桥接已交付；zcode/Claude Code 适配下期；codex 待查证；DSH 等上游 TODO(compaction)
  - 可选 MCP server（自动化层跨客户端）
  - 母版模板里 `{SESSION_ID}` 占位符目前靠手工替换
- **给下个节点的衔接说明**：母版在仓库根 `node-architect/`；协议真源以 `.nodes/PROTOCOL.md` 为准；二期只加执行者，不动文档格式。

---

## 附：L3 压缩前桥接·调查实证与落地（2026-08-21 节点 3 回写）

五端压缩前钩子能力实证（本机核验，非纯文档转述）：

| 客户端 | 能力 | 证据 |
|---|---|---|
| opencode | ✅ 双落点 | 本机 SDK `@opencode-ai/plugin` index.d.ts L271-299：`experimental.session.compacting`（压缩**前**，context 追加/prompt 整体替换）+ `experimental.compaction.autocontinue`（压缩后合成消息前，仅 enabled 开关、无文本通道→指令块走摘要搭车） |
| zcode | 🟡 待实测 | 官方 superpowers 插件实证 zcode 执行 **Claude 兼容 hooks.json**（SessionStart matcher 含 compact、command 类型、stdin/stdout JSON）；PreCompact 是否支持需挂日志钩子验证 |
| Claude Code | ✅ 官方 PreCompact | 公开文档；注入语义需实测，退路 SessionStart(matcher=compact) 兜底（效果等价 autocontinue） |
| codex | ❓ 未证实 | 本机 config.toml 仅 notify 事件机制（配了 turn-ended），未见压缩事件 |
| DSH | ⏳ 上游未落地 | dsh-agent README.zh.md L121：SessionStartSource 预留 'clear'/'compact' 无发出方（TODO(compaction)），原文核验 |

已落地（第一期主线）：`node-architect/skill/bridge/compact-context.ps1` 共享核心（注入文本单一真源 + SESSIONS/_compactions.log 墓碑）+ opencode 适配器 `.opencode/plugin/node-architect-bridge.ts` + install.ps1 `-Bridge`。全链路本机验证通过（Bun→spawnSync→PowerShell 5.1→核心输出完整无乱码；本机无 pwsh，回退链必要性获实证）。架构定论与风险声明见 DECISIONS「L2 压缩前桥接」条及 `node-architect/bridge/README.md`。
