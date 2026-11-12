@echo off
rem Silent watchdog: keep hysteria client alive, restart on crash
cd /d "%~dp0"
:loop
tasklist /FI "IMAGENAME eq hysteria.exe" | find /I "hysteria.exe" >nul
if %errorlevel%==0 (
  timeout /t 10 /nobreak >nul
  goto loop
)
hysteria.exe client -c client.yaml >> client.out.log 2>> client.err.log
timeout /t 5 /nobreak >nul
goto loop
