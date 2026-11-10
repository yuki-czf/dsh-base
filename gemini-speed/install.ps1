#Requires -Version 5.1
<#
.SYNOPSIS
  gemini-speed module installer: installs the gemini-speed OpenCode agents
  (primary executor + dedicated gs-explore subagent) and the title-agent
  tuning that stops session-title generation from gambling into deep
  thinking on the Gemini lane.

.DESCRIPTION
  1) Installs user-globally to %USERPROFILE%\.config\opencode\agents\:
       - gemini-speed.md  (primary speed agent)
       - gs-explore.md    (dedicated exploration subagent)
     Existing files are backed up to <name>.md.bak-<yyyyMMdd> first (never
     silent); copies verified by SHA256.
  2) Merges title-agent.json into %USERPROFILE%\.config\opencode\opencode.json
     under agents.title (V2 hidden title agent): pins a chat-lane model and an
     anchor system prompt so the ~400-token title call stops inheriting the
     session model's autonomous deep thinking (observed 3/3 draws of
     3700+ thinking tokens = 20-34s blocked before the first reply).
     opencode.json is backed up to opencode.json.bak-gs-title-<yyyyMMdd>.
     The merge is idempotent: an existing agents.title is preserved unless
     -ForceTitle. Written UTF-8 without BOM; JSON round-trips through
     ConvertFrom-Json/ConvertTo-Json -Depth 100.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1

  # custom target dir for the agent files (rare)
  powershell -ExecutionPolicy Bypass -File install.ps1 -TargetDir D:\tools\agents

  # re-apply the title-agent block even if agents.title already exists
  powershell -ExecutionPolicy Bypass -File install.ps1 -ForceTitle

.NOTES
  -Project and -Force are accepted for parity with remote-install.ps1 passthrough
  and deliberately ignored: this module installs user-globally, not per-project.
  Uninstall: delete the two agent files and remove agents.title from
  opencode.json (or restore the .bak-gs-title backup), then restart.
  Keep this file ASCII-only, matching the dsh-base .ps1 discipline
  (the title agent's Chinese system prompt lives in title-agent.json).
#>
param(
  # Ignored (harness parity with remote-install.ps1 which always passes -Project).
  [string]$Project = '',
  # Ignored (parity switch; agent overwrite always happens, old file is backed up first).
  [switch]$Force,
  # Where the agent files land. Default: the current user's global OpenCode agents dir.
  [string]$TargetDir = (Join-Path $env:USERPROFILE '.config\opencode\agents'),
  # Re-apply agents.title even if it already exists in opencode.json.
  [switch]$ForceTitle
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---------- 1) agent files ----------
$files = @('gemini-speed.md', 'gs-explore.md')
foreach ($f in $files) {
  $src = Join-Path $PSScriptRoot $f
  if (-not (Test-Path $src)) { throw "agent source file not found next to installer: $src" }
}

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

foreach ($f in $files) {
  $src = Join-Path $PSScriptRoot $f
  $dst = Join-Path $TargetDir $f

  if (Test-Path $dst) {
    $oldHash = (Get-FileHash $dst -Algorithm SHA256).Hash
    $bak = "$dst.bak-$(Get-Date -Format 'yyyyMMdd')"
    Copy-Item $dst $bak -Force
    Write-Host "backed up existing agent -> $bak"
  } else {
    $oldHash = ''
  }

  Copy-Item $src $dst -Force

  $newHash = (Get-FileHash $dst -Algorithm SHA256).Hash
  $srcHash = (Get-FileHash $src -Algorithm SHA256).Hash
  if ($newHash -ne $srcHash) { throw "install verification FAILED: hash mismatch after copy ($dst)" }

  $size = (Get-Item $dst).Length
  Write-Host ''
  Write-Host "installed -> $dst ($size bytes, sha256 OK)"
  if ($oldHash -and $oldHash -ne $newHash) { Write-Host 'note: previous version differed; backup kept (see path above).' }
}

# ---------- 2) title agent tuning in opencode.json ----------
$titleSrc = Join-Path $PSScriptRoot 'title-agent.json'
if (-not (Test-Path $titleSrc)) { throw "title-agent.json not found next to installer: $titleSrc" }

$ocDir = Join-Path $env:USERPROFILE '.config\opencode'
$ocPath = Join-Path $ocDir 'opencode.json'
New-Item -ItemType Directory -Force -Path $ocDir | Out-Null

$titleDef = (Get-Content $titleSrc -Raw -Encoding UTF8 | ConvertFrom-Json).title

if (Test-Path $ocPath) {
  $raw = [IO.File]::ReadAllText($ocPath)
  if ($raw.Length -gt 0 -and $raw[0] -eq [char]0xFEFF) { $raw = $raw.Substring(1) }  # strip BOM if any
  $cfg = $raw | ConvertFrom-Json

  $hasAgents = ($cfg.PSObject.Properties.Name -contains 'agents')
  $hasTitle = $false
  if ($hasAgents) { $hasTitle = ($cfg.agents.PSObject.Properties.Name -contains 'title') }

  if ($hasTitle -and -not $ForceTitle) {
    Write-Host ''
    Write-Host 'agents.title already present in opencode.json; left untouched (use -ForceTitle to re-apply).'
  } else {
    $bak = "$ocPath.bak-gs-title-$(Get-Date -Format 'yyyyMMdd')"
    Copy-Item $ocPath $bak -Force
    Write-Host "backed up opencode.json -> $bak"

    if (-not $hasAgents) {
      $cfg | Add-Member -MemberType NoteProperty -Name agents -Value (New-Object PSObject)
    }
    if ($hasTitle) { $cfg.agents.title = $titleDef }
    else { $cfg.agents | Add-Member -MemberType NoteProperty -Name title -Value $titleDef }

    $out = $cfg | ConvertTo-Json -Depth 100
    [IO.File]::WriteAllText($ocPath, $out, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'agents.title merged into opencode.json (UTF-8, no BOM).'
  }
} else {
  $cfg = New-Object PSObject
  $agents = New-Object PSObject
  $agents | Add-Member -MemberType NoteProperty -Name title -Value $titleDef
  $cfg | Add-Member -MemberType NoteProperty -Name agents -Value $agents
  $out = $cfg | ConvertTo-Json -Depth 100
  [IO.File]::WriteAllText($ocPath, $out, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'opencode.json created with agents.title.'
}

# sanity: the file must still parse as JSON
$null = [IO.File]::ReadAllText($ocPath) | ConvertFrom-Json
Write-Host 'opencode.json parses OK after changes.'

$ver = ''
$verFile = Join-Path $PSScriptRoot 'VERSION'
if (Test-Path $verFile) { $ver = (Get-Content $verFile -Raw).Trim() }

Write-Host ''
if ($ver) { Write-Host "version: $ver" }
Write-Host 'next: config hot-reloads; pick the gemini-speed agent for new sessions.'
