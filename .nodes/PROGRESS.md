# 节点进度矩阵 PROGRESS

> 每个节点一行，谁拥有谁更新（只 edit 自己的行）。新节点插在表头下方。

| # | 节点 | 验收标准 | 状态 | Owner 会话 | 更新时间 |
|---|------|----------|------|-----------|----------|
| 10 | v1.4.0 skill 优化与母版同步（分层文档 / 真源对齐 / 一键存档 / 目录锁 / 跨平台 save.mjs） | SKILL.md 分三层（精简版 + QUICKREF 速查 + SKILL-FULL 全文）；母版↔真源镜像 diff=0；版本号三处一致 v1.4.0（SKILL frontmatter / .nodes/PROTOCOL.md / AGENTS 指针，且 init 能自刷新）；save.ps1 新增 `save` 与 `trim-decisions` 动作 + 目录锁原子创建 + DECISIONS 行数与待验收过期双告警；save.mjs 跨平台功能对等；新机解压安装实测通过；dist v1.4.0 zip+sha256 | 已完成 | main | 2026-09-17 |
| 14 | 云端分发入口：remote-install 泛化多模块（原云端#4） | ①-Module 参数路由 node-architect/ssh-runner，默认行为向后兼容 ②-ZipPath 离线安装可用 ③本地 zip 模拟云端：两模块均能装入临时项目且产物完整 ④README 含 ssh-runner 云端安装命令 | 已完成 | opencode 主会话 | 2026-08-22 |
| 13 | mcp-ssh-runner v0.2 凭据隔离收紧（原云端#3） | ①凭据改平文件（ssh_host/user/password 等），一次 read 最多暴露一字段 ②resolved 临时文件在服务端启动后数秒内删除（时序验证）③opencode.json 附 permission deny 拦截 .secrets ④.secrets ACL 收紧仅当前用户 ⑤全量回归通过 | 已完成 | opencode 主会话 | 2026-08-22 |
| 12 | dsh-mcp skill（AI 纪律层）（原云端#2） | 教 AI 排障/升级走 installer、禁读 .secrets | 待开始 | — | 2026-08-22 |
| 11 | mcp-ssh-runner 统一源封装（原云端#1） | ①修正版 runner 通过 stdio 握手测试 ②install.ps1 幂等生成 ≥4 客户端配置且不覆盖已有条目 ③凭据零进 argv/零进客户端配置 ④.secrets 模板初始化+gitignore 自动补齐 | 已完成 | opencode 主会话 | 2026-08-22 |
| 9 | dsh-plan-popup 个人套餐弹窗插件（计划已落 plans/dsh-plan-popup.md） | 侧边栏「个人套餐」入口点击弹出 shell.overlay 浮层，正确渲染各渠道套餐窗口（百分比+重置时间）；刷新按钮走 /api/dsh-usage/refresh；主题与中英文自适应；原使用统计入口不受影响。计划与坑清单见 plans/dsh-plan-popup.md | 已完成 | main | 2026-09-17 |
| 8 | DSH 自动派生探路（web API 反推 + 派生实现或关闭归档） | 批1 探路产出 API 契约笔记（会话创建端点/鉴权/参数）；批2 分支：可用 → 实现派生（pwsh 直调或插件工具）+ DSH 实测真批末自动开出下一批会话 + 版本 bump；不可用 → 归档结论维持手动档并关节点 | 待验收 | v8-b2 | 2026-08-28 |
| 7 | v1.3.2 DSH 适配（batch-executor preset / bridge/dsh 收编 / install 探测 ~/.dsh） | ~/.dsh/.agent-presets/batch-executor 挂载成功且 DSH 实测跑通真批（含模型校验拒绝路径）；母版 bridge/dsh/ 收编 preset；install 探测 ~/.dsh 并扩展 -BatchAgent 语义；镜像 diff=0；dist v1.3.2 zip | 待验收 | v132-b2 | 2026-08-28 |
| 6 | v1.3.1 原子收口（save.ps1 commit 动作 / verify-batch 盲区 / UTF-8 降噪 / agent 纪律与询问制 / agent 迁母版） | save.ps1 含 `commit` 动作：单命令完成 lock→CONTEXT→unlock→verify，三场景实测（正常 / 锁竞争退码 / verify-batch FAIL 退码）；verify-batch 补 CONTEXT 批号校验；脚本输出 UTF-8；batch-executor 纪律更新 + **询问制**落 plans/README 与母版口径；**batch-executor 模板入母版**（{{BATCH_MODEL}} 占位）+ install `-BatchAgent` 两态冒烟；镜像 diff=0；dist v1.3.1 zip | 已归档 | main | 2026-08-28 |
| 5 | v1.3.0 批次协议固化（PROTOCOL 批次节 / BATCH-PLAN 模板 / install 同步 / zip） | 母版 PROTOCOL 含「批次协议」节且六条纪律全覆盖、目录树含 plans/；templates/BATCH-PLAN.md 六列字段说明完整；install 后镜像 diff=0；实例 .nodes/PROTOCOL.md 同步；dist v1.3.0 zip+sha256 | 已完成 | main | 2026-08-28 |
| 3 | L2 压缩前桥接·第一期（共享核心 + opencode 双落点桥接 + 五端实证收口） | opencode 触发压缩时桥接文本进入压缩 prompt 且 SESSIONS 留墓碑标记；bridge 核心单一真源（输出含 .nodes 快照 + 摘要硬指令 + 压缩后首动作=读档）；五端钩子实证回写归档 L3；install.ps1 -Bridge 可选装桥接件 | 进行中 | main | 2026-08-21 |
| 4 | v1.2.0 可分发（去硬编码/占位符自愈/pack.ps1/zip 验证） | 母版无 E:\www 残留；模拟新机解压安装全过；Bootstrap 路径指向解压位置；产出 dist\node-architect-v1.2.0.zip | 待验收 | main | 2026-08-22 |
| 2 | v1.1.0 P0 强化（save.ps1 存档脚本化 / 真源覆盖备份 / 规则去重+版本号） | 沙盒全周期 lock/unlock/verify 通过；重跑 install 本地差异自动备份不丢；SKILL/PROTOCOL/AGENTS 指针版本一致且以 PROTOCOL 为准 | 待验收 | main | 2026-08-21 |
| 1 | node-architect skill v1 | 一条命令安装到任意项目；DSH 热发现；init 幂等；AGENTS.md 指针生效 | 待验收 | main | 2026-08-21 |

<!--
状态取值：待开始 / 进行中 / 待验收 / 已完成 / 已归档
节点完成时：状态改"已完成"，细节归档到 archive/<节点名>.md，之后可改"已归档"
-->
