// node-architect 压缩桥接 · opencode 适配器
// 安装位置：<项目>/.opencode/plugin/node-architect-bridge.ts（由 install.ps1 -Bridge 复制）
//
// 机制（本机 SDK @opencode-ai/plugin index.d.ts 已验证）：
//   experimental.session.compacting —— 摘要生成"前"触发；
//     output.context: string[] 会追加到默认压缩 prompt（不覆盖 opencode 自带摘要指令）。
//   我们把桥接文本推进 context，并让摘要末尾携带"压缩后第一动作"指令块——
//   autocontinue 钩子只有 enabled 开关、无文本通道，故指令块走摘要搭车。
// 依赖：Windows 下的 PowerShell（pwsh 优先，退回 powershell）。
//       找不到核心脚本或 .nodes/ 时静默跳过（L0 系统提示兜底仍生效）。
import type { Plugin } from "@opencode-ai/plugin"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

function findCore(worktree: string): string | null {
  const candidates = [
    process.env.NODE_ARCHITECT_BRIDGE_CORE, // 手动覆盖入口
    join(worktree, ".agents", "skills", "node-architect", "bridge", "compact-context.ps1"),
    join(worktree, "node-architect", "skill", "bridge", "compact-context.ps1"), // 母版仓库内开发用
  ].filter((p): p is string => !!p)
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function runBridge(core: string, worktree: string, sessionID: string): string | null {
  const args = [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", core,
    "-Project", worktree,
    "-Tombstone", // 顺手留一行压缩墓碑到 .nodes/SESSIONS/_compactions.log
  ]
  if (sessionID) args.push("-SessionID", sessionID)
  for (const host of ["pwsh", "powershell"]) {
    const r = spawnSync(host, args, { encoding: "utf8", timeout: 15000 })
    if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") continue // 换下一个宿主
    const out = (r.stdout || "").trim()
    if (r.status === 0 && out) return out
    return null // 宿主在但执行失败：静默放弃，绝不阻断压缩
  }
  return null
}

export const NodeArchitectBridge: Plugin = async ({ worktree }) => ({
  "experimental.session.compacting": async (input, output) => {
    try {
      const core = findCore(worktree)
      if (!core) return
      const text = runBridge(core, worktree, input.sessionID)
      if (text) output.context.push(text)
    } catch {
      // 桥接失败不能影响压缩本身：吞掉一切异常
    }
  },
})
