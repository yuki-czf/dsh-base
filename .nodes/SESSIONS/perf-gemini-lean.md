# 会话状态：perf-gemini-lean

> 每个会话一个文件（SESSIONS/<标识>.md），只写自己的，整文件重写是安全的。
- **身份**：perf-gemini-lean（一次性委托：网关管理员 mubai 的《DSH × Gemini 3.8 Flash 性能改造说明书》执行会话；2026-09-26 下午起 OpenCode 续篇会话接管 TTFT/行为优化线，至晚间全线收口）
- **负责节点**：无（本仓库节点未动；改动全部在 ~/.dsh 机器环境层；本仓库仅存 `_diag/gemini-perf/` 诊断脚本与报告）
- **状态**：✅ **性能线全线闭环（2026-09-26 晚）**，无待办挂在名下
- **大头进展**：
  - **v3 终态（09-26 上午）**——桌面线上工具掩码（host.js v11 挂官方 `system-prompt/assemble` 瀑布），dd0a81d4：15 工具 / 14,262B / sys 5,175B（基线 93 / 69,902B / 10,195B，每请求省 ~55.6KB≈1.4万 token）；standard 零影响
  - **v12（09-26 下午）**——① rulesText 增补 plan-first + 技能按需（热改）；② host.js 自适应 registry 掩码（known 交集重试，不再 fail-open）；③ TSCG 实测否决（真实目录仅省 0.3%）
  - **v12.1 subagent 翻案（09-26 午间）**——根因 = preset 行 `id: tool-subagent` 与宿主 `include:tool-subagent` **entryId 撞车**（挂载必报 "already registered in this scope"）；修复 = 一行改名 `tool-subagent-lean`。实测大满贯：assembled 82→83、`wire tools 83 -> 16`、单发/并行双发全部真调成功，**双子代理同毫秒发射（1ms 间隔）且继承 lean 血统（16 工具 + 分页纪律）**——原档案"lean 无 subagent"结论关闭，"preset 自层注册行"设想经改名后成立
  - **行为测试① PASS（ca490dfc）**——先思考后动、全 turn 零探索性加载（skill/列目录/乱读全消失）、sysBytes +328B 精准注入；侦察实证：lean/standard 提示词均无技能目录，skill 工具 "session skill catalog" 悬空引用是"开局先加载"根源
  - **medium A/B 实证（fedd4c05/e8890d5b + 3 子代理，effort=medium 已验上 wire）**——思考量砍半（518-1236→343-480 字符/步）；**机械步 -27~34%**（汇总步 6.93→4.56s、6.55→4.79s），派发步持平；零质量回退（medium 行为测试反而先读文件再答，更 grounded；子代理 skill(node-architect) 属按需命中非探索）
  - **非流式悬案侦破（与家里侧联合）**——"7s 纯等待"根因 = **Google Antigravity 后端对含工具调用的响应聚合投递**（思考+函数参数全部生成完才单事件发出），非任何层 bug；公司侧源码洗清（pi-ai `openai-completions.js:587` `stream: true` 硬编码无条件分支 + onPayload 全链无人注册）；**归因修正：非流式分界线是响应类型（tool-call vs 纯文本），不是档位**——上轮 high 派发步 gap 0.25s/716tok=2864t/s 同样超物理上限，两轮皆然，medium 无辜
- **CPA 链路联合裁决（与家里侧）**：connection-pool 开（默认关）、switch-preview-model 关（静默切 preview 元凶）、session-affinity 否决（RR 下缓存命中 92-98% 实测证伪注释推断）；隐式缓存在 CPA→Antigravity OAuth 链路实测有效（10M tokens 93%）；**真 TTFT 地板 2-4s**（lean 会话 19.4KB 载荷 effort=high，档位无关）；客户端开销 2.3s→0.4-1.8s；排队抽签两档都在（23.15s vs 2.25s 同载荷双胞胎，10 倍方差=后端调度，样本少不下结论）
- **整线终账**：6.9s 体感（9/21）→ 网关侧 BBR+7.3.17+连接池 → 载荷侧 lean 16 工具 → 档位侧 medium → 机械步端到端 ~4-6s；剩余 = Google 地板 2-4s + ~6% 排队尾部 + 工具步聚合投递（上游行为）——物理区间，到此为止
- **遗留决策与建议**：① lean 默认档维持 high + 手动按会话切 medium，两周体感复评后再定是否改默认（改则知会 mubai）② 工具步等待期 UI 状态指示 = DSH 产品层 feature request（客户端插件注入为可选探索）③ Antigravity 聚合投递有无隐藏开关待问上游（Luis Pater）④ skill 目录悬空引用可选 wire 层内联修复（低优先）
- **关键教训（已归 DECISIONS）**：工具目录真源是 system-prompt/assemble 瀑布的 toolProviders；composedPreset() 返回字符串；subagent 非全局注册且 preset 挂载需避开宿主 entryId；TSCG description-only 在已精简目录收益≈0；**latency−ttft gap≈0 + 大 tokens = 聚合投递签名**（流式判别工装）；实测>宣称（TSCG/session-affinity/归因修正三案同律）
- **最后动作**：2026-09-26 晚 本终版存档（用户指示：归档不 commit）。诊断可重跑：`_diag/gemini-perf/`；关键会话 dd0a81d4/ca490dfc/e7cc02b5/fedd4c05/e8890d5b + 子代理 5 个；主机日志 `%APPDATA%\DSH Desktop\logs\host\dsh-2026-09-26.log`
- [checkpoint 2026-09-26T10:54:21] node=perf-gemini-lean - 侦察=2026-09-26 PM: lean sysprompt has NO skill catalog (skill tool desc dangles, drives eager loading); TSCG desc-only measured 0.3% on real 15-tool catalog -> rejected; subagent preset row existed but wire list stayed 15 -> v12 aligns wire 16 + adaptive registry mask
