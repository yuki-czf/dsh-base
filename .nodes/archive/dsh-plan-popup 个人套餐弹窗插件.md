# 节点归档：dsh-plan-popup 个人套餐弹窗插件

- **周期**：2026-09-17 → 2026-09-17
- **验收结果**：
  - [x] 重启后侧边栏底部出现「个人套餐」入口（wide/rail 两态正常）——2026-09-17 实测通过
  - [x] 点击弹出干净浮层，正确显示 opencode-go 三窗口与 zai-coding-cn 两窗口的用量百分比 + 重置时间——实测通过
  - [x] 「刷新」按钮触发探测并更新数据与时间戳——代码核验通过
  - [x] 深色/浅色主题、中英文界面下显示正常——代码核验通过（全部走 --dsw-alias-* 变量与 locale 字典）
  - [x] 底部链接能打开设置的使用统计分区——代码核验通过（复用 shadow-piercing 导航 + 自排除）
  - [x] 原「使用统计」入口功能不受影响——实测通过
  - [x] 安装副本一致性：SHA256 源码 = 安装副本 ✅（FB8E97581911F73AE7E86370C3485C809A45B858C15F3B9560B64A03B9FE0DAA）
  - [x] 收尾优化：PlanOverlay 严格过滤未添加套餐渠道（仅保留真正含 windows 的渠道），空卡片已清除。
  - 经用户界面实测交互全量确认通过。
- **改动了什么**：
  - `~/.dsh/plugins/dsh-plan-popup/package.json`：插件清单（声明 exports、`dsh.client` 与 bundle patch）
  - `~/.dsh/plugins/dsh-plan-popup/cordis.patch.yml`：Cordis bundle patch，向 composition 注入 `dsh-plan-popup`
  - `~/.dsh/plugins/dsh-plan-popup/lib/index.js`：宿主端空实现（零冗余数据管道）
  - `~/.dsh/plugins/dsh-plan-popup/lib/client.js`：客户端界面核心（`sidebar.footer.action` 入口 + `shell.overlay` 弹窗浮层 + 各渠道套餐卡片/进度条/颜色分阶/重置时间/刷新/Shadow DOM 穿透设置跳转；严格过滤未配置 windows 的空卡片）
  - `~/.dsh/profiles/desktop/node_modules/dsh-plan-popup/`：插件同步副本（SHA256 一致）
  - `~/.dsh/profiles/desktop/package.json`：在 `dsh.profile.bundles` 与 `dependencies` 挂载 `dsh-plan-popup`
  - `.nodes/PROGRESS.md`：节点 9 状态更新与收口
  - `.nodes/SESSIONS/main.md`：会话状态跟进
  - `.nodes/CONTEXT.md`：快照收口
- **踩坑记录**：
  1. pnpm file: 依赖 inode 陷阱：改完 `~/.dsh/plugins/` 源文件后，必须同步 Copy 到 `profiles/desktop/node_modules/` 副本，以安装副本为运行真源。
  2. 新增 bundle 必须重启：`patchReload: live` 仅覆盖 patch 配置层，新增 package 级别 bundle 需宿主重新启动组装依赖图。
  3. client 声明：必须显式声明 `dsh.client: { platform: "web", immediately: true }`，宿主才能在启动时将 client 脚本暴露给前端 loader。
  4. strictdom 穿透：设置页跳转需穿透 Shadow DOM，且 DOM 查询需排除自身按钮以防递归误触。
  5. 渠道过滤器：`p.planSupported` 只是适配器静态声明，若用户未配置 key 导致 `windows` 为空时会渲染空卡片，改为 `p.plan && Array.isArray(p.plan.windows) && p.plan.windows.length > 0` 保证干净。
- **遗留**：无未决缺陷；原「使用统计」与新「个人套餐」双入口和谐共存。
- **给下个节点的衔接说明**：
  - 纯 UI 层直接消费 `GET /api/dsh-usage/overview` 与 `POST /api/dsh-usage/refresh`。
  - 既有遗留节点：节点 8 待验收、节点 7 并入 8 验收、节点 3 与节点 4 并行。
