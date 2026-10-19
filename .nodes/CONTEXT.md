# 项目快照 CONTEXT

> 本文件是项目一页纸快照，任何会话开工前必读。永远保持一屏以内，细节放 archive/。
> 最后更新：2026-10-18（由 node-architect 存档流程维护）

## 项目一句话

node-architect：把"设计先行 + 节点存档 + 读档恢复"的长项目协议做成集中式多客户端安装包；本仓库是它的母版与试验场（GitHub: yuki-czf/dsh-base）。

## 当前节点

- **节点 29**：`四连败封盘：接力执行迁 openchamber permissions 硬闸`（**已完成** 2026-10-18，会话 pidesktop-gemini；细节 archive 同名）——274R1（v1.0.10 首弹，53.9m）确认装载仍双轨（35E+41B／ctx 320k／自检 0/4）→ **提示词层方案封盘**（272R1→272R2→274→274R1 四连）；方向 B 拍板：openchamber build-relay agent（permissions 工具级硬闸，话术已交用户）；PI-Desktop 退居规划＋复审＋验收
- **节点 28**：`v1.0.10 双轨自检与返工棒`（已完成 2026-10-18）——首弹即败，结论沉淀于节点 29
- **节点 27**：`委派双槽与三层闸门`（已完成 2026-10-18）——node-architect **v1.13.3**（规划端治理有效：274 档案全合规）
- **节点 26/25/24/23**：sync-skills 同步器／执行接力档案化／外部看门狗／pi-tempo 体系（均已完成）
- **节点 19**：`事故速查与派活纪律`（待验收，v1.10.1）

## 活跃会话

| 会话 | 负责 | 更新时间 |
|---|---|---|
| pidesktop-gemini | ✅ 节点 27/28/29 三连收口（10-18）：双槽→双轨防线→迁 openchamber 拍板；下一步等 build-relay 落地实测 | 2026-10-18 |
| main / main-n19 | 节点 16/17/18/19 待验收 | 2026-10-09 |

## 关键路径提醒

- **工作区是正式 git 克隆**：开工先 `git pull`；**推送走代理 `git -c http.proxy=http://127.0.0.1:7892 push origin main`**；`.nodes` 档案入库待用户定
- **双母版维护（唯一正道）**：改母版 → `sync-skills.ps1`（17 项校验）→ `pack.ps1`（node-architect 有改动时）→ commit/push；母版 .ps1 新代码 ASCII-only
- **save.ps1 跨项目调用必须显式 -Project**；跑法=`powershell.exe -NoProfile -ExecutionPolicy Bypass -File <save.ps1> …`
- **CPA 渠道档位**：Google /v1beta 收嵌套 `thinkingConfig.thinkingLevel`；生效配置在 ~/.pi-desktop/pi.sqlite providers 表
- **pi-tempo v1.0.10（全局）**：执行槽闸＋接力（2.5）＋并行批（2.6）＋双轨自检与返工棒（2.7）——**提示词层已到顶，接力主会话不再用 PI-Desktop 跑**；看门狗六规则运行中
- **执行分工（节点 29 起）**：openchamber prometheus-spec 规划＋build-relay 接力执行（permissions 硬闸）；PI-Desktop /node-run 仅自干节点与复审验收

## 下一步

1. **build-relay agent 落地**（用户在 openchamber 按话术创建）→ 275 号节点全链实测：openchamber 规划→build-relay 照单循环→PI-Desktop 复审；对账：主会话（build-relay）源码 Edit=权限层拒绝数、ctx、墙钟、棒成功率
2. **#274/R1 实施结果用户验收**（reddit-trend-tc 真机）；两外仓同步产物待各自 commit
3. 节点 19/17/18/16 验收；上游三案待发（`pi-tempo/upstream-issue-draft.md`）
4. pi-speed/pi-statusbar 插件遗留；pi-gemini-tuning/ 双源合并待用户定
