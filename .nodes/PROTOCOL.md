# .nodes 节点协议（客户端无关版）

> node-architect v1.4.1 · 本文件是协议规则的**唯一真源**；SKILL.md 与 AGENTS.md 中的条款为摘要，如有分歧以本文件为准。
> 核心理念：**文件是记忆，对话不是**。上下文压缩不可避免，唯一可靠的记忆是磁盘上的档案。

## 目录

```
.nodes/
├── CONTEXT.md    项目一页纸快照（一屏以内）
├── PROGRESS.md   节点矩阵（一行一节点）
├── DECISIONS.md  决策日志（只追加）
├── SESSIONS/     每个会话一个私有状态文件
├── archive/      节点归档与旧决策归档
├── plans/        分批执行约定与各节点批次计划
├── PROTOCOL.md   本文件
└── .lock.d/      写 CONTEXT.md 时的临时锁（目录锁，原子创建）
```

## 开工协议

1. 读 `CONTEXT.md` + `PROGRESS.md`（必要时读 `DECISIONS.md` 最近条目）。
2. 用一两句话向用户复述"当前节点 / 下一步"，确认后再动手。

## 节点协议

- 节点 = 一个可验收的交付物，不是任务清单。边界由 AI 提议、用户确认。
- 新节点开工前：在 `PROGRESS.md` 登记行（名称 / 验收标准 / owner / 状态），敲定设计要点写入 `CONTEXT.md` 的"下一步"。
- 会话内的细粒度步骤用各自客户端的任务清单机制管理，不写入节点档案。
- 状态取值：待开始 / 进行中 / 待验收 / 已完成 / 已归档 / 已废弃

## 存档协议（触发时机：节点完成 / 用户要求 / 大改动落地 / 会话收尾）

机械动作（锁 / 校验 / 归档骨架）优先交给 skill 的 `save.ps1`（位于 `.agents/skills/node-architect/scripts/`）；无脚本环境时按各步骤括号内的规则手工执行。

**完成字样时序**：verify/verify-batch 清单全 [OK] 之前，任何档案不得写入"已完成"类表述，避免提前宣告完成。

1. `PROGRESS.md`：定向更新该节点行。
2. `SESSIONS/<会话标识>.md`：重写本会话状态。
3. `DECISIONS.md`：有新决策则末尾追加（不改历史）。
4. `CONTEXT.md`：写暂存文件 → 调 `save.ps1 save`（自动 lock→替换→unlock→verify）。
   - 手工等价：建 `.lock.d/` → 写 owner 文件 → 重写 CONTEXT → 删 `.lock.d/`
   - 批次场景改用 `save.ps1 commit`（含 verify-batch）
5. 节点完成：`archive/<节点名>.md` 归档细节（`save.ps1 verify -Completed` 可自动生成骨架）。
6. 收口：`save.ps1 verify` 清单全 [OK] 才算存档完成（手工等价：对照 1-5 逐项自查）。

### 一键存档（save 动作）

非批次场景的常规存档，`save.ps1 save` 单命令完成第 4-6 步：lock → 用暂存文件原子替换 CONTEXT.md → 删暂存 → unlock → verify。正常 exit 0（暂存已删）；锁竞争 exit 1（暂存保留，重试同一命令免重写）。

### 原子收口（commit 动作）

批次场景的批末收口，`save.ps1 commit` 单命令完成：lock → CONTEXT 原子替换 → 删暂存 → unlock → verify-batch。正常 exit 0（暂存已删）；锁竞争 exit 1（暂存保留，重试免重写）；校验 FAIL exit 1（CONTEXT 已落盘无损，按修复提示处理）。`"完成"` 字样只允许在 commit exit 0 之后写入。

## 并发协议（多会话）

- `DECISIONS.md` 只追加；`PROGRESS.md` 只改自己节点的行；`SESSIONS/` 只写自己文件。
- `CONTEXT.md` 写入通过 save/commit 命令自动加锁（目录锁 `.lock.d/`，原子创建；10 分钟超时；超时可覆盖；只能删自己的锁或超时锁）。手工操作须遵守同样规则。
- 冲突时重读合并，不盲目覆盖。

## 体积协议

- `CONTEXT.md` 一屏以内；细节进 `archive/`。
- `DECISIONS.md` 超 200 行时跑 `save.ps1 trim-decisions` 归档旧段到 `archive/decisions-<日期>.md`（默认保留最近 20 条）。

## 批次协议（单节点超上下文预算时拆批执行）

- **触发条件**：登记节点时预判工作超出单会话上下文预算 → **立节点先问**（询问制）：spec-superflow（proposal/specs/design/tasks + execution-contract 门禁，重型）还是本分批约定（plans/<节点名>.md + 一批一会话，轻量），二选一并向用户说明，**不得混用**；用户选定本约定 → 登记同时在 `.nodes/plans/<节点名>.md` 落批次计划；PROGRESS 状态列记 `进行中·批N/M`。
- **批次计划文件**：`.nodes/plans/<节点名>.md`，模板 = `templates/BATCH-PLAN.md`；核心为六列表：批 / 名称 / 范围（文件/函数）/ 验收标准 / 预估材料K / 前置批。单批输入材料默认 ≤30K tokens，按校准日志调整。

- **执行规则**：
  1. **拆批时机**：登记节点时同步落批次计划文件，不事后补。
  2. **切割原则**：按复杂度切、不按文件大小切——思考密集的步骤单独成批；批间靠文件/接口衔接，不靠会话记忆。
  3. **一批一会话**：每批开新会话，照常走开工协议读档，但只读本批相关档案；会话标识按批轮换 `<节点>-b<N>`，避免 SESSIONS 覆盖上批暂停点。
  4. **批末必存档**：走存档协议（收口固定走 `save.ps1 commit`，禁止手工拆步 lock/unlock）；SESSIONS 暂停点写「已完成批N：<产出>；批N+1 从 <文件/步骤> 开始」，CONTEXT 下一步指向下一批。**完成字样时序**：verify-batch 全 [OK] 前不得在任何档案写入"已完成"表述。
  5. **超限即断**：实读材料超阈值或接近压缩点 → 提前收口存档换会话，不硬撑。
  6. **校准回路**：每批实际压缩点/耗时回填计划文件校准日志，回头调阈值。
