---
name: node-run
description: 执行节点（DSH 版）：先加载节点协议与节奏纪律 skill，再读档→基线快照→接力派棒（subagent 并发+完成通知）→复审→收口存档。用法：斜杠命令面选 node-run 或直接说「node-run <节点编号或名称> [补充要求]」，目标节点写在用户消息里。当用户点名要执行某个已登记节点、或节点行带「执行:执行接力」需要照接力表派棒时使用。
---

<!-- pi-tempo v1.0.10 DSH 方言版 · 语义底稿=node-run.lab.md（云端 main 2026-10-18）· 落位 .dsh/skills/node-run.md（rank 100，user-invocable 默认开） -->
<!-- 派发原语：Task/TaskWait → DSH subagent（异步、同消息多调用=并行、完成主动通知）/ workflow parallel·pipeline；存档动作按本机 node-architect v1.10.1（save/checkpoint/commit/verify/verify-batch，无 finish） -->

# node-run — 执行节点（DSH 版）

目标节点与补充要求：见用户消息。

**本命令即授权**：打出 node-run 就等于说了「开工」。读档后不要停下等确认，直接连续执行到节点收口或触发下方「停止条件」之一。本模板对「确认」的口径**优先于** node-architect 铁律 1 与项目 `AGENTS.md` 的「复述后确认再动手」——那条规矩针对「读取节点xx」这类只读交接；本命令是执行指令。

## 第 0 步（两件事，顺序不可换）

**0.1 路径纪律**：脚本路径照抄本模板与 `AGENTS.md`（`.agents\skills\node-architect\scripts\save.ps1`），禁止用搜索工具定位点目录（`.agents`/`.dsh`/`.nodes` 对搜索不可见，搜了必空转）。

**0.2 加载 skill（同一批发出两个 `skill` 调用）**：

1. `node-architect` —— 节点协议（读档 / 节点登记 / 存档流程 / save.ps1 动作与退出码语义）
2. `pi-tempo` —— 执行节奏纪律（往返预算 / 批量编辑 / 多任务切分与并行派发 / 子代理依赖调度 / 锚定与会话熔断）

## 执行流程

1. **读档（一批并发）**：`.nodes/CONTEXT.md`、`.nodes/PROGRESS.md`、该节点 `.nodes/archive/<节点名>.md`（或 `.nodes/plans/<短名>.md`）、`.nodes/DECISIONS.md` 最近条目**放在同一批工具调用里一次发出**——分次读纯属浪费往返。
2. **一行状态**：读档后用一两句话交代「当前节点 / 验收标准 / 下一步」，交代完立即进入第 3 步，不要结束回合。
3. **执行槽闸**：查节点行验收标准末尾的**执行槽**——带 `执行:执行接力`（旧式 `委派:执行接力`、plans 接力表等价）→ 走第 4 步接力分支；带 `执行:—(自干理由)` → 主线程按验收标准直接执行（守 pi-tempo 全部纪律）；**两者皆无而任务 ≥3 或批次 ≥2 → 停**：先按协议补登记执行槽再开工，不默认自干。
4. **接力分支（本会话＝调度器）**：**本会话禁止 edit/write 任何源码，禁止自己跑测试/门禁**（验证归执行棒与复审棒）。派发后主会话合法动作**仅四类**：①读子代理报告并记 facts ②备下一棒简报 ③存档/SESSIONS 留痕 ④`git status --porcelain` 越界检查。

   **开工基线快照**：

   ```powershell
   New-Item -ItemType Directory -Force .nodes\relay\<名> | Out-Null
   git status --porcelain | Out-File -Encoding utf8 .nodes\relay\<名>\baseline.txt
   ```

   （会话无 shell 工具时——如规划者预设——改派**只读棒**（gemini-scout，带 pwsh）执行 `git status --porcelain` 并原文回报，调度器把回报落盘 baseline.txt；棒0 基线 → 棒群 → 越界棒复核同法。越界判据不变：快照后新增且不在本棒授权集的行。）

   **照单循环（每棒）**：读棒简报（接力表行 + facts）→ 组六段简报（GOAL/验收/文件集+禁区/已验证事实/验证/终止；固定纪律已由 preset-gemini-fixer 的 persona 常驻承载，简报只带六段）→ 派发：

   ```
   subagent(agent_preset='gemini-fixer', prompt=<六段简报>, provider='vps-direct', model='gemini-3.8-flash')
   ```

   （路由已回填＝`vps-direct/gemini-3.8-flash`（用户 llm-pi-ai providers 键，2026-10-18）。subagent 的 provider/model 参数仅在 Settings→Subagent 模型白名单开启后才出现在 schema 里；若当前会话 schema 无此参数 → 退化派发**不带 provider/model**（继承父会话模型）并在 facts 里记录。复审异构路由＝`zai-coding-cn/glm-5.3-flash`（与 gemini 实现棒不同家族；重活可换 `zai-coding-cn/glm-5.3`）。）

   → 等完成通知收敛（**同一消息并发派 ≤3 支**＝同批号并行批；`workflow` 的 `parallel()`/`pipeline()` 承载批量编排与 schema 校验）→ **双轨自检**：`git status --porcelain` 对比基线——改动应恰为本棒授权集内文件；授权集外有改动或棒报告与工作树不符 → **不是修简报重派，是立即停止接力报告用户**（写 handoff）→ 报告事实追加 `.nodes/relay/<名>/facts.md`（各段 ≤300 字）→ 下一棒。

   **等待窗口纪律**：只做四类合法动作，禁读源码本体（读棒报告/facts/接力表即可）。

   **全棒完成 → 复审棒**：`subagent(agent_preset='independent-review', prompt=<复审简报>)`（审查纪律由 preset persona 常驻；复审简报=验收标准+改动文件清单（`git diff --name-only`）+关键 diff 摘要），**换 provider 异构**（与实现棒不同路由/家族：实现棒走 `vps-direct/gemini-3.8-flash`，复审走 `zai-coding-cn/glm-5.3-flash`）；**报告须含逐项行号证据，不完整即重派**。复审发现问题 → 派**单支返工棒**（agent_preset='gemini-fixer'）吃完所有发现，主会话禁参与返工；返工棒重派 ≥2 次熔断。

   **失败处理**：执行棒失败 → 修简报重派；**同棒重派 ≥2 次即熔断**停棒报告用户（失败三分类：瞬时/环境/方法死路）。
5. **锚定纪律（跳过＝该批作废）**：每个批次开工时，先在**助手正文**（不是 thinking）写一行 `ANCHOR: 本批最大风险 → 要验证的点 → 适用 §号 → 本批上限：N 次迭代 / M 分钟`，然后才发工具调用。收口时自查 `ANCHOR:` 次数 ≥ 批次数。
6. **会话熔断线**：上下文 **>25 万 token** 或进入第 3 个回合 → 不要「继续」：先写「新会话接续提示词」（当前进度/关键决策及为什么/下一步/已踩的坑），再跑 `save.ps1 checkpoint -Node <节点名> -Session <会话> -Note "<断点>"` 落档案。
7. **收口**：
   - 验收达成 → 写 `.nodes/archive/<节点名>.md` → 写 CONTEXT 暂存文件 → 跑
     `powershell -NoProfile -ExecutionPolicy Bypass -File .agents\skills\node-architect\scripts\save.ps1 save -Node <节点名> -Session <会话> -ContextFile <暂存> -Completed`
     （`-Completed` 会校验归档文件存在）→ 向用户报告 verify 各项结果。
   - 未达成 → `save.ps1 checkpoint -Node <节点名> -Session <会话> -Note "<断点>"`，报告剩余项与下一步。
   - **跨目录调用必须显式传 `-Project`**（该参数默认取当前目录，跨项目会写错文件）。

**开工前先量规模（拆批阈值）**：预计实现 >2000 行 / >100 处改动 / >40 分钟，任一命中 → 按接力表批次拆，逐批「实现→局部验证→暂存」，批间 checkpoint。

## 停止条件（只有这几种才停）

1. 需要用户决策（方案二选一、改需求、提供凭据等模型无法自决的事）。
2. 破坏性 / 不可逆操作需要批准。
3. 节点验收标准已达成 → 执行收口并存档。
4. 真实阻塞（环境不可用、依赖缺失且装不上、锚点失配需人工）。
5. 触发会话熔断线 → 按第 6 步 handoff。

除以上之外**不要停下等确认**：本回合的交付物是该节点的实际进展（派棒 + facts + 验证 + 存档），不是读档摘要。

## 纪律

- 节点号只能由 `save.ps1 next-node` 分配；`PROGRESS.md` 只改自己节点的行；`DECISIONS.md` 只追加。
- 断点场景（会话中断 / 异常终止）**不原样重发同一句**：进度在档案不在对话，照常读档恢复。
- 本模板只负责「执行一个已存在的节点」；新计划走「登记计划节点」，日常交接用「读取节点xx」。
