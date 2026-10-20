# 决策日志 DECISIONS

> 只追加，永不改写历史条目。多会话并发追加是安全的。最新的在最下面。

> Older entries archived: archive/decisions-*.md（2026-10-15 及更早见 archive/decisions-2026-10-15.md）

## [2026-09-26] 桌面端线上工具掩码落地：dsh-lean-tools host v11（system-prompt/assemble 瀑布）

- **背景**：v2 后桌面实测 lean 会话仍 82 工具上线——v9/v10 的注册表掩码（ctx.tools.restrict）日志显示挂载成功，但解码 request/header 仍 82 工具（1a2b4452 实证）。
- **决定/根因**：请求工具目录的真源 = SystemPrompt.assemble() 的 toolProviders（dsh-system-prompt/index.js:319），非 ctx.tools 注册表视图；官方变换口为 system-prompt/assemble 瀑布（:355，dsh-agent 模型切换同款机制）。host.js v11 挂该瀑布，按 context.agent → composedPreset()（官方契约返回字符串）判定 lean 后过滤 assembly.tools 至 15 名单；pre-step 注册表掩码保留为执行层兜底。前置两修：composedPreset 返回字符串需直读（v9 只认对象导致正确答案被拒）；subagent 注册在非全局层、进不了全局 allow 校验（08:53 抛错），从名单移除——桌面 lean 因而无 subagent。
- **影响**：桌面终态 dd0a81d4：15 工具/14,262B/sys 5,175B（基线 93/69,902B/10,195B；每请求省 ~55.6KB≈1.4万 token）；每步日志 wire 82→15；standard 探针 lean=false 放行零影响。配置热载可改名单（行 config.allow），代码改动仍需重启。规则段已按用户偏好移除预算思考行。


## [2026-09-26] perf-gemini-lean v12：技能行为压制 + subagent 名单对齐 + TSCG 实测否决（TTFT 续篇）

- **背景**：用户反馈 Gemini 首字慢且"先加载技能不先思考"；链路 DSH→网关→自建 CPA(CLIProxyAPI v7.3.17)→Antigravity。侦察实证：lean 系统提示词（5,175B）与 standard（10,237B）均无技能目录——skill 工具 description 引用的 "session skill catalog" 悬空，听话模型开局易触发探索性加载。
- **决定**：① rulesText 增补 plan-first + 技能按需两条（yml 热改即时生效）；② host.js v12 自适应 registry 掩码——restrict 遇非全局注册名（subagent，preset 自层注册）抛错时按错误信息里的 known 列表取交集重试，替代 v10 的整次 fail-open；③ wire 名单 15→16 放行 subagent（preset 的 tool-subagent 行已在，可调性待重启实测）。
- **TSCG 否决（实测>宣称）**：@tscg/core 1.4.3 compressDescriptions 用 dd0a81d4 真实 15 工具目录实测仅省 0.3%（48B）；其 50-72% 宣称是破坏 schema 结构的 full-compress 口径，description-only 在已精简目录上收益≈0——v11 白名单已吃掉大头，剩余 14.3KB 主体是参数 schema，无免费压缩空间。vendor 未落地即回退。
- **CPA 联合裁决**（家里侧执行已生效）：antigravity connection-pool 开（默认关）；quota-exceeded.switch-preview-model 关（配额紧张静默切 preview 模型是"时快时慢"嫌疑元凶）；session-affinity 否决——家里 9/21 实测双账号 RR 缓存命中 92-98%（10M tokens 会话 93%），官方注释推断被证伪且粘性伤配额分摊；**隐式缓存在 CPA→Antigravity OAuth 链路实测有效**——修正"OAuth 不可缓存"旧假设（其仅适用显式 caches.create）。reasoningEffort=high 源头=DSH 侧 agent-default-model 配置行（降档一行即改，红线待数据）。
- **影响**：rulesText 热改生效；host.js v12+allow16 需重启 DSH 桌面；回滚=恢复 cordis.patch.yml.bak-dsh-v12-20260926 + host.js.bak-v11 + 删 rulesText 两行。验收点：wire 16、`registry MASKED (allow 15 adaptive from 16; dropped subagent)` 日志、subagent 真调、首步 plan-first。

## [2026-10-16] 节点23 登记（进行中）：Gemini 3.8 Flash 调查 + CPA 渠道商链路实测，余项转 PI-Desktop
- **背景**：全量调查 GitHub 上 Gemini 3.8 Flash / Gemini Flash 的 Agent 优化项目与 skill，用于 PI-Desktop（→ CPA 渠道商 api.mindnest.asia:8443 → gemini-3.8-flash）的使用优化；用户已把该服务从 OpenAI(/v1) 切到 Google 原生协议(/v1beta)。
- **调查结论**：无 3.8 专属成熟项目（发布仅 6 周）；可用组合=官方 skill 库（google/skills 21k★、conductor 3.8k★）+ 行为纪律（Gravitas 159★）+ 档位纪律 + 桥接/诊断（meridian、claude-tap）；Flash 系挂 skill 收益最大（SkillsBench 48.7% 最高通过率）。
- **渠道商实测（6 组同题，key 未打印）**：OpenAI /v1 reasoning_effort 有效（low≈5.0s/0 思考；high≈13.3s/810 思考 token）；Google /v1beta thinkingBudget 有效（1000≈5.3s/0；32768≈12.5s/1034；缺省≈7.2s/464）但 thinkingLevel 被 400 拒（Unknown name）；/v1beta/models 不发布列表不影响对话。
- **未决**：app 内切档实际发送字段未知；models.json（10/8、/v1+openai-completions）与 UI（/v1beta+Google）不一致；协议去留待 PI-Desktop 侧实测。
- **产物**：archive/Gemini 3.8 Flash 调查与 PI-Desktop 使用优化（CPA 渠道商）.md；SESSIONS/pidesktop-gemini.md。

## [2026-10-16] 节点23 更正：CPA /v1beta 支持 thinkingConfig.thinkingLevel（旧测 400 系字段层级错放）＋ app 配置落点=pi.sqlite
- **更正**：第一段记录的「Google 路径拒 thinkingLevel」不成立——那次字段放在 `generationConfig.thinkingLevel`（顶层）。正确层级 `generationConfig.thinkingConfig.thinkingLevel` 同 key 直连复测：HIGH→200（thoughts=286，7.5s）、LOW→200（thoughts=0，1.9s）、thinkingBudget=1000→200（thoughts=139，3.7s）；顶层写法稳定 400（Unknown name at 'request.generation_config'）→ 层级是唯一变量。
- **落点**：PI-Desktop 的 provider 定义在 `~/.pi-desktop/pi.sqlite` → `providers` 表；`~/.pi/agent/models.json`（10-08）仅供一次性导入，已过期（旧记录的两处不一致即源于此）。CPA 行：api_style=google_generative_ai、base_url=…:8443/v1beta、default_model=gemini-3.8-flash、thinkingLevels=[off,low,high]、defaultThinkingLevel=high。
- **适配器**：app.asar `google-shared` 的 `usesGoogleThinkingLevel()` 对 `/gemini-3(?:\.\d+)?-(?:pro|flash)/` 命中即发嵌套 thinkingConfig.thinkingLevel；`off` 发 thinkingBudget:0。
- **运行证据**：turns 表 CPA 回合 completed 且 operations.reasoningTokens>0（10-16 15:08 回合 361/1051），无 400；provider.log 仅 /v1beta 模型列表 404（不影响对话）。
- **结论**：协议去留=保留 Google /v1beta；档位纪律照旧（high 打底），待 app 内 low/high 对照实测复核。

## [2026-10-16] 节点23 收口：pi-tempo 执行纪律体系（四轮实测 + 两轮调研，结论闭环）

- **体系**：全局 skill `~/.agents/skills/pi-tempo/`（十节 + `analyze.mjs` 体检脚本 + 基线，15,365 B）；三个全局子代理 `~/.agents/subagents/`（`gemini-scout` 只读·low／`gemini-fixer` 可写·high／`independent-review` 异构 DeepSeek·只读）；专用沙盒 `E:\www\pi-tempo-lab`（37 文件 / 65 测试 / 门禁绿 / 单次洁净提交，git 历史已抹除测试痕迹）；`/node-run` 模板两份（lab 12,998 B + reddit-trend-tc 15,793 B）。
- **四轮实测**：①基线＝节点 268（pi-tempo 之前）：388 趟往返、模型等待 79.9 min、**381/388 趟只带 1 个工具调用（零合批）**、重复读 53%、`BrandAnalyticsPage.vue` 重复读 32 次。②沙盒三轮修复验证：调用/趟 1.02→**2.2–3.2**、重复读 53–77%→**7–21%**、`save.ps1` 碎片读 4→1、复审等待期空转 107s→56s。③外推节点 268 同任务：往返 388→约 110–145、墙钟 91→约 45–60 min（工具 25.6 min 省不掉）。
- **「并行派 fixer 写代码」被证伪**：结构耦合（节点 268 所有改动围着一个枢纽文件）与规模不足（沙盒 21 文件节点主线程 1 个往返并发写 16 文件 99.6s，派 3 个 fixer 需 ≈10 个往返）双重否定。**subagent 的真实价值只有两种：上下文隔离（scout）与模型多样性（independent-review）**——四轮全部只派了复审这一个。
- **外部佐证**：Co-Coder（arXiv 2606.00953）把编排形式化为 T(P)=W(P)+α·C(P)，实测 Claude Code Agent Teams 墙钟最快但**代码质量低于串行**、文件级并行 API 成本 +60%；动态并发实证（arXiv 2610.10263，2124 次执行 / $20K）——并发收益**只在万行级长程任务转正**，token 1.41–3.31×，SWE-bench 上 Claude Code 反掉 24pp。
- **Flash 专属短板**（调研补充）：长上下文可靠性 22.1%（vs Pro 26.3%）、幻觉率 91%——据此落地两条新规则：**上下文守门**（预判读 >30 文件或 >3000 行→先派 scout；大工具输出先派廉价子代理摘要；实测主线程上下文 1.1万→14.9万 token）与**门禁每批跑最小子集**（不再攒到收口）。
- **判据替换**（旧「≥5 文件／≥30 行／≥5 处」实测证明量错了维度——成本单位是往返不是行数）：**耦合判据**（该支要读 ≥3 个属于其他分支的文件才能确定接口→不拆）＋**规模判据**（预计实现 >2000 行、或该支自身 ≥8 个串行往返→才考虑并行）。
- **明确放弃**：盲目多 agent 写代码；"Core never writes code" 路由器模式（为省贵模型 token 设计，与本目标相反）。
- **记档未落地**（等真实节点数据再说）：Best-of-N 决策点、强模型审切分表（OMO metis 模式）、难度自适应结构、机械步降档强化。
- **建议上游（app 层，非规则可解）**：fork 语义子代理（继承主线程上下文，消灭复审重读 12 个文件的浪费——LangChain deepagents 已实现该模式）、工具输出自动摘要、子代理 schema 化返回（OMP 已实现）。
- **验收指标（下一个真实节点用）**：每趟调用数 ≥2.5／往返 ≤160／重复读 ≤20%／墙钟 ≤60 min／预判 >30 文件时派了 scout。

## [2026-10-17] 节点24：外部看门狗落地（宿主无扩展 API 时的唯一可行落点）

- **数据源三选**：tool.log 只有工具名+成败、无命令正文（做不了签名）；pi.sqlite messages 表 text 对工具行为 null；最终用 `sessions/<id>.jsonl`（完整 args+isError+assistant meta.usage→上下文）＋ pi.sqlite turns（running/error 状态）。全部只读，不与宿主争锁。
- **五规则即五条实测事故**：R1 同签名连败 ≥3（→熔断三分类）/ R2 上下文 >25 万（→handoff 提示词）/ R3 单回合 running >25 min / R4 单回合工具 >45 次（271 T3=48 次重试 38 败）/ R5 15 分钟内 ≥3 个 error 回合（271 T4=换模型解局）。
- **通知与节流**：WinRT toast 走 `-EncodedCommand`（UTF-16LE→B64，防代码页乱码）；同键 10 分钟冷却、每键最多弹 3 次后只留痕；启动回填只建态不弹窗（防重启被旧事故轰炸）；事件留痕 `~/.pi-desktop/logs/pi-tempo-watchdog.jsonl`。
- **真库冒烟自证**：上线首扫即报本会话 ctx≈553k（熔断线两倍以上）＋连败签名 3——正是它要抓的注意力衰减实况，工具上线当天抓到第一个真实案例。
- **验证**：fixture 端到端五规则全触发（静默回填、同签名成功重置、stale 不弹全对）；toast 真机 exit 0；`--once` 真库扫描无误报。教训：本会话三次 Edit 行号错位（553k 上下文的活案例），最终整文件 Write 收口——**超长会话里手术式编辑的失败率本身就是熔断论据**。

## [2026-10-17] 补：CPA Gemini 上下文窗口改 272000（系统级压缩线落地）

- **依据=内嵌核心实测**：`shouldCompact = contextTokens > contextWindow − reserveTokens(默认 16384)`（pi-coding-agent compaction.js:149）；providers 表 `config_json.models[].contextWindow` 是 model override 真源（model-registry.js:206）。此前"压缩阈值不可配"的结论错了一半——`compactAfterTokens*` 键确实不存在，但 contextWindow 就是压缩阈值的杠杆。
- **动作**：CPA gemini-3.8-flash `contextWindow` 1048576→**272000**（source=user，maxTokens 65536 不动）→ 自动压缩触发点 = **255,616 ≈ 25.6 万**（对齐 Codex 272k 与 pi-tempo 25 万熔断线）；**回滚=同字段改回 1048576**，重启 PI-Desktop 生效。
- **副作用已核**（pi-ai overflow.js 全文）：isContextOverflow 仅在单轮暴涨跨 27.2 万时误走 overflow 路径（行为也是压缩+自动重试，可接受）；branch-summarization 预算变小无害；请求本身不会被截断（agent 无按窗口裁剪逻辑）。

## [2026-10-17] 节点25：执行接力档案化（拆分前移到规划落档——判断变程序）

- **调查结论（用户假设被证实）**：落档体系从不分配执行主体——/plan-node 四要素（目标/边界/验收/规模）无执行拓扑；委派词汇四个全是辅助时刻（侦察/复审/整体移交/自干豁免）；BATCH-PLAN 六列有批次无执行者；272 的 execution-contract 有 B1–B3 批次骨架却正向编码「同文件内串行」＋tasks.md 全任务标 `Parallel:NO`——**档案写了自干，执行忠实照办**，7 节点 fixer 零触发由此而来，不是模型不听话。
- **修复（v1.0.6，8390a7a）**：①委派词汇加 `委派:执行接力`（PROTOCOL+PROGRESS 模板；语义=登记时须落七列接力表，执行会话照单循环、禁主会话写源码）②BATCH-PLAN 六列→七列加**执行者列** ③/node-run 两模板加 **2.5 接力分支**（读到标记→读棒简报→Task→TaskWait→事实追加 facts.md→越界检查→下一棒；同棒重派 ≥2 熔断）④fixer 定义加「接力棒纪律」（简报冲突即停棒上报，不静默纠正）⑤contextWindow 恢复 1048576。
- **机制依据**：272 对照实验——同一会话程序性步骤（派复审/ANCHOR 241 次/五步存档）执行率≈100%，判断性步骤（派 fixer 判据/合批/一次读够）全部衰减。「要不要派」是判断（永远判自干），「照单循环」是程序。档案三条性质是 skill 没有的：开工新鲜装载、压缩自愈（272 被压 5 次档案被重读 5 次）、任务定义而非建议。
- **决策修订**：「放弃 Core never writes code 路由器模式」的前提（省贵模型 token）不成立——多账号池下动机＝抗长上下文衰减，纯调度模式重新成立，**仅限档案化接力表驱动**（先落表后执行，不接受执行会话现场自判）。
- **待实测**：273 号节点首用（登记时写接力表）；核对三数：主会话峰值上下文 ≤8 万／全程零源码 Read/Write／fixer 单棒成功率。沙盒全链验证可选（若 273 首跑失败先查死在哪环：①②设计问题回炉，③fixer 能力问题换强模型档）。
## [2026-10-18] 节点27：委派双槽必填——执行拓扑从建议变闸门（#273 复盘）

- **复盘（#273 全链路取证）**：openchamber 规划会话 ses_eb3714320（prometheus-spec／glm-5.3-flashx）技能目录含 node-architect、确实读了 `.nodes/PROTOCOL.md` v1.13.2——seq 415 原文承认「9 tasks 18 files, >30min likely」符合执行接力判据，仍以「spec-superflow contract 未声明就不要求」自设豁免 → 登记行只有 `委派:收口独立复审` → pi-desktop 执行会话忠实自干：57min／主会话 53 Edit+47 Bash／ctx 峰值 498.6k 零压缩／看门狗 6 弹（R4 回合风暴、R2 超 25 万线 268k、R1 失败循环×3、R6 调度器越权首实弹）。
- **三层缺口**：①spec-superflow 五件套模板无执行拓扑节（执行模型写死单 build agent；模板 mtime 10-16 早于 v1.13.0，从未被问过「谁执行」）②协议委派单槽——写上必做的收口复审值即完成委派义务，执行接力是「适用条件」建议不是闸门③模型判断——「要不要派」永远判自干，跨客户端/跨模型第三次应验（pi-desktop gemini×2＋openchamber glm）。
- **决策**：委派拆**双必填槽**——`执行:执行接力`（>30min 或 ≥3 任务；plans 七列接力表；禁主会话写码）或 `执行:—(自干理由)`，**没有默认值**；＋`收口:独立复审`／`收口:登记差距分析`。三层闸门：save.ps1 next-node 缺执行槽硬拒绝（exit 1，两路径实测）／ execution-contract 须含「Execution Topology」节（传导方向恒为 行→contract，反向照抄＝违规）／ /node-run 2.4 执行槽闸（无槽且任务 ≥3 → 停下补登记）。历史行单槽 `委派:` 兼容读法＝执行槽自干；旧式 `委派:执行接力` 等价放行。
- **用户侧待办**：`~/.config/opencode/agents/prometheus-spec.md` 补 Execution Topology 必填节（话术已交用户，openchamber 内执行）。

## [2026-10-18] 节点28：接力双轨防线——v1.0.10 双轨自检与返工棒（#274 首弹复盘）

- **#274 首弹数据**：147min／13 Task／**fixer 8/8 棒全绿**（facts.md 记档）；但主会话 78 Edit＋218 Bash＋433 Read 与棒赛写同一批文件——R6 三弹、棒重派 2 次、ctx 峰 408.9k（目标 8 万的 5 倍）、复审返工 33min 仍双轨（派了返工棒又自己改 11 处）。
- **定论（防线收窄）**：判断层（要不要派）已治愈——程序层 100% 照档案执行（三棒同消息并发/波次顺序/自觉加串行收尾棒/baseline/facts 五次追加/复审带行号/返工棒/存档收口）。唯一残存＝**TaskWait 等待窗口白名单失守**（R1→R2→274 三连，跨三版提示词）；且等待窗口内的活**只烧上下文不省墙钟**（该等的照等）。
- **v1.0.10 四规则**：①每棒收敛自检——TaskWait 回来先 `git status --porcelain` 对授权集，越界＝**停止而非重派**（禁令改程序：检查命令是照单循环步骤，274 实测此类步骤执行率 100%，而「不要写」禁令执行率 0% 类）②等待窗口禁 Read 源码本体（调度器读报告/facts 即可，433 次 Read 是烧穿主因）③返工棒单一 owner 吃完全部发现，主会话禁参与返工④可选只读模式（plan mode 是否放行 Task 无法在宿主外验证，不强制）。
- **缓办**：watchdog R6 写 STOP 标记文件（路径解析不可靠）；plan mode 强制（Task 兼容性未验证）。
- sync 17/17；节点 #28 双槽登记放行（硬闸 dogfood 第 2 次）；275 首用 v1.0.10，新增对账：自检执行次数＝棒数、返工段主会话 Edit＝0。
## [2026-10-18] 节点29：四连败封盘——接力执行迁 openchamber permissions 硬闸

- **274R1 复盘（v1.0.10 首弹）**：模板与 skill 确认装载（会话首条= v1.0.10 版本行＋「双轨自检与返工棒」条在 Skill 回载里）仍双轨——主会话 35E+8W+41B 与全量返工棒陪跑 45 分钟／ctx 320k／R6×3／**每棒收敛自检 0/4 执行**（git status 仅开工×2＋收尾×2）。墙钟 53.9m、Task 仅 2 支、返工棒单一 owner ✓——规模减半但模式原样。
- **结论封盘**：提示词层方案对「等待焦虑」**无效**——禁令（v1.0.7 白名单）、程序化检查（v1.0.10 自检步骤）四连全败（272R1→272R2→274→274R1）。执行会话不能自证清白，只能换执行端。
- **方向 B 拍板**：接力执行迁 **openchamber build-relay agent**——permissions 工具级硬闸（照抄 prometheus-spec 已验证模式：「对授权目录外无 edit/write，工具被权限层直接拒绝」非口头约束）；PI-Desktop /node-run 退居规划＋复审＋验收，不再跑接力主会话。build-relay 话术已交用户在 openchamber 创建。
- **A 线（PI-Desktop plan mode）**：宿主外不可验证（pi-coding-agent dist／agent-capabilities 插件均零命中），且自测会锁死本会话写档——由 B 绕开，不再追。

## [2026-10-18] #16 DSH主力栈适配 批B：两预设工具面定案（开放问题2 收口）

- **背景**：蓝图 B2① 要求 preset-prometheus-spec 挂「只读工具面」并留悬念「dsh-tool-fs 能否只挂 read」（开放问题2）；同时 B2③ 要求「override 行 tool-subagent 加 allowedAgentPresets」。
- **查证**（真源=dsh checkout 包 README + dsh-web-app 预设补丁）：① dsh-tool-fs Config 四独立开关 read/readImage/write/edit（默认 true），minimal 出货预设即有只读挂载示范 → 只读可行；② web-app 基底把 Host 层 tool-subagent 行 disabled:true，注释明言「preset 决定 agent 看到哪些委派工具」→ override Host 行无法影响预设会话，subagent 工具行必须由预设自持。
- **决定**：① preset-prometheus-spec 的 fs **全量挂**（规划者必须写 changes/ 五件套，只读会废掉 A4 核心工作流），越界写靠 persona 闸门口径（蓝图自带降级），物理路径闸门留二期 policy 插件——**开放问题2 答案=能只挂 read**；librarian 无需 policy 即物理无写，prometheus-spec 的路径级闸门有立项价值，按蓝图「等越权写证据」再定；② tool-subagent 以**预设内整块重述声明**落地（照抄 standard/ptc 原行 config 三字段 + allowedAgentPresets:[librarian]）；③ 两条预设补挂 compaction 组（全部出货预设都带，蓝图清单缺项）；④ preset-prometheus-spec 必须带 skill-filesystem+tool-skill 对（web-app 层禁了 Host 发现，预设自持，否则「首步加载 skill」无技能可载）。
- **影响**：bundle=`@local/dsh-prometheus-spec`（pnpm link 到 `research\dsh-adaptation-drafts\bundle`，草稿目录承重）；两 preset 行激活无诊断。坑与漂移全文见 `research\dsh-adaptation-drafts\discrepancies.md`（11 条，含 skill frontmatter ASCII 冒号静默丢弃坑）。

## [2026-10-18] #16 四棒实体化：执行棒从 prompt 模板升级为 preset（用户决策）

- **背景**：用户追问「为什么没有创建那几个子智能体」并确认需要 GUI 可见。蓝图 A2 原设计＝三执行棒仅作 prompt 模板（派发时注入），GUI 无任何实体；PI-Desktop 对照是「文件即定义」，DSH 唯一定义形态＝preset。
- **决定**：bundle v1.1.0 追加三条预设——preset-gemini-fixer（persona=A2 正文真源；fs 全量+fs-search+pwsh 带平台守卫；无 web）、preset-gemini-scout（fs 只读 write:false/edit:false+pwsh）、preset-independent-review（fs 只读、无 shell、无 web）；tool-subagent 白名单扩四元；A3/A4 派发口径同步改为 subagent(agent_preset=…, prompt=六段简报, provider/model 调用层传)——固定纪律由 persona 常驻，简报只带变量部分。
- **不变项**：模型钉死仍不可能（DSH preset 无 model 字段），`__GEMINI_ROUTE__` 维持调用层传；验收⑥口径不变（枚举含 librarian），只是枚举多了三个同伴。
- **影响**：五 preset 行激活无诊断（插件总数 223→226）；新会话预设选择器将出现五个条目（fixer/scout/review 也可被选成会话预设，无害副作用）；link 包版本升级流程=remove_bundle→install_bundle。详见 discrepancies #11。

## [2026-10-19] #31 DSH profile store 失配修复：记录里的 store 必须与操刀 pnpm 的大版本一致

- **故障**：本机 profile（`E:\.dsh\profiles\desktop`）自 10-19 12:07 起所有插件安装/卸载失败，码=`ERR_PNPM_UNEXPECTED_STORE`。取证：`.modules.yaml` 记录 `storeDir=E:\.pnpm-store\v10`／`packageManager=pnpm@10.32.1`／`prunedAt=10:54:47`（当天那次用 **PATH 上的 pnpm 10.32.1** 跑的 install 把记录写回 v10），而市场实际调的是 DSH 自带 **pnpm 11.8.0**，其 store 解析为 `E:\.pnpm-store\v11`；`fsutil hardlink list` 实证 node_modules 内容硬链接落在 v10 store。pnpm 的 store 路径=**`<storeDir> + \v<自己的 store 版本>`**（仅当已以该版本结尾才不追加）→ 记录 v10 与 pnpm 11 永远拼不出同一路径，checkCompatibility 拒绝一切 add/remove。
- **修复（唯一实质改动）**：`.modules.yaml` 两字段——`storeDir`→`E:\.pnpm-store\v11`、`packageManager`→`11.8.0`；备份 `.modules.yaml.bak-20261019-151050`。**零重装**：改前用探针目录比对了 pnpm 11.8.0 的期望值（`layoutVersion` 同为 5、`virtualStoreDirMaxLength` 同为 60，其余字段逐项一致），改后 `add -w is-number@7.0.0`／`remove` 双通、lockfile SHA256 不变，市场随即实装 2 插件成功（dsh-better-sidebar@0.28.0、@kenz1117/dsh-ui-usage-billing@1.6.2，exit=0 hot=true）。
- **推翻的官方建议**：DSH 报错弹窗自带「把记录里的 store 写进 `pnpm-workspace.yaml`：`storeDir: <第一个路径>`」——**跨大版本时无效**（实测 pnpm 11 解析成 `…\v10\v11`，仍报同错）；该修法只适用同大版本换盘（记录 v11 时写 v11 路径即通过）。另两条路也不通：`pnpm install --store-dir <path>` 只对单次命令生效、不重写记录；`pnpm install` 在 store 变更时先要求确认删除 node_modules，非 TTY 下 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`（须 `CI=true`/`confirmModulesPurge=false`，且要退出 DSH 释放占用）——这正是市场无法自愈的机制原因。实测全文见 archive/DSH profile store 失配修复.md。
- **纪律（本机）**：**禁止用 PATH 上的 pnpm（`C:\tools\nodejs`，10.32.1）在 `E:\.dsh\profiles\desktop` 里执行 install**——一次就把记录写回 v10、市场即刻全拒；该目录手动操作一律用 DSH 自带 11.8.0（`resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.mjs`）。一句话判据：**记录里的 store 必须与操刀 pnpm 的大版本一致**。
- **遗留**：`E:\.pnpm-store\v10`（918MB）仍被 node_modules 硬链接引用，直接删不省空间；退役需退出 DSH 后 `$env:CI='true'; <DSH NEXT.exe> --expose-internals <自带 pnpm.mjs> install` 全量重链到 v11，再清 v10（可选，未执行）。

## [2026-10-20] #32/#33 接力批加固与试点：并行原语、BOM、复审锚点

- **背景**：三模板批级循环＋sync 断言（v1.0.11）落地后，用真实小节点 #33 做 n=1 试点；P0 探测发现模板里的「并行」实为串行。
- **决定（并行原语）**：批内并发一律 `workflow.parallel`（可带 provider/model）；`subagent_manager_run` 是同步 persona、一条消息内串行（实测两棒差 102.5s），只配单棒/复审/返工；官方异步 `subagent` 真并行但无 provider/model，仅不需分档时用。v1.0.12 已回写 dsh-run／pi-tempo §10／BATCH-PLAN。
- **决定（防幻觉）**：复审阻断项必须附 `文件:行: 原文`，调度器先 grep 复核；原文不存在＝误报，记 facts 不派返工（#33 实测复审编造 `PROTOCOL.md:126`）。
- **修复（BOM）**：编辑 `.ps1` 会丢 UTF-8 BOM，PS5.1 解析 CJK 即崩；`sync-skills.ps1` 增 4 副本「BOM+ParseFile 零错误」断言（25 checks）——哈希一致不代表可执行。
- **试点结果**：批 1 双棒真并行 22.6min vs 串行外推 40m57s（省 44.8%）；五判据全过；模型分档不变。
- **遗留**：workflow 子会话不落 projcache（每棒 TTFT/pressure 不可机读）；host 取消 workflow 的 `agent/disposed TypeError` 上报；pi-tempo DSH 方言副本需经装配链升版。
