@echo off
rem HY2 dual-lane health check (v3 - powershell based)
rem 9443 = CPA lane, 9444 = AI Studio lane (checked when key file exists)
cd /d "%~dp0"
tasklist /FI "IMAGENAME eq hysteria.exe" | find /I "hysteria.exe" >nul
if not %errorlevel%==0 (
  echo [X] hysteria.exe NOT running. Double-click start-hy2.bat first.
  pause
  exit /b 1
)
powershell -NoProfile -Command "$lanes = @(@{p=9443; n='CPA';       k='cpa-api-key.txt'}, @{p=9444; n='AIStudio'; k='aistudio-api-key.txt'}); foreach ($l in $lanes) { $kf = $l.k; if (Test-Path $kf) { $k = (Get-Content -LiteralPath $kf -Raw).Trim(); try { $r = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $l.p + '/v1/models') -Headers @{Authorization = ('Bearer ' + $k)} -TimeoutSec 12 -UseBasicParsing; Write-Host ('[OK] ' + $l.n + ' (' + $l.p + ') HTTP ' + $r.StatusCode) } catch { if ($_.Exception.Response) { Write-Host ('[?] ' + $l.n + ' (' + $l.p + ') HTTP ' + [int]$_.Exception.Response.StatusCode + ' - key problem') } else { Write-Host ('[X] ' + $l.n + ' (' + $l.p + ') tunnel down: ' + $_.Exception.Message) } } } else { Write-Host ('[--] ' + $l.n + ' (' + $l.p + ') skipped - no ' + $kf) } }"
echo.
pause
