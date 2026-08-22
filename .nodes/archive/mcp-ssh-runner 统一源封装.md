# 节点归档：mcp-ssh-runner 统一源封装

- **周期**：2026-08-22 — 2026-08-22
- **验收结果**（全部实测）：
  1. stdio 握手：initialize 返回 ssh-mcp-server@1.9.0 ✓
  2. 真实 SSH：execute-command 远端回显 + hostname ✓；shutdown 被黑名单拦截（COMMAND_VALIDATION_FAILED）✓
  3. 凭据零进 argv：Win32_Process 实查进程命令行仅 `--config-file <路径>` ✓（对照：旧 npx 进程明文泄露，已杀除）
  4. installer 幂等：重跑后 opencode.json/policy.json/.gitignore 哈希不变；.secrets 已存在不覆盖 ✓
- **改动了什么**：
  - `mcps/ssh-runner/`（新增）：bin/run-ssh-mcp.cjs 包装器、package.json（锁版 1.9.0 弃 npx）、policy.json、secrets-template、install.ps1、README
  - `.agents/mcps/ssh-runner/`（dogfood 安装产物）+ `opencode.json`（mcp.ssh 条目）+ `.secrets/ssh-servers.json`（真实凭据迁移）+ `.gitignore`（+.secrets/ 与 node_modules 规则）
  - `research/ssh-mcp-cross-client-proposal.md`：评审→修订→落地全记录
- **踩坑记录**：
  - PS 5.1 对无 BOM 的 UTF-8 .ps1 按 ANSI 解析，中文注释破坏语法 → install.ps1 必须 UTF-8 BOM
  - 上游密码无 env 通道（仅 SSH_MCP_PASSPHRASE），`--config-file` 是唯一避开 argv 的注入路径
  - Get-Process/Stop-Process 硬杀不触发任何清理 → resolved 临时文件需 TTL 孤儿清理兜底
- **遗留**：cursor/zed/claude 真机回归（配置生成逻辑同源已测 opencode）；多客户端并发 MaxSessions → 节点 #3 连接池候选；AI 读 .secrets 防护 → 节点 #2 skill 纪律层
- **给下个节点的衔接说明**：节点 #2（dsh-mcp skill）应教会 AI：升级/排障走 install.ps1、禁读 `.secrets/`、自查进程命令行泄露；节点 #3 如立项，守护进程建议本地 socket 复用，各客户端 runner 改为 socket 客户端
