# facts — 试跑草稿目录文档化（调度器记账，各段 ≤300 字）

## 批0 基线快照（scout 7f2d5565 · vps-direct/gemini-3.8-flash · 2026-10-18）

- 结果：成功。`git status --porcelain` 原文 11 行已落盘 `baseline.txt`。
- 基线要点：4 个已修改（.nodes/CONTEXT.md、.nodes/DECISIONS.md、.nodes/PROGRESS.md、.nodes/SESSIONS/main.md）；6 处未跟踪（.agents/skills/pi-tempo/、.agents/skills/prometheus-spec/、.dsh/、两个 .nodes/plans/*.md、research/dsh-adaptation-drafts/、research/dsh-desktop-adaptation.md）。
- 判定口径注记：research/dsh-adaptation-drafts/ 整目录 untracked → 批1 对 README.md（新建）/ discrepancies.md（untracked 文件内容修改）的改动在折叠 porcelain 下均不产生新行。批2 判定＝①无基线外新行（同口径对比）＋②`-uall` 展开该目录作辅助证据＋③各棒回报改动清单交叉核对。

## 批1a README 新建（fixer 3c3797eb · vps-direct/gemini-3.8-flash · 2026-10-18）

- 结果：成功。新建 research/dsh-adaptation-drafts/README.md，改动清单恰为授权集内单文件。
- 三要素自检（棒回报）：①目录用途＝批A/B 交付物草稿+台账归档区；②承重警告＝bundle/ 经 pnpm link 挂 DSH 桌面 profile、改动即改环境、升级走 remove_bundle→install_bundle；③persona 真源＝persona-prometheus-spec.md / persona-librarian.md / cordis.patch.template.yml＋装配校验一句话（模板+草稿→装配脚本→YAML 校验）。
- 棒自报：回读逐要素核对、无占位符/编造文件名、零跨棒冲突。终局核实归批3 复审。

## 批1b 顶部索引（fixer a3774776 · vps-direct/gemini-3.8-flash · 2026-10-18）

- 结果：成功。discrepancies.md 首行标题与前言之后、第一条目之前插入「## 目录索引」节（索引节占行 5–21，行 7–21 恰 15 行锚链接），改动清单恰为授权集内单文件。
- 验证（棒回报）：重读确认原 15 条及下方正文逐字未改；15 条标题→slug 映射表齐（GitHub 风格：小写/空格转 -/删标点含反引号/留 CJK 数字下划线）；抽查条目 1/4/13 推导核对通过。
- 备注：条目 7 slug 含 ③ 字符保留、条目 13 下划线保留——不同渲染器对符号类处理有差异，属「锚点与标题 slug 对应」口径内的最佳努力，交批3 复审终审。

## 批2 越界复核（scout 4590a356 · vps-direct/gemini-3.8-flash · 2026-10-18）

- 判定：**零越界 ✅**。折叠 porcelain 12 行 vs 基线 11 行：唯一新增行＝`?? .nodes/relay/`（调度器自记 baseline.txt/facts.md，验收④明文合法）。
- `-uall` 展开草稿目录 11 文件：授权两文件（README.md、discrepancies.md）在列；其余 9 个为既有草稿（bundle/×2、cordis.patch.template.yml、persona×2）与转录 jsonl（child-7c23d0ea + session×3，运行时产物，非棒写入；计划文件「两个 jsonl」口径已过时）。
- 双轨交叉：两棒回报改动清单恰为各自授权单文件，与 git 证据自洽。

## 批3 异构复审（independent-review，重派 1 次 · zai-coding-cn/glm-5.3-flash · 2026-10-18）

- 首派 641cb310：完整报告落在调度器不可见轮次，收尾消息仅剩结论引用 → 判**报告不完整**，修简报（加「完整报告必须写入收尾消息」硬性条款）重派 1 次（未触 ≥2 熔断线）。
- 重派 dc4de02e：**裁决＝通过**。①README.md:3-4（目录用途）/:6-11（承重警告，pnpm link＋remove_bundle→install_bundle）/:13-20（persona 真源三文件＋装配校验一句话）；②discrepancies.md:5-21 索引 15 行与正文 15 条一一对应，抽查 6 条 slug（含候选瑕疵条目 7/13）全部符合 GitHub slugger 规则——③ 为 Unicode 数字类应保留、下划线从不删除，均不构成缺陷，正文未改；③越界证据链自洽（唯一新增 `?? .nodes/relay/` 属验收口径明文豁免）。
- 未决风险：复审棒无 shell 未独立重跑 git（仅复核证据自洽性，低风险）；slug 推导以 GitHub 渲染为口径（与验收口径一致）。

## 节点收口（调度器 · 2026-10-18）

- 六项验收全过：①②复审通过（行号证据）③本 facts 全程记账各段 ≤300 字 ④批2 零越界 ⑤复审回报逐项行号 ⑥调度会话零源码写入（仅 .nodes/relay/ 两文件＋PROGRESS 自己行）。
- 执行统计：4 批 5 棒（scout×2＋fixer×2＋review×1，其中复审重派 1 次），路由 vps-direct/gemini-3.8-flash×4＋zai-coding-cn/glm-5.3-flash×1，全部异步通知收敛，零超时零熔断。
- PROGRESS #17 → 待验收；checkpoint 转告 main 会话执行（本调度会话无 pwsh）。
