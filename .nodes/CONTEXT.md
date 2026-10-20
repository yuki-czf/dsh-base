# 项目快照 CONTEXT

> 本文件是项目一页纸快照，任何会话开工前必读。永远保持一屏以内，细节放 archive/。
> 最后更新：2026-10-20（#32/#33 接力批加固与试点收口；由 node-architect 存档流程维护）

## 项目一句话

node-architect：把"设计先行 + 节点存档 + 读档恢复"的长项目协议做成集中式多客户端安装包；本仓库是它的母版与试验场（GitHub: yuki-czf/dsh-base）。

## 当前节点

- **节点 33**：`v1.0.11 发布文档补正与 dsh-run 落位说明`（**已完成** 2026-10-20，会话 relay-v1011；细节 archive 同名）——试点 n=1：批 1 双棒 `workflow.parallel` 22.6min vs 串行外推 40m57s（省 44.8%）；P0 判定 Gemini 可并发、串行来自同步 persona 原语；复审误报 1 条留痕；metrics/facts/retro 归档
- **节点 32**：`接力批并行提速与防幻觉加固`（**已完成** 2026-10-20，会话 relay-v1011；细节 archive 同名）——三模板 v1.0.11（dsh-run 批级循环／BATCH-PLAN 批列主键／pi-tempo §10）＋sync 25 项断言（含 BOM/解析）＋提交 `00507c6`／`c84eb6e`／`27b0c4b`
- **节点 31/30** 已完成（profile store 失配修复／更名证实与旧会话迁移，细节 archive 同名）
- **节点 29**：四连败封盘，方向 B（openchamber build-relay）待实测；**#16/#17** 已完成
- **⚠ 撞号附注**：另一设备登记时云端无 #16–#29，新 #16/#17 与旧 #16/#17 编号重叠，两套并存；后续取号恢复 max+1

## 活跃会话

| 会话 | 负责 | 更新时间 |
|---|---|---|
| relay-v1011（本机·DeepSeek NEXT） | ✅ #32/#33 双收口；余留：pi-tempo DSH 方言副本仍 v1.0.10（待装配链）、workflow 子会话无 projcache 指标、host 取消路径 TypeError 上报 | 2026-10-20 |
| dsh-next-mig（本机·DeepSeek NEXT） | ✅ 节点 #30、#31 双收口；余留：残缺备份 zip、旧残留目录、E:\.dsh 活数据备份、可选全量重链退役 v10 store | 2026-10-19 |
| pidesktop-gemini（本机） | ✅ 节点 27/28/29 三连收口；等 build-relay 落地实测 | 2026-10-18 |
| main（另一设备） | #16/#17 收口归档＋install-stack 手册推送 | 2026-10-19 |

## 关键路径提醒

- **dsh-run 双落点**：仓内母版 `.dsh\skills\dsh-run.md` ↔ 实际加载位 `E:\.dsh\skills\dsh-run.md`（手工复制；`sync-skills.ps1` 只断言关键句与残留，不校验哈希）
- **批内并行原语**：`workflow.parallel`（可带 provider/model）；`subagent_manager_run` 同步串行只配单棒；官方异步 `subagent` 真并行但无模型参数——同步原语一次消息多调用 ≠ 并行
- **母版 .ps1 铁律**：编辑后必须保 UTF-8 BOM（`EF BB BF`）且 PS5.1 `ParseFile` 零错误；`sync-skills.ps1` 已对 4 份 save.ps1 断言（25 checks）
- **复审锚点**：阻断项须附 `文件:行: 原文`，调度器先 grep 复核；原文不存在＝误报，记 facts 不返工
- **双母版维护（唯一正道）**：改母版 → `sync-skills.ps1`（25 项校验）→ `pack.ps1` → commit/push；母版 .ps1 新代码 ASCII-only；推送走代理 `git -c http.proxy=http://127.0.0.1:7892 push origin main`
- `save.ps1` 跨项目必须显式 `-Project`；受限令牌下锁创建被拒，需 full access
- **profile 装插件铁律（#31）**：node_modules 记录的 store 必须与操刀 pnpm 大版本一致；禁用 PATH 上的 pnpm 10.32.1 在 `E:\.dsh\profiles\desktop` 里 install
- **DSH NEXT 数据家目录**：`E:\.dsh`（DSH_HOME 进程注入）；会话/标题缓存/workspace.json 结构见节点 #30 archive
- **DSH 适配资产承重目录**：`.agents/skills/{pi-tempo,prometheus-spec}/`、`.dsh/skills/dsh-run.md`、`research/dsh-adaptation-drafts/`；勿手改，走「模板→装配脚本→YAML 校验」

## 下一步

1. pi-tempo DSH 方言副本（`.agents/skills/pi-tempo`）经装配链升 v1.0.12（勿手改承重目录）
2. 指标缺口：workflow 子会话不落 projcache → 评估异步 subagent 采集或产品侧支持
3. 上游：取消 workflow 时 `agent/disposed TypeError`＋workflow 无过程进度（已留日志证据）
4. 二期竞速批：worktree 隔离立项（草案见 task9-retro.md）
5. 遗留：#274R1 验收、节点 19/17 验收、gemini-lean v12 实测、pi-speed/pi-statusbar 双源合并、#12 dsh-mcp skill
