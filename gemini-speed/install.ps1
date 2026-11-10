#Requires -Version 5.1
<#
.SYNOPSIS
  gemini-speed module installer: installs the gemini-speed OpenCode agent
  (primary-mode speed agent bound to cpa/gemini-3.8-flash-high).

.DESCRIPTION
  Installs user-globally to %USERPROFILE%\.config\opencode\agents\gemini-speed.md
  so every project on this machine can pick the agent. An existing agent file is
  backed up to gemini-speed.md.bak-<yyyyMMdd> before overwrite (never silent).
  Backs up by content hash verification after copy.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1

  # custom target dir (rare; e.g. a portable agents folder)
  powershell -ExecutionPolicy Bypass -File install.ps1 -TargetDir D:\tools\agents

.NOTES
  -Project and -Force are accepted for parity with remote-install.ps1 passthrough
  and deliberately ignored: this module installs user-globally, not per-project.
  Keep this file ASCII-only, matching the dsh-base .ps1 discipline.
#>
param(
  # Ignored (harness parity with remote-install.ps1 which always passes -Project).
  [string]$Project = '',
  # Ignored (parity switch; overwrite always happens, old file is backed up first).
  [switch]$Force,
  # Where the agent file lands. Default: the current user's global OpenCode agents dir.
  [string]$TargetDir = (Join-Path $env:USERPROFILE '.config\opencode\agents')
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$src = Join-Path $PSScriptRoot 'gemini-speed.md'
if (-not (Test-Path $src)) { throw "agent source file not found next to installer: $src" }

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
$dst = Join-Path $TargetDir 'gemini-speed.md'

# 1) back up any existing agent file first -- never silently overwrite
if (Test-Path $dst) {
  $oldHash = (Get-FileHash $dst -Algorithm SHA256).Hash
  $bak = "$dst.bak-$(Get-Date -Format 'yyyyMMdd')"
  Copy-Item $dst $bak -Force
  Write-Host "backed up existing agent -> $bak"
} else {
  $oldHash = ''
}

# 2) install
Copy-Item $src $dst -Force

# 3) verify byte-identical
$newHash = (Get-FileHash $dst -Algorithm SHA256).Hash
$srcHash = (Get-FileHash $src -Algorithm SHA256).Hash
if ($newHash -ne $srcHash) { throw "install verification FAILED: hash mismatch after copy ($dst)" }

$size = (Get-Item $dst).Length
$ver = ''
$verFile = Join-Path $PSScriptRoot 'VERSION'
if (Test-Path $verFile) { $ver = (Get-Content $verFile -Raw).Trim() }

Write-Host ''
Write-Host "gemini-speed installed -> $dst ($size bytes, sha256 OK)"
Write-Host "source sha256: $srcHash"
if ($oldHash -and $oldHash -ne $newHash) { Write-Host 'note: previous version differed; backup kept (see path above).' }
if ($ver) { Write-Host "version: $ver" }
Write-Host 'next: restart OpenCode/OpenChamber, then pick the gemini-speed agent.'
