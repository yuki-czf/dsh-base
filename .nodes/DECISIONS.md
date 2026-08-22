# 决策日志 DECISIONS

> 只追加，永不改写历史条目。多会话并发追加是安全的。最新的在最下面。

## [2026-08-22] {决策标题}

- **背景**：{为什么需要做这个决定}
- **决定**：{选了什么}
- **理由**：{为什么选它，权衡了什么替代方案}
- **影响**：{波及哪些模块 / 节点}

## [2026-08-22] mcp-ssh-runner：凭据经 --config-file 注入，弃 argv/env

- **背景**：跨客户端 SSH MCP 需要凭据隔离；初版方案密码拼 argv，实测本机旧 npx 进程正在明文泄露密码（Win32_Process 可读）。
- **决定**：runner 从 `.secrets/ssh-servers.json` 读凭据、合并 `policy.json` 策略，写临时 resolved 文件，以 `--config-file` 传给 @fangjunjie/ssh-mcp-server@1.9.0（精确锁版，vendor 进项目，弃 npx/shell）。
- **理由**：读源码确认密码无 env 通道，config-file 是唯一避开 argv 的路径；策略与凭据分文件使策略可进 git 审计。临时文件放 `.secrets/` 内（继承其 gitignore/权限），退出即删 + 孤儿 1h TTL。
- **影响**：mcps/ssh-runner/、install.ps1 四端配置生成、research/ssh-mcp-cross-client-proposal.md；节点 #2（skill 纪律层）、#3（连接池）后续。

## [2026-08-22] 统一源采用项目级安装（.agents/mcps/），非中央安装

- **背景**：用户场景为单项目多客户端同时打开，曾考虑中央安装（~/.dsh/mcps 一份多项目引用）。
- **决定**：installer 拷贝 runner 到 `<project>/.agents/mcps/ssh-runner/` 并在该目录 npm install；客户端配置全部显式带 `--project <绝对路径>`。
- **理由**：项目自包含、可随 git 分发；显式 --project 根治 Claude Desktop cwd 错位（P0-2），配置行为确定不依赖 cwd。代价是升级需逐项目重跑 installer。
- **影响**：install.ps1 安装模型、.gitignore 增加 `.agents/mcps/*/node_modules/`。

## [2026-08-22] v0.2：凭据平文件化（一字段一文件），弃 ssh-servers.json

- **背景**：用户评审指出 v0.1 的 ssh-servers.json 一次 read 即把 host+user+password 全套带进 AI 上下文，与凭据隔离目标矛盾；JSON 文件名还天然诱导 AI 打开排障。
- **决定**：凭据改 `.secrets/ssh_host|ssh_port|ssh_user|ssh_password|ssh_key_path` 平文件；同时砍除多服务器支持（用户实际单服务器，将来按 `servers/<name>/` 目录约定扩展）。resolved 临时文件改为 stderr 扫描 "connection established" 即删（10s 兜底 + 退出即删 + 孤儿 TTL）。
- **理由**：单文件误读暴露面切到单字段；上游源码确认 config 同步解析后纯内存驻留、Logger 全走 stderr，早删安全（实测 215ms 出现 → 1047ms 删除 → 之后 SSH 执行仍正常）。
- **影响**：runner loadConfig/installer 模板/README/research 文档；opencode.json 附 permission deny（read/grep/bash 挡 .secrets）；installer 加 icacls ACL 收紧（移除继承，仅当前用户 (OI)(CI)F）。

## [2026-08-22] 防护分层明确：OpenCode 客户端拦截 + 跨客户端通用层

- **背景**：AI 读 .secrets 的威胁需要分层防御；各客户端拦截能力不对齐。
- **决定**：四层——①平文件切小暴露面（通用）②OS 层 gitignore + ACL（通用）③OpenCode permission deny 规则（仅 OpenCode，schema 已核实支持 last-match-wins）④skill 纪律层（节点 #2，覆盖所有客户端的 AI 行为教育）。
- **理由**：Cursor/Zed/Claude 无内建等价拦截，不能假装有；通用层兜底 + 客户端层增强是诚实的边界。
- **影响**：install.ps1 opencode 分支；节点 #2 范围定义。

## [2026-08-22] 云端分发：remote-install.ps1 泛化为多模块路由器

- **背景**：ssh-runner 需要像 node-architect 一样从 GitHub 云端安装到任意新项目。
- **决定**：不另起安装器，把 remote-install.ps1 泛化：`-Module` 参数（ValidateSet 路由）+ `$moduleMap` 模块→安装器路径登记表 + `-ZipPath` 离线包参数；默认 `node-architect` 保持旧行为，`irm | iex` 一行式不变；ssh-runner 带参一行式用 `& ([scriptblock]::Create((irm url))) -Module ssh-runner`。
- **理由**：云端层只负责"送母版到目标机器"，落装逻辑各模块 install.ps1 自持（已验证幂等）；新增模块只需 moduleMap 加一行。ZipPath 同时解决内网分发与无法推送时的本地端到端测试。
- **影响**：remote-install.ps1（注意保持 UTF-8 BOM）；dsh-base README、mcps/ssh-runner README 安装说明；真实云端可用性依赖 git 推送（mcps/ 等尚未提交）。

