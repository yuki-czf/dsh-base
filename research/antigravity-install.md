# 反重力（Antigravity）安装清单 —— 新设备部署指南

> **用途**：在一台新 Windows 设备（如公司机）上，从零复现反重力桌面端的完整可用环境：代理启动 + 中文汉化 + 推理等级滑条。
> **来源**：源仓库 `G:\www\antigravity-lab`（私有，家用机）。本文件是分发副本，改动请回源仓库同步，勿单边修改本副本。
> **验证环境**：Windows 11 + Antigravity 2.32.1 + hans v0.4.10，2026-11-15 全链路实测通过。
> **本文件地址**（公司机直接访问）：
> `https://raw.githubusercontent.com/yuki-czf/dsh-base/main/research/antigravity-install.md`

---

## 一、前置条件（装之前先确认）

| # | 项 | 要求 | 说明 |
|---|---|---|---|
| P1 | 代理客户端 | Clash 类工具，HTTP 混合端口可用 | 家用机是 Clash Verge 7897；公司机按实际端口改 bat（见第四节） |
| P2 | Node.js | ≥ 20（仅滑条注入需要） | 不装滑条可不装 Node。验证：`node -v` |
| P3 | Google 账号 | **美区账号** | 国内区会触发地区限制锁死（历史教训：改美区后才登进）。账号邮箱勿写入任何文档 |
| P4 | 杀软 | 若有火绒：先给目标文件夹加信任区 | 火绒会静默秒删未信任的 exe（实测过，无弹窗无日志） |

**网络结论（实测）**：不需要 TUN 模式、不需要全局模式。Clash 只开「系统代理」（规则模式即可），启动器用环境变量把反重力的流量指向代理端口。

---

## 二、安装步骤（按顺序）

### 1. Antigravity 桌面端

- 下载：`https://antigravity.google/releases/` → Windows x64 安装包
- **必须装默认路径**（启动器依赖）：`%LOCALAPPDATA%\Programs\Antigravity\`
- 装完**先不要直接打开登录**（直启没有代理环境变量，会卡登录页）

### 2. antigravity-hans 汉化器 v0.4.10

- 下载（约 8.8MB）：
  `https://github.com/yuexps/Antigravity-Hans/releases/download/v0.4.10/antigravity-hans-windows-amd64.exe`
- **改名为 `antigravity-hans.exe`**，放进一个固定文件夹（家用机是桌面「AI 工具」）
- SHA256 校验：
  `b25efdcb7de17db672db92a09a815c321094684c7fca10108c6807bd5647bf70`
  （PowerShell：`Get-FileHash .\antigravity-hans.exe -Algorithm SHA256`）
- ⚠️ **版本配对**：hans 与 Antigravity 版本强耦合。v0.4.8 ↔ 2.29.0；v0.4.10 ↔ 2.32.1（实测）。反重力自动升级后汉化失效 → 去 `https://github.com/yuexps/Antigravity-Hans/releases` 下新版，同文件名覆盖
- ⚠️ 有火绒先加信任区再下载，否则下载件可能被秒删

### 3. 启动器 bat（核心件）

新建 `启动Antigravity.bat`，与 `antigravity-hans.exe` **同目录**，内容见第四节（整段复制）。

它做五件事：检测代理端口 → 清残留进程 → 经汉化器启动（英文兜底）→ 20 秒健康检查 → 自动注入滑条。

### 4. effort-slider 滑条插件（可选，需要 Node ≥ 20）

- 克隆：`https://github.com/LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider`
  （v1.2.6，MIT，零 npm 依赖）
- 放到固定路径，记下 `tools\inject-cdp.cjs` 的完整路径，填进 bat 的 `SLIDER` 变量
- 不装的话：bat 里 `SLIDER` 指向的文件不存在会**自动跳过**，不影响其他功能

### 5. 登录

1. 确认代理客户端已开（系统代理模式）
2. 双击 `启动Antigravity.bat` 启动
3. 应用内登录美区 Google 账号（一次即可，登录态存本地）

---

## 三、验收清单（装完逐项打勾）

| # | 检查项 | 通过标准 |
|---|---|---|
| V1 | 双击 bat | 反重力窗口打开，**界面是中文** |
| V2 | 登录态 | `%APPDATA%\Antigravity\logs\language_server.log` 出现 `Auth succeeded` |
| V3 | 无直连失败 | 同一日志搜 `dial tcp` 应为 0 条 |
| V4 | 滑条（装了的话） | 打开模型菜单（点左下角模型名），底部出现「推理等级」滑条 |
| V5 | hans 进程 | 任务管理器有 `antigravity-hans.exe`，其黑窗保持最小化 |

---

## 四、启动器完整源码

> 复制以下全部内容，存为 `启动Antigravity.bat`（UTF-8 编码），与 `antigravity-hans.exe` 同目录。
> **新设备必改两处**：第 6 行 `PROXY` 端口；第 8 行 `SLIDER` 路径（不装滑条可保持原样，自动跳过）。

```bat
@echo off
chcp 65001 >nul
title Antigravity Launcher (proxy + hans + effort slider + fallback)

set "PROXY=http://127.0.0.1:7897"
set "HANS=%~dp0antigravity-hans.exe"
set "APP=%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe"
set "SLIDER=G:\www\antigravity-lab\plugins\effort-slider\tools\inject-cdp.cjs"

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
    echo [!] Slider injection failed (app not ready or version changed). Skip.
) else (
    echo [OK] Effort slider injected. Open the model menu to use it.
)
exit /b 0
```

---

## 五、使用规则与排障

**日常使用**：
- **唯一入口 = `启动Antigravity.bat`**，不要双击 exe 直启（没有代理环境变量会卡登录页）
- Clash 只开系统代理（规则模式），TUN / 全局都不需要
- hans 黑窗保持最小化；关了 = 汉化失效，重开 bat 恢复
- 想固定到任务栏：建一个指向 `cmd /c start "" "...\启动Antigravity.bat"` 的快捷方式，图标取自 Antigravity.exe

**排障口诀**：

| 现象 | 原因 | 处理 |
|---|---|---|
| 双击 bat 零进程零日志零崩溃 | hans 版本跟不上反重力版本 | bat 会自动英文兜底；去 Hans releases 下新版覆盖 |
| 窗口开着但卡登录报错页 | 代理环境变量没生效（Go 语言服务器不读系统代理，只认 `HTTP_PROXY`/`HTTPS_PROXY`） | 确认走 bat 启动 + 代理端口在线 |
| 汉化失效但应用能用 | hans 落后于反重力版本 | 同第一条 |
| 滑条消失 | 重启后热注入失效 | 重开 bat（自动注入）或手动 `node inject-cdp.cjs` |
| 反重力自动升级后一切正常但变英文 | 升级覆盖了汉化依赖的结构 | 重装对应版本 hans |

**已知坑**（源仓库 `.nodes` 里有完整档案）：
1. 火绒静默秒删下载件（`%TEMP%` 也会被删）→ 只往信任区文件夹下载，下完立刻校验 SHA256
2. `chcp 65001` 下把中文写进 bat 的 `if (...)` 括号块会被 cmd 解析器拆坏 → bat 块内只写 ASCII（上面源码已遵守）
3. 反重力自动升级关不掉，每次升级需验证：汉化（重装 hans）/ 滑条（重跑注入）/ 启动器（通常无影响）
