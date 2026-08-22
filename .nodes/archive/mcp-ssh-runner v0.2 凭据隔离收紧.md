# 节点归档：mcp-ssh-runner v0.2 凭据隔离收紧

- **周期**：2026-08-22 — 2026-08-22
- **验收结果**（全部实测）：
  1. 平文件凭据：`.secrets/` 终态为 ssh_host/ssh_port/ssh_user/ssh_password/README.txt，单次误读最多暴露一字段 ✓
  2. resolved 早删时序：215ms 出现 → 1047ms 删除（stderr 扫描 "connection established"），删除后真实 SSH 执行正常（config 纯内存驻留）✓
  3. opencode.json permission deny：read/grep/bash 对 `.secrets*`/`*ssh_password*`/`*Win32_Process*` 拒绝，last-match 顺序正确 ✓
  4. ACL：icacls 显示 `.secrets` 仅 `LAPTOP-JDKORDGD\zifeng:(OI)(CI)(F)`，继承已移除 ✓
  5. 全量回归：握手 / 真实 SSH（v02-ok + hostname）/ 黑名单（reboot 拦截 COMMAND_VALIDATION_FAILED）/ 进程命令行零凭据（仅 --project 与 --config-file 路径）/ installer 幂等（重跑哈希不变）✓
- **改动了什么**：
  - `mcps/ssh-runner/bin/run-ssh-mcp.cjs`：loadConfig 平文件化、单服务器 default、stderr pipe 扫描早删 + 10s 兜底
  - `mcps/ssh-runner/secrets-template/`：平文件 .example 模板 + README.txt 填写说明（删 ssh-servers.example.json）
  - `mcps/ssh-runner/install.ps1`：平文件初始化、icacls ACL、opencode.json permission deny 合并
  - dogfood：`.secrets/ssh-servers.json` 拆解删除、重跑 installer、`.agents/mcps/ssh-runner` 同步（哈希一致）
  - README.md / research/ssh-mcp-cross-client-proposal.md：v0.2 威胁模型修订记录
- **踩坑记录**：
  - JSON 凭据文件是"诱导性暴露"：文件名像配置文件，AI 排障天然想打开——设计时要以"AI 会读它"为威胁前提
  - stderr 必须改 pipe（不能 inherit）才能扫描；确认过上游 Logger 全走 stderr 不污染 stdout 协议
- **遗留**：cursor/zed/claude 真机回归；节点 #2 skill 纪律层（覆盖无内建拦截的客户端）；多服务器需求出现时按 `.secrets/servers/<name>/` 扩展
- **给下个节点的衔接说明**：节点 #2（dsh-mcp skill）核心纪律：禁读 `.secrets/` 任何文件、禁 grep 凭据字段、排障/升级一律走 install.ps1、自查进程命令行泄露（Win32_Process 在 OpenCode 已 deny，需提示用户手工查）
