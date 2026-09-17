---
name: node-architect
version: 1.4.1
description: 长项目节点存档与恢复协议。项目根存在 .nodes/ 时必须启用：会话开工先读档恢复全貌，节点完成、用户要求存档或大改动落地时写存档。也用于用户说"初始化节点协议、存档、恢复进度、开新节点"时。
whenToUse: 项目根存在 .nodes/ 目录；或用户要求建立节点化项目管理、执行存档、恢复进度。
---

# node-architect：节点架构师

对抗上下文压缩的唯一可靠手段：**文件是记忆，对话不是**。设计先行，节点推进，落盘存档。

## 铁律（优先级高于一切编码冲动）

1. **开工必读档**：项目根有 `.nodes/` → 动手前先读 `CONTEXT.md` 和 `PROGRESS.md`；对决策有疑问再读 `DECISIONS.md` 最近条目。读完用一两句话向用户复述"当前节点 / 下一步"，确认后再动手。
2. **节点先行**：任何长于一次会话的工作，先在 `PROGRESS.md` 登记节点（名称 + 验收标准 + owner 会话），并把下一步的设计要点写入 `CONTEXT.md` 的"下一步"，再写代码。地图先于道路。
3. **必须存档的时机**：① 节点验收标准达成；② 用户表达存档意向（"存档 / 这节点差不多了 / 先到这"）；③ 完成大结构改动；④ 出现会话即将结束的迹象。存档走【存档流程】。
4. **体积纪律**：`CONTEXT.md` 永远保持一屏以内；细节写入 `archive/<节点>.md`；`DECISIONS.md` 超过 200 行时跑 `save.ps1 trim-decisions` 归档旧段。
5. **发现即恢复**：感知到上下文被压缩（出现摘要标记、记忆断裂）→ 立即重读 `CONTEXT.md`、`PROGRESS.md` 和本会话的 `SESSIONS/` 文件，再继续工作。

## 节点定义

节点 = **一个可验收的交付物**（"跑通登录流程"），不是任务清单（"写三个函数"）。边界由你提议、用户一句话确认。

与其他机制的分工：todo = 会话内步骤（活不过压缩）；goal = 跨轮目标锚；**节点 = 项目级存档单元（活在磁盘上）**。

状态：待开始 / 进行中 / 待验收 / 已完成 / 已归档 / 已废弃

## 存档流程（checkpoint）

按顺序执行；**完成字样时序**：verify 全 [OK] 之前，任何档案不得写入"已完成"类表述。

1. **PROGRESS.md**：定向 edit 该节点行（状态、更新时间）
2. **SESSIONS/<会话>.md**：重写本会话状态
3. **DECISIONS.md**：有决策则末尾追加（永不改旧）
4. **CONTEXT.md**：写暂存文件 → 调 `save.ps1 save`（自动 lock→替换→unlock→verify）
5. **archive/<节点名>.md**：节点完成时按模板填写归档

命令速查与参数详见 `references/QUICKREF.md`。批次场景用 `save.ps1 commit` 替代 `save`。

## 并发安全

- `DECISIONS.md` **只追加**；`PROGRESS.md` **只改自己节点的行**；`SESSIONS/` **只写自己的**。
- `CONTEXT.md` 写入通过 save/commit 命令自动加锁，无需手动 lock/unlock。
- 冲突时重读合并，绝不盲目覆盖。

## 初始化

用户说"初始化节点协议"时：运行 `scripts/init-nodes.ps1 [-Project <项目根>]`，然后回到铁律 1 读档。

## 需要分批？

预判超单会话上下文预算 → 先问用户选 **spec-superflow**（重型）还是**本分批约定**（轻量），二选一不混用。执行纪律与命令详见 `.nodes/PROTOCOL.md`「批次协议」节和 `references/QUICKREF.md`。

## 规则真源

协议全文以 `.nodes/PROTOCOL.md` 为准（版本号与本 frontmatter 同源）。`AGENTS.md` 为跨客户端指针摘要，分歧以 PROTOCOL 为准。
