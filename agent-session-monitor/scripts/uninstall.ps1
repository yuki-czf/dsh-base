# agent-session-monitor uninstaller: removes scheduled task + firewall rule.
# Keeps data/ and config.yaml. ASCII-only for PowerShell 5.1 safety.
$ErrorActionPreference = 'Continue'
$taskName = "AgentSessionMonitor"
$ruleName = "AgentSessionMonitor-Panel"

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Removed scheduled task $taskName"
} else { Write-Host "Scheduled task not found, skipped" }

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runVal = Get-ItemProperty -Path $runKey -Name $taskName -ErrorAction SilentlyContinue
if ($runVal) {
  Remove-ItemProperty -Path $runKey -Name $taskName
  Write-Host "Removed HKCU Run entry $taskName"
} else { Write-Host "HKCU Run entry not found, skipped" }

if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName $ruleName
  Write-Host "Removed firewall rule $ruleName"
} else { Write-Host "Firewall rule not found, skipped" }

Write-Host "OK. data/ and config.yaml kept."
