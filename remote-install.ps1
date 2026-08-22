#Requires -Version 5.1
<#
.SYNOPSIS
  node-architect 一键云端安装器：从 GitHub 公开仓库拉取母版并安装到目标项目。
  零凭据、零依赖（Windows + PowerShell 5.1 即可）。
.EXAMPLE
  # 任意项目根目录，一行命令直装：
  irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1 | iex

  # 或下载后带参数运行：
  powershell -ExecutionPolicy Bypass -File remote-install.ps1 -Project D:\www\myapp -Clients opencode
#>
param(
  [string]$Project = (Get-Location).Path,
  [string]$Repo    = 'yuki-czf/dsh-base',
  [string]$Branch  = 'main',
  [string[]]$Clients = @(),
  [switch]$Copy,
  [switch]$SkipNodes
)
$ErrorActionPreference = 'Stop'

# ---------- 0) 强制 TLS 1.2（PS 5.1 默认可能协商不到） ----------
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not (Test-Path $Project)) { throw "目标项目目录不存在: $Project" }
$Project = (Resolve-Path $Project).Path

# ---------- 1) 下载仓库 zip 到临时目录 ----------
$tmp  = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-base-" + [System.Guid]::NewGuid().ToString('N').Substring(0,8))
$zip  = Join-Path $tmp 'repo.zip'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$url = "https://codeload.github.com/$Repo/zip/refs/heads/$Branch"
Write-Host "下载 $url ..."
try {
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
} catch {
  throw "下载失败（网络不通或需代理）：$($_.Exception.Message)"
}

# ---------- 2) 解压并定位母版 install.ps1 ----------
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$master = Get-ChildItem -Path $tmp -Directory | Where-Object { $_.Name -like "$($Repo.Split('/')[1])-*" } | Select-Object -First 1
if (-not $master) { throw "解压后未找到仓库目录（结构变更？）" }
$installer = Join-Path $master.FullName 'node-architect\install.ps1'
if (-not (Test-Path $installer)) { throw "未找到母版安装器: $installer" }

# ---------- 3) 执行安装（透传参数） ----------
$splat = @{ Project = $Project }
if ($Clients)     { $splat.Clients   = $Clients }
if ($Copy)        { $splat.Copy      = $true }
if ($SkipNodes)   { $splat.SkipNodes = $true }
& $installer @splat
$code = $LASTEXITCODE

# ---------- 4) 清理临时目录 ----------
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
if ($code) { exit $code }
Write-Host ""
Write-Host "云端安装完成。验证：目标项目应出现 .agents\skills\node-architect\SKILL.md 与 .nodes\CONTEXT.md"
