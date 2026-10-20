# facts — 节点 #32 接力批并行提速与防幻觉加固

## 批 1（T1 已完成 ∥ T2 ∥ T3 ∥ T4）

- **开工基线**：`baseline.txt`（git status 快照，含 .nodes/PROGRESS.md、SESSIONS/main.md、talk-human、relay 目录等既有项）。
- **T1（scout，已完成）**：DSH 实际加载位＝`E:\.dsh\skills\node-run.md`；仓内母版 `.dsh\skills\node-run.md`；两处仅 provider 行不同（活体 cpa / 仓内 vps-direct 陈旧）。关键新事实：本会话 skill 目录同时出现 `dsh-run`（项目 .dsh）与 `node-run`（E:\.dsh 用户位）→ 改名后两处都要有 dsh-run 且 E:\.dsh 不得有 node-run 残留。
- **T2（fixer）**：`.dsh/skills/node-run.md` → `dsh-run.md`（git mv，name/description/头注/provider cpa/批级循环/失败处置/提问前置/停止条件第6条/模型分档）；引用更正 `install-stack.md:28,87,92`、`dsh-desktop-adaptation.md:15,25,102,137`、`discrepancies.md:28,30,45`、`AGENTS.md:2`、`pi-tempo/README.md:54,55`。自证 10/10，subagent 计数 6（未减）。
- **T3（fixer）**：BATCH-PLAN 三关键句（批列=主键/必须同号/每棒一批）各 1 命中、批1双棒同号示例两行；1.13.3→1.13.4 八位清零；`.nodes/PROTOCOL.md` 与 master 归一化一致；`.agents` 镜像哈希一致。
- **T4（fixer）**：pi-tempo SKILL.md v1.0.11；§10 批级循环逐字句＋:219 双指＋:236 抽检＋:250 锚定；净增 0 行，hunk 仅 frontmatter/§10。
- **越界检查**：`git status --porcelain` 对比 baseline → 改动仅 T2/T3/T4 授权集＋调度器登记文件，零越界。
- **环境事实**：期间文件策略由 workspace-write 切为 danger-full-access（写入工作区外不再受阻）；批 1 期间 E:\.dsh 不可写，故 fixer 只改工作区，实际加载位部署由调度器补做（T6 断言 1 需要该位在位）。
- **调度器部署（T2 收口后）**：`Copy-Item .dsh\skills\dsh-run.md E:\.dsh\skills\dsh-run.md` + 删除 `E:\.dsh\skills\node-run.md`；哈希一致（HASH_MATCH=True），该目录现仅 dsh-run.md。部署动作记此，T7 复核幂等。

## 批 2 · T5（lab 底稿同步）

- lab 底稿 `pi-tempo\templates\node-run.lab.md`、reddit 方言 `pi-tempo\templates\node-run.reddit-trend-tc.md`：L6 升 v1.0.11；2.5 接力分支改批级循环（同一消息并发 Task→TaskWait 整批→facts→越界→下一批）；补批内失败处置/棒停批不停/推荐分支直行/锚点抽检/文件路径:行号。
- 两部署副本 `E:\www\pi-tempo-lab\.pi\prompts\node-run.md`、`E:\www\reddit\reddit-trend-tc\.pi\prompts\node-run.md` 整文件覆盖，两对 SHA256 逐字节一致。
- 校验：四份 `pi-tempo v1.0.11` 各 ≥1；lab/reddit 内 `subagent|workflow|dsh-run` 0 命中。
- 越界检查：待下一轮 git status 对照（授权集 A/B/E）。

## 批 2 · T6（sync 断言）

- `sync-skills.ps1` 新增 3.4 节四条断言（ASCII-only，中文串用 UTF-8 字节还原）：母版关键句／实际加载位关键句／`E:\.dsh\skills` 无 node-run 残留／BATCH-PLAN 含「批列=主键」「必须同号」。
- 三跑：全量 sync exit 0（21 checks, 0 fail）→ -CheckOnly exit 0 → 篡改部署位关键句 -CheckOnly exit 1（指名路径）→ try/finally 恢复 → exit 0；母版与部署位 SHA256 一致。
- 不确定项②闭环：全量 sync 后全局 pi-tempo SKILL.md 已带 `version: 1.0.11`，-CheckOnly 的 version 项转绿。
- 副作用：sync 同时更新了仓内 `.agents/skills/node-architect/` 5 文件（预期分发），未清理未提交。
