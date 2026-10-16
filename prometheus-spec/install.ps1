#Requires -Version 5.1
<#
.SYNOPSIS
  prometheus-spec installer (Windows only, PowerShell 5.1+).
  Installs the gated planner agent (prometheus-spec), its librarian research
  subagent, and a bootstrap skill into the local opencode config directory.
  Never goes online, never reads or writes opencode.json.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1 -Core    # required files only, no prompts
  powershell -ExecutionPolicy Bypass -File install.ps1 -All     # required + all locally available extras
  powershell -ExecutionPolicy Bypass -File install.ps1          # interactive layered menu
  powershell -ExecutionPolicy Bypass -File install.ps1 -Remove  # backup everything, then uninstall
#>
param(
  [switch]$All,
  [switch]$Core,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$repo = Split-Path $root -Parent
$oc = Join-Path $HOME '.config\opencode'
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $oc)) {
  Write-Host "ERROR: opencode config dir not found: $oc"
  Write-Host "Install opencode first, then rerun this script."
  exit 1
}

$targets = @(
  @{ Src = Join-Path $root 'prometheus-spec.md'; Dst = Join-Path $oc 'agents\prometheus-spec.md' },
  @{ Src = Join-Path $root 'librarian.md';       Dst = Join-Path $oc 'agents\librarian.md' },
  @{ Src = Join-Path $root 'bootstrap\SKILL.md'; Dst = Join-Path $oc 'skills\prometheus-spec-installer\SKILL.md' }
)

function Get-DiffLineCount([string]$a, [string]$b) {
  $la = $a -split "`r?`n"
  $lb = $b -split "`r?`n"
  $n = [Math]::Max($la.Count, $lb.Count)
  $d = 0
  for ($i = 0; $i -lt $n; $i++) {
    $x = ''
    $y = ''
    if ($i -lt $la.Count) { $x = $la[$i] }
    if ($i -lt $lb.Count) { $y = $lb[$i] }
    if ($x -ne $y) { $d++ }
  }
  return $d
}

function Install-One([string]$src, [string]$dst) {
  if (-not (Test-Path $src)) {
    Write-Host "SKIP (not in master): $src"
    return
  }
  $content = [System.IO.File]::ReadAllText($src)
  New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
  if (Test-Path $dst) {
    $old = [System.IO.File]::ReadAllText($dst)
    if ($old -cne $content) {
      $bak = "$dst.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
      Copy-Item $dst $bak -Force
      Write-Host "backed up ($(Get-DiffLineCount $old $content) lines differ): $bak"
    }
  }
  $tmp = "$dst.tmp"
  [System.IO.File]::WriteAllText($tmp, $content, $utf8)
  Move-Item $tmp $dst -Force
  Write-Host "OK: $dst"
}

function Remove-All {
  $existing = @($targets | Where-Object { Test-Path $_.Dst })
  if ($existing.Count -eq 0) {
    Write-Host "Nothing to remove (no prometheus-spec files found under $oc)."
    return
  }
  $backupDir = Join-Path $oc ("prometheus-spec-uninstall-backup-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  foreach ($t in $existing) {
    $rel = $t.Dst.Substring($oc.Length + 1)
    $bd = Join-Path $backupDir $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $bd -Parent) | Out-Null
    Copy-Item $t.Dst $bd -Force
    Remove-Item $t.Dst -Force
    $parent = Split-Path $t.Dst -Parent
    $skillsRoot = Join-Path $oc 'skills'
    if ($parent.StartsWith($skillsRoot) -and -not (Get-ChildItem $parent -Force)) {
      Remove-Item $parent -Force
      Write-Host "REMOVED (now empty): $parent"
    }
    Write-Host "REMOVED (backed up): $($t.Dst)"
  }
  Write-Host ""
  Write-Host "Uninstall backup dir: $backupDir"
  Write-Host "To restore: copy the files back from that dir under $oc"
}

function Ask-YesNo([string]$prompt) {
  $a = (Read-Host "$prompt (Y/N)").Trim().ToUpper()
  return ($a -eq 'Y' -or $a -eq 'YES')
}

function Show-Layers {
  Write-Host ""
  Write-Host "=== Dependency layers ==="
  Write-Host "[REQUIRED]           prometheus-spec.md + librarian.md + bootstrap skill"
  Write-Host "                     (bundled in this folder, always installed)"
  Write-Host "[STRONGLY REC]       talk-human      -> run <repo>\talk-human\install.ps1"
  Write-Host "                     spec-superflow  -> npm i -g spec-superflow (MANUAL, this script"
  Write-Host "                                        never goes online) + register the plugin in"
  Write-Host "                                        opencode.json by hand - see README.md"
  Write-Host "[PROJECT-OPTIONAL]   node-architect  -> run <repo>\node-architect\install.ps1"
  Write-Host "[OPTIONAL]           systematic-debugging-with-impact-analysis / investigate /"
  Write-Host "                     graphify / backend-patterns / skill-creator /"
  Write-Host "                     karpathy-guidelines -> copied from <repo>\.agents\skills"
  Write-Host "                     when bundled there"
  Write-Host ""
}

$strongly = $false
$project = $false
$optional = $false

if ($Remove) {
  Remove-All
  Write-Host ""
  Write-Host "Restart your opencode session for changes to take effect."
  exit 0
}

if ($All) {
  $strongly = $true; $project = $true; $optional = $true
} elseif (-not $Core) {
  Show-Layers
  $choice = (Read-Host 'Select 1=All 2=Core+Recommended 3=Custom').Trim()
  if ($choice -eq '1') {
    $strongly = $true; $project = $true; $optional = $true
  } elseif ($choice -eq '2') {
    $strongly = $true
  } elseif ($choice -eq '3') {
    $strongly = Ask-YesNo 'Install STRONGLY REC layer (talk-human + spec-superflow guidance)?'
    $project = Ask-YesNo 'Install PROJECT-OPTIONAL layer (node-architect)?'
    $optional = Ask-YesNo 'Install OPTIONAL skills (when bundled in repo)?'
  } else {
    Write-Host "Invalid choice '$choice' - installing Core only."
  }
}

Write-Host ""
Write-Host "=== Installing REQUIRED (bundled) ==="
$installed = @()
foreach ($t in $targets) {
  Install-One $t.Src $t.Dst
  if (Test-Path $t.Src) { $installed += $t.Dst }
}

if ($strongly) {
  Write-Host ""
  Write-Host "=== STRONGLY RECOMMENDED ==="
  $th = Join-Path $repo 'talk-human\install.ps1'
  if (Test-Path $th) {
    Write-Host "running: $th"
    & $th
  } else {
    Write-Host "talk-human master not found: $th (see its own README)"
  }
  Write-Host "spec-superflow: run 'npm i -g spec-superflow' yourself, then register the"
  Write-Host "plugin in opencode.json manually - exact steps and JSON snippet: README.md"
}

if ($project) {
  Write-Host ""
  Write-Host "=== PROJECT-OPTIONAL ==="
  $na = Join-Path $repo 'node-architect\install.ps1'
  if (Test-Path $na) {
    Write-Host "running: $na"
    & $na
  } else {
    Write-Host "node-architect master not found: $na"
  }
}

if ($optional) {
  Write-Host ""
  Write-Host "=== OPTIONAL skills ==="
  $optNames = @(
    'systematic-debugging-with-impact-analysis',
    'investigate',
    'graphify',
    'backend-patterns',
    'skill-creator',
    'karpathy-guidelines'
  )
  foreach ($n in $optNames) {
    $s = Join-Path $repo (".agents\skills\" + $n)
    $d = Join-Path $oc ("skills\" + $n)
    if (Test-Path $s) {
      if (Test-Path $d) { Remove-Item $d -Recurse -Force }
      Copy-Item $s $d -Recurse -Force
      Write-Host "OK: $d"
    } else {
      Write-Host "SKIP (not bundled in this repo): $n - install per its own docs"
    }
  }
}

Write-Host ""
Write-Host "=== Done ==="
Write-Host "Installed/updated files:"
foreach ($p in $installed) { Write-Host "  $p" }
Write-Host "Restart your opencode session to take effect."
Write-Host "Dependencies not bundled here are NOT installed automatically:"
Write-Host "see README.md (dependency layers + manual plugin registration)."
Write-Host "This script never goes online and never modifies opencode.json."
