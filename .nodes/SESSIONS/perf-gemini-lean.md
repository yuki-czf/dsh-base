# 会话状态：perf-gemini-lean

> 每个会话一个文件（SESSIONS/<标识>.md），只写自己的，整文件重写是安全的。
- **身份**：perf-gemini-lean（一次性委托：网关管理员 mubai 的《DSH × Gemini 3.8 Flash 性能改造说明书》执行会话；2026-09-26 下午起 OpenCode 续篇会话接管 TTFT/行为优化线）
- **负责节点**：无（本仓库节点未动；改动全部在 ~/.dsh 机器环境层；本仓库仅存 `_diag/gemini-perf/` 诊断脚本与报告）
- **大头进展**：
  - **v3 终态（09-26 上午）验收通过**——桌面线上工具掩码（host.js v11 挂官方 `system-prompt/assemble` 瀑布），终态会话 dd0a81d4：**15 工具 / 14,262B / sys 5,175B**（基线 93 / 69,902B / 10,195B，每请求固定负载 ≈80KB→19.4KB，省 ~55.6KB≈1.4万 token）；每步日志 `wire tools 82→15`；standard 零影响
  - **v12 续篇（09-26 下午）**：① rulesText 增补 plan-first + 技能按需两条（热改即时生效，直击"Gemini 开局先加载技能/文件"）；② host.js v11→v12 自适应 registry 掩码（allow 含非全局注册名时按 known 交集重试，不再 fail-open）；③ wire 名单 15→16 放行 subagent（preset 自层 tool-subagent 行已在，实际可调性待重启实测）；④ **TSCG 压缩实测否决**——description-only 对真实 15 工具目录仅省 0.3%/48B（50-72% 是破坏 schema 的 full-compress 口径；v11 白名单已吃掉大头，剩余 14.3KB 是 schema 本体）
- **CPA 链路联合裁决（与家里侧会话，09-26）**：家里 CPA v7.3.17 已开 antigravity connection-pool（默认关）+ 关 quota-exceeded.switch-preview-model（配额紧张静默切 preview 是"时快时慢"嫌疑元凶）；session-affinity **否决**（家里 9/21 实测双账号 RR 下缓存命中 92-98%，官方注释推断被证伪，且粘性伤配额分摊）；**隐式缓存在 CPA→Antigravity OAuth 链路实测有效**（10M tokens 会话 93% 命中）——修正"OAuth 不可缓存"旧假设（其仅适用显式 caches.create）；reasoningEffort=high 源头定位在 DSH 侧 agent-default-model 配置行（降档改一行即可，红线待数据）
- **未决问题**：① subagent v12 放行后实际可调性待实测（需重启 DSH 桌面 + 新 lean 会话）② TTFT 逐请求埋点由家里侧 CPA-Manager/Keeper 承担，两边完工后会师 A/B（同任务双端对质）③ 思考档 high→medium A/B 待管理员点头 ④ skill 工具 description 引用的 "session skill catalog" 悬空（目录不注入提示词；后续可选 wire 层改写 description 内联目录，或接受 rulesText 行为压制）
- **关键教训（已归 DECISIONS）**：请求工具目录真源是 SystemPrompt.assemble() 的 toolProviders 而非 ctx.tools 注册表视图；composedPreset() 官方契约返回字符串；subagent 非全局注册；**TSCG description-only 在已精简目录上收益≈0（实测>宣称）**
- **最后动作**：2026-09-26 下午 v12 落地 + 本存档；等用户重启 DSH 桌面后开新 lean 会话实测（验收点：wire 16 / `registry MASKED (allow 15 adaptive from 16; dropped subagent)` 日志 / subagent 真调成功 / 首步 plan-first 行为 / toolsBytes 应≈14.7KB 含 subagent schema）
- [checkpoint 2026-09-26T10:54:21] node=perf-gemini-lean - 侦察=2026-09-26 PM: lean sysprompt has NO skill catalog (skill tool desc dangles, drives eager loading); TSCG desc-only measured 0.3% on real 15-tool catalog -> rejected; subagent preset row existed but wire list stayed 15 -> v12 aligns wire 16 + adaptive registry mask
