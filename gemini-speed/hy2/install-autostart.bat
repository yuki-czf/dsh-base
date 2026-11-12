@echo off
rem Register logon autostart (hidden, watchdog)
cd /d "%~dp0"
schtasks /Create /TN "HysteriaCPA" /SC ONLOGON /DELAY 0000:20 /TR "wscript.exe "%~dp0invisible.vbs" "%~dp0run-hy2.bat"" /F
if %errorlevel%==0 (
  echo [OK] Autostart registered. Starting now...
  schtasks /Run /TN "HysteriaCPA"
) else (
  echo [FAIL] schtasks error - right-click this file, Run as administrator
)
pause
