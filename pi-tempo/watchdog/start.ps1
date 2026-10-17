# pi-tempo watchdog 常驻启动器：崩溃自动拉起，输出落日志
# 用法（建议开机/开工时跑一次，窗口可最小化）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File start.ps1
# 后台隐藏窗口：powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File start.ps1
# 停止：任务管理器结束 node.exe（跑 watchdog 的那个），或 Get-Process node | Where-Object {$_.CommandLine -match 'watchdog'} | Stop-Process
$ErrorActionPreference = 'Continue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $env:USERPROFILE '.pi-desktop\logs\pi-tempo-watchdog-run.log'
while ($true) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $log -Value "[$stamp] starting watchdog"
  & node (Join-Path $dir 'watchdog.mjs') *>> $log
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $log -Value "[$stamp] watchdog exited (code=$LASTEXITCODE), restart in 5s"
  Start-Sleep -Seconds 5
}
