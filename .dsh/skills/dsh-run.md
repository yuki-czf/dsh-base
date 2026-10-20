---
name: dsh-run
description: 执行节点（DSH 版）：先加载节点协议与节奏纪律 skill，再读档→基线快照→接力派棒（subagent 并发+完成通知）→复审→收口存档。用法：斜杠命令面选 dsh-run 或直接说「dsh-run <节点编号或名称> [补充要求]」（原 node-run，DSH NEXT 专用），目标节点写在用户消息里。当用户点名要执行某个已登记节点、或节点行带「执行:执行接力」需要照接力表派棒时使用。
---

<!-- pi-tempo v1.0.12 DSH 方言 · 独立血统 dsh-run（node-run=PI-Desktop 血统，语义分家） · 落位 .dsh/skills/dsh-run.md（rank 100，user-invocable 默认开） · 批内并行=workflow.parallel -->
<!-- 派发原语：Task/TaskWait → DSH subagent（异步、同消息多调用=并行、完成主动通知）/ workflow parallel·pipeline；存档动作按本机 node-architect v1.13.4（save/checkpoint/commit/verify/verify-batch，无 finish） -->
<!-- v1.0.11 批级循环：每批一次消息并发派发 ＋ 模型分档 -->
<!-- v1.0.12 并行原语校正：批内用 workflow.parallel（可带 provider/model）；同步 persona 原语串行、官方异步 subagent 无模型参数 -->

# dsh-run — 执行节点（DSH 版，原 node-run）

目标节点与补充要求：见用户消息。

**本命令即授权**：打出 dsh-run 就等于说了「开工」。读档后不要停下等确认，直接连续执行到节点收口或触发下方「停止条件」之一。本模板对「确认」的口径**优先于** node-architect 铁律 1 与项目 `AGENTS.md` 的「复述后确认再动手」——那条规矩针对「读取节点xx」这类只读交接；本命令是执行指令。

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

   **照单循环（每批）**：
   按接力表划分批次，每批包含 1~3 支同批号无依赖的执行棒。**每批一次消息并发派发**：
   1. 读批内全部棒简报（接力表行 + facts）。
   2. 组六段简报（GOAL / 验收 / 文件集+禁区 / 已验证事实 / 验证 / 终止；固定纪律已由 preset persona 常驻承载，简报只带六段）：
      - **回报要求**：每处改动附 `文件路径:行号`，无锚定=报告不完整重派（REQ-H1）。
      - **终止条件**：目标 ≤40 步/棒（TTFT 账：每步 ≈9–11s）；同一失败签名连续 3 次即停。
   3. **批内并行必须用真并行原语（v1.0.12 实测校正）**：执行棒走 `workflow` 的 `parallel()`，一个调用内并列 `agent(prompt, {provider, model})`（≤3 支）：
      ```js
      const [a, b] = await parallel([
        () => agent(<六段简报A>, { label: '棒A', provider: 'cpa', model: 'gemini-3.8-flash' }),
        () => agent(<六段简报B>, { label: '棒B', provider: 'cpa', model: 'gemini-3.8-flash' }),
      ]);
      ```
      **禁止用同步子代理原语冒充并行**：`subagent_manager_run`（persona 同步运行）在一条消息里是串行返回（2026-10-20 P0 实测：两棒窗口零重叠、后棒晚 102s 启动），只用于单棒/复审/返工；官方异步 `subagent` 真并行但本会话 schema 无 provider/model 参数（继承父会话模型），仅在不需要模型分档时用。派发后在 facts 记「本批原语＝workflow.parallel / 异步 subagent / 降级串行（原因）」。
   4. 等整批完成通知收敛。
   5. facts 追加（批内逐棒）：把各棒报告事实逐一追加到 `.nodes/relay/<名>/facts.md`（各段 ≤300 字）。
   6. **双轨自检**：`git status --porcelain` 对比基线——判据仍按棒授权集：改动应恰为本批各棒授权集内文件；授权集外有改动或棒报告与工作树不符 → **不是修简报重派，是立即停止接力报告用户**（写 handoff）。
   7. 进入下一批。

   **批内失败处置**：单棒失败/熔断不阻塞同批他棒；整批收敛后逐棒处置（修简报重派 / 同棒 ≥2 次熔断报告用户，失败三分类：瞬时/环境/方法死路）。

   **批中提问＝棒停批不停**：棒内若遇需要向用户提问的情况 → 该棒 handoff 断点终止，整批收敛后统一转达（REQ-A2），不阻塞同批其它棒的继续执行。

   **等待窗口纪律**：只做四类合法动作，禁读源码本体（读棒报告/facts/接力表即可）。

   **全棒完成 → 复审棒**：`subagent_manager_run(agent='independent-review', task=<复审简报>)`（单棒，同步可接受；审查纪律由 persona 常驻；复审简报=验收标准+改动文件清单（`git diff --name-only`）+关键 diff 摘要），**异构模型分档**（复审棒路由＝`deepseek-v4.1-flash`）。**报告须含逐项行号证据（`文件路径:行号: 该行内容`），无锚定或报告不完整即重派；阻断项必须先由调度器 grep 核对摘录原文**——原文不存在＝复审误报，记 facts 后不派返工（2026-10-20 试点实测一次编造行号）。复审确认问题 → 派**单支返工棒**（`subagent_manager_run(agent='gemini-fixer', task=<返工清单>)`）吃完所有发现，主会话禁参与返工；返工棒重派 ≥2 次熔断。

   **模型分档（v1.0.11）**：
   - 主会话（调度器）与复审棒建议 `deepseek-v4.1-flash` 速度档（主会话模型由用户建会话时选择，模板只提示）。
   - 执行棒固定 `cpa/gemini-3.8-flash` 额度档。
   - 开工自检：主会话与执行棒同档时，facts 记「同档运行」（提示不阻塞）。

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
6. 指向已归档节点且有明确派生下一步 → 推荐分支直行 + facts 记「默认分支：…」；破坏性/不可逆操作仍停（REQ-A1）。

除以上之外**不要停下等确认**：本回合的交付物是该节点的实际进展（派棒 + facts + 验证 + 存档），不是读档摘要。

## 纪律

- 节点号只能由 `save.ps1 next-node` 分配；`PROGRESS.md` 只改自己节点的行；`DECISIONS.md` 只追加。
- 断点场景（会话中断 / 异常终止）**不原样重发同一句**：进度在档案不在对话，照常读档恢复。
- 本模板只负责「执行一个已存在的节点」；新计划走「登记计划节点」，日常交接用「读取节点xx」。
