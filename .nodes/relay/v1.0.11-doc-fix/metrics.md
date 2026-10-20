# metrics — 节点 #33 试点（2026-10-20，n=1 冒烟）

## 数据源与口径

- 父会话：`E:\.dsh\storages\session_projcache\sessions\session-49676d31-…json`（cwd=E:\www\dsh-base，title=执行接力并行批次）。
- 子会话：`E:\.dsh\sessions\--E-www-dsh-base--\{6eb07850…, a5adae93…}\session.v4.jsonl.zstd`。
- **口径限制（诚实标注）**：workflow agent 子会话不生成 projcache `session-*.json`，因此每棒 `llmMs/ttftMs/decodeTokens/pressure` 无法机读；下表窗口取「会话目录创建时间 → session 文件最后写入时间」，属推算值，非 sessionStats 实测。父会话 pressure 为 projcache 机读值。

## 批 1 并行窗口（D1 ∥ D2，workflow.parallel + cpa/gemini-3.8-flash）

| 棒 | 子会话 | 创建（本地） | 最后写入 | 墙钟 |
|---|---|---|---|---|
| D1 pi-tempo README | 6eb07850 | 14:42:22 | 15:00:47 | 1105s（18m25s） |
| D2 install-stack | a5adae93 | 14:42:22 | 15:04:54 | 1352s（22m32s） |

- 重叠窗口：1105s（18m25s，两棒同秒创建，D1 收尾时 D2 已跑 18m25s）。
- 批墙钟：1356s（22m36s，14:42:22 → 15:04:58）。
- 串行外推：1105 + 1352 = 2457s（40m57s）。
- **并行收益：省 1101s ≈ 18.4min（44.8%）**。

## 关键指标

| 指标 | 值 | 来源 |
|---|---|---|
| 批 1 墙钟 | 22m36s | workflow 返回时刻 − 子会话创建 |
| 每棒中位墙钟 | 1228.5s（20m29s） | 两棒推算中位数 |
| 父会话 pressure（批 1 收敛时） | 162,826 tok（<25 万） | 父 projcache contextPressure |
| 每棒 pressure / TTFT 占比 / decode t/s | N/A | 子会话无 projcache |
| 返工棒数 | 1（复审发现后单支返工） | facts / 复审报告 |
| 复审重派 | 1（返工后复核） | facts |
| P0 并行判定 | Gemini 渠道可并发；串行来自同步 persona 原语 | P0 样本 1-5（facts） |

## 基线对比（#277 实测基线与本试点）

| 指标 | #277 基线（session-999658c2） | 本试点 #33 |
|---|---|---|
| 墙钟 | 88.6min（6 棒严格串行） | 批 1 = 22.6min（2 棒并行）；全节点含 P0/复审 ≈95min |
| TTFT 占比 | 64% | N/A（子会话无 projcache；父会话 llmMs 占中有 TTFT 但非按棒） |
| 并行收益 | 0（逐棒串行） | ≈18.4min（2 棒批） |
| 越界 | — | 0（每批 git status 对照授权集） |
| 复审 | — | 有条件通过（1 误报阻断＋2 必须修），返工 1 次 |

## 结论

- 批级循环在 DSH 上可用，但派发原语需用 `workflow.parallel`（可带 provider/model，满足 D7 分档）；同步 persona 原语串行、官方 `subagent` 无模型参数——此差异须回 Wave 1 修 `dsh-run.md` 与 T8/T6 断言口径。
- 本试点 2 棒节省 ≈45% 墙钟，与「2 棒串行变 max」理论一致；样本 n=1，方向性结论。
