# 跨客户端 SSH MCP 集成与凭据隔离：评审、修订与落地记录

> 状态：已落地（2026-08-22，节点 #1 v0.1 + 节点 #3 v0.2 凭据平文件化）。实现位于 `mcps/ssh-runner/`，dogfood 安装于本仓库 `.agents/mcps/ssh-runner/`。

## ⚠️ v0.2 修订（2026-08-22，用户评审发现）：JSON 凭据文件的上下文暴露面

v0.1 把全套凭据放 `.secrets/ssh-servers.json`——AI 排障时一次 `read` 即把 host+user+password 全套带进上下文，且 JSON 文件名天然诱导 AI 打开。这与节点"凭据隔离"目标自相矛盾，属设计疏漏。v0.2 变更：

1. **凭据平文件化**：`.secrets/ssh_host|ssh_port|ssh_user|ssh_password|ssh_key_path` 一字段一文件，单次误读暴露面切到单字段；多服务器支持砍除（单服务器场景，将来按 `servers/<name>/` 目录约定扩展）
2. **resolved 临时文件窗口收窄**：上游源码确认 config 在 `run()` 首行同步解析后纯内存驻留 → runner 把子进程 stderr 改 pipe，扫描到 "connection established"（Logger 全走 stderr，已核实）即删除 resolved 文件；10s 兜底定时器 + 退出即删 + 孤儿 TTL 三重保险。含密文件在盘窗口从"整个会话"缩到"启动后数秒"
3. **OpenCode permission deny**：installer 在 opencode.json 附加 `read/grep/bash` 对 `.secrets`/`ssh_password`/`Win32_Process` 的 deny 规则（官方 schema 支持 last-match-wins 通配符，已对照文档核实）。Cursor/Zed/Claude 无等价物，防护依赖平文件 + ACL + 节点 #2 skill 纪律层
4. **ACL 加固**：installer 对 `.secrets` 执行 `icacls /inheritance:r /grant:r 当前用户:(OI)(CI)F`

---

## 一、原始方案评审结论

原始提案（Runner 桥接模式）方向正确，但初版脚本存在硬伤：

| 级别 | 问题 | 后果 |
|---|---|---|
| **P0-1** | 密码经 `--password` 拼 argv | Windows `Get-CimInstance Win32_Process` / Linux `ps aux` 直接读出明文。**本机验证时实测发现旧 npx 进程正在泄露明文密码（PID 30812/24300，opencode 拉起的遗留进程），已杀除并迁移凭据** |
| **P0-2** | `process.cwd()` 定位 `.secrets/` | Claude Desktop 以绝对路径启动 MCP，cwd 是其安装目录，凭据永远找不到 |
| P1-1 | `npx -y` + `shell: true` | 每次拉最新版（供应链投毒/版本漂移）；密码含 shell 元字符被解析甚至注入 |
| P1-2 | 无信号转发 / 无 error 监听 | 客户端杀 runner 后子进程孤儿化，SSH 连接悬挂 |
| P1-3 | 黑名单正则可绕过 | `rm  -rf /`（多空格）、`cd / && rm -rf *`、`find / -delete` 均可穿透；`^:().*` 是空分组语义错误 |

## 二、上游接口调研事实（@fangjunjie/ssh-mcp-server@1.9.0）

读源码（command-line-parser.js / mcp-server.js）确认：

1. **`--config-file <path>` 原生支持**：JSON 对象格式 `{"default": {host, port, username, password}}`，多服务器即多 key，工具用 `connectionName` 选择
2. **密码无环境变量通道**（仅 `SSH_MCP_PASSPHRASE` 支持私钥口令）→ config-file 是唯一让凭据避开 argv 的路径
3. config JSON 条目内原生支持 `commandWhitelist` / `commandBlacklist` / `allowedRemotePaths` / `allowedLocalPaths`，官方强烈建议同时配置 whitelist 与 allowedRemotePaths
4. 服务端自带 SIGINT/SIGTERM/stdin-close 优雅关闭；入口 `build/index.js`（ESM）
5. 工具集：`execute-command`、`upload`、`download`、`list-servers`

## 三、最终架构

```
客户端 (opencode.json / .cursor/mcp.json / .zed/settings.json / claude_desktop_config.json)
   │  仅包含: node <runner.cjs> --project <项目根>     ← 零凭据
   ▼
run-ssh-mcp.cjs（唯一真源分发到 .agents/mcps/ssh-runner/）
   ├─ 读 <project>/.secrets/ssh-servers.json    凭据（gitignore，按项目隔离）
   ├─ 合并 policy.json                          安全策略（进 git，可审计可 diff）
   ├─ 写 .secrets/.resolved-<pid>-<rand>.json   临时文件（退出即删；孤儿 1h TTL 清理）
   └─ spawn process.execPath <server>/build/index.js --config-file <resolved>
       无 shell、无 npx、版本精确锁定；信号转发 + 退出码透传；日志仅 stderr 且不打印配置
```

关键修订对应：P0-1 → config-file 注入；P0-2 → `--project` 显式传参（installer 生成配置时写入绝对路径）；P1-1 → 依赖 vendor 进项目 + 精确锁版；P1-2 → 全信号监听转发；P1-3 → 正则用 `\s+`/`[^;|&>]*` 修正 + 文档明示黑名单是 best-effort。

## 四、验证记录（全部实测通过）

| 验收项 | 结果 |
|---|---|
| stdio 握手 | initialize 返回 `serverInfo: ssh-mcp-server@1.9.0` ✓ |
| 工具注册 | tools/list 返回 execute-command / upload / download / list-servers ✓ |
| 真实 SSH 执行 | 远端回显 `hello-from-remote` + 主机名 ✓ |
| 黑名单拦截 | `shutdown -h now` → `COMMAND_VALIDATION_FAILED` ✓ |
| **凭据零进 argv** | Win32_Process 实查子进程命令行：仅 `--config-file <路径>` ✓（对照：旧 npx 进程明文泄露，已处置） |
| 临时文件生命周期 | 优雅退出即删；硬杀残留由 TTL 清理兜底 ✓ |
| installer 幂等 | 重跑后 opencode.json / policy.json / .gitignore 哈希不变；.secrets 已存在不覆盖 ✓ |
| 跨客户端配置生成 | opencode 实测；cursor / zed / claude 逻辑同源（JSON 安全合并），未接真客户端验证 |

## 五、原评审问题的落地回答

**Q1 stdio 透传稳定性**：`spawn(process.execPath, [cli], { stdio: 'inherit' })`（无 shell）在 Windows 实测信号与管道正常；服务端自身监听 stdin-close 优雅退出。残余风险：任务管理器硬杀（TerminateProcess）不触发任何清理 → runner 临时文件残留，TTL 机制兜底。

**Q2 多客户端并发**：确实会撞。每客户端独立拉起 runner + SSH 连接，OpenSSH 默认 `MaxSessions 10` / `MaxStartups 10:30:100`。当前缓解：懒连接（首次调用才建连）、`list-servers` 多连接分名。后续方向：本地单守护进程持有连接池，各客户端经本地 socket 复用（节点 #3 候选）。

**Q3 拦截盲区**：分层防御——runner 层黑名单 + `allowedRemotePaths`（SFTP 面）；`.secrets/` 依赖 OS 文件权限（Linux 0600，Windows 建议目录 ACL）；客户端层 OpenCode 可加 permission deny 规则（Cursor/Zed/Claude 无等价物，靠 runner 层兜底）。AI 读 `.secrets` 的防护属节点 #2（skill 纪律层）范围。

**Q4 通用发布**：已实现 installer 覆盖：幂等配置合并、.secrets 模板初始化、.gitignore 自动补齐、版本锁定升级路径（改 package.json 重跑 installer）。边缘待补：PS1 脚本需 UTF-8 BOM（PS 5.1 ANSI 解析坑，已修）；`.opencode`/`.cursor` 配置文件的 JSON 合并已防呆（非法 JSON 拒写不破坏）。

## 六、遗留与后续

- [ ] 节点 #2：`dsh-mcp` skill——AI 纪律层（禁读 `.secrets`、升级/排障走 installer）
- [ ] 节点 #3（候选）：SSH 连接池守护进程，解决多客户端并发
- [ ] cursor / zed / claude 三端接真实客户端回归
- [ ] 黑名单本质 best-effort：高价值服务器应启用 `whitelist` + 收紧 `allowedRemotePaths`（policy.json 注释已声明）

## 七、使用速查

```powershell
# 安装到任意项目（来自 dsh-base 母版）
powershell -ExecutionPolicy Bypass -File <dsh-base>\mcps\ssh-runner\install.ps1 [-Clients opencode,cursor,zed,claude]

# 手工握手验证
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' | node .agents\mcps\ssh-runner\bin\run-ssh-mcp.cjs --project .
```
