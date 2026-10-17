' pi-tempo watchdog: hidden boot launcher.
' Auto-start = put a shortcut to THIS file into shell:startup (see README).
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""E:\www\dsh-base\pi-tempo\watchdog\start.ps1""", 0, False
