#Requires -Version 5.1
<#
.SYNOPSIS
  Gate for install.ps1's DSH client. Runs the installer inside a throwaway sandbox
  (temp project + temp DSH home) and asserts:
    1. the generated Agent preset and the profile patch parse as YAML (custom !!js tag)
    2. re-running the installer is byte-idempotent
    3. text outside the managed block survives an update
    4. -DshProjectPreset registers the project root, and refuses to overwrite a foreign
       agent-presets row
  The real $DSH_HOME and the repository working tree are never touched.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tests\install-gate.ps1
  powershell -ExecutionPolicy Bypass -File tests\install-gate.ps1 -Keep      # keep the sandbox
#>
param(
  [string]$SandboxRoot = '',
  [string]$BaseComposition = '',
  [string]$YamlModule = '',
  [switch]$Keep
)
$ErrorActionPreference = 'Stop'
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

$installer = Join-Path (Split-Path $PSScriptRoot -Parent) 'install.ps1'
if (-not (Test-Path -LiteralPath $installer)) { throw "install.ps1 not found next to tests\: $installer" }

$tempRoot = [System.IO.Path]::GetTempPath()
if (-not $SandboxRoot) { $SandboxRoot = Join-Path $tempRoot ('ssh-runner-gate-' + [guid]::NewGuid().ToString('N').Substring(0, 8)) }
if (Test-Path -LiteralPath $SandboxRoot) {
  if (-not $SandboxRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "refusing to delete a sandbox root outside the temp directory: $SandboxRoot"
  }
  Remove-Item -LiteralPath $SandboxRoot -Recurse -Force
}

$fails = 0
function Check([bool]$Ok, [string]$Label) {
  if ($Ok) { Write-Host ("  [OK]   " + $Label) } else { Write-Host ("  [FAIL] " + $Label) -ForegroundColor Red; $script:fails++ }
}
function Read-Utf8([string]$Path) { return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) }
function Write-Utf8([string]$Path, [string]$Text) {
  $dir = Split-Path $Path -Parent
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}
function Get-Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }
$yamlProbeScript = ''
function Test-Yaml([string]$Path) {
  if (-not $YamlModule) { return $null }
  if (-not $script:yamlProbeScript) {
    # A real probe FILE: PS 5.1 strips embedded double quotes when handing an argument to a
    # native command, so a quoted `node -e` one-liner arrives corrupted.
    $script:yamlProbeScript = Join-Path $SandboxRoot 'yaml-check.cjs'
    Write-Utf8 $script:yamlProbeScript ((@(
        "const fs = require('fs')"
        "const YAML = require(process.argv[2])"
        "const jsTag = { tag: 'tag:yaml.org,2002:js', resolve: (value) => value }"
        "YAML.parse(fs.readFileSync(process.argv[3], 'utf8'), { customTags: [jsTag] })"
      ) -join "`n") + "`n")
  }
  & node $script:yamlProbeScript $YamlModule $Path 2>&1 | Out-Null
  return ($LASTEXITCODE -eq 0)
}

# ---------- fixtures ----------
# Locate the DSH install for the yaml module and a realistic base composition. The install
# may live on any drive (this machine: E:\Program Files\DSH Desktop), so scan drives and read
# the `dsh` launcher shim, which names the install directory verbatim.
$dshAppRoots = @()
foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs' }))) {
  if ($base) { $dshAppRoots += (Join-Path $base 'DSH Desktop\resources\app') }
}
foreach ($drive in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
  if (-not $drive.Root) { continue }
  $dshAppRoots += (Join-Path $drive.Root 'Program Files\DSH Desktop\resources\app')
  $dshAppRoots += (Join-Path $drive.Root 'DSH Desktop\resources\app')
}
$shim = Get-Command dsh -ErrorAction SilentlyContinue
if ($shim -and $shim.Source) {
  try {
    foreach ($hit in [regex]::Matches((Read-Utf8 $shim.Source), '([A-Za-z]:\\[^"\r\n]*?)\\resources\\app\\')) { $dshAppRoots += ($hit.Groups[1].Value + '\resources\app') }
  } catch { }
}
$dshAppRoots = @($dshAppRoots | Where-Object { $_ } | Select-Object -Unique)

if (-not $YamlModule) {
  foreach ($candidate in $dshAppRoots) {
    $probe = Join-Path $candidate 'node_modules\yaml'
    if (Test-Path -LiteralPath (Join-Path $probe 'package.json')) { $YamlModule = $probe; break }
  }
}
if (-not $YamlModule) { Write-Warning 'yaml module not found -- YAML assertions are skipped' }

if (-not $BaseComposition) {
  foreach ($candidate in $dshAppRoots) {
    $probe = Join-Path $candidate 'node_modules\@deepseek-ai\dsh-agent-presets\presets\standard\agent.cordis.yml'
    if (Test-Path -LiteralPath $probe) { $BaseComposition = $probe; break }
  }
}
$baseText = ''
if ($BaseComposition) { $baseText = Read-Utf8 $BaseComposition }
if (-not $baseText) {
  $baseText = @'
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: gate fixture
- id: tool-pwsh
  name: '@deepseek-ai/dsh-tool-pwsh'
  disabled: !!js process.platform !== 'win32'
'@
  Write-Warning 'shipped standard preset not found -- using the synthetic fixture as the base composition'
}

$seedPatch = @'
- insert:
    - id: mcp-playwright
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: playwright
        transport: stdio
        command: npx
        args: ['-y', '@playwright/mcp']
- id: some-row
  disabled: !!js false
'@

$repoOpencode = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'opencode.json'
$opencodeHashBefore = if (Test-Path -LiteralPath $repoOpencode) { Get-Hash $repoOpencode } else { '' }

function New-Sandbox([string]$Name) {
  $root = Join-Path $SandboxRoot $Name
  $proj = Join-Path $root 'proj'
  $dshHomeDir = Join-Path $root 'dshhome'
  New-Item -ItemType Directory -Force -Path $proj | Out-Null
  Write-Utf8 (Join-Path $dshHomeDir '.agent-presets\standard\agent.cordis.yml') $baseText
  Write-Utf8 (Join-Path $dshHomeDir 'profiles\desktop\cordis.patch.yml') $seedPatch
  return @{ Root = $root; Project = $proj; Home = $dshHomeDir }
}

# ---------- 1) user-root preset: generate, parse, idempotency, preservation ----------
Write-Host 'Case 1: user-root preset (-Clients dsh)'
$sb1 = New-Sandbox 'user-root'
$presetFile = Join-Path $sb1.Home '.agent-presets\proj-ssh\agent.cordis.yml'
$metaFile = Join-Path $sb1.Home '.agent-presets\proj-ssh\preset.yml'
$patchFile = Join-Path $sb1.Home 'profiles\desktop\cordis.patch.yml'
$patchHashBefore = Get-Hash $patchFile

$out1 = (& $installer -Project $sb1.Project -Clients dsh -SkipDeps -DshHome $sb1.Home -DshYamlModule $YamlModule *>&1 | Out-String)
Check (Test-Path -LiteralPath $presetFile) 'preset agent.cordis.yml created'
Check (Test-Path -LiteralPath $metaFile) 'preset.yml created'
$presetText = if (Test-Path -LiteralPath $presetFile) { Read-Utf8 $presetFile } else { '' }
Check ($presetText -match 'dsh-mcp-shared:ssh:begin') 'managed MCP block present'
Check ($presetText -match "(?m)^- id: mcp-ssh$") 'mcp-ssh row present'
Check ($presetText -match "name: '@deepseek-ai/dsh-mcp-client'") 'dsh-mcp-client row present'
Check ($presetText -match 'run-ssh-mcp\.cjs') 'runner path present in args'
Check ($presetText -match 'serverName: proj-ssh') 'serverName derived from the project leaf'
Check ($presetText -match 'disabled: !!js') 'base composition content preserved'
Check ((Get-Hash $patchFile) -eq $patchHashBefore) 'profile patch untouched without -DshProjectPreset'
Check ((Test-Yaml $presetFile) -ne $false) 'preset parses as YAML (!!js aware)'
Check ($out1 -match 'OK: DSH preset') 'installer reported the DSH preset write'

$presetHash1 = Get-Hash $presetFile
$metaHash1 = Get-Hash $metaFile
$out2 = (& $installer -Project $sb1.Project -Clients dsh -SkipDeps -DshHome $sb1.Home -DshYamlModule $YamlModule *>&1 | Out-String)
Check ((Get-Hash $presetFile) -eq $presetHash1) 're-run leaves the preset byte-identical'
Check ((Get-Hash $metaFile) -eq $metaHash1) 're-run leaves preset.yml byte-identical'
Check ($out2 -match 'SKIP: DSH preset already up to date') 're-run reported SKIP'

$userNote = '# user note kept by the installer' + "`r`n"
Write-Utf8 $presetFile ($userNote + $presetText)
$out3 = (& $installer -Project $sb1.Project -Clients dsh -SkipDeps -DshHome $sb1.Home -DshYamlModule $YamlModule *>&1 | Out-String)
$presetText3 = Read-Utf8 $presetFile
Check ($presetText3.Contains($userNote.Trim())) 'user text outside the block preserved'
Check (([regex]::Matches($presetText3, 'dsh-mcp-shared:ssh:begin')).Count -eq 1) 'exactly one managed block after update'

# ---------- 2) project preset + roots registration ----------
Write-Host 'Case 2: project preset (-DshProjectPreset)'
$sb2 = New-Sandbox 'project-preset'
$projPreset = Join-Path $sb2.Project '.dsh\agent-presets\proj-ssh\agent.cordis.yml'
$patch2 = Join-Path $sb2.Home 'profiles\desktop\cordis.patch.yml'
$out4 = (& $installer -Project $sb2.Project -Clients dsh -SkipDeps -DshHome $sb2.Home -DshYamlModule $YamlModule -DshProjectPreset *>&1 | Out-String)
Check (Test-Path -LiteralPath $projPreset) 'preset written inside the project'
$patchText2 = Read-Utf8 $patch2
$expectedRoot = ((Join-Path $sb2.Project '.dsh\agent-presets') -replace '\\', '/')
Check ($patchText2 -match 'dsh-mcp-shared:roots:begin') 'roots managed block registered'
Check ($patchText2.Contains($expectedRoot)) 'roots path points at the project preset root'
Check ($patchText2 -match "(?m)^\s+default:\s*\S+") 'agent-presets config keeps its default (shallow patch semantics)'
Check ($patchText2 -match 'mcp-playwright') 'pre-existing patch rows preserved'
Check ((Test-Yaml $patch2) -ne $false) 'profile patch parses as YAML (!!js aware)'
Check ($out4 -match 'DSH preset root registered') 'installer reported the root registration'
$patch2Hash = Get-Hash $patch2
$out5 = (& $installer -Project $sb2.Project -Clients dsh -SkipDeps -DshHome $sb2.Home -DshYamlModule $YamlModule -DshProjectPreset *>&1 | Out-String)
Check ((Get-Hash $patch2) -eq $patch2Hash) 're-run leaves the profile patch byte-identical'
Check ($out5 -match 'DSH preset root already registered') 're-run reported the root as already registered'

# ---------- 3) foreign agent-presets row: refuse to clobber ----------
Write-Host 'Case 3: foreign agent-presets row'
$sb3 = New-Sandbox 'foreign-row'
$patch3 = Join-Path $sb3.Home 'profiles\desktop\cordis.patch.yml'
$foreign = "- id: agent-presets`r`n  config:`r`n    default: ptc`r`n" + (Read-Utf8 $patch3)
Write-Utf8 $patch3 $foreign
$foreignHash = Get-Hash $patch3
$out6 = (& $installer -Project $sb3.Project -Clients dsh -SkipDeps -DshHome $sb3.Home -DshYamlModule $YamlModule -DshProjectPreset *>&1 | Out-String)
Check ((Get-Hash $patch3) -eq $foreignHash) 'foreign patch left untouched'
Check ($out6 -match 'already patches .agent-presets.') 'installer warned about the foreign row'

# ---------- 4) regression: the repository tree is untouched ----------
Write-Host 'Case 4: no side effects outside the sandbox'
if ($opencodeHashBefore) { Check ((Get-Hash $repoOpencode) -eq $opencodeHashBefore) 'repository opencode.json unchanged' }

# ---------- result ----------
if (-not $Keep) { Remove-Item -LiteralPath $SandboxRoot -Recurse -Force }
else { Write-Host ("Sandbox kept: " + $SandboxRoot) }
Write-Host ''
if ($fails -gt 0) { Write-Host ("[FAIL] gate failed (" + $fails + " checks)") -ForegroundColor Red; exit 1 }
Write-Host '[OK] gate passed' -ForegroundColor Green
exit 0
