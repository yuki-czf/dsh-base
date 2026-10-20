# T9 复盘：节点 #33 试点（n=1 冒烟）

## 冒烟五判据（REQ-M3）

| 判据 | 结果 | 证据 |
|---|---|---|
| 并行窗口重叠 | ✓ | D1/D2 子会话同秒创建 14:42:22，重叠 18m25s（metrics.md） |
| 无越界 | ✓ | 每批 `git status` 仅授权集（facts.md） |
| 门禁绿 | ✓ | v1.0.11：`-CheckOnly` 21/21；v1.0.12 修复后 25/25（task7-sync.txt / 本轮 sync 输出） |
| 复审过 | ✓（有条件→已修） | 复审 2 必须修已落；1 误报阻断经复核撤销（evidence 七节） |
| 墙钟 ≤ 串行外推 | ✓ | 批 1 实际 22.6min vs 串行外推 40m57s，省 44.8%（metrics.md） |

## P0 渠道探测结论

- Gemini（cpa）渠道**可并发**：G1/G2 同毫秒启动、重叠 29.98s。
- 同步 persona 原语 `subagent_manager_run` **串行**：A/B 两棒零重叠、后棒晚 102.5s。
- 官方异步 `subagent` **真并行**（X/Y 重叠 9.17s），但 schema 无 provider/model，不能承载 D7 分档。
- 结论：批级并行原语＝`workflow.parallel`（可带 provider/model）；已落 v1.0.12 模板。

## 墙钟与基线对比

- #277 基线：88.6min / TTFT 占 64% / 6 棒严格串行。
- 本试点批 1（2 棒）：22.6min，串行外推 40m57s，省 18.4min（≈45%）。
- 全节点墙钟 ≈95min（含 P0 五组实验、D3 机检、复审、返工），n=1，方向性结论。

## 发现的缺陷与处置

1. **[已修 v1.0.12]** 模板派发写法 `subagent(agent_preset=..., provider=...)` 与本机工具面不符 → 执行者退化为同步 persona，批级「并行」变串行（批 1 白付约 45min）。改正：`workflow.parallel` 正文流程 + 禁止同步原语冒充并行。
2. **[已修 v1.0.12]** `save.ps1` 编辑丢 UTF-8 BOM → PS5.1 解析崩溃，`next-node` 不可用。改正：`sync-skills.ps1` 增 4 份副本「BOM 在位 + PS5.1 解析零错误」断言。
3. **[已修]** `pi-tempo/README.md` v1.0.11 条目把「模型分档」写成 pi-tempo SKILL 改动（归属错误）；`install-stack.md` 分工与回滚路径表述不准。
4. **[已修]** 复审编造 `PROTOCOL.md:126` 作阻断项（实测 0 命中）。改正：复审阻断项须附 `文件:行: 原文`，调度器先 grep 复核再派返工。
5. **[超范围/上报]** DSH 宿主取消 workflow 时抛 `TypeError: Cannot read properties of undefined (reading 'catch')`（desktop-next.log 15:51:14），属产品侧 agent 销毁路径缺陷 → 记 upstream 建议。
6. **[待办]** workflow agent 子会话不落 projcache → 每棒 TTFT/decode/pressure 不可机读，只能按会话文件时间窗推算。需产品支持或改用可观测派发形态。
7. **[待办]** `.agents/skills/pi-tempo/SKILL.md`（DSH 方言副本）仍是 v1.0.10，未走装配链；**勿手改承重目录**，应更新 `research/dsh-adaptation-drafts/` 装配源后重装。

## 二期建议：竞速批（≤10 行，未实施）

- 前置：git worktree 隔离（每支 fixer 独立 worktree + 分支），主会话只做 fan-in diff 与择优。
- 判据：测试全绿 + diff 最小；败方 worktree 直接删除，禁止 merge。
- 上限：同任务 2 支，仅限同一批文件集；两期实测后再评估是否常态化。
- 成本：每支多付环境准备与依赖安装；仅对高不确定任务启用。

## 经验沉淀

- 同步原语「一条消息多个调用」≠ 并行；派发前先用 20s 窗口探针验证原语。
- 小改（≤2 文件、≤20 行）不派棒：主会话直改，省 2 趟往返 + 10–30min。
- 复审也会幻觉：阻断项先机检复核原文，再决定是否返工。
- 编辑 `.ps1` 后必须验 BOM + PS5.1 解析；哈希一致不代表可执行。
