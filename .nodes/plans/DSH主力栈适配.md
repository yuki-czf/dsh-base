# 计划：DSH主力栈适配（蓝图执行）

> 状态：进行中 · 登记 2026-10-18 · 唯一蓝图 `research/dsh-desktop-adaptation.md`（严格执行，不另起设计）
> 目标一句话：按蓝图 §4 把 prometheus-spec + node-architect/pi-tempo + subagent 全家桶迁入 DSH Desktop：批A（A1–A6 文件类）→ 批B（B1–B3 bundle 编写与安装）。

## 边界（铁律）

1. 底稿只从蓝图 §2 的 raw URL 拉；**禁止任何 git 网络操作**（本地 git fetch 因 ACL 已坏），git 本地只读命令可用
2. 只写项目级安装形态（`.agents/skills/`、`.dsh/skills/`）与草稿目录 `research/dsh-adaptation-drafts/`；**不改母版目录**（node-architect/、talk-human/ 等）
3. `__GEMINI_ROUTE__` 保持占位符原样；对应挂起验收项跳过并记录
4. `install_bundle` 弹 Full/审批属预期
5. 蓝图与实际不符 → 写 `research/dsh-adaptation-drafts/discrepancies.md` 再继续，不硬编

## 批次

- **批A**（文件类，普通会话）：A1 pi-tempo DSH 方言版 / A2 三执行棒简报模板 / A3 node-run DSH 版（user-invocable）/ A4 prometheus-spec skill 全文 DSH 版 / A5 persona 前缀 / A6 librarian persona → ANCHOR 见各批正文
- **批B**（bundle 类，依赖批A）：B1 bundle 目录 / B2 cordis.patch.yml（先查 dsh-tool-fs 只读挂载可行性 + tool-subagent 原行整块重述）/ B3 install_bundle 安装与验证

## 验收标准

抄蓝图 §6（PROGRESS 行已录全文）：①A1-A6 落位且 frontmatter 合法 ②技能目录出现 pi-tempo、prometheus-spec；斜杠面出现 node-run ③A1 保留 §8.5 锚定与 §10 依赖四型普适内核 ④B3 两 preset 激活无诊断、新会话选择器可见 ⑤prometheus-spec 预设新会话首步加载 skill、对「实现X」回「创建工作计划」⑥subagent 出 agent_preset 枚举含 librarian 且派单跑通 ⑦并发≥2 subagent→fan-in（__GEMINI_ROUTE__ 未回填则挂起）⑧真实小节点试跑（接力表 2 棒）。
执行:执行接力（批A文件/批B bundle 可两棒）；收口:独立复审（对照云端原文 diff 抽查 + GUI 实测）。

## 撞号备注

PROGRESS 表 max 原为 15，本节点取号 **#16**；但 `.nodes/CONTEXT.md`「当前节点」段落里另有一个从未落 PROGRESS 行的「节点 16（共享MCP-ssh-runner-DSH，待验收）」。两处编号冲突系历史登记缺口，非本次脚本失误（PROGRESS 只改自己节点的行，ssh-runner 行留给其 owner 补登记）。查阅时注意区分。

## 规模

10 份云端底稿 + 8 份产出 + 1 bundle（3 文件）；预估 >40min，两棒接力。蓝图与实际不符处记 `research/dsh-adaptation-drafts/discrepancies.md`。
