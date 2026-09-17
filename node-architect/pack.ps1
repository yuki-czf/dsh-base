#Requires -Version 5.1
<#
.SYNOPSIS
  把母版打包为可分发自包含 zip：dist\node-architect-v<版本>.zip（附 .sha256 校验文件）。
  zip 解压到任意目录即为完整安装源（Windows + PowerShell 5.1 即可用）。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File pack.ps1
  powershell -ExecutionPolicy Bypass -File pack.ps1 -OutDir D:\share
#>
param(
  [string]$OutDir = ''
)
$ErrorActionPreference = 'Stop'
$master = $PSScriptRoot

# 打包清单（母版自包含所需的最小集合；dist/ 与运行杂物不入包）
$items = @('skill', 'bridge', 'bootstrap', 'install.ps1', 'AGENTS.md', 'README.md')
foreach ($i in $items) {
  if (-not (Test-Path (Join-Path $master $i))) { throw "打包项缺失: $i（母版不完整）" }
}

# 版本号单一真源：skill/SKILL.md frontmatter
$ver = $null
$vm = Select-String -Path (Join-Path $master 'skill\SKILL.md') -Pattern '^version:\s*(\S+)\s*$' | Select-Object -First 1
if ($vm) { $ver = $vm.Matches[0].Groups[1].Value }
if (-not $ver) { throw '未在 skill\SKILL.md frontmatter 解析到 version:' }

if (-not $OutDir) { $OutDir = Join-Path $master 'dist' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

# 暂存干净目录（避免把 dist 嵌套打进包）
$staging = Join-Path $OutDir 'staging\node-architect'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null
foreach ($i in $items) { Copy-Item (Join-Path $master $i) (Join-Path $staging $i) -Recurse -Force }

# 压缩 + sha256
$zip = Join-Path $OutDir "node-architect-v$ver.zip"
Compress-Archive -Path $staging -DestinationPath $zip -Force
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash
$shaFile = "$zip.sha256"
[System.IO.File]::WriteAllText($shaFile, "$hash  node-architect-v$ver.zip`n", (New-Object System.Text.UTF8Encoding($false)))

Remove-Item (Join-Path $OutDir 'staging') -Recurse -Force

$sizeKB = [math]::Round((Get-Item $zip).Length / 1KB, 1)
Write-Host "OK: $zip（$sizeKB KB）"
Write-Host "OK: $shaFile"
Write-Host "分发：整目录拷走 / 发 zip 均可；对方解压后对 agent 说「帮我安装 <解压路径>\node-architect 目录下的 skill」。"
