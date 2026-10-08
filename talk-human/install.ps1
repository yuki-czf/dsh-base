#Requires -Version 5.1
<#
.SYNOPSIS
  talk-human（说人话输出规范）全局安装/更新/卸载。
  母版：本目录（dsh-base/talk-human），装到各客户端的全局 skills 目录 + AGENTS.md 标记块注入。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1                     # 自动检测客户端，默认 opencode+claude
  powershell -ExecutionPolicy Bypass -File install.ps1 -Clients opencode,codex
  powershell -ExecutionPolicy Bypass -File install.ps1 -Remove             # 卸载（删 skill + 剥离 AGENTS.md 标记块）
#>
param(
  [string[]]$Clients = @(),
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$master = $PSScriptRoot
$skillSrc = Join-Path $master 'skill'
$snippetPath = Join-Path $master 'agents-global\AGENTS.snippet.md'
if (-not (Test-Path $skillSrc))   { throw "母版缺失: $skillSrc" }
if (-not (Test-Path $snippetPath)) { throw "片段缺失: $snippetPath" }

# 版本号单一真源：skill/SKILL.md frontmatter
$ver = '?'
$verMatch = Select-String -Path (Join-Path $skillSrc 'SKILL.md') -Pattern '^version:\s*(\S+)\s*$' | Select-Object -First 1
if ($verMatch) { $ver = $verMatch.Matches[0].Groups[1].Value }

$BEGIN = '# >>> talk-human'
$END   = '# <<< talk-human'

# 客户端注册表：全局 skills 目录 + 全局 AGENTS.md 路径 + 环境指纹
$clientTable = [ordered]@{
  opencode = @{ skills = "$env:USERPROFILE\.config\opencode\skills"; agents = "$env:USERPROFILE\.config\opencode\AGENTS.md"; sniff = { [bool]$env:OPENCODE } }
  claude   = @{ skills = "$env:USERPROFILE\.claude\skills";          agents = "$env:USERPROFILE\.claude\CLAUDE.md";        sniff = { [bool]($env:CLAUDECODE -or $env:CLAUDE_CODE_ENTRYPOINT) } }
  codex    = @{ skills = "$env:USERPROFILE\.codex\skills";           agents = "$env:USERPROFILE\.codex\AGENTS.md";         sniff = { [bool]$env:CODEX_HOME } }
  zcode    = @{ skills = "$env:USERPROFILE\.zcode\skills";           agents = $null;                                      sniff = { [bool]$env:ZCODE } }
}

# 目标解析：显式指定 > 环境指纹 > 默认 opencode+claude（-File 调用时逗号会被并入单字符串，这里拆开）
$targets = @($Clients | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })
if (-not $targets) {
  $detected = @($clientTable.Keys | Where-Object { & $clientTable[$_].sniff })
  if ($detected) { $targets = $detected } else { $targets = @('opencode', 'claude') }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-BlockRange([string[]]$lines) {
  # 返回标记块的起止行号（含标记行）；不存在返回 $null
  $s = -1; $e = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].StartsWith($BEGIN)) { $s = $i }
    elseif ($s -ge 0 -and $lines[$i].StartsWith($END)) { $e = $i; break }
  }
  if ($s -ge 0 -and $e -ge $s) { ,@($s, $e) } else { $null }
}

foreach ($t in $targets) {
  if (-not $clientTable.Contains($t)) { Write-Warning "未知客户端 '$t'，跳过"; continue }
  $cfg = $clientTable[$t]
  $skillDst = Join-Path $cfg.skills 'talk-human'

  if ($Remove) {
    # --- 卸载：删 skill 目录 + 剥离 AGENTS.md 标记块 ---
    if (Test-Path $skillDst) { Remove-Item $skillDst -Recurse -Force; Write-Host "OK [$t]: 已删除 $skillDst" }
    if ($cfg.agents -and (Test-Path $cfg.agents)) {
      $lines = [System.IO.File]::ReadAllLines($cfg.agents)
      $range = Get-BlockRange $lines
      if ($range) {
        # 用显式循环剔除标记块区间，避免 PowerShell 退化区间（0..-1 → @(0,-1)）陷阱
        $kept = @(for ($i = 0; $i -lt $lines.Count; $i++) { if ($i -lt $range[0] -or $i -gt $range[1]) { $lines[$i] } })
        [System.IO.File]::WriteAllLines($cfg.agents, $kept, $utf8NoBom)
        Write-Host "OK [$t]: 已从 $($cfg.agents) 剥离标记块"
      }
    }
    continue
  }

  # --- 安装/更新 1：skill 目录 ---
  New-Item -ItemType Directory -Force -Path $cfg.skills | Out-Null
  if (Test-Path $skillDst) { Remove-Item $skillDst -Recurse -Force }
  Copy-Item $skillSrc $skillDst -Recurse -Force
  Write-Host "OK [$t]: skill v$ver -> $skillDst"

  # --- 安装/更新 2：AGENTS.md 标记块（幂等：已有则替换，没有则追加） ---
  if ($cfg.agents) {
    $snippet = [System.IO.File]::ReadAllText($snippetPath)
    $dir = Split-Path $cfg.agents -Parent
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    if (Test-Path $cfg.agents) {
      $text = [System.IO.File]::ReadAllText($cfg.agents)
      $lines = [System.IO.File]::ReadAllLines($cfg.agents)
      $range = Get-BlockRange $lines
      if ($range) {
        # 用显式循环剔除标记块区间，避免 PowerShell 退化区间（0..-1 → @(0,-1)）陷阱
        $kept = @(for ($i = 0; $i -lt $lines.Count; $i++) { if ($i -lt $range[0] -or $i -gt $range[1]) { $lines[$i] } })
        $new = ($kept -join "`n").TrimEnd("`n") + "`n`n" + $snippet.TrimEnd("`n") + "`n"
        [System.IO.File]::WriteAllText($cfg.agents, $new, $utf8NoBom)
        Write-Host "OK [$t]: 标记块已更新 -> $($cfg.agents)"
      } else {
        [System.IO.File]::WriteAllText($cfg.agents, $text.TrimEnd("`n") + "`n`n" + $snippet.TrimEnd("`n") + "`n", $utf8NoBom)
        Write-Host "OK [$t]: 标记块已追加 -> $($cfg.agents)"
      }
    } else {
      [System.IO.File]::WriteAllText($cfg.agents, $snippet, $utf8NoBom)
      Write-Host "OK [$t]: 已创建 $($cfg.agents)"
    }
  }
}

if ($Remove) { Write-Host "`n卸载完成。" }
else { Write-Host "`n安装完成 v$ver。新开会话即生效；重跑本脚本 = 更新（幂等）。" }
