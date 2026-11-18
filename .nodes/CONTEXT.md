# 项目快照 CONTEXT

> 本文件是项目一页纸快照，任何会话开工前必读。永远保持一屏以内，细节放 archive/。
> 最后更新：2026-11-18（#37 dotdir-locate-fix ✅已完成：母版 node-architect v1.13.5 纯 skill 防误判 + locate 动作上线，sync-skills 29/29 + zip 重打包）

## 项目一句话

node-architect：把"设计先行 + 节点存档 + 读档恢复"的长项目协议做成集中式多客户端安装包；本仓库是它的母版与试验场（GitHub: yuki-czf/dsh-base）。

## 当前节点

- **节点 37**：`dotdir-locate-fix`（**已完成** 2026-11-18，会话 opencode-main）——纯 skill 方案（不动项目/全局 AGENTS.md、不用 `.ignore`）：母版 v1.13.5 五处落地（`SKILL.md` 首句 ≤80 字禁 `glob` 提示＋铁律 0／两 command 第 0 步／`PROTOCOL` 第 0 步／`QUICKREF` 定位节＋码 2／`save.ps1`+`save.mjs` 增 `locate` 且遇 `.git` 停搜）；四态+`verify` 全过，sync-skills 29/29，`dist/node-architect-v1.13.5.zip` 已出
- **节点 36**：`spec-superflow v2 并行试点落位`（**已完成** 2026-11-02，会话 openchamber-main）——上游 v2.1.0＝一条龙（规划=执行同会话）＋两件套默认，与 prometheus-spec 分离架构相反，故**全局钉 0.8.16 不升级**；新线三件：E:\tools\spec-superflow-v2（npm pack 2.1.0）＋E:\www\ssf-v2-lab 试点仓（裸名 skills）＋~/.config/opencode/agents/superflow-v2.md；冒烟 npx 2.1.0 过
- **节点 35**：dsh-present MVP ✅已完成 2026-10-30（openchamber-poc；标注功能 1:1，截图缩略图缺口已记录）
- **节点 34**：OpenChamber 呈现能力对标验证 — **进行中**（装机完成，待重启激活＋实测，openchamber-poc）
- **⚠ 撞号附注**：另一设备登记时云端无 #16–#29，新旧 #16/#17 两套并存；后续取号恢复 max+1

## 活跃会话

| 会话 | 负责 | 更新时间 |
|---|---|---|
| opencode-main（本机） | ✅ #37 dotdir-locate-fix 收口（node-architect v1.13.5 + locate + zip 打包） | 2026-11-18 |
| openchamber-main（本机·GLM-5.3） | ✅ #36 v2 试点落位；余留：用户实跑 direct/planned 出 pilot-notes | 2026-11-02 |
| openchamber-poc（本机） | #34 进行中（待重启实测）；#35 已收口 | 2026-10-30 |
| relay-v1011（本机·DeepSeek NEXT） | ✅ #32/#33 双收口；余留：pi-tempo DSH 方言副本对齐 v1.0.12、workflow 子会话无 projcache 指标 | 2026-10-20 |
| main（另一设备） | #16/#17 收口归档＋install-stack 手册推送 | 2026-10-19 |

## 关键路径提醒

- **spec-superflow 双轨铁律（#36）**：全局 npm 钉 0.8.16（它是 opencode.json 插件注册的物理源，升它＝动旧线）；v2 试点只在 E:\www\ssf-v2-lab＋agent superflow-v2，CLI 走 `npx -y spec-superflow@2.1.0` 禁用全局 ssf
- **dsh-run 双落点**：仓内母版 `.dsh\skills\dsh-run.md` ↔ 实际加载位 `E:\.dsh\skills\dsh-run.md`（手工复制；`sync-skills.ps1` 只断言关键句与残留，不校验哈希）
- **批内并行原语**：`workflow.parallel`（可带 provider/model）；`subagent_manager_run` 同步串行只配单棒；官方异步 `subagent` 真并行但无模型参数——同步原语一次消息多调用 ≠ 并行
- **母版 .ps1 铁律**：编辑后必须保 UTF-8 BOM（`EF BB BF`）且 PS5.1 `ParseFile` 零错误；`sync-skills.ps1` 已对 4 份 save.ps1 断言（25 checks）
- **复审锚点**：阻断项须附 `文件:行: 原文`，调度器先 grep 复核；原文不存在＝误报，记 facts 不返工
- **双母版维护（唯一正道）**：改母版 → `sync-skills.ps1`（29 项校验）→ `pack.ps1` → commit/push；母版 .ps1 新代码 ASCII-only；推送走代理 `git -c http.proxy=http://127.0.0.1:8321 push origin main（hysteria HTTP；7892 已失效，2026-11-10 实测）`
- **profile 装插件铁律（#31）**：node_modules 记录的 store 必须与操刀 pnpm 大版本一致；禁用 PATH 上的 pnpm 10.32.1 在 `E:\.dsh\profiles\desktop` 里 install
- **DSH 适配资产承重目录**：`.agents/skills/{pi-tempo,prometheus-spec}/`、`.dsh/skills/dsh-run.md`、`research/dsh-adaptation-drafts/`；勿手改，走「模板→装配脚本→YAML 校验」
- **pi-tempo 看门狗已下线（2026-11-02 用户拍板）**：勿重装看门狗、勿再注册自启

## 下一步

1. v2 试点实跑（用户）：superflow-v2 agent 在 ssf-v2-lab 跑 direct/planned 两路径，出 `changes/*/pilot-notes.md` 后评估是否吸收（评审锚点／isolate+finish）
2. pi-tempo DSH 方言副本（`.agents/skills/pi-tempo`）经装配链对齐 v1.0.12（勿手改承重目录）
3. 指标缺口：workflow 子会话不落 projcache → 评估异步 subagent 采集或产品侧支持
4. 上游：取消 workflow 时 `agent/disposed TypeError`＋workflow 无过程进度（已留日志证据）
5. 二期竞速批：worktree 隔离立项（草案见 task9-retro.md）
6. 遗留：#274R1 验收、节点 19/17 验收、gemini-lean v12 实测、#12 dsh-mcp skill
