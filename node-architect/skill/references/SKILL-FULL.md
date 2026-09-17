---
name: node-architect
version: 1.3.3
description: 长项目节点存档与恢复协议。项目根存在 .nodes/ 时必须启用：会话开工先读档恢复全貌，节点完成、用户要求存档或大改动落地时写存档。也用于用户说"初始化节点协议、存档、恢复进度、开新节点"时。
whenToUse: 项目根存在 .nodes/ 目录；或用户要求建立节点化项目管理、执行存档、恢复进度。
---

# node-architect：节点架构师

对抗上下文压缩的唯一可靠手段：**文件是记忆，对话不是**。设计先行，节点推进，落盘存档。

## 铁律（优先级高于一切编码冲动）

1. **开工必读档**：项目根有 `.nodes/` → 动手前先读 `CONTEXT.md` 和 `PROGRESS.md`；对决策有疑问再读 `DECISIONS.md` 最近条目。读完用一两句话向用户复述"当前节点 / 下一步"，确认后再动手。
2. **节点先行**：任何长于一次会话的工作，先在 `PROGRESS.md` 登记节点（名称 + 验收标准 + owner 会话），并把下一步的设计要点写入 `CONTEXT.md` 的"下一步"，再写代码。地图先于道路。
3. **必须存档的时机**：① 节点验收标准达成；② 用户表达存档意向（"存档 / 这节点差不多了 / 先到这"）；③ 完成大结构改动；④ 出现会话即将结束的迹象。存档走【存档流程】。
4. **体积纪律**：`CONTEXT.md` 永远保持一屏以内；细节写入 `archive/<节点>.md`；`DECISIONS.md` 超过 200 行时把旧段剪切到 `archive/decisions-<日期>.md`。
5. **发现即恢复**：感知到上下文被压缩（出现摘要标记、记忆断裂）→ 立即重读 `CONTEXT.md`、`PROGRESS.md` 和本会话的 `SESSIONS/` 文件，再继续工作。

## 节点定义

节点 = **一个可验收的交付物**（"跑通登录流程"），不是任务清单（"写三个函数"）。
边界由你提议、用户一句话确认。

与其他机制的分工：todo = 会话内步骤（活不过压缩）；goal = 跨轮目标锚；
**节点 = 项目级存档单元（活在磁盘上）**。一个节点 ≈ 一个 goal 的完整交付。

## 存档流程（checkpoint）

机械动作（锁 / 超时判断 / 校验 / 归档骨架）交给 `scripts/save.ps1`，你只负责生成内容。按顺序执行，末步 `verify` 全过才算存档（**完成字样时序**：verify 清单全 [OK] 之前，任何档案不得写入"已完成"类表述，避免提前宣告完成）：

1. **PROGRESS.md**：定向 edit 该节点所在行（状态、更新时间；批次收口时状态改 `进行中·批N+1/M` 或 `待验收`）。
2. **SESSIONS/<本会话标识>.md**：整文件重写本会话状态（进行中 / 暂停点 / 未决问题）。会话标识取简短稳定名（如 main、exp-1），首次写入时在 `CONTEXT.md` 活跃会话表登记。
3. **DECISIONS.md**：本节点产生了决策时，在文件末尾**追加**一条，永不改写历史条目。
4. **CONTEXT.md**：先 `scripts/save.ps1 lock -Session <会话标识>` 取锁 → 全文重写快照（当前节点 / 下一步 / 活跃会话 / 关键路径，头部"最后更新"改为今日）→ 立即 `scripts/save.ps1 unlock -Session <会话标识>` 放锁。取锁失败（他人持新锁）→ 先做第 5 步稍后重试。
   批末收口（PROGRESS 状态带 `进行中·批N/M`）改用**单命令原子收口**：第 1-3 步落盘后，把新 CONTEXT 全文写入暂存文件，再跑 `scripts/save.ps1 commit -Session <会话> -Node <节点名> -Batch <N> -ContextFile <暂存文件>`——脚本内完成 CONTEXT 落盘 → 暂存清理 → 放锁 → `verify-batch` 校验，中途崩溃不留锁不留半写。`"完成"`字样只允许在 commit 退出码 0（= 校验全过）之后写入（见「批次协议」纪律 7）。
5. **archive/<节点名>.md**：节点完成时按 `archive/_template.md` 结构填写归档（改动清单 / 踩坑 / 遗留 / 给下个节点的衔接说明）。
6. **校验收口**：`scripts/save.ps1 verify -Node <节点名> -Session <会话标识> [-Completed]`——清单必须全 [OK]（退出码 0）；有 [FAIL] 按提示补齐后重跑。归档文件缺失时 verify 自动从模板生成骨架。
7. **原子收口（可选）**：`scripts/save.ps1 commit -Session <会话标识> -Node <节点名> -Batch <批号> -ContextFile <CONTEXT 暂存文件>` 单命令完成 ④⑤⑥ 合并（lock → 用暂存文件原子替换 CONTEXT.md → 删暂存 → unlock → verify-batch）。正常 exit 0（暂存已删）；锁竞争 exit 1（暂存保留，重试免重写）；校验 FAIL exit 1（CONTEXT 已落盘无损，按修复提示处理）。批量执行场景（见下节）收口固定走 commit。

## 并发安全规则（多会话同时工作时）

- `DECISIONS.md` **只追加**；`PROGRESS.md` **只改自己拥有节点的行**；`SESSIONS/` **每会话一文件，只写自己的**。
- 写 `CONTEXT.md` 前后用 `scripts/save.ps1 lock / unlock -Session <会话标识>`（锁文件 `.nodes/.lock` = 会话标识 + 时间戳，10 分钟超时；持有者校验与超时覆盖由脚本处理）。
- 拿到过期锁或发现其他会话刚写过 → **重读最新内容再合并**，绝不盲目覆盖。

## 初始化（项目还没有 .nodes/ 时）

用户说"初始化节点协议"，或你判断这是长项目且用户同意时：

1. 运行本 skill 的 `scripts/init-nodes.ps1 -Project <项目根>`（脚本位于 skill 目录下，相对本文件为 `scripts/init-nodes.ps1`）。
2. 初始化后回到【铁律 1】执行开工读档。

## 批次协议（单节点超上下文预算时拆批执行）

- **询问制**：登记节点时预判超预算 → 先问用户走 **spec-superflow**（proposal/specs/design/tasks + execution-contract 门禁，重型）还是**本分批约定**（轻量），二选一不混用；用户选定本约定 → 登记同时在 `.nodes/plans/<节点名>.md` 落批次计划（模板 `references/templates/BATCH-PLAN.md`），PROGRESS 状态记 `进行中·批N/M`。
- **执行纪律**（全文见 `.nodes/PROTOCOL.md`「批次协议」节）：一批一会话（会话标识 `<节点>-b<N>`）；批末必存档且收口固定走 `save.ps1 commit`（lock→CONTEXT→unlock→verify-batch 原子完成，禁止手工拆步）；**完成字样时序**：verify 全 [OK] 前不得在任何档案写入"已完成"表述；超限即断；校准回路回填计划文件。
- opencode 加速通道：全局 agent `batch-executor` 已固化上述纪律（真源为母版 `bridge/opencode/agents/batch-executor.md` 模板，install `-BatchAgent` 安装后为生成物；本机全局副本改后需手动同步回母版）。

## 跨客户端

`AGENTS.md` 中的指针会引导非 DSH 客户端读取 `.nodes/PROTOCOL.md`（客户端无关的协议全文）。保持该指针存在且有效；协议升级时同步更新 `.nodes/PROTOCOL.md`。

**规则真源与版本**：协议规则以 `.nodes/PROTOCOL.md` 为准（版本号见其头部，与 skill frontmatter `version:` 同源）；本文件与 AGENTS.md 指针为摘要，出现分歧以协议为准。升级流程：改母版 `node-architect\skill\` → 重跑 `install.ps1` 同步（真源若被本地改过，覆盖前自动备份到 `.agents\backup\`）。
