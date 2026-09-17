#Requires -Version 5.1
<#
.SYNOPSIS
  node-architect 集中式安装：唯一真源 .agents\skills + 各客户端联接镜像 + .nodes 初始化。
  不传 -Project 时默认当前目录（自然语言场景：让 agent 在项目根直接跑）。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1                                # 默认装到当前目录（全自然）
  powershell -ExecutionPolicy Bypass -File install.ps1 -Project D:\www\myapp -Clients opencode,zcode
  powershell -ExecutionPolicy Bypass -File install.ps1 -Clients opencode -Copy        # 拷贝镜像（联接不可用时）
  powershell -ExecutionPolicy Bypass -File install.ps1 -SkipNodes                     # 不初始化 .nodes
#>
param(
  [string]$Project = (Get-Location).Path,
  [string[]]$Clients = @(),
  [switch]$Copy,
  [switch]$SkipNodes,
  [switch]$Bootstrap,
  [switch]$Bridge,
  [switch]$BatchAgent,
  [string]$BatchModel = ''
)
$ErrorActionPreference = 'Stop'
$master   = $PSScriptRoot
$skillSrc = Join-Path $master 'skill'
if (-not (Test-Path $Project)) { throw "项目目录不存在: $Project" }
$Project = (Resolve-Path $Project).Path

if (-not (Test-Path $skillSrc)) { throw "母版缺失: $skillSrc" }

# ---------- 0) -Bootstrap 模式：把安装引导技能装进客户端的全局技能目录（一次性） ----------
if ($Bootstrap) {
  $bootSrc = Join-Path $master 'bootstrap'
  if (-not (Test-Path $bootSrc)) { throw "引导技能缺失: $bootSrc" }
  $globalDirs = @{
    opencode = "$env:USERPROFILE\.config\opencode\skills"
    zcode    = "$env:USERPROFILE\.zcode\skills"
    claude   = "$env:USERPROFILE\.claude\skills"
    dsh      = "$env:USERPROFILE\.dsh\skills"
  }
  $fingerprints = @{
    opencode = { [bool]$env:OPENCODE }
    claude   = { [bool]($env:CLAUDECODE -or $env:CLAUDE_CODE_ENTRYPOINT) }
    zcode    = { [bool]$env:ZCODE }
  }
  $targets = @($Clients | ForEach-Object { $_.ToLower() })
  $detected = @($fingerprints.Keys | Where-Object { & $fingerprints[$_] })
  $targets = @($targets + $detected | Select-Object -Unique)
  if (-not $targets) { $targets = @($globalDirs.Keys) }   # 未指定则四家全装（各 2KB，一次到位）
  foreach ($t in $targets) {
    if (-not $globalDirs.ContainsKey($t)) { Write-Warning "未知客户端 '$t'，跳过"; continue }
    $dst = Join-Path $globalDirs[$t] 'node-architect-installer'
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $globalDirs[$t] | Out-Null
    Copy-Item $bootSrc $dst -Recurse -Force
    # 把引导技能中的 {{MASTER}} 占位符重写为本机母版实际路径（换机后重跑 -Bootstrap 即自愈）
    $bootMd = Join-Path $dst 'SKILL.md'
    if (Test-Path $bootMd) {
      $txt = [System.IO.File]::ReadAllText($bootMd, [System.Text.Encoding]::UTF8)
      [System.IO.File]::WriteAllText($bootMd, $txt.Replace('{{MASTER}}', $master), (New-Object System.Text.UTF8Encoding($false)))
    }
    Write-Host "OK: 引导技能 -> $dst（母版路径: $master）"
  }
  Write-Host ""
  Write-Host "完成。此后在任何新项目的会话里说『装节点协议』即可自动安装。"
  return
}

function Remove-PathSafe([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  $item = Get-Item $Path -Force
  if ($item.LinkType) {
    # 联接/重解析点：只删链接本身，绝不动真源内容
    [System.IO.Directory]::Delete($Path, $false)
  } else {
    Remove-Item $Path -Recurse -Force
  }
}

function Compare-DirHash([string]$Left, [string]$Right) {
  # 递归比对两侧文件哈希，返回差异文件相对路径列表（内容不同 / 仅一侧存在）；空 = 完全一致
  $diff = @()
  $map  = @{}
  $leftRoot  = (Resolve-Path $Left).Path
  $rightRoot = (Resolve-Path $Right).Path
  Get-ChildItem $leftRoot -Recurse -File | ForEach-Object {
    $map[$_.FullName.Substring($leftRoot.Length + 1)] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
  }
  foreach ($rel in $map.Keys) {
    $rFile = Join-Path $rightRoot $rel
    if (-not (Test-Path $rFile) -or (Get-FileHash $rFile -Algorithm SHA256).Hash -ne $map[$rel]) { $diff += $rel }
  }
  Get-ChildItem $rightRoot -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($rightRoot.Length + 1)
    if (-not $map.ContainsKey($rel)) { $diff += $rel }
  }
  return @($diff | Select-Object -Unique)
}

# 版本号单一真源：skill/SKILL.md frontmatter
$ver = '?'
$verMatch = Select-String -Path (Join-Path $skillSrc 'SKILL.md') -Pattern '^version:\s*(\S+)\s*$' | Select-Object -First 1
if ($verMatch) { $ver = $verMatch.Matches[0].Groups[1].Value }

# ---------- 1) 唯一真源：.agents\skills\node-architect（DSH 原生扫描此目录） ----------
# 覆盖保护：真源相对母版有本地差异时先备份再覆盖，绝不静默丢弃
$canonical = Join-Path $Project '.agents\skills\node-architect'
if (Test-Path $canonical) {
  $diff = Compare-DirHash $skillSrc $canonical
  if ($diff.Count -gt 0) {
    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $Project ".agents\backup\node-architect\$stamp"
    New-Item -ItemType Directory -Force -Path $backup | Out-Null
    Copy-Item "$canonical\*" $backup -Recurse -Force
    Write-Warning "真源存在与母版的本地差异，已备份 -> $backup"
    Write-Warning "差异文件: $($diff -join ', ')"
    Write-Host  "提示：日常维护改母版 node-architect\skill\ 后重跑本命令同步；备份不会被再次安装。"
  }
}
Remove-PathSafe $canonical
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $canonical) | Out-Null
Copy-Item $skillSrc $canonical -Recurse -Force
Write-Host "OK: 唯一真源 -> $canonical（node-architect v$ver）"

# ---------- 2) 清理旧版散落副本（.dsh\skills 已被 .agents\skills 取代） ----------
$legacyDsh = Join-Path $Project '.dsh\skills\node-architect'
if (Test-Path $legacyDsh) {
  Remove-PathSafe $legacyDsh
  Write-Host "清理旧散落副本: $legacyDsh（DSH 原生读 .agents\skills）"
}

# ---------- 3) 客户端镜像：联接（默认）或拷贝（-Copy） ----------
# 自动识别：客户端注入的 shell 环境变量指纹（在客户端会话里跑时生效；裸终端探测不到则跳过）
# 注意：OPENCODE/CLAUDECODE 为公开约定；ZCODE 为合理推测，实测不符改这一行即可。
$clientSkillDirs = @{
  opencode = '.opencode\skills'
  zcode    = '.zcode\skills'
  claude   = '.claude\skills'
}
$envFingerprints = @{
  opencode = { [bool]$env:OPENCODE }
  claude   = { [bool]($env:CLAUDECODE -or $env:CLAUDE_CODE_ENTRYPOINT) }
  zcode    = { [bool]$env:ZCODE }
}
$detected = @($envFingerprints.Keys | Where-Object { & $envFingerprints[$_] })
if (Get-ChildItem env: -Name | Where-Object { $_ -like 'DSH_*' }) {
  Write-Host "识别到 DSH 环境：无需镜像（原生读 .agents\skills）"
}
if ($detected) { Write-Host "识别到客户端: $($detected -join ', ')" }

$allClients = @($Clients | ForEach-Object { $_.ToLower() }) + $detected | Select-Object -Unique
if (-not $allClients) {
  Write-Host "未指定 -Clients 且未探测到客户端指纹：只装真源+AGENTS.md 保底层（已够用）；在客户端会话里重跑可自动补镜像。"
}

$installedMirrors = @()
foreach ($c in $allClients) {
  $cKey = $c.ToLower()
  if (-not $clientSkillDirs.ContainsKey($cKey)) {
    Write-Warning "未知客户端 '$c'：已跳过（其入口靠 AGENTS.md 铁律保底）。已知：$($clientSkillDirs.Keys -join ', ')。"
    continue
  }
  $mirror = Join-Path $Project (Join-Path $clientSkillDirs[$cKey] 'node-architect')
  Remove-PathSafe $mirror
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $mirror) | Out-Null
  if ($Copy) {
    Copy-Item $canonical $mirror -Recurse -Force
    Write-Host "OK: 拷贝镜像 -> $mirror"
  } else {
    New-Item -ItemType Junction -Path $mirror -Target $canonical | Out-Null
    Write-Host "OK: 联接镜像 -> $mirror  ==>  $canonical"
  }
  $installedMirrors += $mirror

  if ($cKey -eq 'opencode') {
    $cmdDir  = Join-Path $Project '.opencode\command'
    New-Item -ItemType Directory -Force -Path $cmdDir | Out-Null
    $cmdFile = Join-Path $cmdDir 'node-architect.md'
    @'
---
description: 节点协议入口：读档恢复 / 存档 / 初始化（协议真源 .nodes/PROTOCOL.md）
---
读取并遵守 `.nodes/PROTOCOL.md` 节点协议，然后：
1. 若 `.nodes/` 不存在：运行 `.agents/skills/node-architect/scripts/init-nodes.ps1`（默认装到当前目录）初始化，再执行第 2 步。
2. 若已存在：读 `.nodes/CONTEXT.md` 与 `.nodes/PROGRESS.md`，向用户复述"当前节点 / 下一步"后待命。
3. 若用户参数是"存档"：按协议执行五步存档。

用户补充：$ARGUMENTS
'@ | Set-Content -Path $cmdFile -Encoding utf8
    Write-Host "OK: 命令 -> $cmdFile"
  }
}

# ---------- 3.5) 压缩桥接（可选，-Bridge）：核心随真源分发 + opencode 适配器插件 ----------
if ($Bridge) {
  $coreSrc = Join-Path $skillSrc 'bridge\compact-context.ps1'
  if (-not (Test-Path $coreSrc)) { throw "桥接核心缺失: $coreSrc" }
  $pluginSrc = Join-Path $master 'bridge\opencode\node-architect-bridge.ts'
  if (-not (Test-Path $pluginSrc)) { throw "opencode 适配器缺失: $pluginSrc" }
  $pluginDst = Join-Path $Project '.opencode\plugin\node-architect-bridge.ts'
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $pluginDst) | Out-Null
  Copy-Item $pluginSrc $pluginDst -Force
  Write-Host "OK: opencode 桥接插件 -> $pluginDst"
  Write-Host "OK: 桥接核心随真源分发 -> .agents\skills\node-architect\bridge\compact-context.ps1"
}

# ---------- 3.6) batch-executor agent（可选，-BatchAgent）：安装分批执行员 agent 到目标项目 ----------
if ($BatchAgent) {
  # 仅当 opencode 在目标客户端列表中时生效
  $ocKey = 'opencode'
  $ocInTargets = @($allClients | Where-Object { $_ -eq $ocKey })
  if ($ocInTargets.Count -eq 0) {
    $curLabel = if ($allClients.Count -gt 0) { $allClients -join ', ' } else { '无' }
    Write-Host "提示: -BatchAgent 仅在 opencode 客户端目标时生效（当前目标: $curLabel），跳过。"
  } else {
    $agentSrc = Join-Path $master 'bridge\opencode\agents\batch-executor.md'
    if (-not (Test-Path $agentSrc)) { throw "agent 模板缺失: $agentSrc" }
    $agentDst = Join-Path $Project '.opencode\agent\batch-executor.md'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $agentDst) | Out-Null
    $txt = [System.IO.File]::ReadAllText($agentSrc, [System.Text.Encoding]::UTF8)
    if ($BatchModel) {
      $txt = $txt.Replace('{{BATCH_MODEL}}', $BatchModel)
    }
    [System.IO.File]::WriteAllText($agentDst, $txt, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "OK: batch-executor agent -> $agentDst"
    if (-not $BatchModel) {
      Write-Host "⚠ batch-executor 未配置模型：手工编辑 $agentDst 替换 {{BATCH_MODEL}}"
    }
  }

  # DSH：探测全局 ~/.dsh → 复制 preset 两文件（模型路由属 host 平面，无占位符重写；
  # 跑批时模型由用户在会话创建时手动选公司 vLLM 的 Qwen3.8-27B-W4A16-AWQ，persona 内置校验兜底）
  $dshHome = Join-Path $env:USERPROFILE '.dsh'
  if (Test-Path $dshHome) {
    $presetSrcDir = Join-Path $master 'bridge\dsh\agent-presets\batch-executor'
    $presetFiles = @('agent.cordis.yml', 'preset.yml')
    foreach ($f in $presetFiles) {
      $src2 = Join-Path $presetSrcDir $f
      if (-not (Test-Path $src2)) { throw "DSH preset 文件缺失: $src2" }
    }
    $presetDst = Join-Path $dshHome '.agent-presets\batch-executor'
    New-Item -ItemType Directory -Force -Path $presetDst | Out-Null
    foreach ($f in $presetFiles) {
      Copy-Item (Join-Path $presetSrcDir $f) (Join-Path $presetDst $f) -Force
    }
    Write-Host "OK: DSH batch-executor preset -> $presetDst"
    Write-Host "? DSH 跑批请选模型：公司大模型(vLLM) / Qwen3.8-27B-W4A16-AWQ（新 preset 需重启 DSH 生效）"
  }
}

# ---------- 4) .gitignore（仅联接模式：镜像是生成物，clone 后重跑本命令重建） ----------
if (-not $Copy) {
  $gi   = Join-Path $Project '.gitignore'
  $want = @('# node-architect 生成的联接镜像（clone 后重跑 install.ps1 重建）')
  foreach ($m in $installedMirrors) {
    $rel  = $m.Substring($Project.Length + 1).Replace('\', '/')
    $want += "$rel/"
  }
  $want += @('.nodes/.lock', '.agents/backup/')
  $existing = if (Test-Path $gi) { Get-Content $gi -Encoding utf8 } else { @() }
  $missing  = $want | Where-Object { $existing -notcontains $_ -and $existing -notcontains $_.TrimEnd('/') }
  if ($missing) {
    Add-Content -Path $gi -Value (@() + $missing) -Encoding utf8
    Write-Host "OK: .gitignore += $($missing.Count) 行"
  }
}

# ---------- 5) .nodes 数据目录 ----------
if (-not $SkipNodes) {
  & (Join-Path $canonical 'scripts\init-nodes.ps1') -Project $Project
}

Write-Host ""
Write-Host "完成（node-architect v$ver）。日常维护只改母版 node-architect\skill\，重跑本命令同步各端；换机 clone 后重跑本命令重建联接。"
