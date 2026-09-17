# 项目快照 CONTEXT

> 本文件是项目的一页纸快照，任何会话开工前必读。永远保持一屏以内，细节放 archive/。
> 最后更新：2026-09-17（由 node-architect 存档流程维护）

## 项目一句话

node-architect：把"设计先行 + 节点存档 + 读档恢复"的长项目协议做成集中式多客户端安装包；本仓库是它的母版与试验场（GitHub: yuki-czf/dsh-base）。

## 当前节点

- **节点**：节点 10（v1.4.0 skill 优化与母版同步）**已完成**（归档详见 `archive/v1.4.0 skill 优化与母版同步.md`）
- **协议现状**：v1.4.1。8 项优化已交付（SKILL 分层、真源注入、`save` 一键存档、目录锁、`trim-decisions`、已废弃状态、`save.mjs`、批次归并）；云端线（GitHub 侧）已并档：6 条决策按日期合入、节点重编号 #11-#14
- **下一步**：
  1. DSH 插件侧遗留：节点 8 待验收；节点 7 并入 8 验收
  2. 并行遗留：节点 3（L2 桥接）进行中、节点 4（zip 新机实测，用户侧）
  3. **云端线遗留（GitHub 侧并行开发）**：#12 dsh-mcp skill（AI 纪律层）**待开始**；#11/#13/#14（ssh-runner、remote-install 路由）已完成
  4. 新能力待实战：`save` / `trim-decisions` / `save.mjs` 尚未在批次流程实跑

## 活跃会话

| 会话 | 负责 | 更新时间 |
|---|---|---|
| main | v1.4.1 收口 + 云端线并档回 GitHub | 2026-09-17 |
| opencode-main | 云端线 ssh-runner / remote-install（历史，GitHub 侧） | 2026-08-22 |
| v8-b2 | 节点 8 批2 收口（历史） | 2026-08-28 |

## 关键路径提醒

- **仓库结构**：本工作区 ↔ GitHub yuki-czf/dsh-base 双向同步；远程独有件（remote-install.ps1 / mcps\ / research\ / opencode.json / dist\安装包）勿在本地误删
- **维护正向流程**：只改母版 `node-architect\skill\` → 重跑 `install.ps1` → 打包 `pack.ps1` 后同步 dist 到仓库根 `dist\`；README 引用 dist 包名
- **别项目更新话术**：任意项目说「更新节点协议」→ 全局引导跑母版 install.ps1（幂等，档案保留）；改触发词后重跑 `-Bootstrap`（写 C 盘需提权）
- 母版 .ps1 必须 BOM+CRLF；PS 单引号串内禁 `<>`；remote-install.ps1 必须**纯 ASCII 无 BOM**（irm|iex 管道解析）
- 版本号唯一真源 = `skill/SKILL.md` frontmatter；verify 的 `-Node` 用无斜杠短名
- 大任务两套范式二选一（询问制）：spec-superflow 或 分批约定；命令速查见 `skill/references/QUICKREF.md`
- **DSH 插件开发坑**（详见 archive/dsh-plan-popup.md）：pnpm file: 副本 inode 不同步、缺 `dsh.client` 声明则浏览器拿不到模块、Shadow DOM 穿透、DOM 自排除、新增 bundle 必须重启
