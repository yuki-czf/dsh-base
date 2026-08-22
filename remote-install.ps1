#Requires -Version 5.1
<#
.SYNOPSIS
  dsh-base 云端一键安装器：从 GitHub 公开仓库拉取母版并安装到目标项目。
  零凭据、零依赖（Windows + PowerShell 5.1 即可；ssh-runner 模块另需 node/npm）。
.EXAMPLE
  # node-architect（默认模块，行为同旧版）：
  irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1 | iex

  # ssh-runner MCP（带参数的一行式）：
  & ([scriptblock]::Create((irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1))) -Module ssh-runner

  # 下载后带参数运行：
  powershell -ExecutionPolicy Bypass -File remote-install.ps1 -Module ssh-runner -Project D:\www\myapp -Clients opencode,cursor

  # 离线/内网：直接指向本地仓库 zip
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

# ---------- 0) 强制 TLS 1.2（PS 5.1 默认可能协商不到） ----------
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not (Test-Path $Project)) { throw "目标项目目录不存在: $Project" }
$Project = (Resolve-Path $Project).Path

# 模块 -> 安装器相对路径（新增模块在这里登记一行即可）
$moduleMap = @{
  'node-architect' = 'node-architect\install.ps1'
  'ssh-runner'     = 'mcps\ssh-runner\install.ps1'
}

# ---------- 1) 获取仓库 zip（云端下载或本地离线包） ----------
$tmp  = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-base-" + [System.Guid]::NewGuid().ToString('N').Substring(0,8))
$zip  = Join-Path $tmp 'repo.zip'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

if ($ZipPath) {
  if (-not (Test-Path $ZipPath)) { throw "本地 zip 不存在: $ZipPath" }
  Copy-Item $ZipPath $zip
  Write-Host "使用本地离线包: $ZipPath"
} else {
  $url = "https://codeload.github.com/$Repo/zip/refs/heads/$Branch"
  Write-Host "下载 $url ..."
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  } catch {
    throw "下载失败（网络不通或需代理）：$($_.Exception.Message)"
  }
}

# ---------- 2) 解压并定位模块安装器 ----------
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$master = Get-ChildItem -Path $tmp -Directory | Where-Object { $_.Name -like "$($Repo.Split('/')[1])-*" } | Select-Object -First 1
if (-not $master) { throw "解压后未找到仓库目录（结构变更？）" }
$installer = Join-Path $master.FullName $moduleMap[$Module]
if (-not (Test-Path $installer)) { throw "未找到模块 [$Module] 安装器: $installer（该分支可能尚未包含此模块，先推送仓库）" }

# ---------- 3) 执行安装（按模块透传参数） ----------
$splat = @{ Project = $Project }
if ($Clients) { $splat.Clients = $Clients }
if ($Module -eq 'node-architect') {
  if ($Copy)      { $splat.Copy      = $true }
  if ($SkipNodes) { $splat.SkipNodes = $true }
  if ($Force)     { Write-Warning "-Force 仅对 ssh-runner 模块有效，已忽略" }
} else {
  if ($Force)     { $splat.Force     = $true }
  if ($Copy -or $SkipNodes) { Write-Warning "-Copy/-SkipNodes 仅对 node-architect 模块有效，已忽略" }
}
& $installer @splat
$code = $LASTEXITCODE

# ---------- 4) 清理临时目录 ----------
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
if ($code) { exit $code }
Write-Host ""
Write-Host "云端安装完成（模块: $Module -> $Project）"
