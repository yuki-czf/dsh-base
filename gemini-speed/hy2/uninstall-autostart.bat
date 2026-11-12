@echo off
schtasks /Delete /TN "HysteriaCPA" /F
taskkill /IM hysteria.exe /F >nul 2>&1
echo [OK] Autostart removed and client stopped.
pause
