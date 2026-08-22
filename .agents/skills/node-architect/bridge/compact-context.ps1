#Requires -Version 5.1
<#
.SYNOPSIS
  node-architect 压缩桥接核心（单一真源）：产出注入文本；可选写压缩墓碑标记。
.DESCRIPTION
  被各客户端适配器在"压缩开始前"调用。只做两件事：
  1) 读 .nodes/CONTEXT.md + PROGRESS.md，向 stdout 产出统一注入文本（措辞只维护这一份）
  2) -Tombstone 时向 .nodes/SESSIONS/_compactions.log 追加一行机械标记（压缩已发生的证据）
  找不到 .nodes/ 时静默退出（exit 0、无 stdout），绝不阻断客户端压缩流程。
  非 Windows 或无 PowerShell 的环境由适配器负责跳过（L0 系统提示兜底仍生效）。
.EXAMPLE
  pwsh -NoProfile -File compact-context.ps1 -Project D:\www\myapp
  pwsh -NoProfile -File compact-context.ps1 -Project . -Tombstone -SessionID ses_abc123
#>
param(
  [string]$Project = (Get-Location).Path,
  [switch]$Tombstone,
  [string]$SessionID = '',
  [int]$MaxSectionChars = 6000
)
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$ErrorActionPreference = 'Stop'
$nodesDir = Join-Path $Project '.nodes'
if (-not (Test-Path (Join-Path $nodesDir 'PROTOCOL.md'))) {
  [Console]::Error.WriteLine('node-architect-bridge: .nodes/ not found, skip')
  exit 0
}

function Read-Section([string]$Path) {
  if (-not (Test-Path $Path)) { return '(缺失)' }
  $t = Get-Content -Path $Path -Raw -Encoding UTF8
  if ($null -eq $t) { return '(空)' }
  $t = $t.Trim()
  if ($t.Length -gt $MaxSectionChars) { $t = $t.Substring(0, $MaxSectionChars) + "`n…（超长截断）" }
  return $t
}

if ($Tombstone) {
  $logDir = Join-Path $nodesDir 'SESSIONS'
  if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
  $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $who = 'unknown'
  if ($SessionID) { $who = $SessionID }
  $line = "[{0}] compaction-pending session={1}" -f $stamp, $who
  Add-Content -Path (Join-Path $logDir '_compactions.log') -Value $line -Encoding UTF8
}

$snapContext  = Read-Section (Join-Path $nodesDir 'CONTEXT.md')
$snapProgress = Read-Section (Join-Path $nodesDir 'PROGRESS.md')

$bridge = @"
<node-architect-compaction-bridge>
本项目启用 .nodes 节点存档协议（原则：文件是记忆，对话不是）。你正在生成上下文压缩摘要，必须遵守以下要求。

【磁盘存档快照 · 压缩前最新状态】
—— 当前节点/下一步（来自 .nodes/CONTEXT.md）——
$snapContext

—— 节点进度矩阵（来自 .nodes/PROGRESS.md）——
$snapProgress

【摘要硬性要求】
1. 对话中尚未落入上面快照的进展、决策、用户明确要求与下一步计划，必须在摘要中具体保留（保留文件路径、节点名、验收标准等细节），禁止泛化为"继续之前的工作"。
2. 若对话中的最新状态与快照冲突，以对话为准，并在摘要中标注「待落盘」。
3. 摘要的最末尾必须逐字附上下面这个指令块（它会在压缩后引导模型补写存档）：
--- 压缩后第一动作 ---
上下文刚被压缩。立即执行：① 重读 .nodes/CONTEXT.md 与 .nodes/PROGRESS.md 恢复状态；② 向用户复述当前节点/下一步；③ 把摘要中所有「待落盘」内容补写进 .nodes（SESSIONS/PROGRESS/DECISIONS），完成 catch-up 存档。
-------------------------
</node-architect-compaction-bridge>
"@

Write-Output $bridge
