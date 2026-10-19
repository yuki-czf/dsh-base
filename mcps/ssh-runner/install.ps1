#Requires -Version 5.1
<#
.SYNOPSIS
  dsh ssh-mcp-runner 项目级安装：拷贝 runner 到目标项目 + npm install + .secrets 初始化 + 五端 MCP 配置幂等生成。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1
  powershell -ExecutionPolicy Bypass -File install.ps1 -Project D:\www\myapp -Clients opencode,cursor
  powershell -ExecutionPolicy Bypass -File install.ps1 -Force      # 覆盖已存在的 policy.json
  powershell -ExecutionPolicy Bypass -File install.ps1 -Clients opencode,dsh
  powershell -ExecutionPolicy Bypass -File install.ps1 -Clients dsh -DshProjectPreset
#>
# DSH client notes (verified against DSH 0.1.5-rc.2):
#   * DSH has no project-level MCP config file. The project-scoped carrier is an Agent
#     preset (mounted per Agent scope), and a preset is a COMPLETE composition -- so this
#     installer emits "<base composition> + managed MCP block", never a bare MCP file.
#   * Preset discovery roots = shipped root + agent-presets config.roots + $DSH_HOME/.agent-presets.
#     Default target is the user root (discovered with zero extra config); -DshProjectPreset
#     writes into <Project>\.dsh\agent-presets and registers that root in the profile layer.
#   * cordis patch semantics are SHALLOW: applyEntryPatches() assigns target[key] = value, so a
#     patch row carrying `config` REPLACES the whole config object. The agent-presets patch
#     therefore repeats `default` beside `roots`, or the row would lose its required default.
param(
  [string]$Project = (Get-Location).Path,
  [string[]]$Clients = @(),
  [switch]$Force,
  [switch]$SkipDeps,                 # skip npm install (offline / gate testing)
  # --- DSH client (Agent preset) options ---
  [string]$DshHome = '',             # default: $env:DSH_HOME, else %USERPROFILE%\.dsh
  [string]$DshProfile = '',          # default: 'desktop' when present, else the only profile
  [string]$DshPresetName = '',       # default: <project-leaf>-ssh  (PRESET_ID: ^[a-z0-9][a-z0-9-]*$)
  [string]$DshPresetSource = '',     # explicit base composition (agent.cordis.yml)
  [string]$DshDefaultPreset = '',    # default preset id carried in the roots patch; auto-detected
  [string]$DshYamlModule = '',       # explicit path to the 'yaml' npm package (syntax check)
  [switch]$DshProjectPreset          # write the preset under <Project>\.dsh\agent-presets + register root
)
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot

if (-not (Test-Path $Project)) { throw "目标项目目录不存在: $Project" }
$Project = (Resolve-Path $Project).Path

# ---------- 0) 前置检查 ----------
$requiredTools = @('node')
if (-not $SkipDeps) { $requiredTools += 'npm' }
foreach ($tool in $requiredTools) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "未找到 $tool，请先安装 Node.js" }
}

# ---------- 1) 拷贝 runner 到项目 ----------
$dst = Join-Path $Project '.agents\mcps\ssh-runner'
New-Item -ItemType Directory -Force -Path (Join-Path $dst 'bin'), (Join-Path $dst 'secrets-template') | Out-Null

Copy-Item (Join-Path $src 'bin\run-ssh-mcp.cjs')      (Join-Path $dst 'bin\') -Force
Copy-Item (Join-Path $src 'package.json')              $dst -Force
$lockSrc = Join-Path $src 'package-lock.json'
if (Test-Path $lockSrc) { Copy-Item $lockSrc $dst -Force }   # 锁文件随行：可复现安装（供应链）
Copy-Item (Join-Path $src 'README.md')                 $dst -Force
Copy-Item (Join-Path $src 'secrets-template\*')        (Join-Path $dst 'secrets-template\') -Force

$policyDst = Join-Path $dst 'policy.json'
if ($Force -or -not (Test-Path $policyDst)) {
  Copy-Item (Join-Path $src 'policy.json') $policyDst -Force
  Write-Host "OK: policy.json -> $policyDst"
} else {
  Write-Host "SKIP: policy.json 已存在（策略保留用户改动；-Force 可重置）"
}
Write-Host "OK: runner -> $dst"

# ---------- 2) 安装依赖（版本锁定，不用 npx） ----------
if ($SkipDeps) {
  Write-Host "SKIP: npm install (-SkipDeps)"
} else {
  Write-Host "npm install（--omit=dev）..."
  Push-Location $dst
  try {
    npm install --omit=dev --no-fund --no-audit 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm install 失败（exit $LASTEXITCODE）" }
  } finally { Pop-Location }
  Write-Host "OK: 依赖安装完成"
}

# ---------- 3) 初始化 .secrets（v0.2 平文件：一字段一文件，一次误读最多暴露一字段） ----------
$secretsDir = Join-Path $Project '.secrets'
New-Item -ItemType Directory -Force -Path $secretsDir | Out-Null
$secretDefaults = [ordered]@{
  'ssh_host'     = 'CHANGE_ME'
  'ssh_port'     = '22'
  'ssh_user'     = 'root'
  'ssh_password' = 'CHANGE_ME'
}
foreach ($name in $secretDefaults.Keys) {
  $f = Join-Path $secretsDir $name
  if (-not (Test-Path $f)) {
    [System.IO.File]::WriteAllText($f, $secretDefaults[$name], (New-Object System.Text.UTF8Encoding($false)))
  }
}
if (-not (Test-Path (Join-Path $secretsDir 'ssh_key_path'))) {
  Copy-Item (Join-Path $src 'secrets-template\README.txt') (Join-Path $secretsDir 'README.txt') -Force
}
$hostVal = ''
$hostFile = Join-Path $secretsDir 'ssh_host'
$pwFile   = Join-Path $secretsDir 'ssh_password'
if (Test-Path $hostFile) { $hostVal = ([System.IO.File]::ReadAllText($hostFile)).Trim() }
$pwIsPlaceholder = (Test-Path $pwFile) -and (([System.IO.File]::ReadAllText($pwFile)).Trim() -eq 'CHANGE_ME')
$keyFile = Join-Path $secretsDir 'ssh_key_path'
if ($pwIsPlaceholder -and -not (Test-Path $keyFile)) {
  Write-Warning "凭据为模板占位值：请填写 .secrets\ssh_host / ssh_user / ssh_password（或改用 ssh_key_path 密钥认证，见 .secrets\README.txt）"
} else {
  Write-Host "OK: .secrets 凭据文件就绪（$secretsDir）"
}

# ---------- 3b) 收紧 .secrets ACL：移除继承，仅当前用户完全控制（best-effort） ----------
try {
  $aclUser = "$env:USERDOMAIN\$env:USERNAME"
  icacls $secretsDir /inheritance:r /grant:r "${aclUser}:(OI)(CI)F" 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "OK: .secrets ACL 已收紧为仅当前用户" }
  else { Write-Warning "icacls 退出码 $LASTEXITCODE，ACL 未完全收紧（非致命，建议手工检查）" }
} catch { Write-Warning "ACL 收紧失败（非致命）：$($_.Exception.Message)" }

# ---------- 4) .gitignore 补齐 ----------
$gitignore = Join-Path $Project '.gitignore'
$needed = @('.secrets/', '.agents/mcps/*/node_modules/')
$existing = if (Test-Path $gitignore) { [System.IO.File]::ReadAllLines($gitignore) } else { @() }
$missing = @($needed | Where-Object { $existing -notcontains $_ })
if ($missing.Count) {
  $text = if ($existing.Count) { ($existing -join "`r`n") + "`r`n" } else { '' }
  $text += ($missing -join "`r`n") + "`r`n"
  [System.IO.File]::WriteAllText($gitignore, $text, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "OK: .gitignore += $($missing -join ', ')"
} else {
  Write-Host "SKIP: .gitignore 已包含所需规则"
}

# ---------- 5) 客户端配置生成（幂等合并，保留已有条目） ----------
function Update-JsonFile([string]$Path, [scriptblock]$Mutate, [string]$Label) {
  $json = if (Test-Path $Path) {
    try {
      [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    } catch { throw "$Label 配置文件不是合法 JSON，请手工修复后重跑: $Path" }
  } else { [PSCustomObject]@{} }
  & $Mutate $json
  $dir = Split-Path $Path -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($Path, ($json | ConvertTo-Json -Depth 30), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "OK: $Label -> $Path"
}

function Ensure-Property($Obj, [string]$Name) {
  if ($Obj.PSObject.Properties[$Name] -and $Obj.$Name) { return $Obj.$Name }
  $val = [PSCustomObject]@{}
  if ($Obj.PSObject.Properties[$Name]) { $Obj.$Name = $val } else { $Obj | Add-Member -NotePropertyName $Name -NotePropertyValue $val }
  return $val
}

$runnerPath = (Join-Path $dst 'bin\run-ssh-mcp.cjs') -replace '\\', '/'
$projectFwd = $Project -replace '\\', '/'
$projectKey = ('ssh-' + (Split-Path $Project -Leaf)).ToLower()

$allClients = @('opencode', 'cursor', 'zed', 'claude', 'dsh')
$targets = @($Clients | ForEach-Object { $_.ToLower() } | Select-Object -Unique)
if (-not $targets) { $targets = $allClients }
foreach ($t in $targets) {
  if ($allClients -notcontains $t) { Write-Warning "未知客户端 '$t'（支持: $($allClients -join ', ')），跳过"; continue }
}

if ($targets -contains 'opencode') {
  Update-JsonFile (Join-Path $Project 'opencode.json') {
    param($j)
    $mcp = Ensure-Property $j 'mcp'
    $entry = [PSCustomObject]@{ type = 'local'; command = @('node', $runnerPath, '--project', $projectFwd); enabled = $true }
    if ($mcp.PSObject.Properties['ssh']) { $mcp.ssh = $entry } else { $mcp | Add-Member -NotePropertyName 'ssh' -NotePropertyValue $entry }
    # v0.2: 凭据防护——deny 规则放在 "*" 之后（last match wins），拦截 AI 读 .secrets /
    # grep 凭据字段 / 终端命令带 .secrets。其他客户端无内建等价物，靠 runner 层与 skill 纪律层兜底。
    $perm = Ensure-Property $j 'permission'
    $read = Ensure-Property $perm 'read'
    if (-not $read.PSObject.Properties['*']) { $read | Add-Member -NotePropertyName '*' -NotePropertyValue 'allow' }
    $read | Add-Member -NotePropertyName '*.secrets*' -NotePropertyValue 'deny' -Force
    $grep = Ensure-Property $perm 'grep'
    if (-not $grep.PSObject.Properties['*']) { $grep | Add-Member -NotePropertyName '*' -NotePropertyValue 'allow' }
    $grep | Add-Member -NotePropertyName '*ssh_password*' -NotePropertyValue 'deny' -Force
    $grep | Add-Member -NotePropertyName '*ssh_key_path*' -NotePropertyValue 'deny' -Force
    $bash = Ensure-Property $perm 'bash'
    if (-not $bash.PSObject.Properties['*']) { $bash | Add-Member -NotePropertyName '*' -NotePropertyValue 'allow' }
    $bash | Add-Member -NotePropertyName '*.secrets*' -NotePropertyValue 'deny' -Force
    $bash | Add-Member -NotePropertyName '*ssh_password*' -NotePropertyValue 'deny' -Force
    $bash | Add-Member -NotePropertyName '*Win32_Process*' -NotePropertyValue 'deny' -Force
  } 'OpenCode MCP 配置'
}

if ($targets -contains 'cursor') {
  Update-JsonFile (Join-Path $Project '.cursor\mcp.json') {
    param($j)
    $servers = Ensure-Property $j 'mcpServers'
    $entry = [PSCustomObject]@{ command = 'node'; args = @($runnerPath, '--project', $projectFwd) }
    if ($servers.PSObject.Properties['ssh']) { $servers.ssh = $entry } else { $servers | Add-Member -NotePropertyName 'ssh' -NotePropertyValue $entry }
  } 'Cursor MCP 配置'
}

if ($targets -contains 'zed') {
  Update-JsonFile (Join-Path $Project '.zed\settings.json') {
    param($j)
    $cs = Ensure-Property $j 'context_servers'
    $cmd = [PSCustomObject]@{ path = 'node'; args = @($runnerPath, '--project', $projectFwd) }
    $entry = [PSCustomObject]@{ command = $cmd }
    if ($cs.PSObject.Properties['ssh']) { $cs.ssh = $entry } else { $cs | Add-Member -NotePropertyName 'ssh' -NotePropertyValue $entry }
  } 'Zed context server 配置'
}

if ($targets -contains 'claude') {
  $claudeCfg = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
  Update-JsonFile $claudeCfg {
    param($j)
    $servers = Ensure-Property $j 'mcpServers'
    $entry = [PSCustomObject]@{ command = 'node'; args = @($runnerPath, '--project', $projectFwd) }
    if ($servers.PSObject.Properties[$projectKey]) { $servers.$projectKey = $entry } else { $servers | Add-Member -NotePropertyName $projectKey -NotePropertyValue $entry }
  } "Claude Desktop MCP 配置（key: $projectKey）"
}

# ---------- 5e) DSH 客户端：Agent 预设（项目级 opt-in，v0.3） ----------
# ASCII-only code block on purpose: this script ships with a BOM, but a BOM lost to any future
# editor makes PS 5.1 parse it as ANSI and CJK literals break the parse. All new CJK text is
# carried as \uXXXX escapes and decoded at runtime by ConvertFrom-EscapedText.
function ConvertFrom-EscapedText {
  param([string]$Text)
  return [regex]::Replace($Text, '\\u([0-9a-fA-F]{4})', { param($m) [string][char][int]('0x' + $m.Groups[1].Value) })
}
function ConvertTo-DshId {
  param([string]$Text, [string]$Fallback)
  $s = [regex]::Replace($Text.ToLowerInvariant(), '[^a-z0-9]+', '-').Trim('-')
  if ($s.Length -gt 32) { $s = $s.Substring(0, 32).Trim('-') }
  if (-not $s -or -not ($s -match '^[a-z0-9]')) { return $Fallback }
  return $s
}
function Read-Utf8Text {
  param([string]$Path)
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}
function Write-Utf8Text {
  param([string]$Path, [string]$Text)
  $dir = Split-Path $Path -Parent
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}
function Get-TextEol {
  param([string]$Text)
  if ($Text -match "`r`n") { return "`r`n" }
  return "`n"
}
function Set-ManagedBlock {
  param([string]$Text, [string]$Key, [string]$Block, [string]$Eol)
  $begin = '# >>> dsh-mcp-shared:' + $Key + ':begin'
  $end = '# <<< dsh-mcp-shared:' + $Key + ':end'
  $pattern = '(?ms)^' + [regex]::Escape($begin) + '.*?^' + [regex]::Escape($end) + '[^\r\n]*'
  if ([regex]::IsMatch($Text, $pattern)) {
    return @{ Text = [regex]::Replace($Text, $pattern, { param($m) $Block }, 1); Mode = 'replaced' }
  }
  $trimmed = $Text.TrimEnd("`r", "`n")
  if ($trimmed.Length -eq 0) { return @{ Text = $Block + $Eol; Mode = 'created' } }
  return @{ Text = $trimmed + $Eol + $Eol + $Block + $Eol; Mode = 'appended' }
}
function Test-DshYaml {
  param([string]$Path, [string]$YamlModule, [string]$ProbeScript)
  if (-not $YamlModule -or -not $ProbeScript) { return $null }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $null }
  if (-not (Test-Path -LiteralPath (Join-Path $YamlModule 'package.json'))) { return $null }
  # A real probe FILE, not `node -e`: PS 5.1 strips embedded double quotes from an argument
  # handed to a native command, so a quoted JS one-liner arrives corrupted at node.
  & node $ProbeScript $YamlModule $Path 2>&1 | Out-Null
  return ($LASTEXITCODE -eq 0)
}

$dshPresetId = ''
$dshPresetFile = ''
if ($targets -contains 'dsh') {
  $dshHomePath = $DshHome
  if (-not $dshHomePath) { $dshHomePath = $env:DSH_HOME }
  if (-not $dshHomePath) { $dshHomePath = Join-Path $env:USERPROFILE '.dsh' }
  if (-not (Test-Path -LiteralPath $dshHomePath)) {
    Write-Warning "DSH home not found: $dshHomePath -- skipping the dsh client (use -DshHome to point elsewhere)"
  } else {
    $dshHomePath = (Resolve-Path -LiteralPath $dshHomePath).Path
    $dshProfilesDir = Join-Path $dshHomePath 'profiles'
    $projectLeaf = Split-Path $Project -Leaf
    $dshPresetId = ConvertTo-DshId -Text ($DshPresetName) -Fallback (ConvertTo-DshId -Text ($projectLeaf + '-ssh') -Fallback 'ssh-mcp')
    $dshServerName = ConvertTo-DshId -Text ($projectLeaf + '-ssh') -Fallback 'ssh-mcp'
    if ($dshPresetId -notmatch '^[a-z0-9][a-z0-9-]*$') { throw "invalid DSH preset id '$dshPresetId' (PRESET_ID = ^[a-z0-9][a-z0-9-]*$)" }

    $dshPresetRoot = Join-Path $dshHomePath '.agent-presets'
    if ($DshProjectPreset) { $dshPresetRoot = Join-Path $Project '.dsh\agent-presets' }
    $dshPresetDir = Join-Path $dshPresetRoot $dshPresetId
    $dshPresetFile = Join-Path $dshPresetDir 'agent.cordis.yml'

    $dshInstallRoots = @()
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs' }))) {
      if ($base) { $dshInstallRoots += (Join-Path $base 'DSH Desktop\resources\app') }
    }
    foreach ($drive in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
      if (-not $drive.Root) { continue }
      $dshInstallRoots += (Join-Path $drive.Root 'Program Files\DSH Desktop\resources\app')
      $dshInstallRoots += (Join-Path $drive.Root 'DSH Desktop\resources\app')
    }
    # The launcher shim names the install directory verbatim (covers non-default drive installs).
    $dshLauncher = Get-Command dsh -ErrorAction SilentlyContinue
    if ($dshLauncher -and $dshLauncher.Source) {
      try {
        foreach ($hit in [regex]::Matches((Read-Utf8Text -Path $dshLauncher.Source), '([A-Za-z]:\\[^"\r\n]*?)\\resources\\app\\')) { $dshInstallRoots += ($hit.Groups[1].Value + '\resources\app') }
      } catch { }
    }
    $dshInstallRoots = @($dshInstallRoots | Where-Object { $_ } | Select-Object -Unique)

    # --- base composition: explicit > existing preset > user root > bundled (per DSH install) ---
    $baseCandidates = @()
    if ($DshPresetSource) { $baseCandidates += $DshPresetSource }
    if (Test-Path -LiteralPath $dshPresetFile) { $baseCandidates += $dshPresetFile }
    $baseCandidates += (Join-Path $dshPresetRoot 'standard\agent.cordis.yml')
    foreach ($root in $dshInstallRoots) { $baseCandidates += (Join-Path $root 'node_modules\@deepseek-ai\dsh-agent-presets\presets\standard\agent.cordis.yml') }
    if (Test-Path -LiteralPath $dshProfilesDir) {
      foreach ($profileDir in (Get-ChildItem -LiteralPath $dshProfilesDir -Directory -ErrorAction SilentlyContinue)) {
        $baseCandidates += (Join-Path $profileDir.FullName 'node_modules\@deepseek-ai\dsh-agent-presets\presets\standard\agent.cordis.yml')
        foreach ($pnpmDir in (Get-ChildItem -LiteralPath $profileDir.FullName -Directory -Filter '.pnpm' -ErrorAction SilentlyContinue)) {
          foreach ($pkg in (Get-ChildItem -LiteralPath $pnpmDir.FullName -Directory -Filter '@deepseek-ai+dsh-agent-presets@*' -ErrorAction SilentlyContinue)) {
            $baseCandidates += (Join-Path $pkg.FullName 'node_modules\@deepseek-ai\dsh-agent-presets\presets\standard\agent.cordis.yml')
          }
        }
      }
    }
    $basePath = ''
    foreach ($candidate in $baseCandidates) {
      if ($candidate -and (Test-Path -LiteralPath $candidate)) { $basePath = (Resolve-Path -LiteralPath $candidate).Path; break }
    }
    if (-not $basePath) {
      throw ("DSH base composition not found (looked for 'standard/agent.cordis.yml'). Pass -DshPresetSource <path>, " +
        "or copy a preset once from the DSH GUI (Settings > Agent presets) and re-run.")
    }

    $eol = "`r`n"
    $baseText = Read-Utf8Text -Path $basePath
    if ($baseText.Length -gt 0) { $eol = Get-TextEol -Text $baseText }

    $mcpBlock = (@(
      '# >>> dsh-mcp-shared:ssh:begin  (generated by mcps/ssh-runner/install.ps1 -Clients dsh; do not edit inside)'
      '- id: mcp-ssh'
      "  name: '@deepseek-ai/dsh-mcp-client'"
      '  config:'
      ('    serverName: ' + $dshServerName)
      '    transport: stdio'
      "    command: 'node'"
      ("    args: ['" + $runnerPath + "', '--project', '" + $projectFwd + "']")
      '    failOnStartupError: false'
      '    toolCallTimeoutMs: 30000'
      '# <<< dsh-mcp-shared:ssh:end'
    ) -join $eol)

    $yamlModule = $DshYamlModule
    if (-not $yamlModule) {
      $yamlCandidates = @()
      foreach ($root in $dshInstallRoots) { $yamlCandidates += (Join-Path $root 'node_modules\yaml') }
      if (Test-Path -LiteralPath $dshProfilesDir) {
        foreach ($profileDir in (Get-ChildItem -LiteralPath $dshProfilesDir -Directory -ErrorAction SilentlyContinue)) {
          $yamlCandidates += (Join-Path $profileDir.FullName 'node_modules\yaml')
        }
      }
      foreach ($candidate in $yamlCandidates) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'package.json')) { $yamlModule = $candidate; break }
      }
    }

    $yamlProbeScript = ''
    if ($yamlModule) {
      $yamlProbeScript = Join-Path ([System.IO.Path]::GetTempPath()) 'dsh-mcp-yaml-check.cjs'
      $probeBody = (@(
        "const fs = require('fs')"
        "const YAML = require(process.argv[2])"
        "const jsTag = { tag: 'tag:yaml.org,2002:js', resolve: (value) => value }"
        "YAML.parse(fs.readFileSync(process.argv[3], 'utf8'), { customTags: [jsTag] })"
      ) -join "`n") + "`n"
      Write-Utf8Text -Path $yamlProbeScript -Text $probeBody
    }

    $currentPresetText = ''
    if (Test-Path -LiteralPath $dshPresetFile) { $currentPresetText = Read-Utf8Text -Path $dshPresetFile }
    $nextPresetText = (Set-ManagedBlock -Text $baseText -Key 'ssh' -Block $mcpBlock -Eol $eol).Text
    if ($currentPresetText -eq $nextPresetText) {
      Write-Host "SKIP: DSH preset already up to date -> $dshPresetFile"
    } else {
      $probeFile = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-preset-check-' + [guid]::NewGuid().ToString('N') + '.yml')
      Write-Utf8Text -Path $probeFile -Text $nextPresetText
      $yamlOk = Test-DshYaml -Path $probeFile -YamlModule $yamlModule -ProbeScript $yamlProbeScript
      Remove-Item -LiteralPath $probeFile -Force -ErrorAction SilentlyContinue
      if ($yamlOk -eq $false) { throw "generated agent.cordis.yml is not valid YAML; refusing to write $dshPresetFile" }
      if ($null -eq $yamlOk) { Write-Warning 'YAML syntax check skipped (no yaml module next to the DSH install)' }
      Write-Utf8Text -Path $dshPresetFile -Text $nextPresetText
      Write-Host "OK: DSH preset -> $dshPresetFile"
    }

    $presetMeta = Join-Path $dshPresetDir 'preset.yml'
    if (Test-Path -LiteralPath $presetMeta) {
      Write-Host "SKIP: DSH preset.yml exists (user edits kept) -> $presetMeta"
    } else {
      $title = ConvertFrom-EscapedText -Text ($projectLeaf + ' \u00b7 SSH MCP')
      $desc = (ConvertFrom-EscapedText -Text '\u6807\u51c6\u9884\u8bbe + ssh-runner\uff08{0}\uff09\u3002\u4ec5\u9009\u4e2d\u672c\u9884\u8bbe\u7684\u4f1a\u8bdd\u53ef\u89c1 mcp__{1}__* \u5de5\u5177\uff1b\u51ed\u636e\u7559\u5728\u9879\u76ee .secrets/\uff08\u4e00\u6b21\u8bef\u8bfb\u4ec5\u66b4\u9732\u5355\u5b57\u6bb5\uff09\u3002') -f $Project, $dshServerName
      $metaText = (@(('name: "' + $title + '"'), ('description: "' + $desc + '"')) -join $eol) + $eol
      Write-Utf8Text -Path $presetMeta -Text $metaText
      Write-Host "OK: DSH preset.yml -> $presetMeta"
    }

    if ($DshProjectPreset) {
      $profileName = $DshProfile
      if (-not $profileName) {
        if (Test-Path -LiteralPath (Join-Path $dshProfilesDir 'desktop')) { $profileName = 'desktop' }
        elseif (Test-Path -LiteralPath $dshProfilesDir) {
          $dirs = @(Get-ChildItem -LiteralPath $dshProfilesDir -Directory -ErrorAction SilentlyContinue)
          if ($dirs.Count -eq 1) { $profileName = $dirs[0].Name }
        }
      }
      if (-not $profileName) { throw 'cannot pick a DSH profile automatically: pass -DshProfile <name>' }
      $patchPath = Join-Path $dshProfilesDir ($profileName + '\cordis.patch.yml')

      $defaultPreset = $DshDefaultPreset
      if (-not $defaultPreset) {
        $defaultPreset = 'standard'
        foreach ($root in $dshInstallRoots) {
          $bundlePatch = Join-Path $root 'node_modules\@deepseek-ai\dsh-web-app\cordis.patch.yml'
          if (Test-Path -LiteralPath $bundlePatch) {
            $hit = [regex]::Match((Read-Utf8Text -Path $bundlePatch), '(?m)^\s+default:\s*([A-Za-z0-9_-]+)\s*$')
            if ($hit.Success) { $defaultPreset = $hit.Groups[1].Value; break }
          }
        }
      }

      $rootPosix = ($dshPresetRoot -replace '\\', '/')
      $rootsBlock = (@(
        '# >>> dsh-mcp-shared:roots:begin  (generated by mcps/ssh-runner/install.ps1 -Clients dsh; do not edit inside)'
        '# NOTE: a cordis patch `config` REPLACES the whole object, so the row repeats the complete'
        '#       agent-presets config (default + roots) instead of only adding roots.'
        '- id: agent-presets'
        '  config:'
        ('    default: ' + $defaultPreset)
        '    roots:'
        ("      - path: '" + $rootPosix + "'")
        '        trust: user'
        '# <<< dsh-mcp-shared:roots:end'
      ) -join $eol)

      $patchText = ''
      if (Test-Path -LiteralPath $patchPath) { $patchText = Read-Utf8Text -Path $patchPath }
      $hasManaged = $patchText.Contains('# >>> dsh-mcp-shared:roots:begin')
      $hasForeign = [regex]::IsMatch($patchText, '(?m)^\s*-?\s*id:\s*agent-presets\s*$')
      if ($hasForeign -and -not $hasManaged) {
        Write-Warning "profile patch already patches 'agent-presets' outside our managed block -> $patchPath"
        Write-Warning ("  add this root by hand, keeping the existing default: roots: [{ path: '" + $rootPosix + "', trust: user }]")
      } else {
        $nextPatchText = (Set-ManagedBlock -Text $patchText -Key 'roots' -Block $rootsBlock -Eol $eol).Text
        $probeFile = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-patch-check-' + [guid]::NewGuid().ToString('N') + '.yml')
        Write-Utf8Text -Path $probeFile -Text $nextPatchText
        $yamlOk = Test-DshYaml -Path $probeFile -YamlModule $yamlModule -ProbeScript $yamlProbeScript
        Remove-Item -LiteralPath $probeFile -Force -ErrorAction SilentlyContinue
        if ($yamlOk -eq $false) { throw "generated profile patch is not valid YAML; refusing to write $patchPath" }
        if ($null -eq $yamlOk) { Write-Warning 'YAML syntax check skipped (no yaml module next to the DSH install)' }
        if ($nextPatchText -eq $patchText) {
          Write-Host "SKIP: DSH preset root already registered -> $patchPath"
        } else {
          Write-Utf8Text -Path $patchPath -Text $nextPatchText
          Write-Host "OK: DSH preset root registered (profile '$profileName') -> $patchPath"
        }
      }
    }
  }
}

# ---------- 6) 验收提示 ----------
Write-Host ''
Write-Host "安装完成。验收清单："
Write-Host "  1. 填写 .secrets\ssh_host / ssh_user / ssh_password（或 ssh_key_path，见 .secrets\README.txt）"
Write-Host '  2. stdio 握手: echo initialize 请求 | node bin\run-ssh-mcp.cjs --project <项目> （详见 README）'
Write-Host '  3. 检查子进程命令行无凭据: Get-CimInstance Win32_Process -Filter \"Name=''node.exe''\" | Select CommandLine'
if ($targets -contains 'claude') { Write-Host '  4. Claude Desktop 需重启应用以加载全局配置' }
if ($targets -contains 'dsh' -and $dshPresetId) {
  Write-Host ('  5. DSH: pick the preset in the session preset seat -- id: ' + $dshPresetId)
  Write-Host ('     file: ' + $dshPresetFile)
  Write-Host ('     tools appear as mcp__' + (ConvertTo-DshId -Text ((Split-Path $Project -Leaf) + '-ssh') -Fallback 'ssh-mcp') + '__* ; no restart needed (preset roster re-reads roots per call)')
}
