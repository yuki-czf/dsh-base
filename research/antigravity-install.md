# 反重力（Antigravity）安装清单 —— 新设备部署指南

> **用途**：在一台新 Windows 设备（如公司机）上，从零复现反重力桌面端的完整可用环境：代理启动 + 中文汉化 + 推理等级滑条。
> **来源**：源仓库 `G:\www\antigravity-lab`（私有，家用机）。本文件是分发副本，改动请回源仓库同步，勿单边修改本副本。
> **验证环境**：Windows 11 + Antigravity 2.32.1 + hans v0.4.10 + effort-slider v1.2.6 + 512K 上下文补丁，2026-11-15 全链路实测通过。
> **本文件地址**（公司机直接访问）：
> `https://raw.githubusercontent.com/yuki-czf/dsh-base/main/research/antigravity-install.md`

---

## 组件总览（当前家用机在用版本）

| 组件 | 版本 | 形态 | 常驻内存 | 公司机动作 |
|---|---|---|---|---|
| Antigravity 桌面端 | 2.32.1 | Electron 应用 | 主进程 ~95MB + 渲染进程按窗口数 | 装默认路径 + 美区账号登录 |
| antigravity-hans 汉化器 | v0.4.10 | 独立 exe（监视器黑窗） | 独立进程，几十 MB | 下载 + SHA256 校验 + 杀软信任区 |
| effort-slider 滑条 | v1.2.6 | CDP 热注入 JS（免重启） | 渲染进程内几 MB | 克隆公开仓库 + Node ≥ 20 |
| 512K 上下文补丁 | 上游 `267ab59a` | `language_server.exe` 二进制补丁 | 零常驻，大上下文会话时按需增长 | 从 `dist/antigravity/context-autofix/` 取 + Python 3 |
| agy-capsule 配额胶囊 | 上游 2026-11-14 版 | 原生 sidecar 插件（LS 托管）+ CDP 注入 UI | sidecar 进程，几十 MB | 从 `dist/antigravity/agy-capsule/` 复制进 plugins 目录（见 §7） |
| 启动器 bat | 2026-11-15b | 一次性脚本，跑完即退 | 无 | 从 `dist/antigravity/` 下载 + 改两处（见第四节） |

> 内存结论（2026-11-15 实测排查）：整套环境常驻开销 ~150MB 量级，**不是内存压力源**；实测明细见第六节。

---

## 一、前置条件（装之前先确认）

| # | 项 | 要求 | 说明 |
|---|---|---|---|
| P1 | 代理客户端 | Clash 类工具，HTTP 混合端口可用 | 家用机是 Clash Verge 7897；公司机按实际端口改 bat（见第四节） |
| P2 | Node.js | ≥ 20（仅滑条注入需要） | 不装滑条可不装 Node。验证：`node -v` |
| P3 | Google 账号 | **美区账号** | 国内区会触发地区限制锁死（历史教训：改美区后才登进）。账号邮箱勿写入任何文档 |
| P4 | 杀软 | 若有火绒：先给目标文件夹加信任区 | 火绒会静默秒删未信任的 exe（实测过，无弹窗无日志） |
| P5 | Python 3 | 仅 512K 补丁需要 | 不打补丁可不装。验证：`python --version` |

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

### 6. 512K 上下文补丁（可选，本地上下文窗口 256K → 512K）

**前提**：完全退出 Antigravity 再操作；装有 Python 3。

- **脚本来源**：本仓库已带 vendored 正本 `dist/antigravity/context-autofix/`（上游 `TheAutomatic/antigravity-context-autofix` @ `267ab59a`，2026-11-14 版，家用机逐字节副本）——**公司机直接用这份**；上游仅作日后升级参考
- 一键重打（交互菜单选 1）：`tools\context-autofix\windows-fix-all.cmd`
- 它做什么：对 `%LOCALAPPDATA%\Programs\Antigravity\resources\bin\language_server.exe` 做 **9 处指令级等长替换**（文件大小不变，不碰 app.asar）——上下文压缩阈值 256,000 → 512,000 tokens，规则/单文件预算同步放大。原版自动备份到 `~/.gemini/agy-patches/`
- 指纹（Antigravity 2.32.1 / lsVersion 2.32.1 / 构建 CL1021296516 / 215,547,392 B）：
  - 原版 SHA256：`65cdb8d132fc61056625081be7d07d4d22f57eba485de7edf0d24d98e77c891f`
  - 修补后 SHA256：`003ba968eb7e4dd805f5ae626700e9ad39179db51092523ff26855bc070500a5`
- 验证：`python tools\context-autofix\scripts\fix_antigravity_context.py --status` → `ALREADY_PATCHED`，Budget 512,000
- 恢复原版：同脚本 `--restore`

**边界与运维**：
- 只抬本地压缩阈值与规则预算，**不提高服务端能力**；非 1M 模型仍被安全裁剪回真实窗口
- **反重力每次自动升级必冲掉补丁**（`resources\bin` 被整体替换）——启动器哈希告警会提示但不阻塞启动，重打即可；重打成功后必须同步更新两份 `language-server.sha256`（`antigravity-lab\launchers\` 与桌面「AI 工具」各一份）
- 重打前先跑 `--status` 做结构匹配，匹配不过就停手等上游适配，不要硬打

### 7. agy-capsule 配额胶囊（可选，输入框实时显示上下文 + 配额）

- **是什么**：输入框底栏双胶囊——会话上下文占比 + **5 小时/周配额剩余百分比**；悬停看 Token 构成（Turn0/Read/Think/Write）、缓存过期倒计时（3 分钟变黄 / 4 分钟变红）、多模型配额面板。官方只把配额藏在设置页，它钉在输入框边实时刷新
- **上游**：`https://github.com/Lumidarin/agy-capsule`（MIT，2026-11-14 首发）；本仓库 `dist/antigravity/agy-capsule/` 存的是当日原版
- **安装**（把下载的文件夹复制进官方插件目录，保持 `sidecars` 子目录结构）：
  ```powershell
  Copy-Item -Recurse ".\agy-capsule" "$env:USERPROFILE\.gemini\config\plugins\agy-capsule"
  ```
  然后重启 Antigravity。**无需点任何面板**：客户端自动识别新插件，约 1 分钟内写入 `~\.gemini\config\config.json` 完成注册；sidecar 进程由 language_server 托管拉起，用的是 **Antigravity 自带 node 运行时，不需要系统 Node**
- **卸载**：删 `~\.gemini\config\plugins\agy-capsule` 文件夹重启客户端即净（config.json 会留一条无害注册记录）
- ⚠️ **已知问题（上游 bug，原样入库未修）**：悬停配额弹窗每秒整体重建（视觉闪烁）+ 底栏布局约 126Hz 自激微抖；不影响数据正确性。根因与 10 行修法已留档（家用机 OpenChamber 会话 2026-11-15「调查GitHub仓库」），等上游修复或日后自行打补丁

---

## 三、验收清单（装完逐项打勾）

| # | 检查项 | 通过标准 |
|---|---|---|
| V1 | 双击 bat | 反重力窗口打开，**界面是中文** |
| V2 | 登录态 | `%APPDATA%\Antigravity\logs\language_server.log` 出现 `Auth succeeded` |
| V3 | 无直连失败 | 同一日志搜 `dial tcp` 应为 0 条 |
| V4 | 滑条（装了的话） | 打开模型菜单（点左下角模型名），底部出现「推理等级」滑条 |
| V5 | hans 进程 | 任务管理器有 `antigravity-hans.exe`，其黑窗保持最小化 |
| V6 | 补丁（打了的话） | 启动器显示 `[OK] Context patch intact (512K).`；或 `--status` 出 `ALREADY_PATCHED` + Budget 512,000 |
| V7 | 配额胶囊（装了的话） | 输入框底栏、模型选择器右侧出现双胶囊；新会话显示 `0% | 100% | 100%`（上下文/5h/周），配额为真实百分比 |

---

## 四、启动器（直接下载或复制源码）

**方式 A · 直接下载（推荐）**：正本已入本仓库 `dist/antigravity/`，与家用机在用版本逐字节一致。

| 文件 | 放置位置 |
|---|---|
| `启动Antigravity.bat` | 与 `antigravity-hans.exe` 同目录 |
| `language-server.sha256` | 同上（bat 启动时的 512K 补丁检查依赖它；缺了只提示、不阻塞启动） |

在公司机的目标文件夹里用 PowerShell 下载（浏览器直接开 URL 也行，中文文件名会自动编码）：

```powershell
Invoke-WebRequest "https://raw.githubusercontent.com/yuki-czf/dsh-base/main/dist/antigravity/%E5%90%AF%E5%8A%A8Antigravity.bat" -OutFile "启动Antigravity.bat"
Invoke-WebRequest "https://raw.githubusercontent.com/yuki-czf/dsh-base/main/dist/antigravity/language-server.sha256" -OutFile "language-server.sha256"
```

**方式 B · 复制源码**：复制以下全部内容，存为 `启动Antigravity.bat`（UTF-8 无 BOM），与 `antigravity-hans.exe` 同目录；再新建单行文件 `language-server.sha256`，内容为第二节第 6 步里的「修补后 SHA256」。
> **新设备必改两处**：第 5 行 `PROXY` 端口；第 8 行 `SLIDER` 路径（不装滑条可保持原样，自动跳过）。
> 已知坑：`chcp 65001` 下把中文写进 bat 的 `if (...)` 括号块会被 cmd 解析器拆坏 → bat 块内只写 ASCII（下面源码已遵守）。

```bat
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
3. 反重力自动升级关不掉，每次升级需验证：汉化（重装 hans）/ 滑条（重跑注入）/ 启动器（通常无影响）/ 补丁（重打 + 更新哈希文件）

---

## 六、资源开销实测（2026-11-15 家用机排查）

16GB 机器全链路实测的内存画像：

| 组件 | 实测开销 |
|---|---|
| Antigravity 主进程 | ~95MB（无窗口打开时仅存主进程） |
| antigravity-hans 监视器 | 独立进程，几十 MB，随 bat 启停 |
| effort-slider 注入体 | 渲染进程内几 MB（150KB 源码 + UI + 2 个 MutationObserver） |
| 512K 补丁 | 零常驻；只在会话真用到大上下文时 language_server 按需增长 |
| inject-cdp.cjs 注入器 | 跑完即退，不常驻 |

**滑条代码审查结论**（v1.2.6）：无 `setInterval` 轮询；重复注入幂等（每次安装先 `stop()` 旧实例、观察器全部 `disconnect()`）；两个 MutationObserver 监听 `body` subtree，AI 流式输出时每次 DOM 变化触发一次 `scan()`——长回复期间有可感知的 CPU/GC 开销，但有界、不累积、不泄漏。

**排查教训**（家用机 2026-11-15"内存疯狂上涨"误判）：实际元凶是 3D 游戏（单进程 7.8GB commit）+ 聊天/开发类 Electron 应用多渲染器积压（~2.5GB）+ 直播/微信叠加，把 16GB 物理内存压进页面文件抖动（硬页读取 3000+/秒）。反重力全家当时仅占 ~0.1GB。公司机如遇类似卡顿：先看任务管理器「已提交」总量与各进程 Commit 排序，别急着卸插件。
