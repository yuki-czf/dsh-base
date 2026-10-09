---
description: 登记计划节点：扫描空闲节点号并原子登记（冲突即停、零写入）
argument-hint: <计划短名> [一句验收标准]
---

# /plan-node — 登记计划节点

把一份计划登记为新的计划节点。等价于自然语言指令「你使用存档skill，扫描空闲节点，并将计划存档为一个计划节点」。

计划名称与要点：$ARGUMENTS

## 执行流程

**第 0 步（自愈守卫，依赖检查）**：若 `.agents/skills/node-architect/` 或 `.nodes/` 不存在，说明当前项目未安装节点协议——先运行 `.agents/skills/node-architect/scripts/init-nodes.ps1`（脚本不存在则提示用户说「装节点协议」引导安装），装好后回到第 1 步。本命令依赖存档 skill（node-architect），两者随同一安装包同版本分发，不单独存在。

1. **读档**：读 `.nodes/CONTEXT.md` 与 `.nodes/PROGRESS.md`，确认当前节点状态（只读，不修改）。
2. **原子取号**：从 `$ARGUMENTS` 提取「计划短名」（无空格、无斜杠，如 `dsh-plan-popup`）与可选的「一句验收标准」，运行：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/node-architect/scripts/save.ps1 next-node -Node <计划短名> [-Accept <一句验收标准>] -Session <会话标识>
   ```

   无 PowerShell 环境用等价的 `node .agents/skills/node-architect/scripts/save.mjs next-node ...`。
3. **冲突校验（任何失败分支立即停止，除脚本已完成的登记行外不写任何档案）**：
   - **同名节点已存在**（exit 1，`already present`）→ 不再登记。向用户报告 PROGRESS 中同名节点行（编号/状态/owner），问用户：换名重跑本命令，还是这本来就是同一节点的继续推进（若是则转入该节点的正常读档流程）。
   - **锁忙**（exit 1，`Lock busy`）→ 有并发会话持锁（附 owner 信息），建议稍后原样重跑本命令（next-node 幂等重试安全）。
   - **存量撞号**（成功输出带 `existing duplicate numbers` 附注）→ 新号 = 全表 max+1，不受存量撞号影响，可继续；但须向用户转述撞号详情，并建议按 `.nodes/PROTOCOL.md`「编号分配」条目处理（后登记方改号并留痕）。
   - **计划文件已存在**：`.nodes/plans/<计划短名>.md` 已存在且与新计划内容不同 → 报告差异要点，经用户确认后**追加**新内容，绝不覆盖。
4. **计划落盘**：把计划要点写入 `.nodes/plans/<计划短名>.md`（含：目标一句话 / 边界 / 验收标准 / 预估规模，格式参照 plans/ 下现有文件）；若第 2 步未传 `-Accept`（PROGRESS 行验收列是占位符「待补充」），此时把该行验收列回填为一句可验收标准。
5. **收口**：运行 `save.ps1 verify -Node <计划短名> -Session <会话标识>`，全 [OK] 后向用户复述：「节点 #N 已登记（待开始）：<名称>；下一步：<从计划要点提炼的第一步>」。可选：`save.ps1 checkpoint -Node <计划短名> -Session <会话> -Note "登记"` 留检查点。

## 纪律

- 节点号**只能**由 `next-node` 分配（锁内全表扫描 max+1），禁止手改 PROGRESS 表新增行（防并发撞号）。
- 登记动作只写三处：PROGRESS 一行（脚本完成）、`plans/<计划短名>.md`、SESSIONS 检查点（可选）。`CONTEXT.md` 的「当前节点」切换留给该节点的首个工作会话。
