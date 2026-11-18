@echo off
rem HY2 tri-lane health check (v5 - fast models probe + Web-lane real completion deep probe)
rem 9443 = CPA lane, 9444 = AI Studio lane, 9445 = Gemini Web lane (each checked when key file exists)
rem v5: Web lane additionally fires ONE real completion to catch WARP drift / proxy breaker / upstream 302
rem     (v4 models-probe cannot see "tunnel up but upstream broken" - the 11-17 outage blind spot)
cd /d "%~dp0"
tasklist /FI "IMAGENAME eq hysteria.exe" | find /I "hysteria.exe" >nul
if not %errorlevel%==0 (
  echo [X] hysteria.exe NOT running. Double-click start-hy2.bat first.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-lanes.ps1"
echo.
pause
