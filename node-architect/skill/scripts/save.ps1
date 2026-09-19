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
  save.ps1 checkpoint -Node 跑通登录流程 -Session main -Recon "..." [-Note "..."]
  save.ps1 review-audit [-Over 14]
  save.ps1 check-tombstone
  save.ps1 trim-decisions [-Keep 20]
  save.ps1 trim-context [-Apply] [[-MaxCtxLines 60] [-MaxCtxLineChars 6000]]
  save.ps1 trim-progress [-Apply] [[-MaxProgLineChars 600] [-NodeColChars 120] [-CriteriaColChars 250] [-StatusColChars 200]]
  # v1.7.0 cap gate: save/commit/verify hard-check core ledger caps
  #   (CONTEXT <=60 lines & every line <=6000 chars; PROGRESS table rows <=600 chars;
  #    DECISIONS <=200 lines). Violation -> exit 4 (save/commit) or verify FAIL,
  #    one nudge per 10-min window (marker .nodes/.cap-nudge), everything else fail-open.
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('lock', 'unlock', 'verify', 'verify-batch', 'commit', 'save', 'checkpoint', 'review-audit', 'check-tombstone', 'trim-decisions', 'trim-context', 'trim-progress')]
  [string]$Action,
  [string]$Project = (Get-Location).Path,
  [string]$Session = 'main',
  [string]$Node = '',
  [string]$Batch = '',
  [string]$ContextFile = '',
  [int]$Keep = 20,
  [switch]$Completed,
  [string]$Note = '',
  [string]$Recon = '',
  [int]$Over = 14,
  [switch]$Apply,
  [int]$MaxCtxLines = 60,
  [int]$MaxCtxLineChars = 6000,
  [int]$MaxProgLineChars = 600,
  [int]$NodeColChars = 120,
  [int]$CriteriaColChars = 250,
  [int]$StatusColChars = 200
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
if ($Action -eq 'checkpoint') {
  if (-not $Node) { throw 'checkpoint requires -Node' }
  if (-not $Recon -and -not $Note) { throw 'checkpoint requires -Recon and/or -Note' }
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

# ---------- cap gate helpers (v1.7.0) ----------
# Hard caps for core ledger files. Semantics borrowed from skill-memory-bank:
# a violation blocks ONCE per 10-min window (marker .nodes/.cap-nudge keyed by violation
# fingerprint); re-running the same command proceeds with a WARN. Everything except the
# cap violation itself is fail-open (missing file / parse error never blocks a save).
$capNudgePath = Join-Path $nodesDir '.cap-nudge'

function Get-CapViolations([string]$CtxText, [string]$ProgText, [string]$DecText) {
  $v = @()
  if ($CtxText) {
    $cl = @($CtxText -split "`r?`n")
    if ($cl.Count -gt $MaxCtxLines) { $v += @{ File = 'CONTEXT.md'; Code = 'lines'; Detail = "$($cl.Count) lines > $MaxCtxLines" } }
    $long = @(); for ($i = 0; $i -lt $cl.Count; $i++) { if ($cl[$i].Length -gt $MaxCtxLineChars) { $long += ($i + 1) } }
    if ($long.Count -gt 0) { $v += @{ File = 'CONTEXT.md'; Code = 'line-chars'; Detail = "line(s) $($long -join ',') > $MaxCtxLineChars chars" } }
  }
  if ($ProgText) {
    $rows = @(($ProgText -split "`r?`n") | Where-Object { $_ -match '^\|\s*\d+\s*\|' -and $_.Length -gt $MaxProgLineChars })
    if ($rows.Count -gt 0) { $v += @{ File = 'PROGRESS.md'; Code = 'row-chars'; Detail = "$($rows.Count) table row(s) > $MaxProgLineChars chars" } }
  }
  if ($DecText) {
    $dl = @($DecText -split "`r?`n").Count
    if ($dl -gt 200) { $v += @{ File = 'DECISIONS.md'; Code = 'lines'; Detail = "$dl lines > 200" } }
  }
  return $v
}

function Get-CapFingerprint([array]$Violations) {
  return (($Violations | ForEach-Object { "$($_.File):$($_.Code)" } | Sort-Object) -join ' | ')
}

function Test-CapNudgeFresh([string]$Fingerprint) {
  if (-not (Test-Path -LiteralPath $capNudgePath)) { return $false }
  try {
    $raw = Read-Utf8 $capNudgePath
    if ($null -eq $raw -or $raw.Trim() -ne $Fingerprint) { return $false }
    $ageMin = ((Get-Date) - (Get-Item -LiteralPath $capNudgePath).LastWriteTime).TotalMinutes
    return ($ageMin -lt 10)
  } catch { return $false }
}

# Gate for save/commit. Returns $true when the action must be blocked (caller exits 4).
# $StagedCtx = staged CONTEXT content (checked instead of the on-disk copy, since save replaces it).
function Test-CapBlocked([string]$Stage, [string]$StagedCtx) {
  $ctxTxt = $null; $progTxt = $null; $decTxt = $null
  try {
    $progTxt = Read-Utf8 (Join-Path $nodesDir 'PROGRESS.md')
    $decTxt  = Read-Utf8 (Join-Path $nodesDir 'DECISIONS.md')
  } catch { return $false }
  if ($StagedCtx) { $ctxTxt = $StagedCtx } else { try { $ctxTxt = Read-Utf8 (Join-Path $nodesDir 'CONTEXT.md') } catch { $ctxTxt = $null } }
  $viol = @()
  try { $viol = @(Get-CapViolations $ctxTxt $progTxt $decTxt) } catch { return $false }
  if ($viol.Count -eq 0) {
    if (Test-Path -LiteralPath $capNudgePath) { Remove-Item -LiteralPath $capNudgePath -Force -ErrorAction SilentlyContinue }
    return $false
  }
  $fp = Get-CapFingerprint $viol
  if (Test-CapNudgeFresh $fp) {
    Write-Host "  [WARN] Cap violations present (nudge already shown within 10-min window, proceeding): $fp" -ForegroundColor Yellow
    return $false
  }
  try { Write-Utf8 $capNudgePath $fp } catch { }
  Write-Host "[CAP-GATE] Core ledger files exceed hard caps ($Stage). Blocked this once; fix then re-run." -ForegroundColor Red
  foreach ($x in $viol) { Write-Host ("  - {0} [{1}] {2}" -f $x.File, $x.Code, $x.Detail) -ForegroundColor Red }
  Write-Host '  Fix (dry-run first, then add -Apply):' -ForegroundColor Yellow
  Write-Host '    save.ps1 trim-context    # roll finished entries out of CONTEXT.md -> archive/' -ForegroundColor Yellow
  Write-Host '    save.ps1 trim-progress   # truncate oversized PROGRESS.md rows -> archive/' -ForegroundColor Yellow
  Write-Host '    save.ps1 trim-decisions  # if DECISIONS.md exceeds the 200-line cap' -ForegroundColor Yellow
  Write-Host '  Re-running the SAME command within 10 minutes proceeds anyway (one nudge per window).' -ForegroundColor Yellow
  return $true
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

# ---------- checkpoint (v1.6.1) ----------
# Lightweight mid-session marker: appends ONE line to SESSIONS/<session>.md.
# No lock, no CONTEXT write. CJK chars built from code points (BOM-less PS5.1 ANSI-parse safety):
# 0x4FA6 0x5BDF = zhen-cha (recon marker).
if ($Action -eq 'checkpoint') {
  $zhenCha = -join ([char]0x4FA6, [char]0x5BDF)
  $sessDir = Join-Path $nodesDir 'SESSIONS'
  if (-not (Test-Path -LiteralPath $sessDir)) { New-Item -ItemType Directory -Path $sessDir -Force | Out-Null }
  $sessPath = Join-Path $sessDir "$Session.md"
  $prev = Read-Utf8 $sessPath
  if ($null -eq $prev) { $prev = "# session $Session state" }
  $parts = @("- [checkpoint $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')] node=$Node")
  if ($Recon) { $parts += "$zhenCha=$Recon" }
  if ($Note)  { $parts += "note=$Note" }
  Write-Utf8 $sessPath ($prev.TrimEnd() + "`r`n" + ($parts -join ' - ') + "`r`n")
  Write-Host "OK: checkpoint appended to SESSIONS/$Session.md (node=$Node)"
  exit 0
}

# ---------- review-audit (v1.6.1) ----------
# Convergence valve for pending-review nodes (exit 3 = overdue found).
# CJK match via \uXXXX escapes for BOM-less ANSI-parse safety:
# \u5F85\u9A8C\u6536 = dai-yan-shou (pending-review).
if ($Action -eq 'review-audit') {
  $progPathAudit = Join-Path $nodesDir 'PROGRESS.md'
  if (-not (Test-Path -LiteralPath $progPathAudit)) { Write-Host 'PROGRESS.md not found'; exit 1 }
  $progLinesAudit = (Read-Utf8 $progPathAudit) -split "`r?`n"
  $rowsAudit = @($progLinesAudit | Where-Object { $_ -match '^\|' -and $_ -match '\u5F85\u9A8C\u6536' })
  $overdueCount = 0
  Write-Host "Pending-review audit (threshold > $Over days): $($rowsAudit.Count) node(s) pending review"
  foreach ($l in $rowsAudit) {
    if ($l -match '(\d{4}-\d{2}-\d{2})\s*\|?\s*$') {
      $nodeDate = $Matches[1]
      try {
        $daysAudit = ((Get-Date) - [datetime]::ParseExact($nodeDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)).Days
        if ($daysAudit -gt $Over) {
          $overdueCount++
          $fieldsAudit = $l -split '\|'
          $nnameAudit = if ($fieldsAudit.Count -ge 3) { $fieldsAudit[2].Trim() } else { '?' }
          if ($nnameAudit.Length -gt 48) { $nnameAudit = $nnameAudit.Substring(0, 48) + '...' }
          Write-Host "  [OVERDUE ${daysAudit}d] $nnameAudit"
        }
      } catch { }
    }
  }
  if ($overdueCount -gt 0) {
    Write-Host ""
    Write-Host "[WARN] $overdueCount overdue node(s). Actions per node: accept (mark reviewed) / deprecate / keep with reason." -ForegroundColor Yellow
    exit 3
  }
  Write-Host ''
  Write-Host 'OK: No overdue pending-review nodes.'
  exit 0
}

# ---------- trim-context (v1.7.0) ----------
# Rolls finished content out of CONTEXT.md into archive/context-<date>.md:
#   Rule A: blockquote line (> ...) longer than the line-char cap -> archived, replaced by a short dated pointer.
#   Rule B: current-node list entries whose "#<id>" is immediately followed by the done emoji (\u2705) -> archived.
# Conservative by design: in-progress / plan / non-node lines are never touched.
# Default dry-run; -Apply writes (archive append is same-day safe).
if ($Action -eq 'trim-context') {
  $ctxPathT = Join-Path $nodesDir 'CONTEXT.md'
  if (-not (Test-Path -LiteralPath $ctxPathT)) { Write-Host 'CONTEXT.md not found'; exit 1 }
  $dateStr = Get-Date -Format 'yyyy-MM-dd'
  $archRel = "archive/context-$dateStr.md"
  $linesT = @((Read-Utf8 $ctxPathT) -split "`r?`n")
  $kept = New-Object System.Collections.Generic.List[string]
  $rolled = New-Object System.Collections.Generic.List[string]
  $doneEntry = '^\s*-\s*\*{0,2}#\d+\s*\u2705'
  foreach ($ln in $linesT) {
    if ($ln -match '^\s*>' -and $ln.Length -gt $MaxCtxLineChars) {
      $rolled.Add($ln)
      $kept.Add('> ' + [char]0x6700 + [char]0x540E + [char]0x66F4 + [char]0x65B0 + ': ' + $dateStr + ' (full history -> ' + $archRel + ')')
    } elseif ($ln -match $doneEntry) {
      $rolled.Add($ln)
    } else {
      $kept.Add($ln)
    }
  }
  $newCount = $kept.Count
  $maxLine = 0; foreach ($k in $kept) { if ($k.Length -gt $maxLine) { $maxLine = $k.Length } }
  Write-Host "trim-context: would roll out $($rolled.Count) line(s); CONTEXT.md -> $($newCount) lines (cap $MaxCtxLines), longest kept line $maxLine chars (cap $MaxCtxLineChars)"
  if ($rolled.Count -eq 0) { Write-Host 'OK: nothing to roll out.'; exit 0 }
  if (-not $Apply) { Write-Host 'Dry-run only. Re-run with -Apply to write the archive and rewrite CONTEXT.md.'; exit 0 }
  $archiveDir = Join-Path $nodesDir 'archive'
  if (-not (Test-Path $archiveDir)) { New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null }
  $archPath = Join-Path $nodesDir $archRel
  $archBody = ($rolled -join "`r`n").TrimEnd()
  if (Test-Path -LiteralPath $archPath) {
    $archContent = (Read-Utf8 $archPath).TrimEnd() + "`r`n`r`n" + $archBody + "`r`n"
  } else {
    $archContent = "# CONTEXT rolled-out entries ($dateStr)`r`n`r`n> Moved by trim-context (node-architect v1.7.0). Original order preserved.`r`n`r`n$archBody`r`n"
  }
  Write-Utf8 $archPath $archContent
  Write-Utf8 $ctxPathT (($kept -join "`r`n").TrimEnd() + "`r`n")
  Write-Host "OK: archived $($rolled.Count) line(s) to $archRel; CONTEXT.md rewritten."
  exit 0
}

# ---------- trim-progress (v1.7.0) ----------
# Truncates oversized table rows in PROGRESS.md to per-column budgets; each full original
# row is archived under "## #<id>". Default dry-run; -Apply writes (same-day append safe).
if ($Action -eq 'trim-progress') {
  $progPathT = Join-Path $nodesDir 'PROGRESS.md'
  if (-not (Test-Path -LiteralPath $progPathT)) { Write-Host 'PROGRESS.md not found'; exit 1 }
  $dateStr = Get-Date -Format 'yyyy-MM-dd'
  $archRel = "archive/progress-rows-$dateStr.md"
  $linesP = @((Read-Utf8 $progPathT) -split "`r?`n")
  $outLines = New-Object System.Collections.Generic.List[string]
  $sections = New-Object System.Collections.Generic.List[string]
  $inProg = [string]([char]0xD83D + [char]0xDFE1)   # U+1F7E1 in-progress dot (surrogate pair)
  $ellip = [char]0x2026
  foreach ($ln in $linesP) {
    if ($ln -match '^\|\s*\d+\s*\|' -and $ln.Length -gt $MaxProgLineChars) {
      # Both-end anchor: | id | ...middle... | owner | date |  (cells may contain raw '|' chars)
      if ($ln -notmatch '^\|\s*(\d+)\s*\|(.*)\|\s*([^\|]*?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*$') {
        $outLines.Add($ln); Write-Host "  skip row (unparsable tail): $($ln.Substring(0, [Math]::Min(40, $ln.Length)))..."; continue
      }
      $nodeId = $Matches[1]; $middle = $Matches[2]; $owner = $Matches[3].Trim(); $dateCol = $Matches[4]
      $segs = @($middle -split '\|')
      if ($segs.Count -lt 3) { $outLines.Add($ln); Write-Host "  skip row (too few middle cells): #$nodeId"; continue }
      # first middle cell = node name, last = status, everything between = criteria (absorbs embedded pipes)
      $nameSeg = $segs[0].Trim()
      $statusSeg = $segs[$segs.Count - 1].Trim()
      $critSeg = (($segs[1..($segs.Count - 2)]) -join '|').Trim()
      $nameNew = if ($nameSeg.Length -gt $NodeColChars) { $nameSeg.Substring(0, $NodeColChars - 1) + $ellip } else { $nameSeg }
      $statusNew = if ($statusSeg.Length -gt $StatusColChars) { $statusSeg.Substring(0, $StatusColChars - 1) + $ellip } else { $statusSeg }
      $overhead = $nodeId.Length + $owner.Length + $dateCol.Length + 24   # 7 pipes + 12 pad spaces + margin
      $critBudget = $MaxProgLineChars - $overhead - $nameNew.Length - $statusNew.Length
      if ($critBudget -gt $CriteriaColChars) { $critBudget = $CriteriaColChars }
      if ($critBudget -lt 40) { $critBudget = 40 }
      $critNew = if ($critSeg.Length -gt $critBudget) { $critSeg.Substring(0, $critBudget - 1) + $ellip } else { $critSeg }
      $new = ('| ' + $nodeId + ' | ' + $nameNew + ' | ' + $critNew + ' | ' + $statusNew + ' | ' + $owner + ' | ' + $dateCol + ' |')
      if ($new.Length -gt $MaxProgLineChars) {
        # final squeeze: shave the excess off the criteria cell (name+status+overhead alone always fit)
        $excess = $new.Length - $MaxProgLineChars
        $keepAt = [Math]::Max(1, $critNew.Length - $excess - 1)
        $critNew = $critNew.Substring(0, $keepAt) + $ellip
        $new = ('| ' + $nodeId + ' | ' + $nameNew + ' | ' + $critNew + ' | ' + $statusNew + ' | ' + $owner + ' | ' + $dateCol + ' |')
      }
      $outLines.Add($new)
      $note = ''
      if ($ln.Contains($inProg)) { $note = "`r`n> NOTE: in-progress node -- full row preserved below (do not lose current state).`r`n" }
      $sections.Add("## #$nodeId$note`r`n$ln")
      Write-Host ("  row #$nodeId : $($ln.Length) -> $($new.Length) chars")
    } else {
      $outLines.Add($ln)
    }
  }
  if ($sections.Count -eq 0) { Write-Host "OK: no PROGRESS.md rows exceed $MaxProgLineChars chars."; exit 0 }
  Write-Host "trim-progress: $($sections.Count) row(s) affected."
  if (-not $Apply) { Write-Host 'Dry-run only. Re-run with -Apply to write the archive and rewrite PROGRESS.md.'; exit 0 }
  $archPath = Join-Path $nodesDir $archRel
  $archBody = ($sections -join "`r`n`r`n")
  if (Test-Path -LiteralPath $archPath) {
    $archContent = (Read-Utf8 $archPath).TrimEnd() + "`r`n`r`n" + $archBody + "`r`n"
  } else {
    $archContent = "# PROGRESS rolled-out rows ($dateStr)`r`n`r`n> Full original rows moved by trim-progress (node-architect v1.7.0). Locate by '## #<id>'.`r`n`r`n$archBody`r`n"
  }
  Write-Utf8 $archPath $archContent
  Write-Utf8 $progPathT (($outLines -join "`r`n").TrimEnd() + "`r`n")
  Write-Host "OK: $($sections.Count) full row(s) archived to $archRel; PROGRESS.md rewritten within caps."
  exit 0
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

  # v1.7.0 line-aware keep: shrink the keep-count until remaining physical lines fit the
  # 200-line cap (floor: 5 entries). Entry-count threshold alone is not sufficient --
  # 20 multi-line entries can still exceed the cap (e.g. 203 lines).
  $keepN = [Math]::Min($Keep, $sections.Count)
  $headerEnd = $sections[0]
  $cutIndex = 0
  $remLines = 0
  while ($true) {
    $cutIndex = $sections[$sections.Count - $keepN]
    $remLines = $headerEnd + ($lines.Count - $cutIndex) + 4   # header + kept entries + inserted archive-note block
    if ($remLines -le 200 -or $keepN -le 5) { break }
    $keepN--
  }
  if ($keepN -ge $sections.Count) {
    Write-Host "OK: DECISIONS.md has $($sections.Count) entries ($($lines.Count) lines). No trimming needed."
    exit 0
  }
  if ($remLines -gt 200 -and $keepN -le 5) {
    Write-Host "[WARN] DECISIONS.md still $remLines lines at the 5-entry floor - largest entries are very tall; consider a manual split." -ForegroundColor Yellow
  }

  # Header = everything before first ## section (or before the cut point if fewer than Keep before it)
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
  $archContent = if (Test-Path -LiteralPath $archPath) { (Read-Utf8 $archPath).TrimEnd() + "`r`n`r`n" + $oldEntries + "`r`n" } else { "# Archived Decisions ($dateStr)`r`n`r`n> Trimmed from DECISIONS.md (kept latest $Keep entries).`r`n`r`n$oldEntries`r`n" }
  Write-Utf8 $archPath $archContent
  Write-Host "Archived $($sections.Count - $keepN) old entries to archive/decisions-$dateStr.md"

  # Rewrite DECISIONS.md
  $newContent = "$header`r`n`r`n> Older entries archived: archive/decisions-*.md`r`n`r`n$remaining`r`n"
  Write-Utf8 $decPath $newContent
  Write-Host "OK: DECISIONS.md trimmed to $keepN entries ($remLines lines <= 200 cap)."
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

  # Batch-specific D (v1.6.0 efficiency protocol): plans file recon (batch 1) / calibration (batch 2+)
  # NOTE: keep this block ASCII-only -- this script ships BOM-less and Windows PowerShell 5.1
  #       parses BOM-less scripts as ANSI; CJK literals break parsing (AGENTS.md encoding rule).
  #       CJK matching is done via \uXXXX regex escapes: 5f00 5de5 4fa6 5bdf = kai-gong zhen-cha (recon), 6279 = pi (batch)
  $plansPath = Join-Path $nodesDir ('plans\' + $VNode + '.md')
  if ($n -eq 1) {
    $reconOk = $false; $reconFix = 'create .nodes/plans/' + $VNode + '.md from template'
    if (Test-Path $plansPath) {
      $plansTxt = Read-Utf8 $plansPath
      $plines = @(($plansTxt -split "`r?`n"))
      $sIdx = -1; $eIdx = $plines.Count
      for ($i = 0; $i -lt $plines.Count; $i++) {
        if ($sIdx -lt 0 -and $plines[$i] -match '^#{1,3}\s*\u5f00\u5de5\u4fa6\u5bdf') { $sIdx = $i + 1; continue }
        if ($sIdx -ge 0 -and $plines[$i] -match '^(#{1,3}\s|\|)') { $eIdx = $i; break }
      }
      if ($sIdx -lt 0) {
        $reconOk = $true  # legacy plan (pre-v1.5.0, no recon section): skip
        $reconFix = ''
      } else {
        $seg = ''
        if ($eIdx -gt $sIdx) { $seg = ($plines[$sIdx..($eIdx - 1)] -join "`n") }
        $phHits2 = @()
        foreach ($m in [regex]::Matches($seg, '\{[^{}\r\n]+\}')) { $phHits2 += $m.Value }
        $reconOk = ($phHits2.Count -eq 0)
        $reconFix = 'fill recon-section placeholders in plans/' + $VNode + '.md: ' + ($phHits2 -join ', ')
      }
    }
    if ($reconOk) {
      Write-Host ('  [OK]   plans/' + $VNode + '.md recon section filled (batch 1)')
    } else {
      $fails++
      Write-Host ('  [FAIL] plans/' + $VNode + '.md recon section filled (batch 1)') -ForegroundColor Red
      if ($reconFix) { Write-Host ('         Fix: ' + $reconFix) -ForegroundColor Yellow }
    }
  } else {
    $calibOk = $false; $calibFix = 'backfill calibration log for batch ' + $n + ' in plans/' + $VNode + '.md (one line mentioning batch ' + $n + ')'
    if (Test-Path $plansPath) {
      $plansTxt = Read-Utf8 $plansPath
      $calibOk = [bool]$plansTxt -and ($plansTxt -match ('\u6279' + $n + '(?!\d)'))
    } else { $calibFix = 'create .nodes/plans/' + $VNode + '.md (missing)' }
    if ($calibOk) {
      Write-Host ('  [OK]   plans calibration log contains batch ' + $n)
    } else {
      $fails++
      Write-Host ('  [FAIL] plans calibration log contains batch ' + $n) -ForegroundColor Red
      Write-Host ('         Fix: ' + $calibFix) -ForegroundColor Yellow
    }
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

  if (Test-CapBlocked -Stage 'commit' -StagedCtx (Read-Utf8 $ctxSrcPath)) {
    Write-Host '[FAIL] Cap gate blocked commit. Staged ContextFile preserved.' -ForegroundColor Red
    exit 4
  }

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

  if (Test-CapBlocked -Stage 'save' -StagedCtx (Read-Utf8 $ctxSrcPath)) {
    Write-Host '[FAIL] Cap gate blocked save. Staged ContextFile preserved.' -ForegroundColor Red
    exit 4
  }

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

# v1.6.1 efficiency protocol: recon marker soft check (WARN only, never FAIL).
# A session line must contain BOTH the node name and the recon marker (\u4FA6\u5BDF).
if ($Node -and (Test-Path -LiteralPath $sessPath)) {
  $reconOk = $false
  $sessTxtRecon = Read-Utf8 $sessPath
  if ($sessTxtRecon) {
    foreach ($sl in ($sessTxtRecon -split "`r?`n")) {
      if ($sl.Contains($Node) -and $sl -match '\u4FA6\u5BDF') { $reconOk = $true; break }
    }
  }
  if (-not $reconOk) {
    Write-Host "  [WARN] No recon marker for node '$Node' in SESSIONS/$Session.md - run: save.ps1 checkpoint -Node <N> -Session <S> -Recon <conclusion> (efficiency protocol)" -ForegroundColor Yellow
  }
}

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
    # v1.5.0 efficiency protocol: archive must not keep unfilled template placeholders
    # (skeleton-generation run is exempt; CJK-safe: ASCII-only per BOM-less convention)
    $tplPath2 = Join-Path $nodesDir 'archive\_template.md'
    if (Test-Path $tplPath2) {
      $archTxt = Read-Utf8 $archPath
      $phHits = @()
      foreach ($m in [regex]::Matches((Read-Utf8 $tplPath2), '\{[^{}\r\n]+\}')) {
        if ($archTxt.Contains($m.Value)) { $phHits += $m.Value }
      }
      Check ($phHits.Count -eq 0) "archive/$Node.md placeholders filled" "Replace remaining template placeholders: $($phHits -join ', ')"
    }
  }
}

# v1.7.0 cap gate in verify: hard caps as FAIL items (exit 1); a fresh nudge marker
# (written by save/commit/verify within the 10-min window) downgrades them to WARN.
$violV = @()
try { $violV = @(Get-CapViolations (Read-Utf8 $ctxPath) (Read-Utf8 $progPath) (Read-Utf8 $decPath)) } catch { $violV = @() }
if ($violV.Count -gt 0) {
  $fpV = Get-CapFingerprint $violV
  if (Test-CapNudgeFresh $fpV) {
    foreach ($x in $violV) { Write-Host ("  [WARN] Cap violation (nudged, proceeding): {0} [{1}] {2}" -f $x.File, $x.Code, $x.Detail) -ForegroundColor Yellow }
  } else {
    try { Write-Utf8 $capNudgePath $fpV } catch { }
    foreach ($x in $violV) {
      Check $false ("CAP {0} [{1}] {2}" -f $x.File, $x.Code, $x.Detail) "run trim-context / trim-progress / trim-decisions (dry-run then -Apply); re-running within 10 min proceeds anyway"
    }
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
