# 2026-10-21 MCP 凭据存档方法（ssh-runner v0.2：凭据零进 argv / 零进客户端配置 / 零进上下文）

> 面向：需要在本机或新机器复刻 SSH MCP 的 Agent / 工程师。
> 性质：方法说明 + 模板引用，**不含任何真实凭据**。仓库为公开仓库，`.secrets/` 内容严禁入库。

## 0. 一句话结论

云端只存档"代码 + 模板 + 策略"，凭据本体永远留在本机 `.secrets/`（一字段一文件 + ACL 限权 + gitignore）。
换机器/换 Agent 时重新执行安装器并手工填写凭据，**不做凭据的云端同步**。

## 1. 目录分工（谁进 git，谁不进）

| 路径 | 进 git | 内容 |
|---|---|---|
| `mcps/ssh-runner/` | 是 | 母版：`install.ps1`、`bin/run-ssh-mcp.cjs`、`policy.json`、`secrets-template/`、`tests/` |
| `.agents/mcps/ssh-runner/` | 是（有例外） | 安装副本：runner、模板、策略、`package.json`；`node_modules/` 被忽略 |
| `.secrets/` | **否** | 凭据本体：`ssh_host` / `ssh_port` / `ssh_user` / `ssh_password` 或 `ssh_key_path` / `README.txt` |
| `opencode.json`（项目根） | 是 | MCP 注册 + 权限 deny 规则，**无凭据** |
| `.cursor/mcp.json`、`.zed/settings.json`、`%APPDATA%\Claude\claude_desktop_config.json`、`~/.dsh/.agent-presets/<id>/agent.cordis.yml` | 视客户端 | 同上，只有启动命令 |

`.gitignore` 关键两条：

```
.secrets/
.agents/mcps/*/node_modules/
```

## 2. 凭据模型：一字段一平文件（v0.2）

| 文件 | 必填 | 内容 |
|---|---|---|
| `ssh_host` | 是 | 服务器 IP / 域名 |
| `ssh_port` | 否 | 端口，缺省 22 |
| `ssh_user` | 是 | 登录用户 |
| `ssh_password` | 二选一 | 密码认证 |
| `ssh_key_path` | 二选一 | 私钥文件绝对路径（**推荐**，可用后关掉服务器密码登录） |

- 纯文本、**结尾不留空行**，每文件一个字段
- 安装器从 `secrets-template/*.example` 复制为无后缀文件；**已存在不覆盖**
- 为什么不用单个 JSON：一次 `read` 就会把 host + user + password 全套带进模型上下文；
  平文件把单次误读的暴露面切到**最多一个字段**
- 模板文件本身不含真实值，可安全入库

## 3. 运行时数据流（每一层都不碰明文凭据）

```
客户端(stdio) → run-ssh-mcp.cjs
                 ├─ 读 <project>/.secrets/ 五个平文件（一字段一文件）
                 ├─ 合并 <runner>/policy.json（安全策略，可审计）
                 ├─ 写 .secrets/.resolved-<pid>-<8hex>.json（0600，临时）
                 └─ spawn node <server>/build/index.js --config-file <resolved>
```

临时文件的生命周期（四重清理，任一生效即删）：

1. 子进程 stderr 出现 `/connection established/i` → 立即删除（正常路径，秒级）
2. 10s 兜底定时器
3. 子进程 exit / 异常信号 → 删除后退出
4. 下次启动清理 `.secrets/.resolved-*.json` 中 mtime 超过 1 小时的孤儿文件

关键性质：**凭据从不进 argv、不进进程命令行、不进客户端配置文件**。
进程列表里只能看到 `--config-file <路径>`，看不到 host/user/password。

## 4. 安装（三种方式）

一行式（任意项目根，需 node/npm）：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1))) -Module ssh-runner
```

本地母版直装：

```powershell
powershell -ExecutionPolicy Bypass -File <dsh-base>\mcps\ssh-runner\install.ps1 -Project <项目根> -Clients opencode,cursor,zed,claude,dsh
```

离线 / 内网（指向仓库 zip）：

```powershell
powershell -ExecutionPolicy Bypass -File remote-install.ps1 -Module ssh-runner -ZipPath <repo.zip>
```

installer 依次做：

1. 复制 runner 到 `<project>/.agents/mcps/ssh-runner/`（bin/、package.json、lock、README、模板、policy）
2. `npm install --omit=dev`（精确锁版，非 npx）
3. 初始化 `.secrets/`：模板 → 无后缀文件，已存在不覆盖；提醒替换占位值
4. `icacls .secrets /inheritance:r /grant:r "<当前用户>:(OI)(CI)F"`（尽最大努力，失败告警）
5. `.gitignore` 幂等追加 `.secrets/`、`.agents/mcps/*/node_modules/`
6. 合并各客户端 MCP 配置（幂等；只替换 `ssh` 条目，**保留其他 server**）
7. OpenCode 额外注入权限 deny（见 §6）
8. DSH 客户端额外生成 agent preset（`~/.dsh/.agent-presets/<id>/agent.cordis.yml`，或项目内 `.dsh/agent-presets`）

远程安装器（`remote-install.ps1`）只做三件事：下载分支 zip（codeload）→ 解压定位模块安装器 → 透传参数执行；默认模块是 node-architect，ssh-runner 用 `-Module ssh-runner` 指定。

## 5. 客户端接入（配置里只有启动命令）

| 客户端 | 配置文件 | 形状 |
|---|---|---|
| OpenCode | `<project>/opencode.json` | `mcp.ssh = { type:"local", command:["node","<runner>","--project","<root>"], enabled:true }` |
| Cursor | `<project>/.cursor/mcp.json` | `mcpServers.ssh = { command:"node", args:[...] }` |
| Zed | `<project>/.zed/settings.json` | `context_servers.ssh.command = { path:"node", args:[...] }` |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers["ssh-<项目名小写>"] = { command:"node", args:[...] }` |
| DSH | `~/.dsh/.agent-presets/<id>/agent.cordis.yml` | agent preset 引用同一 runner |

`--project` 可省略；解析顺序为 `--project` 参数 → `DSH_SSH_PROJECT` 环境变量 → 当前工作目录。

## 6. 防泄漏四道闸

1. **git 层**：`.secrets/` 被 ignore，且历史中从未出现过（已核验）
2. **文件系统层**：`icacls` 去掉继承，仅当前用户 `(OI)(CI)F`
3. **客户端权限层**（installer 注入 OpenCode）：

```
permission.read  = { "*": "allow", "*.secrets*": "deny" }
permission.grep  = { "*": "allow", "*ssh_password*": "deny", "*ssh_key_path*": "deny" }
permission.bash  = { "*": "allow", "*.secrets*": "deny", "*ssh_password*": "deny", "*Win32_Process*": "deny" }
```

> OpenCode 权限是"后匹配覆盖先匹配"，所以 `"*": "allow"` 必须写在最前、deny 在后。

4. **Agent 纪律层**：见 §9。Cursor / Zed / Claude Desktop 没有等价的 deny 机制，这一层是它们的唯一软件约束。

## 7. 验证清单（装完必跑）

```powershell
# 1) stdio 握手（应返回含 serverInfo 的 JSON-RPC 响应）
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' | node .agents\mcps\ssh-runner\bin\run-ssh-mcp.cjs --project .

# 2) 凭据目录确实被忽略
git check-ignore -v .secrets/ssh_host

# 3) 历史中从未提交过凭据（应为空输出）
git log --all --oneline -- .secrets

# 4) ACL 只剩当前用户
icacls .secrets

# 5) 进程命令行不含凭据（只看得到 --config-file）
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*ssh-mcp*' } | Select-Object CommandLine
```

## 8. 迁移到新机器 / 新项目

1. 克隆仓库，或跑一行式安装器（`-Module ssh-runner`）
2. **推荐密钥认证**：`ssh-keygen` 生成密钥对；公钥追加到服务器 `~/.ssh/authorized_keys`；本地只留私钥，填 `ssh_key_path`
3. 逐个字段填写 `.secrets/` 下文件（每文件一个值、结尾不留空行）
4. 跑 §7 的 5 项验证
5. 需要多客户端时再执行 `install.ps1 -Clients opencode,cursor,zed,claude,dsh`
6. **凭据跨机传递走带外渠道**（密码管理器 / 手工输入），不要走聊天、issue、git、剪贴板日志

## 9. 给 Agent 的硬规则（禁止事项）

- 禁止 `cat` / `type` / `Get-Content` / `grep` / `Select-String` 读取 `.secrets/` 下任何文件
- 禁止 `git add -f .secrets`、`git commit -a` 后再"顺手"提交 `.secrets`
- 禁止把凭据写进 `opencode.json`、环境变量、命令行参数、脚本常量
- 禁止在回复/日志/报告里复述凭据值；需要描述时只写字段名
- 禁止为了"方便"把平文件合并成单个 JSON
- 升级 server 版本时必须改 `package.json` 锁版并重跑 installer，不要 `npx` 现拉

## 10. 已知边界

- v0.2 为**单服务器**设计（`connectionName` 恒为 `default`）；多服务器扩展约定 `.secrets/servers/<name>/`
- 每个客户端各开独立 SSH 连接，注意远端 `MaxSessions`（默认 10）与并发写冲突
- Cursor / Zed / Claude Desktop 无内建 deny，防护依赖平文件切面 + ACL + gitignore + Agent 纪律
- `.resolved-*.json` 是唯一可能短时落盘的合并配置；正常秒级删除，异常退出靠 10s 兜底 + 退出删除 + 1h 孤儿清理
- 启动日志只打印 `host:port as user（key|password）`，不打印任何凭据值
- `policy.json` 只接受四个键：`blacklist` / `whitelist` / `allowedRemotePaths` / `allowedLocalPaths`，未知键直接拒绝启动
- 这不是加密存档，而是"凭据不出本机"的隔离式存档；磁盘被完整读取时 ACL 不构成保护

## 11. 本次核验记录（2026-10-21，不含敏感值）

- `git ls-files .agents/mcps` → 11 个文件，仅代码/模板/策略，无凭据
- `git ls-files .secrets` 与 `git log --all -- .secrets` → 均为空
- `git check-ignore -v .secrets/x` → 命中 `.gitignore:30`
- `icacls .secrets` → 仅当前用户 `(OI)(CI)F`
- 项目 `opencode.json` 的 `mcp.ssh` → 仅 `node <runner> --project <root>`，无 env、无参数凭据
- 权限规则 → `read/grep/bash` 三组 deny 已生效
