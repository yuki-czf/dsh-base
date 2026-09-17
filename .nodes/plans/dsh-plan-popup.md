# 计划：dsh-plan-popup 个人套餐弹窗插件

> 状态：待开工 · 登记 2026-09-17 · 前置工作 dsh-usage-sidebar（已交付并实测通过）已完成
> 目标：独立 DSH 插件，侧边栏入口一键弹出「个人套餐」干净的浮层（各渠道 coding-plan 额度窗口），不经过设置页。

## 调研结论（2026-09-17，已实证）

1. **数据源零成本**：`@linxin666/dsh-usage` 宿主端已自带 HTTP 接口，浏览器同源 fetch 即可（其设置页自身就是这么取数的，无特殊鉴权头）：
   - `GET /api/dsh-usage/overview` → `{ updatedAt, providers[], current, usage }`；每个 provider 含 `displayName`、`plan.windows[{key, percent, resetsAt}]`、`balance`、`planSupported`、`supported`、`error`、`updatedAt`
   - `POST /api/dsh-usage/refresh` → 手动触发一轮探测并返回新数据
   - 实测样本：opencode-go（5h/每周/每月三窗口）、zai-coding-cn（unit-5/5h）；快照落盘 `~/.dsh/dsh-usage/provider-snapshots.json`
2. **弹层模式**：`shell.overlay` slot 注册弹层（范例：dsh-context overview、dsh-quota panel）。背板遮罩 + 居中卡片，模块内 store 开关。
3. **入口**：`sidebar.footer.action` 注册按钮（dsh-usage-sidebar 已趟平）。
4. **结论**：新插件是纯 UI 层，宿主半边保持空实现，零数据逻辑重复，dsh-usage 升级不受影响。

## 实施方案

新插件 `~/.dsh/plugins/dsh-plan-popup/`，四件套同 dsh-usage-sidebar：

- `package.json`：含 `dsh.client: { platform: "web", inject: [], immediately: true }`（缺这个宿主不会把 client 暴露给浏览器——上个大坑）
- `cordis.patch.yml`：`- insert: [- id: plan-popup, name: 'dsh-plan-popup']`
- `lib/index.js`：空宿主半边
- `lib/client.js`：
  - `sidebar.footer.action` 注册「个人套餐」按钮（独立仪表/徽章图标，wide/rail 两态）
  - 点击 → 开 `shell.overlay` 弹窗：
    - 顶部：标题「个人套餐」+ 刷新按钮（POST refresh 后重拉 overview）+ 更新时间
    - 主体：每个 `planSupported` 的 provider 一张卡片：渠道名（当前渠道带「当前」徽章）、每窗口一条进度条（key 映射中文：5h→5 小时、week→每周、month→每月、unit-* 原样；<60% 绿 / 60–85% 黄 / >85% 红）+ 百分比 + 重置时间（本地化）
    - 探测失败渠道显示错误态；无套餐渠道不渲染
    - 底部小链接「打开完整使用统计」→ 复用 dsh-usage-sidebar 的设置页导航
  - 数据策略：打开时拉 overview + 刷新按钮走 refresh；5 分钟 TTL 缓存；fetch 超时 AbortSignal
  - 样式：自配 CSS，跟随 `--dsw-alias-*` 主题变量，深浅色自适应

## 已知坑清单（前置工作实测踩过，务必遵守）

1. **pnpm file: 依赖 inode 陷阱**：改完 `~/.dsh/plugins/<插件>/` 源文件后，`profiles/desktop/node_modules/<插件>/` 副本不会自动更新 → 改完必须重跑 pnpm install 或手动双向 Copy-Item，并以安装副本内容为准验证
2. `dsh.client` 声明缺失 = 宿主加载但浏览器永远拿不到模块（表现为毫无报错）
3. 前端是 Shadow DOM（strictdom）：任何 DOM 查询必须递归穿透 shadowRoot
4. 查找「使用统计/设置」等文本元素时排除自身按钮（aria-label 会自匹配）
5. settings 面板常驻 DOM 但隐藏：判断可见性用 `offsetParent !== null`，不能只看存在性
6. 新增 bundle 必须重启（`patchReload: live` 只覆盖 patch 层热重载）

## 验收标准

- [x] 重启后侧边栏底部出现「个人套餐」入口（wide/rail 两态正常）——2026-09-17 实测通过
- [x] 点击弹出干净浮层，正确显示 opencode-go 三窗口与 zai-coding-cn 两窗口的用量百分比 + 重置时间——实测通过
- [x] 「刷新」按钮触发探测并更新数据与时间戳——代码核验通过
- [x] 深色/浅色主题、中英文界面下显示正常——代码核验通过（全部走 --dsw-alias-* 变量与 locale 字典）
- [x] 底部链接能打开设置的使用统计分区——代码核验通过（复用 shadow-piercing 导航 + 自排除）
- [x] 原「使用统计」入口功能不受影响——实测通过
- 安装副本一致性：SHA256 源码 = 安装副本 ✅

**验收结论（2026-09-17）：通过**。超时横幅说明：卡片顶部橙色横幅 = dsh-usage 宿主端最近一轮对该渠道的探测超时（快照 `error` 字段），窗口数据是上次成功探测的缓存，点「刷新」重试成功后自动消失，非插件缺陷。

## 收尾计划（已执行 2026-09-17）

- [x] **改动 1：过滤未添加的套餐渠道**（已落地，源码与 node_modules 副本 SHA256 双向一致：FB8E97581911F73AE7E86370C3485C809A45B858C15F3B9560B64A03B9FE0DAA）
- [x] **改动 2：重启/重载生效**（client.js 过滤逻辑更新为 `p.plan && Array.isArray(p.plan.windows) && p.plan.windows.length > 0`）
- [x] **改动 3：节点归档收口**（`archive/dsh-plan-popup 个人套餐弹窗插件.md` 已落盘，`save.ps1 verify -Completed` 全 [OK] 通过）

## 衔接

- 前置：dsh-usage-sidebar v0.1.0（已交付：入口 + 设置页导航；本次复用其文件骨架与经验）
- 完成后归档到 `archive/dsh-plan-popup.md`

