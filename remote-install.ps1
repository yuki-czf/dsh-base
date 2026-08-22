#Requires -Version 5.1
<#
.SYNOPSIS
  dsh-base cloud one-line installer: pulls a module from a GitHub repo and installs it into a target project.
  Zero credentials, zero dependencies (Windows + PowerShell 5.1; the ssh-runner module additionally needs node/npm).
  NOTE: this entry script must stay pure ASCII without a BOM -- it is consumed as a string
        via `irm ... | iex`, and a leading BOM character breaks the PowerShell parser.
.EXAMPLE
  # node-architect (default module, same behavior as v1):
  irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1 | iex

  # ssh-runner MCP (with arguments):
  & ([scriptblock]::Create((irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1))) -Module ssh-runner

  # downloaded, run with parameters:
  powershell -ExecutionPolicy Bypass -File remote-install.ps1 -Module ssh-runner -Project D:\www\myapp -Clients opencode,cursor

  # offline / intranet: point at a local repo zip
  powershell -ExecutionPolicy Bypass -File remote-install.ps1 -Module ssh-runner -ZipPath .\dsh-base-main.zip
#>
param(
  [string]$Project = (Get-Location).Path,
  [string]$Repo    = 'yuki-czf/dsh-base',
  [string]$Branch  = 'main',
  [ValidateSet('node-architect', 'ssh-runner')]
  [string]$Module  = 'node-architect',
  [string[]]$Clients = @(),
  [string]$ZipPath = '',
  [switch]$Copy,
  [switch]$SkipNodes,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'

# ---------- 0) force TLS 1.2 (PS 5.1 may not negotiate it by default) ----------
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not (Test-Path $Project)) { throw "target project dir not found: $Project" }
$Project = (Resolve-Path $Project).Path

# module -> installer path map (register new modules here, one line each)
$moduleMap = @{
  'node-architect' = 'node-architect\install.ps1'
  'ssh-runner'     = 'mcps\ssh-runner\install.ps1'
}

# ---------- 1) get the repo zip (download or local offline copy) ----------
$tmp  = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-base-" + [System.Guid]::NewGuid().ToString('N').Substring(0,8))
$zip  = Join-Path $tmp 'repo.zip'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

if ($ZipPath) {
  if (-not (Test-Path $ZipPath)) { throw "local zip not found: $ZipPath" }
  Copy-Item $ZipPath $zip
  Write-Host "using local offline zip: $ZipPath"
} else {
  $url = "https://codeload.github.com/$Repo/zip/refs/heads/$Branch"
  Write-Host "downloading $url ..."
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  } catch {
    throw "download failed (network unreachable or proxy needed): $($_.Exception.Message)"
  }
}

# ---------- 2) extract and locate the module installer ----------
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$master = Get-ChildItem -Path $tmp -Directory | Where-Object { $_.Name -like "$($Repo.Split('/')[1])-*" } | Select-Object -First 1
if (-not $master) { throw "repo dir not found after extract (layout change?)" }
$installer = Join-Path $master.FullName $moduleMap[$Module]
if (-not (Test-Path $installer)) { throw "installer for module [$Module] not found: $installer (branch may not contain it yet; push first)" }

# ---------- 3) run the installer (pass through module-specific params) ----------
$splat = @{ Project = $Project }
if ($Clients) { $splat.Clients = $Clients }
if ($Module -eq 'node-architect') {
  if ($Copy)      { $splat.Copy      = $true }
  if ($SkipNodes) { $splat.SkipNodes = $true }
  if ($Force)     { Write-Warning "-Force only applies to the ssh-runner module; ignored" }
} else {
  if ($Force)     { $splat.Force     = $true }
  if ($Copy -or $SkipNodes) { Write-Warning "-Copy/-SkipNodes only apply to the node-architect module; ignored" }
}
& $installer @splat
$code = $LASTEXITCODE

# ---------- 4) cleanup temp dir ----------
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
if ($code) { exit $code }
Write-Host ""
Write-Host "cloud install done (module: $Module -> $Project)"
