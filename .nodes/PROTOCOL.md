# .nodes 节点协议（客户端无关版）

> node-architect v1.1.0 · 本文件是协议规则的**唯一真源**；SKILL.md 与 AGENTS.md 中的条款为摘要，如有分歧以本文件为准。
> 核心理念：**文件是记忆，对话不是**。上下文压缩不可避免，唯一可靠的记忆是磁盘上的档案。

## 目录

```
.nodes/
├── CONTEXT.md    项目一页纸快照（一屏以内）
├── PROGRESS.md   节点矩阵（一行一节点）
├── DECISIONS.md  决策日志（只追加）
├── SESSIONS/     每个会话一个私有状态文件
├── archive/      节点归档与旧决策归档
├── PROTOCOL.md   本文件
└── .lock         写 CONTEXT.md 时的临时锁
```

## 开工协议

1. 读 `CONTEXT.md` + `PROGRESS.md`（必要时读 `DECISIONS.md` 最近条目）。
2. 用一两句话向用户复述"当前节点 / 下一步"，确认后再动手。

## 节点协议

- 节点 = 一个可验收的交付物，不是任务清单。边界由 AI 提议、用户确认。
- 新节点开工前：在 `PROGRESS.md` 登记行（名称 / 验收标准 / owner / 状态），敲定设计要点写入 `CONTEXT.md` 的"下一步"。
- 会话内的细粒度步骤用各自客户端的任务清单机制管理，不写入节点档案。

## 存档协议（触发时机：节点完成 / 用户要求 / 大改动落地 / 会话收尾）

机械动作（锁 / 校验 / 归档骨架）优先交给 skill 的 `save.ps1`（位于 `.agents/skills/node-architect/scripts/`）；无脚本环境时按各步骤括号内的规则手工执行。

1. `PROGRESS.md`：定向更新该节点行。
2. `SESSIONS/<会话标识>.md`：重写本会话状态。
3. `DECISIONS.md`：有新决策则末尾追加（不改历史）。
4. `CONTEXT.md`：`save.ps1 lock` → 全文重写快照（头部"最后更新"改为今日）→ `save.ps1 unlock`（手工等价：建 `.lock` → 重写 → 删锁）。
5. 节点完成：`archive/<节点名>.md` 归档细节（`save.ps1 verify -Completed` 可自动生成骨架）。
6. 收口：`save.ps1 verify` 清单全 [OK] 才算存档完成（手工等价：对照 1-5 逐项自查）。

## 并发协议（多会话）

- `DECISIONS.md` 只追加；`PROGRESS.md` 只改自己节点的行；`SESSIONS/` 只写自己文件。
- 写 `CONTEXT.md` 前后用 `save.ps1 lock | unlock`（锁 = 会话标识 + 时间戳；未超时 10 分钟不可抢占，超时可覆盖；只能删自己的锁或超时锁）。手工操作须遵守同样规则。
- 冲突时重读合并，不盲目覆盖。

## 体积协议

- `CONTEXT.md` 一屏以内；细节进 `archive/`。
- `DECISIONS.md` 超 200 行时旧段剪切到 `archive/decisions-<日期>.md`。
