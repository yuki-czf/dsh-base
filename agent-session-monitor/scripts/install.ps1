# agent-session-monitor installer: firewall inbound rule (Private profile only)
# + logon scheduled task + config init. ASCII-only for PowerShell 5.1 safety.
param(
  [int]$Port = 7788
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$nodeJs = "C:\tools\nodejs\node.exe"
if (-not (Test-Path $nodeJs)) { $nodeJs = (Get-Command node).Source }

Write-Host "==> 1/3 Firewall inbound rule (Private profile only)"
$ruleName = "AgentSessionMonitor-Panel"
try {
  if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName $ruleName
  }
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port `
    -Profile Private -Action Allow | Out-Null
  Write-Host "    Rule $ruleName created (TCP $Port, Private)"
} catch {
  Write-Host "    [WARN] Firewall rule failed ($($_.Exception.Message.Trim()))."
  Write-Host "    Phone access on LAN needs this rule - re-run install.ps1 from an elevated prompt."
}

Write-Host "==> 2/3 Config init"
$cfgPath = Join-Path $root "config.yaml"
if (-not (Test-Path $cfgPath)) {
  Copy-Item (Join-Path $root "config.example.yaml") $cfgPath
  Write-Host "    config.yaml created (edit token / baseUrl / data paths)"
} else {
  Write-Host "    config.yaml exists, skipped"
}

Write-Host "==> 3/3 Logon autostart"
$taskName = "AgentSessionMonitor"
$cmd = "`"$nodeJs`" `"$root\dist\index.js`""
$taskOk = $false
try {
  $action = New-ScheduledTaskAction -Execute $nodeJs -Argument "`"$root\dist\index.js`"" -WorkingDirectory $root
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings | Out-Null
  $taskOk = $true
  Write-Host "    Scheduled task $taskName registered (at logon)"
} catch {
  Write-Host "    [INFO] schtasks needs admin; falling back to HKCU Run registry"
}
if (-not $taskOk) {
  $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  Set-ItemProperty -Path $runKey -Name $taskName -Value $cmd
  Write-Host "    HKCU Run entry '$taskName' created (logon autostart, no admin needed)"
}

Write-Host ""
Write-Host "OK. Start now:  schtasks /run /tn $taskName"
Write-Host "Uninstall:      powershell -File scripts\uninstall.ps1"
