# 节点归档：云端分发入口：remote-install 泛化多模块

- **周期**：2026-08-22 — 2026-08-22
- **验收结果**：
  1. `-Module` 路由：ValidateSet(node-architect/ssh-runner) + moduleMap；默认 node-architect，`irm | iex` 旧一行式行为不变 ✓
  2. `-ZipPath` 离线安装可用 ✓
  3. 本地 zip 模拟云端（staging 结构 dsh-base-main/，排除 .secrets/node_modules）：ssh-runner 装入全新临时项目（runner vendor + .secrets 平文件 + gitignore + opencode.json 含 permission deny，绝对路径正确）；node-architect 装入另一临时项目（真源+镜像+.nodes 初始化均正常）✓
  4. 两处 README 更新云端安装命令 ✓
- **改动了什么**：`remote-install.ps1` 重写为模块路由器（保持 UTF-8 BOM，语法解析通过）；根 README 云端安装分节；`mcps/ssh-runner/README.md` 安装方式三分支
- **踩坑记录**：无新坑（复用既有 BOM 教训）；测试 zip 构造时注意排除 `.secrets/`（不能让凭据进任何分发包）
- **遗留**：真实云端可用需 git add/commit/push（mcps/、research/、opencode.json 等尚未提交，云端拉 main 分支还不含 ssh-runner）；带参一行式依赖 scriptblock 调用（PS 5.1 验证可行）
- **给下个节点的衔接说明**：新模块云端化 = install.ps1 自持幂等落装 + moduleMap 登记一行 + README 补命令；推送前跑一次真实 `irm` 冒烟（网络路径与本地 zip 路径的差异仅在下载体）
