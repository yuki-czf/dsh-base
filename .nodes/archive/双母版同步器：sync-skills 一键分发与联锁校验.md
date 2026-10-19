# 节点归档：双母版同步器：sync-skills 一键分发与联锁校验

- **周期**：2026-10-17 → 2026-10-17（单会话 pidesktop-gemini 第五段；用户指出双母版更新债务后立题）
- **验收结果**：①`sync-skills.ps1` 覆盖两母版全部部署位 ✅（node-architect→三项目 install.ps1；pi-tempo→全局 `~/.agents/skills/` + `~/.agents/subagents/` + 项目 `.pi/prompts/` 模板映射表）②四类校验 ✅（pi-tempo 版本六处一致／node-architect 三项目镜像哈希＋`.nodes/PROTOCOL` 版本归一化比对／**跨 skill 联锁**：node-run 2.5 分支 ↔ PROTOCOL 执行接力词汇／subagent 哈希一致含接力棒纪律）③汇总表＋失配 exit 1 ✅ ④实测 **17/17 全绿 exit 0** ✅（首跑即抓到 pi-tempo-lab 镜像陈旧＋互锁断裂，部署后修复）⑤提交推送 ✅
- **改动了什么**：
  - 新增 `E:\www\dsh-base\sync-skills.ps1`（121 行，纯 ASCII 防编码坑）：`-CheckOnly` 纯校验／默认部署＋校验／`-Projects` 覆盖项目集；模板映射表（lab↔lab、reddit↔reddit）
  - 关键设计：**校验用文件哈希＋版本归一化比对，不用中文 grep**（PS 5.1 无 BOM 解析 ANSI 会碎裂 CJK 字面量；`.nodes/PROTOCOL.md` 的 `v__VER__` 占位符被 install 替换为实版本号，纯哈希必假阳性——归一化 `v\d+\.\d+\.\d+→vX` 后比对）
- **踩坑记录**：
  - `.nodes/PROTOCOL.md` 与母版唯一差异＝第 3 行版本号替换（install 模板机制）——校验器必须感知此变换，否则三项目全 FAIL 假警报
  - pi-tempo-lab 的 skill 镜像会随时间陈旧（今天只给 reddit/dsh-base 手工跑过 install，lab 被漏）——这正是同步器要防的事故类别，首次运行即实证
- **执行效率复盘**：侦察（junction 机制/部署位清单）＋实现＋两轮调试约 15 分钟；最大成本＝CheckOnly 首跑暴露的 6 FAIL 诊断（占 5 分钟，值——直接换来归一化设计）
- **遗留**：无阻塞。**日常维护新流程**：改任一母版 → 跑 `sync-skills.ps1`（一条命令分发＋校验）→ commit/push；新项目接入＝改脚本默认 Projects 数组或传参
- **给下个节点的衔接说明**：改 pi-tempo skill/模板/子代理或 node-architect 母版后，**不要再手工 Copy-Item 或逐项目 install**——直接 `powershell -ExecutionPolicy Bypass -File E:\www\dsh-base\sync-skills.ps1`，看 17 项全绿即两 skill 全部署位一致；`-CheckOnly` 可当部署前预检。
