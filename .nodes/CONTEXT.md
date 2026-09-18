# 项目快照 CONTEXT

> 本文件是项目的一页纸快照，任何会话开工前必读。永远保持一屏以内，细节放 archive/。
> 最后更新：2026-09-18（由 node-architect 存档流程维护）

## 项目一句话

node-architect：把"设计先行 + 节点存档 + 读档恢复"的长项目协议做成集中式多客户端安装包；本仓库是它的母版与试验场（GitHub: yuki-czf/dsh-base）。

## 当前节点

- **节点**：节点 15（v1.5.0+v1.6.0 batch-executor 退役与执行效率协议）**已完成**（另一会话演进，本次补登记收口）
- **协议现状**：v1.6.0——batch-executor/链式派生退役入 `attic/`；新增「执行效率协议」（开工侦察/批次依赖标注/批内检查点/效率复盘）；verify 家族新增归档占位符、侦察段、校准日志三道机器校验；拆批触发扩至时间巨头；协议本体 ≤150 行红线
- **下一步**：
  1. DSH 插件侧遗留：节点 8 待验收；节点 7 并入 8 验收
  2. 并行遗留：节点 3（L2 桥接）进行中——注意 batch-executor 已退役，L2 桥接与派生相关结论需按 v1.5.0 口径复核
  3. 云端线遗留：#12 dsh-mcp skill（AI 纪律层）**待开始**
  4. 新校验待实战：侦察段/校准日志/归档占位符三道校验尚未在真实批次中跑过

## 活跃会话

| 会话 | 负责 | 更新时间 |
|---|---|---|
| main | v1.6.0 落地推送 + 补登记收口 | 2026-09-18 |
| opencode-main | 云端线 ssh-runner / remote-install（历史，GitHub 侧） | 2026-08-22 |

## 关键路径提醒

- **工作区是正式 git 克隆**（main ↔ origin/main）：开工先 `git pull`；改完 commit/push；凭据走 Windows 凭据管理器（lapland1009）
- **维护正向流程**：只改母版 `node-architect\skill\` → 重跑 `install.ps1` → `pack.ps1` 刷新 dist → 根 `dist\` 安装包与 README 引用同步换版 → commit/push
- **别项目更新话术**：任意项目说「更新节点协议」→ 全局引导跑母版 install.ps1（幂等，`.nodes` 档案保留）；改触发词后重跑 `-Bootstrap`（写 C 盘，DSH 沙箱内需提权）
- 母版 .ps1 保持 BOM；**新增代码块一律 ASCII-only（CJK 用 \uXXXX 转义）**防剥 BOM 后 PS 5.1 ANSI 解析碎裂；PS 单引号串内禁 `<>`；remote-install.ps1 纯 ASCII 无 BOM
- git 约定：autocrlf=true（仓库 blob LF / Windows 检出 CRLF）；`.gitignore` 忽略本地工作态（.sisyphus/.zcode/_diag/tmp-zcode-e2e/.opencode 生成物/node_modules）
- 版本号唯一真源 = `skill/SKILL.md` frontmatter；PROTOCOL/AGENTS 由 init 运行时注入；verify 的 `-Node` 用无斜杠短名
- 大任务两套范式二选一（询问制）：spec-superflow 或 分批约定；命令速查见 `skill/references/QUICKREF.md`
- **DSH 插件开发坑**（详见 archive/dsh-plan-popup.md）：pnpm file: 副本 inode 不同步、缺 `dsh.client` 声明则浏览器拿不到模块、Shadow DOM 穿透、DOM 自排除、新增 bundle 必须重启
