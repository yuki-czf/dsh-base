# node-architect 压缩桥接（L2）

对抗上下文压缩的第二层防线：在客户端**生成压缩摘要之前**介入，把 `.nodes/` 当前状态与摘要硬指令注入压缩流程，使未落盘进展无损过桥；压缩后模型的第一动作是补写 catch-up 存档。

## 架构：共享核心 + 每客户端薄适配器

```
                 ┌─ 共享核心（唯一真源，措辞只维护这一份）─────────────┐
                 │ skill/bridge/compact-context.ps1                   │
                 │  读 <项目>/.nodes/{CONTEXT,PROGRESS}.md            │
                 │  产出统一注入文本（快照+摘要硬指令+压缩后首动作）      │
                 │  -Tombstone：留一行压缩墓碑到 SESSIONS/_compactions.log │
                 └────────────────────────┬───────────────────────────┘
                                          │ 命令行调用 = 最大公约数
        ┌──────────────┬──────────────────┼──────────────┬──────────────┐
   opencode        Claude Code         zcode          codex           DSH
   TS 插件          PreCompact hook    Claude 兼容     notify?         TODO(compaction)
   本文件 opencode/  （下期）            插件格式（下期）  待查证          等上游
```

- **触发机制每端一份**（API 形状、语言、配置位置都不同，不可移植）
- **注入载荷单一真源**（改措辞只改 `compact-context.ps1`，五端同时生效）
- 某端没有压缩前钩子时自动降级：L1 存档纪律 + L0 系统提示兜底（AGENTS.md 指针不参与压缩）

## 五端能力实证（2026-08-21，本机核验）

| 客户端 | 压缩前介入 | 证据 | 状态 |
|---|---|---|---|
| opencode | ✅ 双落点 | `@opencode-ai/plugin` index.d.ts：`experimental.session.compacting`（前，context 追加/prompt 替换）+ `experimental.compaction.autocontinue`（后，仅开关无文本通道） | **本期落地** |
| zcode | 🟡 待实测 | 官方 superpowers 插件用 Claude 兼容 hooks.json（SessionStart matcher 含 compact）；PreCompact 是否支持需挂日志钩子验证 | 下期 |
| Claude Code | ✅ 官方 | 公开文档 PreCompact hook；注入语义需实测，退路 SessionStart(matcher=compact) | 下期 |
| codex | ❓ | config.toml 仅见 notify 事件机制（本机配 turn-ended），未见压缩事件 | 待查证 |
| DSH | ⏳ 上游未落地 | dsh-agent README.zh.md L121：SessionStartSource 预留 'compact' 无发出方（TODO(compaction)） | 等上游 |

## 安装

```powershell
# 在目标项目根（母版仓库内开发时）：
pwsh -File node-architect\install.ps1 -Bridge
# 已装项目升级同理；-Bridge 幂等，可单独补装
```

`-Bridge` 做两件事：
1. 核心脚本随技能真源分发（`skill/bridge/compact-context.ps1` → `.agents/skills/node-architect/bridge/`）
2. 复制适配器到 `<项目>/.opencode/plugin/node-architect-bridge.ts`

## 验收测试（opencode，手动一次）

1. 项目里开 opencode 会话，随便聊几句并**故意留下未存档的进展**（如"记住：下一步要先做 X"）
2. 触发压缩：手动 `/compact`，或把上下文塞满等自动压缩
3. 验收点：
   - `.nodes/SESSIONS/_compactions.log` 出现一行 `compaction-pending session=…`（墓碑生效）
   - 压缩后的摘要包含「待落盘」内容与「压缩后第一动作」指令块，且模型随后真的去重读了 `.nodes/`
4. 反向验收：删掉 `.opencode/plugin/node-architect-bridge.ts` 重测，确认差异只在桥接层

## 设计边界（如实声明）

- 语义存档（"这次做了什么"）机械钩子无法自行提炼——它只存在于即将压缩的对话里。主线方案让**摘要无损携带增量**、压缩后第一动作补写完整存档："晚几秒，不少内容"。
- "钩子内 LLM 预生成增量存档"（真·压缩前语义落盘）是二期增强实验：多一次 LLM 调用的延迟与失败模式，先在 opencode 单端验证再推广。升级依据 = `_compactions.log` 累积的实测数据（摘要是否忠实、catch-up 是否经常缺失）。
- **断链兜底**：唯一残余风险是"压缩后、补存档前会话恰好终止"。用 `save.ps1 check-tombstone` 兜住——最新墓碑之后 `.nodes` 无任何写入即告警；verify 也会联动出 `[WARN]` 行。零 LLM 成本，把静默损失变成显式提示。
