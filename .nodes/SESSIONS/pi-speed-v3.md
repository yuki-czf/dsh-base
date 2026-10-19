# 会话 pi-speed-v3（节点 20 · PI-Desktop 生成速度补丁 v3）

- 更新时间：2026-10-12 18:15
- 节点：20 PI-Desktop 生成速度本地补丁（口径 = 网关「真速度报告」speed_report §3 的 TPS）
- 用户诉求（本会话原话）：「将 PI-Desktop 的这个生成速度改为方案里的 TPS」「要和我一开始发的报告的 TPS 算法一致」+「补上工具调用回复的 TTFT 捕获」；天津服务器侧 speed_report.py 本会话不做。

## 已完成

1. 读档 + 复核 live：runtime/renderer 均 PATCHED(v2)，`verify.mjs` 全 PASS；v2 由 watcher 在 15:54:24 换入，在跑的实例 15:54:25 启动 → 面板跑的就是补丁后代码。
2. 从活体 `app.asar` 反读真实算法：弹窗 = `Ko(responseOutputTokens, responseDurationMs)`（ChatSurface `Ml` 组件），聚合器在 `use-transcript-view-*.js` 的 `bs()`；确认与报告 §3 同形态（pooled Σ/Σ）。
3. 找到真实缺口：TTFT 只认文本/思考 delta → **纯工具调用回复无 TTFT**，退回整窗（本机 47 条 assistant 里 12 条，例 108 tok/3.9s≈28 t/s）。
4. 口径决策（用户确认）：面板数字必须与报告 TPS 一致 → 实施 v3（三条规则 + 分子按渠道去重）。
5. 实施：`patch.mjs` 增 v2→v3 升级路径（runtime：TTFT 记在任意首个 delta；renderer：TTFT 必需 + 250ms 守卫 + token 侧同守卫）；`verify.mjs` 增 v3 检查；README 增 v3 节。
6. 验证：`apply --dry-run` 锚点 OK → `apply`（runtime 就地升级；asar EPERM → 写 `app.asar.new`）→ `verify.mjs` VERIFY OK（staged v3 各项 PASS；staged↔live 570 条仅 1 chunk 差异）→ watcher pid 37388（`finish-when-closed.ps1 -Launch`）。
7. 真数据复核（本会话 82 条 assistant）：v2 规则 136.7 t/s → v3 规则 150.5 t/s。


## 重启后实测（18:12 换入生效，18:14 复核）

- 换入链：watcher 18:12:26 换入（`app.asar` 90897429 字节 = v3 暂存件）并重启应用；`app.asar.new` 已消失（正常），watcher 完成任务后自然退出。
- `verify.mjs` 对 **live** 全 PASS，含 v3 两项：`report rule - TTFT required`、`report rule - 250ms guard on both sides`；runtime 亦为 v3（`counts tool-call / hosted-search deltas`）。`patch.mjs status` = runtime PATCHED / renderer PATCHED，两个 `.pi-speed.bak` 回滚链完整。
- 缺口修复实证（本会话 JSONL）：**重启前** 97 条 assistant 中 42 条无可见文本、其中仅 20 条有 TTFT（22 条缺，正是被稀释的样本）；**重启后** 7 条中 2 条无可见文本、**2/2 都有 TTFT**。
- 数字预测（重启后该轮聚合，v3 规则）：Σtokens 4449 / Σ解码窗 41129ms ≈ **108 tokens/s**，留作与弹窗对照。
- 待办：用户看一眼弹窗认数（标准⑤）→ 节点 20 改「已完成」并归档 archive/。
## 暂停点 / 下一步

- 暂停点：等用户**完全退出 PI-Desktop** → watcher 把 `app.asar.new` 换入并重启应用（runtime 的 v3 也随之生效）。
- 下一步：重启后核对用量弹窗「生成速度」；用户认可数字（验收标准⑤）→ 节点 20 改「已完成」并归档 `archive/`。
- 遗留：`resources\finish-patch.cmd` 仍在（revert 时才清，属正常）；旧的 `app.asar.pi-speed.bak`/`sidecar.js.pi-speed.bak` 备份保留，回滚链完整。

## 工具与环境备忘

- 本机 `~/.ssh` 无 tianjin 别名/私钥，凭据库只有 43.133.62.108（logreader）→ 天津服务器任务在本机无法直连（本会话已与用户确认搁置）。
- 复核面板数字的只读入口：`C:\Users\tc\.pi-desktop\pi.sqlite`（turns.usage_json 有每次调用的 `firstTokenMs`）+ `C:\Users\tc\.pi-desktop\sessions\<sessionId>.jsonl`（每条 assistant 消息的 `meta.usage` / `responseDurationMs`）。
- 会话 JSONL 的 `blocks` 不含思考正文，别用它推算 token。
- [checkpoint 2026-10-12T18:09:53] node=PI-Desktop 生成速度本地补丁 - 侦察=本机无 tianjin ssh 配置/私钥（~/.ssh 仅 known_hosts；.secrets/ssh.json 是 43.133.62.108 logreader）→ 天津报告线搁置；面板算法从活体 app.asar 反读（弹窗=Ko(responseOutputTokens,responseDurationMs)，聚合器 bs()，组件 ChatSurface Ml）；复核入口=pi.sqlite turns.usage_json + sessions/<id>.jsonl 的 meta.usage；缺口实测 47 条 assistant 中 12 条无 TTFT（纯工具调用回复） - note=v3 已实施并验证：runtime 就地升级 + app.asar.new 暂存，watcher 待用户退出应用换入重启

## 0.19.1 升级覆盖后的重打（2026-10-13 13:4x–13:57）

- 用户升级 PI-Desktop 0.18.x → **0.19.1**：`resources` 整目录被重写，runtime/renderer 双双回 stock，`.pi-speed.bak` 备份也没了（revert 无对象，但 stock 即当前版，无碍）。
- 重打过程三步：
  1. **锚点重定位**：0.19.1 上游改名 `nl`→`ll`、`I`→`P`（runtime message_end），渲染器聚合消息变量 `i`→`l`。patch.mjs/verify.mjs 锚点全部按新代码逐字符重写；分子锚点扩到含 `if(typeof u==…` 直接带 250ms 守卫。`apply --dry-run` 全过。
  2. **修了自家 asar 读取器的真 bug**：`readAsar` 用 `16+L` 当数据起点，0.18 的 L 恰好被 4 整除碰巧对；0.19.1 `L%4==1` → 每个条目读早 3 字节，读出的 chunk 以 `};` 开头、结尾缺 `}`，`node --check` 必炸（第一次 apply 被语法闸拦下，**零写入**，安全链起效）。定位法：用目录自带的 SHA256 integrity 做仲裁（正确基址 `8+u32@4` 哈希完全匹配）。修复后 `asar-selftest` ROUND-TRIP OK（571 条逐字节一致、总大小不变）。
  3. **integrity 哈希诚实化**：0.19.1 目录带 SHA256+blocks，`writeAsar` 给被替换条目重算哈希（已验证 recorded==computed）。
- 现状：runtime 已就地 v3（0.19.1 锚点，过 `node --check`）；`app.asar.new` 已暂存，`verify.mjs` 全 PASS（含 v3 两规则 + staged↔live 571 条仅 1 chunk 不同）；watcher pid 27672（WMI 分离启动，已确认存活并写日志）等用户完全退出后换入并重启。
- 教训入库：README「升级 PI-Desktop 之后」新增 0.18→0.19.1 实战记录（升级后先跑 asar-selftest 再 apply）。

## v3.1（2026-10-13 14:2x）：0.19.1 下 TTFT 塌成 0–1ms 的修复

- 现象：13:57 换入重启后，新消息 `usage.firstTokenMs` 全是 0/1（0.18 时代同渠道为 327–2115ms），分母退化回整窗。`responseFirstTokenMs` 消失属宿主白名单，正常。
- 定位：捕获代码与 0.18 逐字节同构、重置/捕获/清理各只有 1 处；适配器惰性建 text/thinking 部件（首 delta 带内容才建）→ 排除「空部件早触发」。唯一自洽解释：**0.19.1 把 `message_start` 与首个内容事件同批送达**（线上层 T4/E4 合帧），本地 `streamStartedAt` 与首 token 几乎同刻。
- 修复：锚定适配器在请求开始打的 `e.message.timestamp`（`{...,stopReason:"pending",timestamp:Date.now()}`，随帧携带）→ `this._piT0`；message_end/finalize 的 `_t` 同步改基点；缺 timestamp 时回退 `streamStartedAt`（最坏=现状，不会更糟）。
- 验证：`apply --dry-run` 锚点全过 → 就地升级 v3→v3.1 → `verify.mjs` 全 PASS（新增 `TTFT anchored to adapter request-start` 检查）；渲染器无需再动（已是 v3）。
- 待办：**用户再完全退出一次**（这次只为重载 sidecar，无 asar 待换）→ 复核 `usage.firstTokenMs` 回到数百 ms 量级、弹窗数字恢复剔除 TTFT 的口径。

## v3.1 生效复核（15:43 重启后，15:46 核对）

- live：runtime v3.1（verify 含 `TTFT anchored to adapter request-start` 全 PASS）、renderer v3；应用 15:43:31 重启，sidecar 载入 14:16:28 的 v3.1 文件。
- 实测（本会话重启后 3 条消息，`usage.firstTokenMs`）：**3106 / 3120 / 5353 ms**（此前 0/1ms）；`responseDurationMs` 9174 / 7597 / 5724；解码窗 6068 / 4477 / 371 ms（均 ≥250 守卫）→ 单条 172 / 203 / 353 t/s。
- 本轮聚合预测：Σgen 1793 / Σ窗 9384ms ≈ **191 t/s**（弹窗口径，等待用户实测对照，即验收标准⑤）。
- 结论：0.19.1 的 TTFT 基点问题已闭环（锚 `e.message.timestamp`），无可见文本/工具调用回复同样带 TTFT。

## 收口（2026-10-13 15:5x）：节点 20 完成

- 用户实测确认弹窗「生成速度」恢复到几百 tokens/s → 验收标准⑤达成，六条全过。
- 状态：PROGRESS 节点 20 行改「已完成」；归档 `archive/pi-desktop-speed-patch 生成速度本地补丁.md`（周期/验收/改动/踩坑/效率复盘/遗留/衔接说明全填）；CONTEXT 经 `save.ps1 save` 原子替换（节点 20 移入已完成 + 「升级后重打」提醒入关键路径）。
- 本会话到此收口；后续升级 PI-Desktop 时按 README「升级 PI-Desktop 之后」流程重打（status → asar-selftest → dry-run → 关应用 → apply → 重开 → verify）。
- [checkpoint 2026-10-13T15:49:31] node=pi-desktop-speed-patch 生成速度本地补丁 - 侦察=开工侦察（0.19.1 线）：升级后 resources 全量重写→补丁与备份消失；本机无 tianjin ssh（天津报告线搁置）；复核入口=pi.sqlite turns.usage_json + sessions/<id>.jsonl 的 meta.usage（宿主白名单只存 modelId/providerId/responseDurationMs/status/usage）；两处环境差异用独立证据仲裁：asar 头部对齐用目录 SHA256 验证、TTFT 基点用真实消息分布（0–1ms）定位
## 0.20.1 升级重打（2026-10-14 10:0x–10:1x）

- 用户报 PI-Desktop 又更新（0.19.1 → **0.20.1**）：`status` 双 stock、`.pi-speed.bak` 备份消失（resources 整目录重写，与 0.19.1 那次同款）。**插件 pi-speed-meter 在工作区不受影响**（renderer.js 28858B / 10-13 18:45 含口径分层改动，`node --check` 过）。
- 重打链：asar-selftest ROUND-TRIP OK（582 条目，输出目录需预建）→ dry-run 揪出 runtime 锚点 0 命中 → 按新代码重定位五处（渲染器锚点零改动；改名 `we→Ce`/`ll→dl`/`ie→z`/`P→oe`/`h→m`；发布/终止锚点带上新增 `modelStreamDurationMs` 展开项；sidecar 有主/subagent 两份 message_update，只锚主份 `a=s.hasThinking?s.thinking:i,l=s.hasText?Ce(r,s.text)…`）→ apply（runtime 5 站点就位置换、`app.asar.new` 暂存、571 条仅 1 chunk 差异）→ verify 全 PASS（verify.mjs 两条断言随变量名更新）。
- v3.1 基点复核：anthropic/openai-completions/openai-responses/google 四适配器仍在请求开始给 partial message 打 `timestamp:Date.now()` 且随帧携带 → TTFT 继续锚 `e.message.timestamp`。上游 0.20.1 新增 `requestStartedAt`/`providerWaitMs`/`modelStreamDurationMs` 原生计时，但持久化白名单未变（不落盘）→ 插件侧仍只能靠补丁的 `usage.firstTokenMs`。
- watcher 新坑：agent 工具会话里 `Start-Process` 派生的隐藏 PowerShell 会被 kill-on-close 的 Job Object 在命令结束 ~10-30s 后回收（死前无日志、无 stderr）→ 改 WMI `Win32_Process.Create` 派生（pid 3020，跨工具调用二次确认存活；与 0.19.1 那次做法一致）。
- 待办：用户完全退出 PI-Desktop → watcher 自动换入并重启 → 发消息复核 `usage.firstTokenMs` 回数百 ms 量级 + 弹窗「生成速度」与输入框胶囊数字；README 已补 0.19.1→0.20.1 实战记录。
- [checkpoint 2026-10-14T10:12:00] node=pi-desktop-speed-patch 生成速度本地补丁 - 侦察=0.20.1 升级把 resources 整目录重写（双 stock 无备份）；渲染器聚合锚点逐字符未变；runtime 主处理器变量布局与 0.19.1 同构仅 diff 函数改名；适配器 timestamp 基点仍在；白名单未扩 - note=五锚点重定位后 apply 成功、verify 全 PASS，app.asar.new 暂存待 watcher 换入；watcher 须 WMI 派生防 Job Object 回收
## 自动痊愈 auto-heal（2026-10-14 10:3x，用户需求）

- 需求原话：下次 PI-Desktop 更新后自动检查插件与 TPS 算法是否被覆盖，被覆盖就自动恢复 DSH Desktop 同构口径。
- 分层设计：**补丁层自动重打**（升级必覆盖 sidecar+asar）；**插件层不需要也不该自动重打**（本体在工作区不会被覆盖；UI 结构变化由 v0.4.0 全根枚举+15s 空结果重发现自愈；字段形状再变时黄点+诊断报警，只能人工）。
- `auto-heal.mjs`：status 双 PATCHED→秒退 exit0；否则 asar-selftest（归档格式安全闸）→ apply --dry-run（锚点安全闸）→ apply（runtime 就地、asar staged 时派 watcher 等退出换入，**不带 -Launch 不自动重启应用**）；锚点失配记 ANCHOR MISMATCH exit2 绝不硬写。退出码 0/1/2/3+，日志进 `%USERPROFILE%\.pi-desktop-speed-patch.log`（[auto-heal] 前缀）。
- 注册 `PI-Speed-AutoHeal` 计划任务（Register-ScheduledTask 用户级）：登录触发 + 每小时重复，ExecutionTimeLimit 10 分钟。
- 实测：①正常态手动跑 exit0"无事可做"；②模拟覆盖（sidecar.js 从 .bak 还原成 stock）→ 自愈 3 秒恢复双 PATCHED exit1，日志全链留痕；③Start-ScheduledTask 触发跑通 LastTaskResult=0，NextRunTime 一小时后。asar staged+watcher 路径未单独模拟（当天 0.20.1 重打实战走过两次，路径相同）。
- 坑：计划任务显示 LastTaskResult=1 是"本次已重打"的正常退出码（README 已注明），别误判为故障。
## 自愈改挂插件生命周期（2026-10-14 11:0x，替代计划任务版）

- 用户约束：**不要任何 Windows 定时/系统任务** → 删除已注册的 `PI-Speed-AutoHeal`（实测 `Unregister-ScheduledTask` 后 TASK REMOVED）。
- 新触发点 = pi-speed-meter 插件生命周期：**onLoad** spawn `node auto-heal.mjs`（后台、windowsHide、结果写宿主日志 `[pi-speed-meter] heal: exit=N`）；**onUnload** 若发现 `resources\app.asar.new`（应用开着锁住换不进）→ 派 detached 隐藏 watcher 跑 `finish-when-closed.ps1`（无 `-Launch` 不自动重启）。零常驻、零系统任务；升级后首次启动即完成自愈。
- 实现细节：`require('node:child_process'/'node:fs')` 包 try/catch（沙箱宿主也不拖垮胶囊）；路径候选 `PI_SPEED_PATCH_DIR`/`PI_SPEED_INSTALL_DIR`/`PI_SPEED_NODE` 环境变量可覆盖；node 从 PATH 解析，spawn error 时日志提示设 `PI_SPEED_NODE`；新命令 `pi-speed-meter.heal`（命令面板手动触发）+ manifest activationEvents 同步。
- 端到端实测（未重启宿主）：①改 main.js 热重载 → `heal: exit=0 (onLoad) 体检：补丁健在，无事可做`（宿主侧 spawn 可用、幂等）；②模拟覆盖（sidecar 从 .bak 还原 stock）+ 加注释触发重载 → `heal: exit=1 (onLoad) 重打完成 runtime patched 5 sites` → status 恢复双 PATCHED。onUnload 换入路径待自然退出验证（与 0.20.1 重打实战同代码路径）。
- 版本 v0.4.1（manifest+README 两处）；PluginCheck 过；PluginPack `dist/local.pi-speed-meter-0.4.1.piplug`（61576B sha256 78444bf5…）。
- 编辑事故（已修，自查捕获）：行号 PUT 三连吞行——常量块被顶掉（补回）、showProbe 的 catch 块被吃（补回时又吞成功 toast、legacy replace 又换丢 console.log，三次才完整）、onUnload 尾部留重复三行（CUT）。教训：每次 PUT 后必须读回 + 关键符号计数（showToast/unregister 计数各 1）。
- [checkpoint 2026-10-14T11:05:00] node=pi-desktop-speed-patch 生成速度本地补丁 - 侦察=宿主插件 main 侧 require child_process 无先例 → try/catch 降级 - note=v0.4.1 生命周期自愈上线：删计划任务、onLoad/onUnload 双钩子、模拟覆盖端到端 exit=1 恢复双 PATCHED
