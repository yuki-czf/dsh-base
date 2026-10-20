# facts — 节点 #33 试点（dsh-run v1.0.11 冒烟）

## P0 渠道并行探测

- **结论（首行）：Gemini 渠道可并发；「串行」假象来自同步 persona 原语。** 批级并行原语＝`workflow.parallel`（可带 provider/model，满足 D7 分档）；官方异步 `subagent` 备用（并行但无模型参数）；`subagent_manager_run` 仅用于单棒/复审。
- 样本 1（同步 persona 双棒 A/B）：A `06:32:22.856Z→06:32:44.836Z`，B `06:34:27.340Z→06:34:53.871Z`，零重叠（B 晚 102.5s）→ `subagent_manager_run` 在工具层串行，**不能承载批级并行**。
- 样本 2（官方异步 subagent X/Y，继承父模型 deepseek）：X `06:35:40.459Z→06:35:50.114Z`，Y `06:35:40.573Z→06:35:49.743Z`，重叠 **9.17s**（取 min(end)−max(start)；X 全窗 9.65s）→ 异步 subagent 真并行。
- 样本 3（workflow.parallel + cpa/gemini，5s 窗）：W2 `06:37:25.914→06:37:31.091`，W1 `06:38:04.995→06:38:19.745`，错峰未见重叠 → 疑启动抖动。
- 样本 4（workflow.parallel 继承父模型 deepseek，10s 窗）：D1 `06:40:17.052→06:40:30.483`，D2 `06:40:16.657→06:40:30.970`，重叠 14s → workflow.parallel 真并发。
- 样本 5（复测 cpa/gemini，20s 窗）：G1 `06:41:09.787→06:41:39.763`，G2 `06:41:09.786→06:41:39.887` —— **同一毫秒启动、重叠 29.98s**（按起止时间实算：sleep 20s＋启动开销） → cpa/Gemini 渠道可并发；样本 3 错峰判定为启动抖动。
- 与模板的差距：`dsh-run.md` 派发段写 `subagent(agent_preset=..., provider=..., model=...)`，本会话 `subagent` schema 无这些参数；执行者退化到 `subagent_manager_run` 会串行。**记 evidence，试点头批后回 Wave 1 修模板**（试点期不改）。

## 批 1（D1 ∥ D2，workflow.parallel + cpa/gemini-3.8-flash）

- **D1**：`pi-tempo/README.md` 恢复 v1.0.10 历史条目原文（L56 起），新增真正的 v1.0.11 条目（L55，批级循环/模型分档/防幻觉锚定），模板节改双指（DSH=dsh-run、PI=node-run）并标 v1.13.4，部署命令补 DSH 加载位说明（L13/L29）；diff +4/−2。
- **D2**：`research/dsh-adaptation-drafts/install-stack.md` 新增「DSH NEXT 侧 dsh-run 落位（手工）」L70-114：模板口径、与 sync-skills 分工、Copy/Remove/三项校验命令；diff +29/−1。
- **并行窗口**：两子会话 `6eb07850`(78KB) 与 `a5adae93`(143KB) **同秒创建 14:42:22**；D1 lastWrite 15:00:47（墙钟 18m25s），D2 lastWrite 15:04:54（墙钟 22m32s）→ 窗口重叠 18m25s。**来源口径：workflow agent 子会话不落 projcache；窗口取会话目录创建时间与 session 文件最后写入时间，属推算，非 sessionStats 实测；每棒 TTFT/decode/pressure 因此记为 N/A。**
- **墙钟对比**：批实际 ≈22.6min（14:42:22→15:04:58）vs 串行外推 18m25s+22m32s=40m57s → 省 ≈18.4min（≈45%）。
- **派发形态偏差**：单条消息 1 个 `workflow` 调用内含 2 个并行 `agent()`，不是 2 个 `subagent` 调用——与模板字面/T8 判据「单消息双派发」形态不完全一致，记 evidence 供 Wave 1 修模板。
- **越界**：`git status` 比基线仅多 `pi-tempo/README.md` 与 `install-stack.md` 两文件＋台账，零越界。

## 批 2（D3 串行机检）

- 6 类机检（8 条断言）全 PASS：`sync-skills.ps1 -CheckOnly` exit 0（21 checks / 0 fail）；加载位与母版哈希一致（FC5E76…E9D6）；关键句命中 2 处；`E:\.dsh\skills` 无 node-run 残留；四模板位 v1.0.11；node-architect 真源 1.13.3 零残留、1.13.4 八位；README/install-stack 条目在位；越界检查通过。
- 证据：`changes/接力批并行提速与防幻觉加固/evidence/pilot-consistency.txt`（15167B）。

## 复审与返工（2026-10-20）

- 复审（independent-review / deepseek-v4.1-flash）：**有条件通过**。1 个阻断＋2 个必须修＋2 个建议。
- 阻断项经调度器复核为**误报**：证据文件实测 0 处 `PROTOCOL.md:126`，1.13.4 匹配块恰 8 行与 Count=8 一致（证据七节留痕）。
- 2 个必须修由主会话（用户批准「修」）直落：① README v1.0.11 模型分档归属改为「DSH NEXT 侧 dsh-run 模板」；② install-stack 分工补 node-architect install.ps1、3.4 断言语义、回滚路径改正。
- 偏离记录：返工 workflow 被用户取消（子会话 15:44:58 创建、15:51:14 仍在写盘，非卡死），经用户批准改为主会话直改——对「主会话禁参与返工」的用户授权例外。
- 模板层同批修复（v1.0.12，提交 `27b0c4b`）：批内并行改 `workflow.parallel`；复审阻断项须附原文摘录并机检；sync 增 save.ps1 BOM+解析断言（25/25 全绿）。
- 事故：调度器误把 PI 母版复制到 `.agents/skills/pi-tempo`（DSH 方言副本），立即 `git checkout` 恢复；DSH 方言副本仍 v1.0.10，待装配链更新。
