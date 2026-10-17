# pi-tempo watchdog resident launcher: auto-restart on crash, single-instance guard, output to log.
# Launch hidden via start-on-boot.vbs (recommended), or run directly.
# Note: log is written line-by-line via Add-Content (no persistent handle) so a second
#       instance can still log its "already running" message before exiting.
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [Console]::OutputEncoding } catch { }
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $env:USERPROFILE '.pi-desktop\logs\pi-tempo-watchdog-run.log'
$pidFile = Join-Path $env:USERPROFILE '.pi-desktop\logs\pi-tempo-watchdog.pid'

function Log($msg) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $log -Value "[$stamp] $msg" -Encoding UTF8
}

# --- guard 1: PID file (wrapper liveness). No command-line matching = no false positives. ---
if (Test-Path $pidFile) {
  $old = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1).ToString().Trim()
  if ($old -match '^\d+$' -and (Get-Process -Id ([int]$old) -ErrorAction SilentlyContinue)) {
    Log "already running (wrapper pid $old), exit"
    exit 0
  }
}

# --- guard 2: orphan node watchdog (wrapper killed but child survived) -> kill for a clean start ---
try {
  $orphan = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'watchdog\.mjs' }
  if ($orphan) {
    Log "orphan node watchdog (pid $($orphan[0].ProcessId)) killed for clean start"
    $orphan | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  }
} catch { }

Set-Content -Path $pidFile -Value $PID
Log "starting watchdog (wrapper pid $PID)"

while ($true) {
  & node (Join-Path $dir 'watchdog.mjs') 2>&1 | ForEach-Object { Log $_.ToString() }
  Log "watchdog exited (code=$LASTEXITCODE), restart in 5s"
  Start-Sleep -Seconds 5
}
