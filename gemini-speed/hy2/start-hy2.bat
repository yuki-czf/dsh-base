@echo off
rem Start Hysteria CPA client (hidden, with watchdog)
cd /d "%~dp0"
wscript.exe invisible.vbs run-hy2.bat
echo Starting... waiting 4s
timeout /t 4 /nobreak >nul
tasklist /FI "IMAGENAME eq hysteria.exe" | find /I "hysteria.exe" >nul
if %errorlevel%==0 (
  echo [OK] hysteria.exe process running.
) else (
  echo [X] process not running - check client.err.log
)
findstr /C:"connected to server" client.err.log >nul 2>&1
if %errorlevel%==0 (
  echo [OK] Tunnel connected. CPA lane: http://127.0.0.1:9443/v1
) else (
  echo [CHECK] no "connected to server" in log yet.
  echo If it never connects - network may block UDP. Fallback:
  echo   https://api.mindnest.asia:8444/v1
)
pause
