@echo off
chcp 65001 >nul
title Antigravity Launcher (proxy + hans + effort slider + fallback)

set "PROXY=http://127.0.0.1:7897"
set "HANS=%~dp0antigravity-hans.exe"
set "APP=%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe"
set "SLIDER=G:\www\antigravity-lab\plugins\effort-slider\tools\inject-cdp.cjs"

rem --- 512K context patch check (tools/context-autofix) ---
set "LSBIN=%LOCALAPPDATA%\Programs\Antigravity\resources\bin\language_server.exe"
set "LSHASHFILE=%~dp0language-server.sha256"
set "LSHASH="
if not exist "%LSHASHFILE%" goto LSNOFILE
if not exist "%LSBIN%" goto LSNOFILE
set /p LSEXPECTED=<"%LSHASHFILE%"
for /f "skip=1 tokens=1 delims= " %%h in ('certutil -hashfile "%LSBIN%" SHA256') do if not defined LSHASH set "LSHASH=%%h"
if /i "%LSHASH%"=="%LSEXPECTED%" goto LSOK
echo [!] language_server.exe changed - 512K context patch likely lost after upgrade.
echo     Re-patch: G:\www\antigravity-lab\tools\context-autofix\windows-fix-all.cmd
echo     Check   : python G:\www\antigravity-lab\tools\context-autofix\scripts\fix_antigravity_context.py --status
timeout /t 5 >nul
goto LSPATCHDONE
:LSOK
echo [OK] Context patch intact (512K).
goto LSPATCHDONE
:LSNOFILE
echo [!] Patch check skipped: language-server.sha256 or language_server.exe not found.
:LSPATCHDONE

netstat -ano | findstr /C:"127.0.0.1:7897" | findstr /C:"LISTENING" >nul 2>&1
if errorlevel 1 goto NOPROXY
echo [OK] Clash detected, proxy env set.
set HTTP_PROXY=%PROXY%
set HTTPS_PROXY=%PROXY%
goto KILLOLD

:NOPROXY
echo [!] Clash 7897 not listening - starting without proxy.
echo     If login fails, open Clash Verge first then rerun.

:KILLOLD
tasklist /FI "IMAGENAME eq Antigravity.exe" 2>nul | find /I "Antigravity.exe" >nul
if errorlevel 1 goto TRYHANS
echo [..] Cleaning leftover Antigravity processes...
taskkill /F /IM Antigravity.exe >nul 2>&1
timeout /t 3 >nul

:TRYHANS
if not exist "%HANS%" goto FALLBACK
echo [..] Starting in Chinese mode via hans...
start "Antigravity Hans Monitor" "%HANS%" --app

for /l %%i in (1,1,20) do (
    timeout /t 1 >nul
    tasklist /FI "IMAGENAME eq Antigravity.exe" 2>nul | find /I "Antigravity.exe" >nul
    if not errorlevel 1 goto GOTIT
)
goto FALLBACK

:GOTIT
echo [OK] Antigravity started in Chinese mode.
echo     Keep the "Antigravity Hans Monitor" window minimized.
call :INJECT
timeout /t 3 >nul
exit /b 0

:FALLBACK
echo [!!] Hans could not start Antigravity (version mismatch?). Falling back to English UI.
if not exist "%APP%" goto NOAPP
start "" "%APP%"
echo [OK] Antigravity started (English UI, no hans).
echo     Update hans at https://github.com/yuexps/Antigravity-Hans/releases
call :INJECT
timeout /t 3 >nul
exit /b 0

:NOAPP
echo [X] Antigravity.exe not found: %APP%
pause
exit /b 1

:INJECT
echo [..] Waiting for debug port, then injecting effort slider...
if not exist "%SLIDER%" (
    echo [!] Slider script not found, skip.
    exit /b 0
)
timeout /t 6 >nul
node "%SLIDER%" >nul 2>&1
if errorlevel 1 (
    echo [!] Slider injection failed ^(app not ready or version changed^). Skip.
) else (
    echo [OK] Effort slider injected. Open the model menu to use it.
)
exit /b 0
