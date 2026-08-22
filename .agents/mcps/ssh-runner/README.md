# dsh ssh-mcp-runner

跨客户端（OpenCode / Cursor / Zed / Claude Desktop / DSH）通用的 SSH MCP 启动包装器。
所有客户端只看到 `node run-ssh-mcp.cjs --project <项目根>`，**凭据零进 argv、零进客户端配置、零进上下文**。

## 架构

```
客户端 (stdio) → run-ssh-mcp.cjs
                    ├─ 读 <project>/.secrets/ssh_host|ssh_port|ssh_user|ssh_password|ssh_key_path
                    │      （一字段一文件；AI 误读单文件最多暴露一个字段）
                    ├─ 合并 <runner>/policy.json                （安全策略，进 git 可审计）
                    ├─ 写 .secrets/.resolved-<pid>-<rand>.json   （临时；服务端启动完成即删，
                    │                                            10s 兜底定时器 + 退出即删 + 孤儿 1h TTL）
                    └─ spawn node <server>/build/index.js --config-file <resolved>
```

## 凭据文件 `.secrets/`（平文件，v0.2）

| 文件 | 必填 | 内容 |
|---|---|---|
| `ssh_host` | ✓ | 服务器 IP / 域名 |
| `ssh_port` | 可选 | 端口，默认 22 |
| `ssh_user` | ✓ | 登录用户 |
| `ssh_password` | 二选一 | 密码认证 |
| `ssh_key_path` | 二选一 | 私钥文件绝对路径（**推荐**，密钥认证后可关服务器密码登录） |

- 每文件一个字段、纯文本、结尾不留空行；install.ps1 自动初始化模板并收紧 ACL（仅当前用户）
- **为什么不用 JSON**：单 JSON 一次 read 即把 host+user+password 全套带进 AI 上下文；平文件把暴露面切到单字段
- 安全策略 `policy.json`（进 git）：`blacklist` / `whitelist` / `allowedRemotePaths` / `allowedLocalPaths`

## 安装到项目

方式一：云端一行式（任意项目根目录，需 node/npm）：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1))) -Module ssh-runner
```

方式二：本地母版直装：

```powershell
powershell -ExecutionPolicy Bypass -File <dsh-base>\mcps\ssh-runner\install.ps1
# 可选: -Clients opencode,cursor,zed,claude   -Force
```

方式三：离线/内网：`remote-install.ps1 -Module ssh-runner -ZipPath <仓库zip>`

installer 做的事：拷贝 runner 到 `<project>/.agents/mcps/ssh-runner/` → `npm install --omit=dev`（版本锁定，不用 npx）→ 初始化 `.secrets/` 平文件模板（已存在不覆盖）→ `icacls` 收紧 ACL 仅当前用户 → 补 `.gitignore` → 幂等合并各客户端 MCP 配置（保留已有其他 server 条目；OpenCode 附带 `.secrets` 读取/grep/bash deny 规则）。

## 手工验证（stdio 握手）

```powershell
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' | node .agents\mcps\ssh-runner\bin\run-ssh-mcp.cjs --project .
```

正常应返回含 `serverInfo` 的 JSON-RPC 响应。任务管理器/`Get-CimInstance Win32_Process` 检查子进程命令行：只有 `--config-file <路径>`，无密码。

## 提供的 MCP 工具（来自 @fangjunjie/ssh-mcp-server）

- `execute-command`：远端执行命令（单服务器，无需 connectionName）
- `upload` / `download`：SFTP 传输（受 `allowedRemotePaths` 约束）
- `list-servers`：列出配置的连接（v0.2 单服务器恒为 `default`）

## 已知边界

- 多客户端同时开 → 每客户端独立 SSH 连接，注意远端 `MaxSessions`（默认 10）与并发写冲突
- v0.2 为单服务器设计；将来需要多服务器时按 `.secrets/servers/<name>/` 目录约定扩展
- OpenCode 的 permission deny 可拦截 AI 读 `.secrets`；Cursor/Zed/Claude 无内建等价物，防护依赖：平文件切小暴露面 + ACL + gitignore + skill 纪律层（节点 #2）
- 依赖精确锁版 `@fangjunjie/ssh-mcp-server@1.9.0`，升级 = 改 package.json + 重跑 installer
