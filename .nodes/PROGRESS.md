# 节点进度矩阵 PROGRESS

> 每个节点一行，谁拥有谁更新（只 edit 自己的行）。新节点插在表头下方。

| # | 节点 | 验收标准 | 状态 | Owner 会话 | 更新时间 |
|---|------|----------|------|-----------|----------|
| 4 | 云端分发入口：remote-install 泛化多模块 | ①-Module 参数路由 node-architect/ssh-runner，默认行为向后兼容 ②-ZipPath 离线安装可用 ③本地 zip 模拟云端：两模块均能装入临时项目且产物完整 ④README 含 ssh-runner 云端安装命令 | 已完成 | opencode 主会话 | 2026-08-22 |
| 3 | mcp-ssh-runner v0.2 凭据隔离收紧 | ①凭据改平文件（ssh_host/user/password 等），一次 read 最多暴露一字段 ②resolved 临时文件在服务端启动后数秒内删除（时序验证）③opencode.json 附 permission deny 拦截 .secrets ④.secrets ACL 收紧仅当前用户 ⑤全量回归通过 | 已完成 | opencode 主会话 | 2026-08-22 |
| 2 | dsh-mcp skill（AI 纪律层） | 教 AI 排障/升级走 installer、禁读 .secrets | 待开始 | — | 2026-08-22 |
| 1 | mcp-ssh-runner 统一源封装 | ①修正版 runner 通过 stdio 握手测试 ②install.ps1 幂等生成 ≥4 客户端配置且不覆盖已有条目 ③凭据零进 argv/零进客户端配置 ④.secrets 模板初始化+gitignore 自动补齐 | 已完成 | opencode 主会话 | 2026-08-22 |

<!--
状态取值：待开始 / 进行中 / 待验收 / 已完成 / 已归档
节点完成时：状态改"已完成"，细节归档到 archive/<节点名>.md，之后可改"已归档"
-->

