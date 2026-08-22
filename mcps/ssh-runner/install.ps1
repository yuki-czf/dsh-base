#Requires -Version 5.1
<#
.SYNOPSIS
  dsh ssh-mcp-runner 项目级安装：拷贝 runner 到目标项目 + npm install + .secrets 初始化 + 四端 MCP 配置幂等生成。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1
  powershell -ExecutionPolicy Bypass -File install.ps1 -Project D:\www\myapp -Clients opencode,cursor
  powershell -ExecutionPolicy Bypass -File install.ps1 -Force      # 覆盖已存在的 policy.json
#>
param(
  [string]$Project = (Get-Location).Path,
  [string[]]$Clients = @(),
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot

if (-not (Test-Path $Project)) { throw "目标项目目录不存在: $Project" }
$Project = (Resolve-Path $Project).Path

# ---------- 0) 前置检查 ----------
foreach ($tool in 'node', 'npm') {
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
Write-Host "npm install（--omit=dev）..."
Push-Location $dst
try {
  npm install --omit=dev --no-fund --no-audit 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "npm install 失败（exit $LASTEXITCODE）" }
} finally { Pop-Location }
Write-Host "OK: 依赖安装完成"

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

$allClients = @('opencode', 'cursor', 'zed', 'claude')
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

# ---------- 6) 验收提示 ----------
Write-Host ''
Write-Host "安装完成。验收清单："
Write-Host "  1. 填写 .secrets\ssh_host / ssh_user / ssh_password（或 ssh_key_path，见 .secrets\README.txt）"
Write-Host '  2. stdio 握手: echo initialize 请求 | node bin\run-ssh-mcp.cjs --project <项目> （详见 README）'
Write-Host '  3. 检查子进程命令行无凭据: Get-CimInstance Win32_Process -Filter \"Name=''node.exe''\" | Select CommandLine'
if ($targets -contains 'claude') { Write-Host '  4. Claude Desktop 需重启应用以加载全局配置' }
