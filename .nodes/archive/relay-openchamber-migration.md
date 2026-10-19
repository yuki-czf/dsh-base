# 四连败封盘：接力执行迁 openchamber permissions 硬闸（#29）

> 2026-10-18 · 会话 pidesktop-gemini · 274R1（session ba7e957d，53.9m）为 v1.0.10 首弹。

## 判定数据

主会话 35E+8W+41B+160R（与全量返工棒陪跑 45min）／ctx 320k／R6×3／自检 0/4 收敛点（git status 仅 10:03×2＋10:49×2）／v1.0.10 确认装载（模板版本行＋skill 双轨条均在会话内）。对比 274：规模减半（78→35E、218→41B、13→2 Task、147→54min），模式原样。

## 定论

- 禁令（v1.0.7）→ 程序化检查（v1.0.10）→ **四连全败**（272R1→272R2→274→274R1）。提示词层对等待焦虑无效，执行会话不能自证清白。
- 机械解只剩工具级拦截：openchamber permissions（已在 prometheus-spec 上验证生效）；PI-Desktop 无会话级工具白名单（plan mode 宿主外不可验证，放弃）。

## 交付

- build-relay agent 创建话术（用户在 openchamber 执行）：permissions 照抄 prometheus-spec.md 语法（action/resource/effect），可写仅 `.nodes/**` 与 `changes/**/evidence/**`，源码 edit/write 全拒，shell 逐条确认；正文=照单循环接力协议（六段简报/重派≥2熔断/返工棒单一 owner/baseline/facts≤300字/收口派独立复审）。
- 后续分工：openchamber 跑接力执行；PI-Desktop 跑规划（/plan-node）＋独立复审＋用户验收。
