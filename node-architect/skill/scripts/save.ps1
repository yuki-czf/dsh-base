#Requires -Version 5.1
<#
.SYNOPSIS
  .nodes 存档流程的机械动作：CONTEXT 写锁管理 + 五步存档完整性校验。
  模型只负责生成内容；加锁/删锁/超时判断/校验/归档骨架生成交给本脚本。
.EXAMPLE
  save.ps1 lock   -Session main
  save.ps1 unlock -Session main
  save.ps1 verify -Node 跑通登录流程 -Session main -Completed
  save.ps1 verify -Session main                          # 节点未完成时的中途存档校验
  save.ps1 check-tombstone                               # 检查"压缩后未补存档"的断链（退出码 3 = 有告警）
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('lock', 'unlock', 'verify', 'check-tombstone')]
  [string]$Action,
  [string]$Project = (Get-Location).Path,
  [string]$Session = 'main',
  [string]$Node = '',
  [switch]$Completed
)
$ErrorActionPreference = 'Stop'

$Project  = (Resolve-Path $Project).Path
$nodesDir = Join-Path $Project '.nodes'
if (-not (Test-Path $nodesDir)) { throw "未找到 $nodesDir（先运行 init-nodes.ps1 初始化）" }
if ($Session -match '[|\\/:*?"<>|\r\n]') { throw "会话标识含非法字符: $Session" }

$lockPath   = Join-Path $nodesDir '.lock'
$timeoutMin = 10
$utf8NoBom  = New-Object System.Text.UTF8Encoding($false)

function Read-Utf8([string]$Path) {
  if (Test-Path -LiteralPath $Path) { return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) }
  return $null
}
function Write-Utf8([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}
function Get-LockInfo {
  if (-not (Test-Path -LiteralPath $lockPath)) { return $null }
  $parts = (Read-Utf8 $lockPath) -split '\|', 2
  $ts = [datetime]::MinValue
  if ($parts.Count -ge 2) {
    try { $ts = [datetime]::ParseExact($parts[1].Trim(), 'yyyy-MM-ddTHH:mm:ss', [Globalization.CultureInfo]::InvariantCulture) } catch { $ts = [datetime]::MinValue }
  }
  $age = [double]::MaxValue
  if ($ts -ne [datetime]::MinValue) { $age = ((Get-Date) - $ts).TotalMinutes }
  New-Object PSObject -Property @{ Owner = "$($parts[0])"; Time = $ts; AgeMin = $age }
}

# ---------- lock：为写 CONTEXT.md 取锁 ----------
if ($Action -eq 'lock') {
  $cur = Get-LockInfo
  if ($cur) {
    if ($cur.Owner -eq $Session) {
      Write-Utf8 $lockPath "$Session|$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
      Write-Host "OK: 刷新自己的锁（$Session）"
      exit 0
    }
    if ($cur.AgeMin -lt $timeoutMin) {
      Write-Host "[FAIL] 锁被 '$($cur.Owner)' 持有（$([int]$cur.AgeMin) 分钟前），未超时（$timeoutMin 分钟）。先做其他存档步骤稍后重试。" -ForegroundColor Red
      exit 1
    }
    Write-Warning "覆盖超时/异常残留锁（原持有者 '$($cur.Owner)'，$([int]$cur.AgeMin) 分钟前）"
  }
  Write-Utf8 $lockPath "$Session|$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
  Write-Host "OK: 锁已建立（$Session）"
  exit 0
}

# ---------- unlock：放锁（只能删自己的或超时锁） ----------
if ($Action -eq 'unlock') {
  $cur = Get-LockInfo
  if (-not $cur) { Write-Host "无锁可删"; exit 0 }
  if ($cur.Owner -ne $Session -and $cur.AgeMin -lt $timeoutMin) {
    Write-Host "[FAIL] 锁属于 '$($cur.Owner)' 且未超时，不能删他人的锁。" -ForegroundColor Red
    exit 1
  }
  Remove-Item -LiteralPath $lockPath -Force
  Write-Host "OK: 锁已删除（$Session）"
  exit 0
}

# ---------- 墓碑校验：检测"压缩后未补存档"的断链 ----------
# 原理：compact-context.ps1 每次压缩前往 SESSIONS\_compactions.log 写一行墓碑；
# 若最新墓碑之后 .nodes 里没有任何内容文件被写过 => 那次压缩的 catch-up 存档大概率没发生。
function Get-StaleTombstone {
  $logPath = Join-Path $nodesDir 'SESSIONS\_compactions.log'
  if (-not (Test-Path -LiteralPath $logPath)) { return $null }
  $latest = [datetime]::MinValue
  foreach ($line in (Read-Utf8 $logPath) -split "`r?`n") {
    if ($line -match '^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]') {
      try { $t = [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture) } catch { continue }
      if ($t -gt $latest) { $latest = $t }
    }
  }
  if ($latest -eq [datetime]::MinValue) { return $null }
  $writes = @()
  foreach ($rel in @('CONTEXT.md', 'PROGRESS.md', 'DECISIONS.md')) {
    $p = Join-Path $nodesDir $rel
    if (Test-Path -LiteralPath $p) { $writes += (Get-Item -LiteralPath $p -Force).LastWriteTime }
  }
  foreach ($dirName in @('SESSIONS', 'archive')) {
    $d = Join-Path $nodesDir $dirName
    if (Test-Path -LiteralPath $d) {
      Get-ChildItem -LiteralPath $d -File -Force | Where-Object { $_.Name -ne '_compactions.log' } | ForEach-Object { $writes += $_.LastWriteTime }
    }
  }
  foreach ($mt in $writes) { if ($mt -gt $latest) { return $null } }
  return $latest
}

if ($Action -eq 'check-tombstone') {
  $stale = Get-StaleTombstone
  if ($null -eq $stale) {
    Write-Host "OK: 无未处理的压缩墓碑（没有墓碑，或墓碑之后已有补存档痕迹）。"
    exit 0
  }
  Write-Host "[WARN] 压缩墓碑（$($stale.ToString('yyyy-MM-dd HH:mm:ss'))）之后 .nodes 无任何写入——上次压缩后可能没做 catch-up 补存档。" -ForegroundColor Yellow
  Write-Host "       建议：翻上一会话的压缩摘要，把「待落盘」内容补写进 .nodes；确认无遗漏后可清理 _compactions.log 对应行。"
  exit 3
}

# ---------- verify：五步存档完整性校验 ----------
if ($Node -match '[\\/:*?"<>|]') { throw "节点名含文件名非法字符: $Node" }
$fails = 0
function Check([bool]$Ok, [string]$Label, [string]$Fix) {
  if ($Ok) {
    Write-Host "  [OK]   $Label"
  } else {
    Write-Host "  [FAIL] $Label" -ForegroundColor Red
    if ($Fix) { Write-Host "         修复: $Fix" -ForegroundColor Yellow }
    $script:fails++
  }
}

$nodeLabel = if ($Node) { $Node } else { '-' }
$modeLabel = if ($Completed) { '节点完成' } else { '中途存档' }
Write-Host "存档校验（节点: $nodeLabel | 会话: $Session | $modeLabel）"

$ctxPath  = Join-Path $nodesDir 'CONTEXT.md'
$progPath = Join-Path $nodesDir 'PROGRESS.md'
$decPath  = Join-Path $nodesDir 'DECISIONS.md'
$sessPath = Join-Path $nodesDir "SESSIONS\$Session.md"

Check (Test-Path $ctxPath)  'CONTEXT.md 存在'   '运行 init-nodes.ps1 初始化'
Check (Test-Path $progPath) 'PROGRESS.md 存在'  '运行 init-nodes.ps1 初始化'
Check (Test-Path $decPath)  'DECISIONS.md 存在' '运行 init-nodes.ps1 初始化'
Check (Test-Path (Join-Path $nodesDir 'SESSIONS')) 'SESSIONS/ 目录存在' '运行 init-nodes.ps1 初始化'

if ($Node) {
  $prog = Read-Utf8 $progPath
  Check ([bool]$prog -and $prog.Contains($Node)) "PROGRESS.md 含节点行「$Node」" "在 PROGRESS.md 表头下登记该节点（名称/验收标准/owner/状态）"
}

$sessOk = (Test-Path $sessPath) -and ((Get-Item -LiteralPath $sessPath -Force).Length -gt 0)
Check $sessOk "SESSIONS/$Session.md 非空" "按 SESSIONS/_template.md 重写本会话状态（进行中/暂停点/未决问题）"

$ctx = Read-Utf8 $ctxPath
Check ([bool]$ctx -and $ctx.Contains((Get-Date -Format 'yyyy-MM-dd'))) 'CONTEXT.md 最后更新为今日' '重写 CONTEXT.md 快照并把头部「最后更新」改为今日日期'

if ($Completed) {
  if (-not $Node) { throw '-Completed 需要同时提供 -Node' }
  $archPath = Join-Path $nodesDir "archive\$Node.md"
  if (-not (Test-Path $archPath)) {
    $tplPath = Join-Path $nodesDir 'archive\_template.md'
    if (Test-Path $tplPath) {
      Write-Utf8 $archPath ((Read-Utf8 $tplPath).Replace('{节点名}', $Node))
      Write-Host "  [OK]   archive/$Node.md（已从模板生成骨架，请填入改动清单/踩坑/遗留/衔接说明）"
    } else {
      Check $false "archive/$Node.md 存在" "从 archive/_template.md 手工创建（模板缺失，先修复 .nodes）"
    }
  } else {
    Check $true "archive/$Node.md 存在"
  }
}

# 信息级：压缩墓碑断链提示（不影响 verify 退出码，详情跑 check-tombstone）
$staleTombstone = Get-StaleTombstone
if ($null -ne $staleTombstone) {
  Write-Host "  [WARN] 存在疑似未补存档的压缩墓碑（$($staleTombstone.ToString('yyyy-MM-dd HH:mm:ss')) 后无 .nodes 写入）——不影响本次校验结论，详情跑 check-tombstone。"
}

if ($fails -gt 0) {
  Write-Host ""
  Write-Host "[FAIL] 存档校验未通过（$fails 项），按「修复」提示补齐后重跑本命令。" -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "[OK] 存档校验全部通过。" -ForegroundColor Green
exit 0
