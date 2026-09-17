# AGENTS
## 节点协议（node-architect v1.4.1）

本项目使用 `.nodes` 节点存档协议对抗上下文压缩（摘要；规则全文以 `.nodes/PROTOCOL.md` 为准）。任何 AI 客户端会话必须遵守：

- **开工必读档**：动手前先读 `.nodes/CONTEXT.md` 与 `.nodes/PROGRESS.md`，读后向用户复述"当前节点/下一步"再动手。
- **节点先行**：长于一次会话的工作，先在 `.nodes/PROGRESS.md` 登记节点（名称+验收标准），敲定设计要点再写代码。
- **存档时机**：节点完成 / 用户说"存档、这节点差不多了" / 大改动落地 / 会话收尾 → 按协议执行存档（PROGRESS → SESSIONS → DECISIONS → CONTEXT → archive），机械动作走 skill 的 `scripts/save.ps1`。
- **压缩即恢复**：感知到上下文被压缩或记忆断裂 → 立即重读 `.nodes/CONTEXT.md`、`PROGRESS.md` 恢复状态再继续。
- **并发纪律**：DECISIONS 只追加；PROGRESS 只改自己节点的行；CONTEXT 写入走 `save.ps1 save`（自动加锁，10 分钟超时）。

协议全文与模板见 `.nodes/PROTOCOL.md`。
