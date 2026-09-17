#Requires -Version 5.1
<#
.SYNOPSIS
  初始化 .nodes 节点协议数据目录（幂等：已存在的文件不覆盖，除非 -Force）。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File init-nodes.ps1 -Project D:\www\myapp
#>
param(
  [string]$Project = (Get-Location).Path,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'

$skillRoot  = Split-Path -Parent $PSScriptRoot   # ...\node-architect\scripts -> node-architect
$templates  = Join-Path $skillRoot 'references\templates'
$protocol   = Join-Path $skillRoot 'references\PROTOCOL.md'

# 版本号单一真源：skill/SKILL.md frontmatter（运行时解析注入指针，避免多处硬编码漂移）
$ver = ''
$skillMd = Join-Path $skillRoot 'SKILL.md'
if (Test-Path $skillMd) {
  $vm = Select-String -Path $skillMd -Pattern '^version:\s*(\S+)\s*$' | Select-Object -First 1
  if ($vm) { $ver = $vm.Matches[0].Groups[1].Value }
}
$Project    = (Resolve-Path $Project).Path
$nodesDir   = Join-Path $Project '.nodes'

if (-not (Test-Path $templates)) { throw "找不到模板目录: $templates" }

New-Item -ItemType Directory -Force -Path `
  $nodesDir, `
  (Join-Path $nodesDir 'SESSIONS'), `
  (Join-Path $nodesDir 'archive') | Out-Null

# 三件套：不存在才写入（-Force 则重写）
foreach ($f in 'CONTEXT.md', 'PROGRESS.md', 'DECISIONS.md') {
  $dst = Join-Path $nodesDir $f
  if (-not (Test-Path $dst) -or $Force) {
    Copy-Item (Join-Path $templates $f) $dst -Force
    Write-Host "创建 $dst"
  } else {
    Write-Host "跳过（已存在）$dst"
  }
}

# 模板副本与会话/归档模板
Copy-Item (Join-Path $templates 'SESSION.md')      (Join-Path $nodesDir 'SESSIONS\_template.md') -Force
Copy-Item (Join-Path $templates 'ARCHIVE-NODE.md') (Join-Path $nodesDir 'archive\_template.md') -Force
# PROTOCOL.md 复制并注入版本号（与 AGENTS.md __VER__ 同机制，消灭真源漂移）
$protoDst = Join-Path $nodesDir 'PROTOCOL.md'
$protoContent = [System.IO.File]::ReadAllText($protocol, [System.Text.Encoding]::UTF8)
if ($ver) { $protoContent = $protoContent.Replace('__VER__', $ver) }
[System.IO.File]::WriteAllText($protoDst, $protoContent, (New-Object System.Text.UTF8Encoding($false)))

# AGENTS.md 跨客户端指针（判重标记用 skill 名，避免项目正文恰好出现 .nodes 字样而误跳过）
$agents  = Join-Path $Project 'AGENTS.md'
$pointer = @'

## 节点协议（node-architect v__VER__）

本项目使用 `.nodes` 节点存档协议对抗上下文压缩（摘要；规则全文以 `.nodes/PROTOCOL.md` 为准）。任何 AI 客户端会话必须遵守：

- **开工必读档**：动手前先读 `.nodes/CONTEXT.md` 与 `.nodes/PROGRESS.md`，读后向用户复述"当前节点/下一步"再动手。
- **节点先行**：长于一次会话的工作，先在 `.nodes/PROGRESS.md` 登记节点（名称+验收标准），敲定设计要点再写代码。
- **存档时机**：节点完成 / 用户说"存档、这节点差不多了" / 大改动落地 / 会话收尾 → 按协议执行存档（PROGRESS → SESSIONS → DECISIONS → CONTEXT → archive），机械动作走 skill 的 `scripts/save.ps1`。
- **压缩即恢复**：感知到上下文被压缩或记忆断裂 → 立即重读 `.nodes/CONTEXT.md`、`PROGRESS.md` 恢复状态再继续。
- **并发纪律**：DECISIONS 只追加；PROGRESS 只改自己节点的行；CONTEXT 写入走 `save.ps1 save`（自动加锁，10 分钟超时）。

协议全文与模板见 `.nodes/PROTOCOL.md`。
'@
$pointer = $pointer.Replace('__VER__', $ver)
if (Test-Path $agents) {
  if (-not (Select-String -Path $agents -Pattern 'node-architect' -Quiet)) {
    Add-Content -Path $agents -Value $pointer -Encoding utf8
    Write-Host "已在 AGENTS.md 追加节点协议指针"
  } elseif ($ver) {
    # 指针已存在：仅刷新版本号 token（不动正文，避免覆盖用户对指针段的编辑）
    $txt = [System.IO.File]::ReadAllText($agents, [System.Text.Encoding]::UTF8)
    $new = $txt -replace '(?m)^(## 节点协议.*node-architect v)[\d.]+', ('${1}' + $ver)
    if ($new -ne $txt) {
      [System.IO.File]::WriteAllText($agents, $new, (New-Object System.Text.UTF8Encoding($false)))
      Write-Host "已刷新 AGENTS.md 指针版本号 -> v$ver"
    }
  }
} else {
  Set-Content -Path $agents -Value "# AGENTS$pointer" -Encoding utf8
  Write-Host "已创建 AGENTS.md（含节点协议指针）"
}

# 替换顶层文件中的 {DATE} 占位符
Get-ChildItem $nodesDir -Filter '*.md' | ForEach-Object {
  $raw = Get-Content $_.FullName -Raw -Encoding utf8
  if ($raw -like '*{DATE}*') {
    $raw.Replace('{DATE}', (Get-Date -Format 'yyyy-MM-dd')) | Set-Content $_.FullName -Encoding utf8
  }
}

Write-Host ""
Write-Host "OK: .nodes 已就绪于 $nodesDir"
