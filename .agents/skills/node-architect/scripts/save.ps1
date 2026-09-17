#Requires -Version 5.1
<#
.SYNOPSIS
  .nodes 存档流程的机械动作：CONTEXT 写锁管理 + 存档完整性校验 + 一键存档/原子收口。
  模型只负责生成内容；加锁/删锁/超时判断/校验/归档骨架生成交给本脚本。
.EXAMPLE
  save.ps1 lock   -Session main
  save.ps1 unlock -Session main
  save.ps1 save   -Node 跑通登录流程 -Session main -ContextFile ctx-tmp.md [-Completed]
  save.ps1 commit -Node 跑通登录流程 -Session main -Batch 2 -ContextFile ctx-tmp.md
  save.ps1 verify -Node 跑通登录流程 -Session main [-Completed]
  save.ps1 verify-batch -Node 跑通登录流程 -Session main -Batch 2
  save.ps1 check-tombstone
  save.ps1 trim-decisions [-Keep 20]
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('lock', 'unlock', 'verify', 'verify-batch', 'commit', 'save', 'check-tombstone', 'trim-decisions')]
  [string]$Action,
  [string]$Project = (Get-Location).Path,
  [string]$Session = 'main',
  [string]$Node = '',
  [string]$Batch = '',
  [string]$ContextFile = '',
  [int]$Keep = 20,
  [switch]$Completed
)
$ErrorActionPreference = 'Stop'

# Force UTF-8 console encoding to prevent GBK mojibake
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

$Project  = (Resolve-Path $Project).Path
$nodesDir = Join-Path $Project '.nodes'
if (-not (Test-Path $nodesDir)) { throw "Not found: $nodesDir (run init-nodes.ps1 first)" }
if ($Session -match '[|\\/:*?"<>|\r\n]') { throw "Session id contains illegal chars: $Session" }
if ($Batch -and $Batch -notmatch '^\d+$') { throw "-Batch must be a number: $Batch" }
if ($Action -eq 'verify-batch') {
  if (-not $Node) { throw 'verify-batch requires -Node' }
  if (-not $Batch) { throw 'verify-batch requires -Batch <N>' }
  if ($Completed) { throw 'verify-batch does not use -Completed (use verify -Completed for node completion)' }
}
if ($Action -eq 'commit') {
  if (-not $Node) { throw 'commit requires -Node' }
  if (-not $Batch) { throw 'commit requires -Batch <N>' }
  if ($Completed) { throw 'commit does not use -Completed' }
  if (-not $ContextFile) { throw 'commit requires -ContextFile <path to staged CONTEXT.md content>' }
}
if ($Action -eq 'save') {
  if (-not $Node) { throw 'save requires -Node' }
  if (-not $ContextFile) { throw 'save requires -ContextFile <path to staged CONTEXT.md content>' }
}

$lockDir    = Join-Path $nodesDir '.lock.d'
$lockOwner  = Join-Path $lockDir 'owner'
$oldLockPath = Join-Path $nodesDir '.lock'  # backward compat
$timeoutMin = 10
$utf8NoBom  = New-Object System.Text.UTF8Encoding($false)

function Read-Utf8([string]$Path) {
  if (Test-Path -LiteralPath $Path) { return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) }
  return $null
}
function Write-Utf8([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

# Migrate old .lock file to .lock.d/ directory format
function Migrate-OldLock {
  if (Test-Path -LiteralPath $oldLockPath -PathType Leaf) {
    $content = Read-Utf8 $oldLockPath
    if (-not (Test-Path -LiteralPath $lockDir)) {
      New-Item -ItemType Directory -Path $lockDir -Force | Out-Null
    }
    Write-Utf8 $lockOwner $content
    Remove-Item -LiteralPath $oldLockPath -Force
    Write-Host "Migrated old .lock file to .lock.d/ directory lock"
  }
}

function Get-LockInfo {
  Migrate-OldLock
  if (-not (Test-Path -LiteralPath $lockDir -PathType Container)) { return $null }
  if (-not (Test-Path -LiteralPath $lockOwner)) { return $null }
  $parts = (Read-Utf8 $lockOwner) -split '\|', 2
  $ts = [datetime]::MinValue
  if ($parts.Count -ge 2) {
    try { $ts = [datetime]::ParseExact($parts[1].Trim(), 'yyyy-MM-ddTHH:mm:ss', [Globalization.CultureInfo]::InvariantCulture) } catch { $ts = [datetime]::MinValue }
  }
  $age = [double]::MaxValue
  if ($ts -ne [datetime]::MinValue) { $age = ((Get-Date) - $ts).TotalMinutes }
  New-Object PSObject -Property @{ Owner = "$($parts[0])"; Time = $ts; AgeMin = $age }
}

# Atomic lock acquisition using directory creation
function Acquire-Lock([string]$LockSession) {
  Migrate-OldLock
  $cur = Get-LockInfo
  if ($cur) {
    if ($cur.Owner -eq $LockSession) {
      Write-Utf8 $lockOwner "$LockSession|$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
      return @{ Ok = $true; Message = "Refreshed own lock ($LockSession)" }
    }
    if ($cur.AgeMin -lt $timeoutMin) {
      return @{ Ok = $false; Message = "Lock held by '$($cur.Owner)' ($([int]$cur.AgeMin) min ago), not timed out ($timeoutMin min). Retry later." }
    }
    Write-Warning "Overriding expired/stale lock (owner '$($cur.Owner)', $([int]$cur.AgeMin) min ago)"
    Remove-Item -LiteralPath $lockDir -Recurse -Force
  }
  # Atomic: mkdir fails if directory already exists (race-safe)
  try {
    New-Item -ItemType Directory -Path $lockDir -ErrorAction Stop | Out-Null
    Write-Utf8 $lockOwner "$LockSession|$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
    return @{ Ok = $true; Message = "Lock acquired ($LockSession)" }
  } catch {
    # Directory already exists = another session grabbed it between our check and mkdir
    $rival = Get-LockInfo
    $rivalName = if ($rival) { $rival.Owner } else { 'unknown' }
    return @{ Ok = $false; Message = "Lock race lost to '$rivalName'. Retry later." }
  }
}

function Release-Lock([string]$LockSession) {
  Migrate-OldLock
  $cur = Get-LockInfo
  if (-not $cur) { return @{ Ok = $true; Message = 'No lock to release' } }
  if ($cur.Owner -ne $LockSession -and $cur.AgeMin -lt $timeoutMin) {
    return @{ Ok = $false; Message = "Lock belongs to '$($cur.Owner)', not timed out. Cannot release another's lock." }
  }
  Remove-Item -LiteralPath $lockDir -Recurse -Force
  return @{ Ok = $true; Message = "Lock released ($LockSession)" }
}

# ---------- lock ----------
if ($Action -eq 'lock') {
  $r = Acquire-Lock $Session
  if ($r.Ok) { Write-Host "OK: $($r.Message)"; exit 0 }
  else { Write-Host "[FAIL] $($r.Message)" -ForegroundColor Red; exit 1 }
}

# ---------- unlock ----------
if ($Action -eq 'unlock') {
  $r = Release-Lock $Session
  if ($r.Ok) { Write-Host "OK: $($r.Message)"; exit 0 }
  else { Write-Host "[FAIL] $($r.Message)" -ForegroundColor Red; exit 1 }
}

# ---------- check-tombstone ----------
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
    Write-Host "OK: No unprocessed compaction tombstones."
    exit 0
  }
  Write-Host "[WARN] Compaction tombstone ($($stale.ToString('yyyy-MM-dd HH:mm:ss'))) has no subsequent .nodes writes — catch-up checkpoint may be missing." -ForegroundColor Yellow
  Write-Host "       Suggestion: review the previous session's compaction summary, write pending content into .nodes, then clean up the corresponding _compactions.log entry."
  exit 3
}

# ---------- trim-decisions ----------
if ($Action -eq 'trim-decisions') {
  $decPath = Join-Path $nodesDir 'DECISIONS.md'
  if (-not (Test-Path $decPath)) { Write-Host "DECISIONS.md not found"; exit 1 }
  $raw = Read-Utf8 $decPath
  $lines = $raw -split "`r?`n"

  # Find all decision-entry headings (any '## ' line; the file title uses a single '#')
  $sections = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^## ') { $sections += $i }
  }

  if ($sections.Count -le $Keep) {
    Write-Host "OK: DECISIONS.md has $($sections.Count) entries (threshold: $Keep). No trimming needed."
    exit 0
  }

  $cutIndex = $sections[$sections.Count - $Keep]  # keep last $Keep entries
  # Header = everything before first ## section (or before the cut point if fewer than Keep before it)
  $headerEnd = $sections[0]
  $header = ($lines[0..($headerEnd - 1)] -join "`r`n").TrimEnd()

  # Old entries to archive
  $oldEntries = ($lines[$headerEnd..($cutIndex - 1)] -join "`r`n").TrimEnd()
  # Remaining entries
  $remaining = ($lines[$cutIndex..($lines.Count - 1)] -join "`r`n").TrimEnd()

  # Write archive
  $archiveDir = Join-Path $nodesDir 'archive'
  if (-not (Test-Path $archiveDir)) { New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null }
  $dateStr = Get-Date -Format 'yyyy-MM-dd'
  $archPath = Join-Path $archiveDir "decisions-$dateStr.md"
  $archContent = "# Archived Decisions ($dateStr)`r`n`r`n> Trimmed from DECISIONS.md (kept latest $Keep entries).`r`n`r`n$oldEntries`r`n"
  Write-Utf8 $archPath $archContent
  Write-Host "Archived $($sections.Count - $Keep) old entries to archive/decisions-$dateStr.md"

  # Rewrite DECISIONS.md
  $newContent = "$header`r`n`r`n> Older entries archived: archive/decisions-*.md`r`n`r`n$remaining`r`n"
  Write-Utf8 $decPath $newContent
  Write-Host "OK: DECISIONS.md trimmed to $Keep entries."
  exit 0
}

# ---------- verify-batch ----------
function Invoke-VerifyBatch {
  param([string]$VNode, [string]$VSession, [int]$VBatch)
  $Node = $VNode
  $Session = $VSession
  $n = $VBatch
  $n1 = $n + 1
  $fails = 0
  $ctxPath  = Join-Path $nodesDir 'CONTEXT.md'
  $progPath = Join-Path $nodesDir 'PROGRESS.md'
  $sessPath = Join-Path $nodesDir "SESSIONS\$Session.md"

  $hdr = 'Batch checkpoint verify (node: ' + $Node + ' | session: ' + $Session + ' | batch ' + $n + ')'
  Write-Host $hdr

  if (Test-Path $ctxPath) { Write-Host '  [OK]   CONTEXT.md exists' } else { $fails++; Write-Host '  [FAIL] CONTEXT.md exists' -ForegroundColor Red; Write-Host '         Fix: run init-nodes.ps1' -ForegroundColor Yellow }
  if (Test-Path $progPath) { Write-Host '  [OK]   PROGRESS.md exists' } else { $fails++; Write-Host '  [FAIL] PROGRESS.md exists' -ForegroundColor Red; Write-Host '         Fix: run init-nodes.ps1' -ForegroundColor Yellow }
  if (Test-Path (Join-Path $nodesDir 'SESSIONS')) { Write-Host '  [OK]   SESSIONS/ directory exists' } else { $fails++; Write-Host '  [FAIL] SESSIONS/ directory exists' -ForegroundColor Red; Write-Host '         Fix: run init-nodes.ps1' -ForegroundColor Yellow }

  $prog = Read-Utf8 $progPath
  $nodeLines = @()
  if ($prog) { $nodeLines = @(($prog -split "`r?`n") | Where-Object { $_ -match '^\|' -and $_.Contains($Node) }) }
  if ($nodeLines.Count -gt 0) {
    Write-Host ('  [OK]   PROGRESS.md contains node: ' + $Node)
  } else {
    $fails++
    Write-Host ('  [FAIL] PROGRESS.md contains node: ' + $Node) -ForegroundColor Red
    Write-Host '         Fix: register node in PROGRESS.md (name/criteria/owner/status)' -ForegroundColor Yellow
  }

  # Batch-specific A: status check
  $statusOk = $false
  $nextPat = ('(?<!\d)' + $n1 + '/\d+')
  $nextLbl = 'batch ' + $n1
  foreach ($l in $nodeLines) {
    if ($l -match $nextPat) { $statusOk = $true; break }
    if ($l -match '待验收') { $statusOk = $true; break }
  }
  $statusMsg = 'PROGRESS node status is batch ' + $n1 + '/M or pending-review'
  if ($statusOk) {
    Write-Host ('  [OK]   ' + $statusMsg)
  } else {
    $fails++
    Write-Host ('  [FAIL] ' + $statusMsg) -ForegroundColor Red
    Write-Host ('         Fix: update PROGRESS status to batch ' + $n1 + '/M (continuing) or pending-review (all batches done)') -ForegroundColor Yellow
  }

  # SESSIONS non-empty
  $sessOk = (Test-Path $sessPath) -and ((Get-Item -LiteralPath $sessPath -Force).Length -gt 0)
  if ($sessOk) {
    Write-Host ('  [OK]   SESSIONS/' + $Session + '.md non-empty')
  } else {
    $fails++
    Write-Host ('  [FAIL] SESSIONS/' + $Session + '.md non-empty') -ForegroundColor Red
    Write-Host '         Fix: write session state per SESSIONS/_template.md' -ForegroundColor Yellow
  }

  # Batch-specific B: completion marker
  $sessTxt = $null
  if (Test-Path $sessPath) { $sessTxt = Read-Utf8 $sessPath }
  $mark1 = '已完成批' + $n
  $mark2 = '批' + $n + ' 已完成'
  $mark3 = 'batch ' + $n + ' done'
  $mark4 = 'completed batch ' + $n
  $markerOk = $sessTxt -and ($sessTxt.Contains($mark1) -or $sessTxt.Contains($mark2) -or $sessTxt.Contains($mark3) -or $sessTxt.Contains($mark4))
  $markerMsg = 'SESSIONS contains batch ' + $n + ' completion marker'
  if ($markerOk) {
    Write-Host ('  [OK]   ' + $markerMsg)
  } else {
    $fails++
    Write-Host ('  [FAIL] ' + $markerMsg) -ForegroundColor Red
    $fixMsg = '         Fix: write in SESSIONS: completed batch ' + $n + ': [output]; batch ' + $n1 + ' starts from [file/step]'
    Write-Host $fixMsg -ForegroundColor Yellow
  }

  # CONTEXT today
  $ctx = Read-Utf8 $ctxPath
  $ctxOk = [bool]$ctx -and $ctx.Contains((Get-Date -Format 'yyyy-MM-dd'))
  if ($ctxOk) {
    Write-Host '  [OK]   CONTEXT.md last-updated is today'
  } else {
    $fails++
    Write-Host '  [FAIL] CONTEXT.md last-updated is today' -ForegroundColor Red
    Write-Host '         Fix: rewrite CONTEXT.md and set header date to today' -ForegroundColor Yellow
  }

  # Batch-specific C: CONTEXT freshness
  $ctxFresh = [bool]$ctx -and $ctx.Contains($Node)
  $ctxNextOk = $false
  if ($ctx) {
    $lines = $ctx -split "`r?`n"
    for ($li = 0; $li -lt $lines.Count; $li++) {
      if ($lines[$li].Contains('下一步')) {
        foreach ($l in @($lines[$li]) + @($lines[($li+1)..([Math]::Min($li+3, $lines.Count-1))])) {
          if (($l -match ('(?<!\d)' + $n1 + '(?!\d)')) -or $l.Contains('待验收')) { $ctxNextOk = $true; break }
        }
        break
      }
    }
  }
  $ctxFreshMsg = 'CONTEXT.md contains node and next-step points to batch ' + $n1 + ' or pending-review'
  if ($ctxFresh -and $ctxNextOk) {
    Write-Host ('  [OK]   ' + $ctxFreshMsg)
  } else {
    $fails++
    Write-Host ('  [FAIL] ' + $ctxFreshMsg) -ForegroundColor Red
    $fixMsg = '         Fix: rewrite CONTEXT.md next-step must point to batch ' + $n1 + ' or pending-review'
    Write-Host $fixMsg -ForegroundColor Yellow
  }

  # Info: tombstone (does not affect exit code)
  $staleTombstone = Get-StaleTombstone
  if ($null -ne $staleTombstone) {
    Write-Host ('  [WARN] Compaction tombstone (' + $staleTombstone.ToString('yyyy-MM-dd HH:mm:ss') + ') with no subsequent .nodes writes — run check-tombstone for details.')
  }

  if ($fails -gt 0) {
    Write-Host ""
    Write-Host "[FAIL] Batch checkpoint verify failed ($fails items). Fix and re-run." -ForegroundColor Red
    return $fails
  }
  Write-Host ""
  Write-Host '[OK] Batch checkpoint verify passed.' -ForegroundColor Green
  return 0
}

if ($Action -eq 'verify-batch') {
  $fails = Invoke-VerifyBatch -VNode $Node -VSession $Session -VBatch ([int]$Batch)
  if ($fails -gt 0) { exit 1 } else { exit 0 }
}

# ---------- commit: atomic batch close (lock->CONTEXT->unlock->verify-batch) ----------
if ($Action -eq 'commit') {
  $ctxSrcPath = if ([System.IO.Path]::IsPathRooted($ContextFile)) { $ContextFile } else { Join-Path $Project $ContextFile }
  if (-not (Test-Path -LiteralPath $ctxSrcPath)) { throw "ContextFile not found: $ctxSrcPath" }
  $ctxDstPath = Join-Path $nodesDir 'CONTEXT.md'
  if ((Resolve-Path -LiteralPath $ctxSrcPath).Path -ieq (Resolve-Path -LiteralPath $ctxDstPath).Path) { throw 'ContextFile must not be the same as CONTEXT.md' }

  $r = Acquire-Lock $Session
  if (-not $r.Ok) {
    Write-Host "[FAIL] $($r.Message) ContextFile preserved for retry." -ForegroundColor Red
    exit 1
  }

  Write-Utf8 $ctxDstPath (Read-Utf8 $ctxSrcPath)
  Remove-Item -LiteralPath $ctxSrcPath -Force
  Write-Host 'OK: CONTEXT.md atomically replaced, staged file cleaned'

  $null = Release-Lock $Session
  Write-Host "OK: Lock released ($Session)"

  $fails = Invoke-VerifyBatch -VNode $Node -VSession $Session -VBatch ([int]$Batch)
  if ($fails -gt 0) {
    Write-Host "[FAIL] Post-commit verify failed ($fails items) — CONTEXT.md is safely written. Fix per above, then re-run verify-batch." -ForegroundColor Red
    exit 1
  }
  exit 0
}

# ---------- save: one-shot checkpoint (lock->CONTEXT->unlock->verify, non-batch) ----------
if ($Action -eq 'save') {
  $ctxSrcPath = if ([System.IO.Path]::IsPathRooted($ContextFile)) { $ContextFile } else { Join-Path $Project $ContextFile }
  if (-not (Test-Path -LiteralPath $ctxSrcPath)) { throw "ContextFile not found: $ctxSrcPath" }
  $ctxDstPath = Join-Path $nodesDir 'CONTEXT.md'
  if ((Resolve-Path -LiteralPath $ctxSrcPath).Path -ieq (Resolve-Path -LiteralPath $ctxDstPath).Path) { throw 'ContextFile must not be the same as CONTEXT.md' }

  $r = Acquire-Lock $Session
  if (-not $r.Ok) {
    Write-Host "[FAIL] $($r.Message) ContextFile preserved for retry." -ForegroundColor Red
    exit 1
  }

  Write-Utf8 $ctxDstPath (Read-Utf8 $ctxSrcPath)
  Remove-Item -LiteralPath $ctxSrcPath -Force
  Write-Host 'OK: CONTEXT.md atomically replaced, staged file cleaned'

  $null = Release-Lock $Session
  Write-Host "OK: Lock released ($Session)"

  # Run standard verify
  # Fall through to verify section below by resetting Action
  $Action = 'verify'
}

# ---------- verify: checkpoint completeness ----------
if ($Node -and $Node -match '[\\/:*?"<>|]') { throw "Node name contains illegal filename chars: $Node" }
$fails = 0
function Check([bool]$Ok, [string]$Label, [string]$Fix) {
  if ($Ok) {
    Write-Host "  [OK]   $Label"
  } else {
    Write-Host "  [FAIL] $Label" -ForegroundColor Red
    if ($Fix) { Write-Host "         Fix: $Fix" -ForegroundColor Yellow }
    $script:fails++
  }
}

$nodeLabel = if ($Node) { $Node } else { '-' }
$modeLabel = if ($Completed) { 'node-complete' } else { 'mid-checkpoint' }
Write-Host "Checkpoint verify (node: $nodeLabel | session: $Session | $modeLabel)"

$ctxPath  = Join-Path $nodesDir 'CONTEXT.md'
$progPath = Join-Path $nodesDir 'PROGRESS.md'
$decPath  = Join-Path $nodesDir 'DECISIONS.md'
$sessPath = Join-Path $nodesDir "SESSIONS\$Session.md"

Check (Test-Path $ctxPath)  'CONTEXT.md exists'   'Run init-nodes.ps1'
Check (Test-Path $progPath) 'PROGRESS.md exists'  'Run init-nodes.ps1'
Check (Test-Path $decPath)  'DECISIONS.md exists'  'Run init-nodes.ps1'
Check (Test-Path (Join-Path $nodesDir 'SESSIONS')) 'SESSIONS/ directory exists' 'Run init-nodes.ps1'

if ($Node) {
  $prog = Read-Utf8 $progPath
  Check ([bool]$prog -and $prog.Contains($Node)) "PROGRESS.md contains node: $Node" "Register the node in PROGRESS.md"
}

$sessOk = (Test-Path $sessPath) -and ((Get-Item -LiteralPath $sessPath -Force).Length -gt 0)
Check $sessOk "SESSIONS/$Session.md non-empty" "Write session state per SESSIONS/_template.md"

$ctx = Read-Utf8 $ctxPath
Check ([bool]$ctx -and $ctx.Contains((Get-Date -Format 'yyyy-MM-dd'))) 'CONTEXT.md last-updated is today' 'Rewrite CONTEXT.md with today date'

if ($Completed) {
  if (-not $Node) { throw '-Completed requires -Node' }
  $archPath = Join-Path $nodesDir "archive\$Node.md"
  if (-not (Test-Path $archPath)) {
    $tplPath = Join-Path $nodesDir 'archive\_template.md'
    if (Test-Path $tplPath) {
      Write-Utf8 $archPath ((Read-Utf8 $tplPath).Replace('{节点名}', $Node))
      Write-Host "  [OK]   archive/$Node.md (skeleton generated from template — fill in details)"
    } else {
      Check $false "archive/$Node.md exists" "Create from archive/_template.md (template missing, fix .nodes first)"
    }
  } else {
    Check $true "archive/$Node.md exists"
  }
}

# Info-level: DECISIONS.md line count warning
if (Test-Path $decPath) {
  $decLines = @((Read-Utf8 $decPath) -split "`r?`n").Count
  if ($decLines -gt 200) {
    Write-Host "  [WARN] DECISIONS.md has $decLines lines (threshold: 200). Run: save.ps1 trim-decisions" -ForegroundColor Yellow
  }
}

# Info-level: stale pending-review nodes
if (Test-Path $progPath) {
  $progTxt = Read-Utf8 $progPath
  $progLines = $progTxt -split "`r?`n"
  foreach ($pl in $progLines) {
    if ($pl -match '^\|' -and $pl -match '待验收' -and $pl -match '(\d{4}-\d{2}-\d{2})\s*\|?\s*$') {
      $nodeDate = $Matches[1]
      try {
        $days = ((Get-Date) - [datetime]::ParseExact($nodeDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)).Days
        if ($days -gt 14) {
          # Extract node name (second | delimited field)
          $fields = $pl -split '\|'
          $nname = if ($fields.Count -ge 3) { $fields[2].Trim() } else { '?' }
          Write-Host "  [WARN] Node '$nname' has been pending-review for $days days" -ForegroundColor Yellow
        }
      } catch { }
    }
  }
}

# Info-level: tombstone
$staleTombstone = Get-StaleTombstone
if ($null -ne $staleTombstone) {
  Write-Host "  [WARN] Compaction tombstone ($($staleTombstone.ToString('yyyy-MM-dd HH:mm:ss'))) with no subsequent .nodes writes — run check-tombstone for details."
}

if ($fails -gt 0) {
  Write-Host ""
  Write-Host "[FAIL] Checkpoint verify failed ($fails items). Fix and re-run." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "[OK] Checkpoint verify passed." -ForegroundColor Green
exit 0
