# 项目快照 CONTEXT

> 本文件是项目一页纸快照，任何会话开工前必读。永远保持一屏以内，细节放 archive/。
> 最后更新：2026-10-19（双机合并；由 node-architect 存档流程维护）

## 项目一句话

node-architect：把"设计先行 + 节点存档 + 读档恢复"的长项目协议做成集中式多客户端安装包；本仓库是它的母版与试验场（GitHub: yuki-czf/dsh-base）。

## 当前节点

- **节点 29**：`四连败封盘：接力执行迁 openchamber permissions 硬闸`（**已完成** 2026-10-18，会话 pidesktop-gemini；细节 archive 同名）——274R1 确认装载仍双轨 → **提示词层方案封盘**（272R1→274R1 四连）；方向 B 拍板：openchamber build-relay agent（permissions 工具级硬闸）；PI-Desktop 退居规划＋复审＋验收
- **#16 DSH主力栈适配**（**已完成** 2026-10-18，另一设备 main；归档 archive/DSH主力栈适配.md）：蓝图 research/dsh-desktop-adaptation.md 全落地，§6 十项全 PASS；三 skill＋bundle v1.3.1 五预设（Prometheus-Spec 已设默认）＋子代理模型 override
- **#17 试跑草稿目录文档化**（已完成 2026-10-18）：dsh-adaptation-drafts README＋台账索引；产物含 install-stack.md v1.2（跨设备安装手册，DSH 核心 >=0.2.1-rc.2 <0.2.2）
- **⚠ 撞号附注**：另一设备登记时云端无 #16–#29（本机当时未推）——新 #16/#17 与旧 #16（ssh-runner）/旧 #17（plan-node）编号重叠，两套并存；后续取号恢复 max+1
- **节点 28**：`v1.0.10 双轨自检与返工棒`（已完成 2026-10-18）——首弹即败，结论沉淀于节点 29
- **节点 27**：`委派双槽与三层闸门`（已完成 2026-10-18）——node-architect **v1.13.3**
- **节点 26/25/24/23**：sync-skills／执行接力档案化／外部看门狗／pi-tempo 体系（均已完成）；**节点 19**：待验收 v1.10.1

## 活跃会话

| 会话 | 负责 | 更新时间 |
|---|---|---|
| pidesktop-gemini（本机） | ✅ 节点 27/28/29 三连收口：双槽→双轨防线→迁 openchamber 拍板；等 build-relay 落地实测 | 2026-10-18 |
| main（另一设备） | #16/#17 收口归档＋install-stack 手册推送；改名调查未找到官方证据，已问用户来源 | 2026-10-19 |
| main / main-n19（本机旧档） | 节点 16/17/18/19 待验收 | 2026-10-09 |

## 关键路径提醒

- **双机并行已实证**：会话名 main 两机共用，SESSIONS/main.md 双写——存档后立即 commit/push，开工先 pull；推送走代理 `git -c http.proxy=http://127.0.0.1:7892 push origin main`
- **双母版维护（唯一正道）**：改母版 → `sync-skills.ps1`（17 项校验）→ `pack.ps1` → commit/push；母版 .ps1 新代码 ASCII-only
- **save.ps1 跨项目调用必须显式 -Project**；受限令牌下锁创建被拒，需 full access
- **DSH 适配资产（#16 交付，勿手改承重目录）**：`.agents/skills/{pi-tempo,prometheus-spec}/`、`.dsh/skills/node-run.md`、`research/dsh-adaptation-drafts/`；改动走「模板→装配脚本→YAML 校验」
- **install-stack 手册**（research/dsh-adaptation-drafts/）：跨设备装主力栈；判据以版本字段/目录/工具名为准（产品更名 DeepSeek NEXT 未验证，engines 闸拒装）
- **CPA 渠道档位**：Google /v1beta 收嵌套 thinkingConfig.thinkingLevel；配置在 ~/.pi-desktop/pi.sqlite providers 表
- **本机 ~/.dsh gemini-lean v12**（2026-09-26）：wire 16 需重启 DSH 桌面生效；回滚见 DECISIONS 09-26 两条
- **执行分工（节点 29 起）**：openchamber prometheus-spec 规划＋build-relay 接力执行；PI-Desktop /node-run 仅自干与复审

## 下一步

1. **build-relay agent 落地**→275 号节点全链实测（openchamber 规划→build-relay 接力→PI-Desktop 复审）
2. **本机版本窗口验证**：install-stack P0 探测——在窗口内照手册装，不在则另立适配节点
3. 二期 policy 插件（fs 路径闸门，触发=越权写证据）／bundle 迁正式位＋母版合流
4. #274/R1 验收；节点 19/17/18/16 验收；上游三案待发
5. 遗留：gemini-lean v12 实测、pi-speed/pi-statusbar、pi-gemini-tuning 双源合并、#12 dsh-mcp skill
