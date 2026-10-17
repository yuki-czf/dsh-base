# pi-tempo watchdog — 外部看门狗

pi-tempo v1.0.5 配套工具。宿主没有扩展 API、提示词规则在长上下文里遵循率≈0（271 实测），所以把「熔断纪律」外置成一个独立进程：它读 PI-Desktop 的会话数据（全部只读），触线就弹 Windows 通知。**它自己不会忘、不会衰减。**

## 安装/运行

```powershell
# 常驻（建议开工时跑；或用 start.ps1 隐藏窗口 + 崩溃自动重启）
node watchdog.mjs
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File start.ps1

# 单次扫描当状态命令用（不弹通知）
node watchdog.mjs --once
```

要求：Node ≥22.5（`node:sqlite`）。R3/R5 依赖 pi.sqlite；R1/R2/R4 只要 sessions 目录。

## 数据源（全只读，不干扰宿主）

| 来源 | 用途 |
|---|---|
| `~/.pi-desktop/sessions/<id>.jsonl` | 工具调用（完整 args + isError）→ 签名；assistant `meta.usage` → 上下文 |
| `~/.pi-desktop/pi.sqlite` | `turns` 表 → running 卡死 / error 连发 |

上下文口径：`inputTokens + cacheReadTokens`（该请求实际重读的量），取窗口内单次最大值，≈ 当前会话上下文。是近似值，够触发 25 万熔断线用。

## 五条规则

| 规则 | 触发 | 默认阈值 | 提醒内容 |
|---|---|---|---|
| R1 失败循环 | 同签名工具连败（15 分钟窗，同签名成功即重置） | ≥3 次 | 按熔断三分类处理，别原样重试 |
| R2 上下文超限 | 当前上下文超线（降回 230k 重新武装） | >250k | 写 handoff 提示词，换会话/换模型发「继续」 |
| R3 回合卡死 | 单回合 running 超时 | >25 min | 人肉看一眼 |
| R4 回合风暴 | 单回合工具调用数超线（271 T3：48 次重试 38 败） | >45 次 | 大概率验证脚本死循环 |
| R5 提供方连错 | 同会话 error 回合连发（271 T4 教训） | 15 分钟内 ≥3 | 换模型发「继续」 |

节流：同一键 10 分钟冷却、每键最多弹 3 次后只留痕。启动回填（历史事件）只建状态不弹窗，防重启时被旧事故轰炸。

## CLI 覆盖

`--interval 5000 --ctx-limit 250000 --ctx-rearm 230000 --fail-streak 3 --fail-window-min 15 --turn-stuck-min 25 --turn-calls 45 --provider-errors 3 --cooldown-min 10 --sessions-dir <path> --db <path> --once --no-toast --quiet`

## 留痕

- 告警：`~/.pi-desktop/logs/pi-tempo-watchdog.jsonl`（每条一行 JSON）
- 运行日志：`~/.pi-desktop/logs/pi-tempo-watchdog-run.log`（start.ps1）

## 系统级配合（2026-10-17 起）

- R2 的系统级对应已落地：`~/.pi-desktop/pi.sqlite` providers 表 CPA gemini-3.8-flash 的 `contextWindow` 1048576→**272000**（`reserveTokens` 默认 16384）→ 宿主自动压缩触发点 = **255,616 ≈ 25.6 万 token**（公式 `shouldCompact = contextTokens > contextWindow − reserveTokens`，pi-coding-agent compaction.js:149）。回滚=同字段改回 1048576，改后重启生效。
- 效果=双保险：R2 弹通知（人做 handoff，清醒时写摘要）＋宿主自动压缩（机器兜底，防漏）。handoff 仍是首选——压缩发生在上下文最满=模型最笨时，摘要质量不可靠。

## 实测

- fixture 端到端：五条规则全触发、静默回填正确、同签名连败带命令正文（`Bash::node scripts/verify.mjs --all`）。
- 真库冒烟（2026-10-17，本会话）：83 个会话文件正确识别 1 个活跃，状态行报 `ctx≈553k`＋连败签名 3——当时该会话真在 25 万熔断线两倍以上运行，看门狗上线即抓到真实超限。

## 为什么不做成插件/扩展

PI-Desktop 宿主 asar 里没有 Pi 扩展 API（`pi.on`/`sendUserMessage`/`session_before_compact` 全 0 命中），`settings.json` 的 `packages` 数组宿主不消费（那是给 pi CLI 的），现成的 pi-loop-breaker/pi-condense 因此装不上。外置进程是当前唯一可行落点；上游若开放扩展 API 可回收本工具的 R3/R5。
