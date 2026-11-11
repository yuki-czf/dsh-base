#Requires -Version 5.1
<#
.SYNOPSIS
  gemini-speed module installer: agents + title tuning + cpa-native provider.

.DESCRIPTION
  1) Installs user-globally to %USERPROFILE%\.config\opencode\agents\:
       - gemini-speed.md  (primary speed agent)
       - gs-explore.md    (dedicated exploration subagent)
     Existing files are backed up to <name>.md.bak-<yyyyMMdd> first (never
     silent); copies verified by SHA256.
  2) Merges title-agent.json into %USERPROFILE%\.config\opencode\opencode.json
     under agents.title (V2 hidden title agent): pins a chat-lane model and an
     anchor system prompt so the ~400-token title call stops inheriting the
     session model's autonomous deep thinking (observed 3/3 draws of 3700+
     thinking tokens = 20-34s blocked before the first reply).
  3) Merges the cpa-native provider into opencode.json (Google-native protocol
     lane with includeThoughts; required by gemini-speed's model binding).
     Cloned from the existing cpa provider: baseURL suffix /v1 -> /v1beta,
     apiKey reference copied verbatim (key material never enters this script
     or the repo). Works unchanged behind local tunnels (e.g. an hy2 port
     forward to 127.0.0.1:9443) because only the path suffix changes. Use
     -NativeBaseURL to override the derived URL, -ForceNative to re-apply.
     Requires a cpa provider entry to clone from; skipped with a warning if
     absent.
  opencode.json is backed up to opencode.json.bak-gs-<yyyyMMdd> before any
  merge (single backup even when both merges apply); written UTF-8 without
  BOM; JSON round-trips through ConvertFrom-Json/ConvertTo-Json -Depth 100.
  Both merges are idempotent: existing agents.title / providers.cpa-native
  are preserved unless -ForceTitle / -ForceNative.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1

  # re-apply both opencode.json blocks even if they already exist
  powershell -ExecutionPolicy Bypass -File install.ps1 -ForceTitle -ForceNative

  # custom native-lane URL (e.g. tunnel forwards to a different port)
  powershell -ExecutionPolicy Bypass -File install.ps1 -NativeBaseURL http://127.0.0.1:9443/v1beta

.NOTES
  -Project and -Force are accepted for parity with remote-install.ps1
  passthrough and deliberately ignored: this module installs user-globally.
  Uninstall: delete the two agent files, remove agents.title and
  providers.cpa-native from opencode.json (or restore the .bak-gs backup).
  Keep this file ASCII-only, matching the dsh-base .ps1 discipline (the title
  agent's Chinese system prompt lives in title-agent.json).
#>
param(
  # Ignored (harness parity with remote-install.ps1 which always passes -Project).
  [string]$Project = '',
  # Ignored (parity switch; agent overwrite always happens, old file is backed up first).
  [switch]$Force,
  # Where the agent files land. Default: the current user's global OpenCode agents dir.
  [string]$TargetDir = (Join-Path $env:USERPROFILE '.config\opencode\agents'),
  # Re-apply agents.title even if it already exists in opencode.json.
  [switch]$ForceTitle,
  # Re-apply providers.cpa-native even if it already exists in opencode.json.
  [switch]$ForceNative,
  # Override the derived cpa-native baseURL (default: cpa baseURL with /v1 suffix swapped to /v1beta).
  [string]$NativeBaseURL = ''
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

# ---------- 2+3) opencode.json merges (title agent + cpa-native provider) ----------
$titleSrc = Join-Path $PSScriptRoot 'title-agent.json'
if (-not (Test-Path $titleSrc)) { throw "title-agent.json not found next to installer: $titleSrc" }
$titleDef = (Get-Content $titleSrc -Raw -Encoding UTF8 | ConvertFrom-Json).title

$ocDir = Join-Path $env:USERPROFILE '.config\opencode'
$ocPath = Join-Path $ocDir 'opencode.json'
New-Item -ItemType Directory -Force -Path $ocDir | Out-Null

if (-not (Test-Path $ocPath)) {
  # Fresh machine with no opencode.json: create a minimal config with the title
  # agent. The cpa-native provider cannot be cloned without a cpa entry.
  $cfg = New-Object PSObject
  $agents = New-Object PSObject
  $agents | Add-Member -MemberType NoteProperty -Name title -Value $titleDef
  $cfg | Add-Member -MemberType NoteProperty -Name agents -Value $agents
  $out = $cfg | ConvertTo-Json -Depth 100
  [IO.File]::WriteAllText($ocPath, $out, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'opencode.json created with agents.title.'
  Write-Host 'note: no cpa provider found to clone; configure cpa first, then re-run for cpa-native.'
} else {
  $raw = [IO.File]::ReadAllText($ocPath)
  if ($raw.Length -gt 0 -and $raw[0] -eq [char]0xFEFF) { $raw = $raw.Substring(1) }  # strip BOM if any
  $cfg = $raw | ConvertFrom-Json

  $hasAgents = ($cfg.PSObject.Properties.Name -contains 'agents')
  $hasTitle = $hasAgents -and ($cfg.agents.PSObject.Properties.Name -contains 'title')
  $hasProviders = ($cfg.PSObject.Properties.Name -contains 'providers')
  $cpa = $null
  if ($hasProviders -and ($cfg.providers.PSObject.Properties.Name -contains 'cpa')) {
    $cpa = $cfg.providers.'cpa'
  }
  $hasNative = $hasProviders -and ($cfg.providers.PSObject.Properties.Name -contains 'cpa-native')

  $wantTitle = (-not $hasTitle) -or $ForceTitle
  $wantNative = $null -ne $cpa -and ((-not $hasNative) -or $ForceNative)
  if ($null -eq $cpa -and ((-not $hasNative) -or $ForceNative)) {
    Write-Host 'warning: no cpa provider in opencode.json; cpa-native merge skipped (configure cpa first).'
  }

  if (-not $wantTitle -and -not $wantNative) {
    Write-Host ''
    Write-Host 'opencode.json: agents.title and cpa-native both present; nothing to merge.'
  } else {
    $bak = "$ocPath.bak-gs-$(Get-Date -Format 'yyyyMMdd')"
    Copy-Item $ocPath $bak -Force
    Write-Host "backed up opencode.json -> $bak"

    if ($wantTitle) {
      if (-not $hasAgents) {
        $cfg | Add-Member -MemberType NoteProperty -Name agents -Value (New-Object PSObject)
      }
      if ($hasTitle) { $cfg.agents.title = $titleDef }
      else { $cfg.agents | Add-Member -MemberType NoteProperty -Name title -Value $titleDef }
      Write-Host 'agents.title merged into opencode.json.'
    }

    if ($wantNative) {
      $base = [string]$cpa.settings.baseURL
      if ($NativeBaseURL) {
        $nativeBase = $NativeBaseURL
      } else {
        $nativeBase = ($base -replace '/v1/?$', '').TrimEnd('/') + '/v1beta'
      }
      $settings = New-Object System.Collections.Specialized.OrderedDictionary
      $settings.baseURL = $nativeBase
      if ($cpa.settings -and ($cpa.settings.PSObject.Properties.Name -contains 'apiKey')) {
        $settings.apiKey = [string]$cpa.settings.apiKey
      }
      $model = New-Object System.Collections.Specialized.OrderedDictionary
      $model.modelID = 'gemini-3.8-flash-high'
      $model.name = 'gemini-3.8-flash-high'
      $caps = New-Object System.Collections.Specialized.OrderedDictionary
      $caps.tools = $true
      $caps.input = @('text', 'image', 'audio', 'video', 'pdf')
      $caps.output = @('text')
      $model.capabilities = $caps
      $limit = New-Object System.Collections.Specialized.OrderedDictionary
      $limit.context = 1101005
      $limit.output = 67174
      $model.limit = $limit
      $thinking = New-Object System.Collections.Specialized.OrderedDictionary
      $thinking.includeThoughts = $true
      $google = New-Object System.Collections.Specialized.OrderedDictionary
      $google.thinkingConfig = $thinking
      $opts = New-Object System.Collections.Specialized.OrderedDictionary
      $opts.google = $google
      $model.providerOptions = $opts

      $models = New-Object System.Collections.Specialized.OrderedDictionary
      $models.'gemini-3.8-flash-high' = $model

      $native = New-Object System.Collections.Specialized.OrderedDictionary
      $native.name = 'CPA Native'
      $native.package = 'aisdk:@ai-sdk/google'
      $native.settings = $settings
      $native.models = $models

      if ($hasNative) { $cfg.providers.'cpa-native' = $native }
      else { $cfg.providers | Add-Member -MemberType NoteProperty -Name 'cpa-native' -Value $native }
      Write-Host "cpa-native provider merged (baseURL: $nativeBase)."
    }

    $out = $cfg | ConvertTo-Json -Depth 100
    [IO.File]::WriteAllText($ocPath, $out, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'opencode.json written (UTF-8, no BOM).'
  }
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
Write-Host 'verify native lane (esp. behind tunnels): curl -s -o NUL -w "%{http_code}" <baseURL>/models  -> expect 200/401, not 404'
