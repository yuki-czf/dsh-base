#Requires -Version 5.1
<#
.SYNOPSIS
  DSH 批末自动派生：在 DSH Desktop 里自动开出下一批会话。
  三连：session.create（cwd + batch-executor preset）→ session.selectModel（公司 vLLM 小模型）→ session.prompt（批间衔接指令）。
  前置：DSH 设置已开启「允许在浏览器中打开」（compatibility shell，网络范围保持仅本机/loopback）。
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File derive-next-batch.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File derive-next-batch.ps1 -Prompt '执行节点9批2'
.NOTES
  API 契约反推记录：.nodes/plans/DSH自动派生探路.md（节点8 批1）。业务错误恒为 HTTP 200 + result.ok=false。
#>
param(
  [string]$Cwd = (Get-Location).Path,
  [string]$AgentPreset = 'batch-executor',
  [string]$Provider = 'company-llm',
  [string]$Model = 'Qwen3.8-27B-W4A16-AWQ',
  [string]$Prompt = '执行下一批。（本会话由上一批批末自动派生）',
  [int]$BasePort = 43120,
  [int]$PortSpan = 33
)
$ErrorActionPreference = 'Stop'

function Invoke-DshRpc {
  param([int]$Port, [string]$Method, [object]$Payload)
  $body = @{
    type    = 'client-request'
    rpcId   = [guid]::NewGuid().ToString()
    method  = $Method
    payload = $Payload
  } | ConvertTo-Json -Depth 8
  # PS 5.1 的 Invoke-RestMethod 对字符串 body 默认按 latin1 编码，中文会变 '?'——必须显式按 UTF-8 字节发送
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $resp = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/$Method" -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 60
  if (-not $resp.result.ok) {
    $e = $resp.result.error
    throw "$Method 失败: $($e.code) $($e.message)"
  }
  return $resp.result.value
}

# 探端口：GET / 返回 200 的第一个端口（403 = 门未开；连接拒绝 = 不在该端口）
$port = $null
for ($p = $BasePort; $p -lt $BasePort + $PortSpan; $p++) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$p/" -Method Get -TimeoutSec 3 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $port = $p; break }
  } catch {
    $code = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    if ($code -eq 403) {
      throw "端口 $p 的 DSH 网页服务存在但拒绝访问（403）。请先在 DSH 设置开启「允许在浏览器中打开」（网络范围保持仅本机）并重启 DSH 后重试。"
    }
  }
}
if (-not $port) { throw "在 $BasePort..$($BasePort + $PortSpan - 1) 未发现 DSH 网页服务（DSH 未运行？）" }
Write-Host "DSH web 服务端口: $port"

$created = Invoke-DshRpc -Port $port -Method 'session.create' -Payload @{ cwd = $Cwd; agentPreset = $AgentPreset }
$sid = $created.sessionId
Write-Host "会话已创建: $sid（preset: $AgentPreset）"

$null = Invoke-DshRpc -Port $port -Method 'session.selectModel' -Payload @{ sessionId = $sid; provider = $Provider; model = $Model }
Write-Host "模型已选择: $Provider / $Model"

$null = Invoke-DshRpc -Port $port -Method 'session.prompt' -Payload @{
  sessionId = $sid
  mode      = 'queue'
  content   = @(@{ type = 'text'; text = $Prompt })
}
Write-Host "批间指令已投递。"
Write-Host ""
Write-Host "派生完成：DSH 中已开出新会话 $sid"
exit 0
