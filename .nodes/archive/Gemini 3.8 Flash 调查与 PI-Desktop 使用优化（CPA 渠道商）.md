# 节点归档：Gemini 3.8 Flash 调查与 PI-Desktop 使用优化（CPA 渠道商）

> 状态：**进行中**（第一段 2026-10-16 收口；第二段在 PI-Desktop 继续）。本文件=细节正文（先行落档），完成时补验收结果。
> 会话：pidesktop-gemini ｜ 相关：DECISIONS.md 2026-10-16 条目、SESSIONS/pidesktop-gemini.md

## 一、背景
- 用户链路：PI-Desktop（pi 内核桌面客户端）→ CPA 渠道商「api.mindnest.asia:8443」（CLIProxyAPI 系聚合中转，多账号池化）→ Gemini 3.8 Flash。
- 用户已把该服务的接入协议从 OpenAI(/v1) 切到 Google 原生(/v1beta + Google Generative AI 格式)；服务内可切“思考档位”。
- 需求：①全量调查 GitHub 上针对 Gemini 3.8 Flash / Gemini Flash 的 Agent 优化项目或 skill；②诊断并优化 PI-Desktop 这条链路；③本节点作为继续入口（PI-Desktop 侧接手）。
- 用户明确：**token 成本不是约束**（多账号池），优化只看能力/延迟。

## 二、调查结论（GitHub，2026-10-16 快照）
**无 3.8 专属成熟项目**（3.8 Flash 发布仅 6 周）。可用资源四类：
- **官方**：google/skills（21,347★，Agent Skills 库）；gemini-cli-extensions/conductor（3,770★，spec 驱动）；google-gemini/gemini-skills（4,282★）；google/agents-cli（6,094★）；antigravity-cli（2,566★）。
- **行为纪律**：udaysharmadev/Gravitas（159★，六铁律：读后写/范围内/证据完成/禁无变化重试/高风险 checkpoint）；Joonghyun-Lee-Frieren/oh-my-antigravity（213★，分档表）；KbWen/agentic-os（211★）。
- **桥接**：rynfar/meridian（2,121★，Pi/OpenCode 本地桥）；NoeFabris/opencode-antigravity-auth（10,939★）；keli-wen/agy-staff（744★）；amlyczz/dsh-agy-link（113★）；CLIProxyAPI（55,386★，本渠道商同类）。
- **诊断**：liaohch3/claude-tap（3,288★，可拦截 Pi 流量）。
- 证据：SkillsBench（Gemini CLI+3 Flash 挂 skill 通过率 48.7%，全场最高）；Appwrite（Flash 加 in-context 文档 +14.4 分）；Google 官方（gemini-api-dev skill 让 3 Flash API 代码正确率 6.8%→87%）。

## 三、渠道商链路实测矩阵（本机直连；key=User 环境变量 CPA_API_KEY，未打印）
同一条话术（鸡蛋题）6 组对照，2026-10-16：

| 协议/参数 | 耗时 | 思考 token | 结果 |
|---|---|---|---|
| OpenAI /v1 · reasoning_effort=low | 5.0s | 0 | ✅ |
| OpenAI /v1 · reasoning_effort=high | 13.3s | 810 | ✅ |
| Google /v1beta · thinkingLevel=LOW/HIGH | — | — | ❌ 400 "Unknown name thinkingLevel" |
| Google /v1beta · 缺省（不传） | 7.2s | 464 | ✅ |
| Google /v1beta · thinkingBudget=1000 | 5.3s | 0 | ✅ |
| Google /v1beta · thinkingBudget=32768 | 12.5s | 1034 | ✅ |

- 结论：Google 路径收旧式 `thinkingConfig.thinkingBudget`、拒新式 `thinkingLevel`（400）；OpenAI 路径 `reasoning_effort` 有效。
- `/v1beta/models` 不发布模型列表（“该地址没有模型列表”）——不影响 generateContent 对话。
- 渠道商为聚合型（模型列表含 veo/imagen/seedance/wanx 等媒体模型）；`gemini-3.8-flash` 为手动添加。
- 配置证据：`~/.pi/agent/models.json`（10/8 最后写入）该服务仍为 `openai-completions @ /v1`、`$CPA_API_KEY`、`thinkingLevelMap{off:none, low:low, high:high}`；UI 现显示 `/v1beta`+Google → 两者不一致，app 实际生效配置落点待 PI-Desktop 确认。

## 四、下一步（PI-Desktop 侧接续清单）
1. **切档对照实测**：app 内同一话术 low/high 各发一次（建议新会话两条）；观察是否 400（=app 发 thinkingLevel）与回答差异；若 400 → 记录并评估：回退 OpenAI 协议（/v1，reasoning_effort 曾实测有效）或让渠道商支持 thinkingLevel。
2. **定协议去留**：Google /v1beta（budget 生效）vs OpenAI /v1（effort 生效），以实测为准。
3. **档位纪律**：high 打底、low 快活、medium 折中（token 非约束）；可参考 oh-my-antigravity 分档（规划/评审=high、实现=medium、快活=low）。
4. **行为纪律 skill**：评估 Gravitas（读后写/范围/证据完成/禁无变化重试）装与不装的结论；若装，装后同任务对比。
5. **收口**：第二段结果回写本文件＋PROGRESS 行，`save.ps1 verify -Completed` 校验归档后节点改“已完成”。

## 五、渠道商报障话术（备用）
> 调 /v1beta/models/gemini-3.8-flash:generateContent 时，generationConfig.thinkingLevel 返回 400 "Unknown name thinkingLevel...Cannot find field"；generationConfig.thinkingConfig.thinkingBudget 正常。请支持新式 thinkingLevel 字段（3.8 官方推荐 low/medium/high），或告知如何让客户端使用 budget 映射。

## 六、参考链接
- Gravitas https://github.com/udaysharmadev/Gravitas ｜ oh-my-antigravity https://github.com/Joonghyun-Lee-Frieren/oh-my-antigravity
- google/skills https://github.com/google/skills ｜ conductor https://github.com/gemini-cli-extensions/conductor
- meridian https://github.com/rynfar/meridian ｜ claude-tap https://github.com/liaohch3/claude-tap
- 本仓库：SESSIONS/pidesktop-gemini.md ｜ DECISIONS.md（2026-10-16）

## 七、第二段侦察与更正（PI-Desktop 侧，2026-10-16）
- **更正（推翻第三节结论）**：「Google 路径拒 thinkingLevel」**不成立**——第一段把字段放在 `generationConfig.thinkingLevel`（顶层）。正确层级 `generationConfig.thinkingConfig.thinkingLevel` 同 key 直连复测：HIGH→**200**（thoughts=286，7.5s）、LOW→200（thoughts=0，1.9s）、thinkingBudget=1000→200（thoughts=139，3.7s）；顶层写法稳定 400 `Unknown name "thinkingLevel" at 'request.generation_config'` → 层级是唯一变量。
- **app 实际配置落点（第三节存疑项已解）**：`~/.pi-desktop/pi.sqlite` 的 `providers` 表（不是 `~/.pi/agent/models.json`；后者 10-08 仅供一次性导入，已过期）。CPA 行：`api_style=google_generative_ai`、`base_url=https://api.mindnest.asia:8443/v1beta`、`default_model_id=gemini-3.8-flash`；模型项 `thinkingLevels=[off,low,high]`、`defaultThinkingLevel=high`、ctx 1048576 / maxTokens 65536。
- **适配器静态证据**：`app.asar` → `google-shared-*.js`：`usesGoogleThinkingLevel(model)` 正则 `/gemini-3(?:\.\d+)?-(?:pro|flash)/` 命中即发嵌套 `thinkingConfig.thinkingLevel`（MINIMAL/LOW/MEDIUM/HIGH）；`off` 走 `getDisabledGoogleThinkingConfig` → `thinkingBudget: 0`。
- **运行证据**：`turns` 表 CPA provider 回合 status=completed，`usage_json.operations[].reasoningTokens>0`（10-16 15:08 本地回合 361/1051/…），全程无 400；`logs/app/provider.log` 只有 `/v1beta` 模型列表 404 / “no models” 的发现告警（不影响对话）。
- **协议去留（初判，待 app 内实测复核）**：保留 Google `/v1beta`。
- **待办**：app 内 low/high 同话术对照（看回答差异与思考 token）→ 档位纪律 → 行为纪律 skill（Gravitas）→ 收口改「已完成」。
- **实测话术（固定，勿改）**：`不要调用任何工具，只凭推理回答，用不超过 3 句话说明理由：球拍和球一共 1.10 元，球拍比球贵 1.00 元，球多少钱？`（正确=0.05 元；高思考易对、低思考常答 0.10）——开两个新会话各发一条，模型=CPA `gemini-3.8-flash`，档位分别 low / high；回读 turns 表 reasoningTokens 与耗时做对照。

## 八、Gemini 强化型 skill 调研（2026-10-16，用户追加：「Gemini 跑起来不强，找 GitHub 强化 skill」）
**结论：不存在「让 Gemini 变强」的 skill**——skill 不改权重，只压漂移/失败模式；官方与第三方口径一致（superpowers 自述不把弱模型变前沿；SkillsBench 实测：人工 skill +16.2pp、自造 skill −1.3pp、最佳 2–3 个）。另有渠道限制证据：CPA 的 Gemini 全系 Flash（3-flash / 3.1-lite / 3.5-lite / 3.8-flash[high|low|none]），**无 Pro 档**——「不强」首因是选型而非缺 skill。

| 类别 | 仓库 | ★ | 说明 | 落地方式 |
|---|---|---|---|---|
| 官方 API 类 | google-gemini/gemini-skills | 4,284 | gemini-api-dev / live-api / omni-flash；官方实测 3 Flash API 代码正确率→87% | 仅写 Gemini 应用时有用 |
| 官方 | google/skills | 21,348 | Google 产品线 skills（含 skills/cloud/gemini-api） | 同上 |
| 官方扩展 | gemini-cli-extensions/conductor | 3,769 | spec-driven（specify→plan→implement） | Gemini CLI 扩展格式，需移植 |
| 纪律护栏 | obra/superpowers | 300,194 | 完整开发方法论 skill 包（先规格→小步→测试→验证） | Gemini CLI `gemini extensions install …`；Antigravity `agy plugin install …`；**Pi `pi install git:github.com/obra/superpowers`** |
| 纪律护栏 | addyosmani/agent-skills | 107,154 | 25 工程 skill + 9 slash（/spec /plan /build /test /review /ship） | `npx skills add addyosmani/agent-skills`（写 `.agents/skills/`） |
| 纪律护栏 | mattpocock/skills / affaan-m/ECC | 293,265 / 280,687 | 工程师向 skill 集 / harness 性能优化（skills+instincts+memory） | 通用 SKILL.md |
| 规则文件 | FerroxLabs/agents-md | 722 | drop-in AGENTS.md：禁谄媚、禁顺手重构、强制验证循环 | 零成本，抄规则本地裁剪 |
| 清单 | VoltAgent/awesome-agent-skills · sickn33/agentic-awesome-skills · Piebald-AI/awesome-gemini-cli | 35,800 / 47,704 / 517 | 1000+ / 2600+ / Gemini CLI 生态索引 | 按需挑装 |
| 评测 | cskwork/skill-ab-eval | 0 | A/B 验证 SKILL.md 是否真改行为（支持 gemini/agy/claude/codex） | 方法论（本节点已在用同款对照法） |

**安装路径（本机实测）**：PI-Desktop 读**工作区 `.agents/skills/<name>/SKILL.md`**（node-architect/talk-human 即从此加载）；宿主 `E:\Program Files\PI-Desktop\resources\skills` 是程序目录、升级即覆盖，勿放。`pi` CLI **不在 PATH**（桌面版自带运行时），`pi install …` 暂不可用 → 用工作区目录手动放或 `npx skills add <repo> -a antigravity`（写 `.agents/skills/`）。
**建议（2–3 个上限）**：① 纪律护栏二选一（superpowers 或 addyosmani/agent-skills）② 规则层抄一份 AGENTS.md 约束 ③ 仅开发 Gemini 应用时加官方 gemini-skills；装后按本节点同款对照法验收（同任务 with/without + pi.sqlite 复核）。

## 九、gemini-3.8-flash 实跑体检与第一轮干预（2026-10-16）
数据源：`pi.sqlite`（turns/messages）+ `~/.pi-desktop/sessions/*.jsonl`，覆盖 **47 会话 / 128 回合**；脚本 `pi-gemini-tuning/analyze.mjs`，基线 `pi-gemini-tuning/baseline-2026-10-16.txt`。

| 指标 | 基线（改动前） |
|---|---|
| 回合 | completed 109（平均墙钟 **923s**、最长 9083s）/ error 13（**全是 NETWORK_ERROR，渠道层**）/ aborted 6 |
| token | input 1.19 亿 / output 157 万 |
| Bash | 2094 calls / **826 err（39.4%）**：stderr 噪声 221、测试失败 210、其他 exit=1 149、TOOL_TIMEOUT 58、类型错误 46、tmp 脚本语法 20、命令敲错 14、依赖 13、路径 9 |
| Edit | 1153 calls / **145 err（12.6%）**：`EDIT_PARSE_FAILED` **110**（`PUT …:` 漏冒号为主）、`EDIT_LINES_UNSEEN` 17、`EDIT_TAG_MISMATCH` 9、`RANGE_INVALID` 2、`NO_CHANGE` 2、`TAG_UNKNOWN` 2 |
| Read / Glob / Grep | 3028（25×FILE_NOT_FOUND，单回合最多 258 次）/ 348（22×漏 `pattern`）/ 613（6×path 不存在） |
| 重复命令 | 同一 spec 13 次、`npx vue-tsc -b` 12 次、同一 verify 脚本 10 次 |

**诊断**：瓶颈＝**工具契约与执行纪律**（Edit DSL 语法、把 stderr 噪声当失败、长命令不设超时、全量验证反复重跑、探索乱序），不是推理能力；13 次 error 属渠道层网络问题，与模型/规则无关。

**第一轮干预（已落地）**：`AGENTS.md` 增「工具执行纪律（PI-Desktop 宿主）」7 条，逐条由上面数字校准。**为什么不用第三方 skill**：实测 Gemini 会话 system prompt 的 context 段（23.4k 字符）确实**每轮注入 AGENTS.md**，而 skill 是**按需加载**——执行层失败发生在每次 Edit/Bash，必须常驻。第三方（superpowers / addyosmani 等）暂不装，避免与规则层同时改动、混淆变量。

**复测**：攒够 ≥10 个含编辑+验证的回合后重跑 `node pi-gemini-tuning/analyze.mjs`，比 Edit 错误率（12.6%→?）、TOOL_TIMEOUT（58→?）、平均墙钟（923s→?）；有基线后再评估是否叠加第三方 skill。

## 十、跨项目落地：全局 skill（2026-10-16；用户指出 AGENTS.md 只管本仓库）
- **机制查实**：PI-Desktop 支持全局 skill 目录 `~/.agents/skills/`（app.asar：`gd="~/.agents/skills"`、`hd(s)`→`<project-root>/.agents/skills`，global/project 两级 scope；UI 调 `listUserSkills({level})`）。宿主扫描后经运行时 `setPluginSkills` 注入：system prompt 出现 `# Skills` 段（"Plugins have taught you the following skills"）+ 每个 skill 一个 `skill:<id>` 段（sidecar.js @63365）。本机该目录已有 13 个在用 skill（animate/apple-design/…）→ 机制确实生效。
- **无注册表**：`~/.pi-desktop` 下搜不到任何记录 skill 启用状态的 json（用既有 skill 名反查 0 命中）→ **磁盘即状态**，新目录在下次扫描（重启 app 或新开会话）即生效。
- **已落地**：`~/.agents/skills/pi-tool-discipline/` — `SKILL.md`(3.8KB) + `analyze.mjs`(跨项目体检脚本) + `baseline-2026-10-16.txt`。description 内嵌触发词（Edit/Bash/工具报错重试/验证方式）。
- **AGENTS.md 收口**：本仓库那一节 7 条规则正文改为「指针」两行，避免与 skill 双源漂移；`pi-gemini-tuning/` 保留为工作副本与基线。
- **边界（诚实声明）**：skill 是 **按需加载**（progressive disclosure，描述命中才载入正文），不是每轮常驻——app 设置里也没有「全局自定义指令」字段（实测 kv `app` 无 customInstructions），所以跨项目目前只有 skill 一条路。若发现触发不够勤，可在各项目 AGENTS.md 放一行指针兜底。

**验证方法**：重启 PI-Desktop（或新开一个会话）→ 设置 → 扩展/技能 里应出现 `pi-tool-discipline`（global）；在任意项目里让它改文件/跑命令，若它先读该 skill 即生效。
- **主动调用方式（斜杠菜单，2026-10-16 追加查实）**：宿主 composer 的命令表含 **「技能/Skills」分组**，用户 skill（全局 `~/.agents/skills` + 项目 `.agents/skills`）以 **`skill:<id>`** 为命令名列出（app.asar `loadComposerSkillCommands`：`name: \`skill:${skill.id}\``，kind=`skill`）；id=目录名。选中后宿主把消息重写成：`Call the \`Skill\` tool with each of these ids before answering this request, in order: "<id>". Follow the loaded skill instructions.` + 正文（`@73880165`），即**强制先加载该 skill 再回答** → 不依赖自动触发。命令表在每次发送（内容匹配 `/(^|\s)\/\S/`）时经 `buildComposerCommands()` 重建。故手动用法：`/skill:pi-tool-discipline <你的请求>`。另一条路（项目级、非全局）：`.pi/prompts/*.md` → `/模板名`。
- **提及语法细节（查实，2026-10-16）**：`findSkillMentions(content, skillIds)` 用 `/(^|\s)\/([^\s]+)/g` 抓 token，再拿 token 去命令表精确匹配（表键=命令名）→ **必须写成 `/skill:<目录名>`**（写 `/pi-tool-discipline` 不匹配）。多条提及**支持**（去重、保序，`ids` 一起下发）；**尾部文字保留为正文**（`body`）。模板侧占位符：`$ARGUMENTS`/`$@`/`$1`/`${1:-默认}`/`${@:2:3}`；模板无占位符时尾部文字自动追加。
- **落地条件已核**：用户真实项目 `E:\www\reddit\reddit-trend-tc` 具备全部前提（`.nodes/` + `.agents/skills/node-architect/` + `.pi/prompts/{plan-node.md,node-save.md}` + `AGENTS.md`）→ 可直接加 `/node-run` 之类的执行节点模板；全局 `pi-tool-discipline` 亦在其中可用（`/skill:pi-tool-discipline`）。
- **已落地（2026-10-16，用户确认）**：`E:\www\reddit\reddit-trend-tc\.pi\prompts\node-run.md`（3,359 B，UTF-8 无 BOM，frontmatter description+argument-hint，`$ARGUMENTS` 就位）——`/node-run <节点>` = 第0步路径纪律 + 加载 `node-architect`+`pi-tool-discipline` → 读档 → 复述 → 执行（含侦察/工具纪律四条）→ 门禁 `scripts\gate.ps1` → 收口 `/node-save`（`save.ps1 finish -Completed`）。验证：编码/中文/frontmatter/占位符全过；`git check-ignore` → `.gitignore:111 .pi/`，故该文件与其 `.pi/prompts/{plan-node,node-save}.md` 同为**本地未入库**，未污染仓库（既有 24 项未提交改动未触碰）。
- **附带发现（待议，未处置）**：用户项目的 `node-save.md` 引用 `save.ps1 finish` 动作与「委派闸门 v1.12.1」，而本母版仓库为 v1.10.1 → 该项目装的是更新版节点协议，母版可能落后（后续若要统一，走「更新节点协议」正向流程）。
- **`/node-run` 首跑故障与修复（2026-10-16，用户实测）**：现象＝执行 `/node-run 268` 后模型读完档、复述节点即结束回合；证据（会话 `bfa8745f`）＝第 0 步两个 Skill 均按模板加载成功（`node-architect` 08:21:52、`pi-tool-discipline` 08:23:16），随后读完 DECISIONS 复述 #268 验收标准并停止，用户补一句「开工」后才继续干活。**根因＝三处规则叠加要求「复述后等确认」**：① 我模板原第 2 步写「确认后再动手」② node-architect 铁律 1「读完复述…确认后再动手」③ 项目 `AGENTS.md` 同义条款。**修复（模板 4 处改动，4537 B / 54 行）**：① 顶部新增「**本命令即授权**：打出 `/node-run` 即等于说『开工』…本口径**优先于**铁律 1 与 AGENTS.md 的确认条款（那条针对『读取节点xx』只读交接）」② 第 2 步改为「一行状态…交代完**立即**进入第 3 步，不要结束回合、不要问是否开工」③ 第 3 步加「TodoWrite 清单逐项推进到底，不要每项回来问一次」④ 新增「**停止条件**」节：仅 5 种情形可停（需用户决策／破坏性操作／验收达成收口／真实阻塞／上下文将压缩留断点），其余不停。验证：读回核验四处标记各命中 1 次（`不要停下等确认` 2 次），UTF-8 无 BOM、中文完好、`.pi/` 仍为 gitignore 不入库。
- **「I will」预告与往返预算（2026-10-16 实测，会话 bfa8745f「读取节点268」）**：用户问「一直 I will 是不是拖累」。数据：①预告行 34/36 条、2,998 字符 ≈ 857 token ≈ **4.5s 生成时间（约 2–3%）**；②**预告不额外增加往返**——`预告出现→工具发起` 中位 **268ms**（同属一个响应），而 `工具结束→下一句预告` 中位 **6,453ms**、工具自身中位 **9ms** → **延迟几乎全在模型侧**（首字 ≈3.8s，属渠道/CDN，本地改不掉）；③本会话推理 token 9,411 ≈ 50s 生成 ≈ 全程两三成；④浪费的往返实例：读档分了 4 次（CONTEXT→plan→git status→PROGRESS 各一轮，本可 1 批），`BrandAnalyticsPage.vue` 读 3 次、`mockups/.../index.html` 读 3 次（L1-120/L121-240 分次）。**结论：优化点不是删掉预告，而是减少往返次数 + 机械步降档。**
- **据此落地的两处改动**：①全局 skill `~/.agents/skills/pi-tool-discipline/SKILL.md` 新增「§8 往返预算」（读档一次并发／同一文件一次读够／独立调用同批／预告每批一行／机械步降档），并更新 frontmatter description 加入「执行变慢/往返太多需要提速」触发词（4,908 B）；②`/node-run` 模板：第 1 步改「读档（一批并发）」、工具纪律新增「往返预算」条（4,970 B / 54 行）。
- **`/node-run` 是否还需单独「读取节点xx」＋子代理并行（2026-10-16 用户提问，已答并落地模板）**：①**不再需要**——模板第 1 步就是「读档（一批并发）」，且第 2 步要求一行状态后**立即执行**；「读取节点xx」降级为「只想先看不想动手」时的读-only 习惯。②顺手优化：0.2 的 skill 加载改为**同一批发出两个 `Skill` 调用**（原先措辞「依次加载」会诱导串行，白等一轮 ≈6.5s）。③**子代理门禁查实**：宿主以模型级 `availableForSubagents`（UI 名「Available for AI delegation」）为闸门，未开启且非默认模型的会被 `PERMISSION_DENIED`（app.asar @74469474）；本机现状=**仅 `deepseek-v4.1-flash` 为 true**，CPA 的 `gemini-3.8-flash` 未开 → 想用 Gemini 当子代理须先在「设置 → 模型」为它打开该开关。④模板第 3 步补「可并行时按项目 `AGENTS.md` 委派决策表派子代理（大范围只读测绘／无共享文件的双线实现／收口独立复审；简报四要素；只读并行、写操作单线程）」，工具纪律补「子代理门禁」条（模板 5,601 B / 55 行）。
- **子代理并行落地（2026-10-16，用户已打开开关）**：①验证 CPA `gemini-3.8-flash` 的 `availableForSubagents` **已为 true**（pi.sqlite providers.config_json），OpenCode Go 的 `deepseek-v4.1-flash` 同为 true。②查实宿主规则（app.asar）：**内置子代理继承父会话模型**（定义无 model 钉 → 父是 Gemini 则子也是 Gemini，用户无需额外配置）；**自建子代理可钉模型**——`~/.agents/subagents/<name>.md`（全局）或 `<项目>/.agents/subagents/`，frontmatter 键（解析时小写去分隔符）：`name`（^[a-z0-9][a-z0-9-]{0,39}$）、`description`（必填）、`provider`+`model` 或 `model: <provider>/<model>`、`fallbackmodels`、`thinkinglevel`、`permission`（inherit/ask/accept-edits/auto）、`tools`（可分配=Read/Glob/Grep/BrowserPreview/Bash/Edit/Write，默认 Read,Glob,Grep，`*`=全部，`inherit` 记号）、`maxtokens`、`idletimeout`/`maxduration`；上限 **16 定义 / 8 钉住 provider**；**用户定义按名覆盖内置**。③新增两个全局子代理：`gemini-scout`（custom/gemini-3.8-flash · low · 只读 Read/Glob/Grep/Bash）与 `gemini-fixer`（同模型 · high · 可写含 Edit/Write）——用自写校验器按解析器规则复核，两条均 ✓ 通过（name/description/model/tools/thinking 合法，正文非空）。④`/node-run` 模板新增「并行派发（子代理）」节（表格列两个子代理＋只读随便并行/写按文件集分割/简报四要素/内置继承模型说明），模板 6,946 B / 74 行。⑤另知：`Task` 调用可临时传 `model` 参数覆盖（宿主有 subagentModelResolver）。
- **多要求并行切分规则（2026-10-16，用户提问「一个节点多个修改要求能否并行」）**：已写进 `/node-run` 模板新增「切分」节（9,593 B / 107 行）。规则三条：①列出每个要求的**文件集**（路径非目录，含必碰文件）②任一文件重合 → 串行 ③接口依赖 → **契约冻结后可并行**（主线程先写类型/签名/骨架并跑通类型检查）否则串行。硬规则：**同一文件=串行**（Edit 行操作＋写后 tag 变，并行必 `EDIT_TAG_MISMATCH`）；**孪生文件**（`en-US.ts`/`zh-CN.ts` 同 key）归同一 agent；**隐式共享文件必查**——实测本仓热点＝`i18n/locales/{en-US,zh-CN}.ts`、`i18n/index.ts`、`router/index.ts`、`api/index.ts`、`i18n/__tests__/{coverage,cjk-hardcoded}.spec.ts`；**门禁由主线程串行跑一次**（整仓检查）。产出「切分表」（要求/文件集/关系/批次），批内两两不相交、跨批串行、一批 2–3 个。按域切最省事（本仓 i18n 已按域分片 `locales/fragments/*.ts`）＋实现与测试分离。另修正模板中「子代理门禁」条：Gemini 与 DeepSeek 均已开启 AI delegation。
- **并行切分机制落到通用层（2026-10-16；用户纠正：不应从单个节点推测、不要改他的节点）**：①**声明**：本会话未改用户任何节点（其项目内仅写 `.pi/prompts/node-run.md` 一个模板文件，`.nodes/` 零写入）。②把切分写成**项目无关的通用协议**，落在全局 skill `pi-tool-discipline` 新增 **§9 多任务切分**（8,307 B）：判定三步＝**枚举文件集（路径级、必须有证据；已读=确定／命名猜=推测）** → 重叠判定（确定集相交→串行；含推测且可能落共享文件→先 Grep 确认否则串行；全确定且不相交且无接口依赖→可并行） → 接口依赖（**契约冻结**：先写类型/签名/骨架并跑通类型检查，再并行实现，否则串行）；**共享文件只允许一个 owner**（注册/入口类、元数据类、共享测试基建、孪生文件 → 并行任务不碰，主线程并行落地后统一收尾）；**每轮并行落地后越界检查**（`git status --porcelain` 只应出现授权集内文件；越界=划分失败）；门禁/全量测试由主线程在所有并行批后跑一次；**准确性优先于并行度，拿不准就串行**；另列「不并行的情况」。description 加入并行/切分/subagent 触发词（616 字符，未超 1024）。③模板侧改为**项目侧要点 + 指向 §9**，并**删除全部照节点 268 编的示例**（ComparePicker/BrandAnalyticsPage/归属逻辑 残留 = 0，已机器核验），切分表换成通用 T1–T4 格式（含"确定/推测"列与"共享文件主线程收尾"行）；本仓热点清单保留但标注「非通用规则，随仓库变化维护」。模板 10,615 B / 112 行。
- **子代理依赖处理（2026-10-16，用户提问「B 要等 A 怎么办」）**：查实机制前提——**子代理之间没有通信通道**（各自独立会话，仅主线程可见其报告；无等待原语），故「B 等 A」只能在主线程调度里表达。通用协议落全局 skill 新增 **§10 子代理依赖：主线程当调度器**（SKILL.md 10,972 B，章节顺序已核 9→10→自检）：**依赖四型**＝A 无依赖（同批并行）／B 接口依赖（**冻结契约消解**：主线程先写类型＋签名＋空骨架并跑通类型检查→同批并行）／C 数据依赖（**真串行两批**：A 批只读低档 → 主线程汇总重切分 → B 批）／D 汇聚（同批并行→主线程 fan-in）；**调度动作**＝`Task` 后台派发 + `TaskWait`（`mode:"any"`＋`minCompleted` 够用即走；**等待超时不是失败**）、**派完不空等**（主线程并行做契约/自己域文件/备简报）、fan-in 前越界检查、门禁只在 fan-in 后跑一次；**成本口径**＝每次「等」≈主线程往返 6.5s＋子代理首字 4s＋报告往返，链长 2–3 即吃光收益 → 小且必须串行的活**主线程自己做**，只有任务大或需隔离上下文才派；**反模式**＝让 B 先跑指望 A 产出、用子代理实现等待、同批碰同文件。同步写进 `/node-run` 模板「依赖怎么排」小节（模板 11,660 B）。
- **异构复审子代理 + app 改写发现（2026-10-16，用户提问「想要另一个审查 subagent」「触发 subagent 的是存档 skill 吗」）**：①**新建 `~/.agents/subagents/independent-review.md`**（1,930 B）：`model: <OpenCode Go provider id>/deepseek-v4.1-flash`（**异构家族**）、`thinkinglevel: high`、`tools: Read/Glob/Grep/Bash`（只读，无 Edit/Write）、正文含「只审不改／逐条对验收标准／结论必须带 path:line／找反例优先（边界·回归·契约）／不编问题／只跑最小验证」与固定报告格式（裁决：阻断/有条件通过/通过）。②**app 会改写用户子代理定义**：`gemini-scout.md`/`gemini-fixer.md` 的 mtime 变为 08:51（我创建之后），内容被规范化为 app 自己的格式——`tools: [Read, Glob, Grep, Bash]`（流式列表）、`model: CPA/gemini-3.8-flash`（provider **名**，我原写 vendorKey `custom`，解析成功）、`thinkingLevel: low`（驼峰，我原写小写）→ 三定义**均被 app 接受并加载**；自写校验器已升级为兼容两种列表写法后复跑，三条 **✓ 完全通过**。③**触发链查实**：派子代理**不是**由存档 skill 单独触发，而是「**PROGRESS 节点行的 `委派:` 标记**（数据源）→ **项目 `AGENTS.md` 委派决策表 v1.12.1**（主规则：必派/选派/不派）→ node-architect skill 效率条款 + `/node-run` 第 6 步（规则副本）」；角色→本端子代理的映射由开工时自声明写进 SESSIONS「委派状态」。④**从用户截图实测到的浪费**：内置 `code-reviewer`（继承 Gemini·high）跑 29 步 / 3m28s，主线程 TaskWait 空等 3m21s → 已写进 `/node-run` 第 6 步三条：**简报给足**（验收标准 + `git diff --name-only` 清单 + 关键 diff 摘要，免它重新探索）、**复审期间主线程并行写 archive/CONTEXT 暂存**（与代码不相交）、**要独立就换家族**（`independent-review`，或用内置 + Task `model` 参数指定非 Gemini）。⑤可委派模型现状：仅 CPA `gemini-3.8-flash` 与 OpenCode Go `deepseek-v4.1-flash` 为 true；若要用更强的复审（deepseek-v4-pro / glm-5.3 / kimi-k3 等）需先在设置中开该开关，换 pin 一行即可。模板 12.1 KB。
- **复审子代理"换人"的方案与落地（2026-10-16，用户要换 deepseek-v4.1-flash）**：①**先澄清**：`independent-review.md` 创建时**已 pin** `a24fe721-5c84-4fc0-ab19-df9c3ead8405/deepseek-v4.1-flash`（不需要换模型）；真正缺的是**映射接通**——让主代理收口时派它而非内置 `code-reviewer`。②**接通位置选定**（三层择优）：不动 PROGRESS 节点行、不动项目 `AGENTS.md`（其第 412 行写死 "派 code-reviewer"，属项目规则未获授权改），改在 **`/node-run` 模板**——新增"三个全局自建子代理"表（含 independent-review 行：deepseek-v4.1-flash·high·只读）、"收口独立复审的映射"条（给出可直接复制的 SESSIONS 声明句 `本端映射=收口独立复审→independent-review（deepseek-v4.1-flash·high·只读）`）、以及执行流程第 3 步"开工时在 SESSIONS 声明委派映射"。③**依据**：项目协议原文＝「角色→本端子代理」映射**开工时自声明写入 SESSIONS「委派状态」**（`AGENTS.md:409`），SESSIONS 实际写法已抽查（如 build-252「本端映射=收口独立复审→general-purpose 子代理」）→ 模板指引与实际惯例一致。④**注意点**：`independent-review.md` 用 provider **id** 作 pin，而 app 会规范化用户定义（`gemini-scout.md` 已被改写成 `model: CPA/gemini-3.8-flash`＝provider 名）；宿主 `findSubagentProviderSource` 支持 id／vendorKey／名称三路匹配，故两种写法均可，重启后按设置里显示的模型名复核即可。模板 13,137 B / 127 行，表头/分隔/数据行与映射声明均核验在位。
- **复审 prompt 对照与融合 v2（2026-10-16，用户质疑「是不是抄了 code-reviewer 的 prompt」）**：①**诚实答复＝不是抄的**：首版 `independent-review.md` 是我凭理解自写（当时**未读**内置 prompt）——这是缺陷，用户质疑成立。②**现已取到内置全文**（app.asar @81632634，内置 `code-reviewer` 定义）：要点＝「Review only what the task names，但读够周边代码」「优先找**会改变行为的缺陷**：错误结果/未处理失败/破坏不变量/竞态/资源泄漏/缺测试覆盖」「对照**调用方与邻居的实际用法**判断而非风格偏好」「格式/命名/结构**除非导致缺陷**否则不说」「每条 `path:line` ＋一句话说清**什么会坏、在什么输入下**，按严重度排序」「**代码没问题就明说并列出检查过的用例**——没有证据的空审查不算审查」，工具 `[Read, Glob, Grep]`（**无 Bash**，描述明写 "Has NO Bash or shell access"）。③**融合 v2**（2,210 B，body 707）：吸收内置六条判据（范围控制/缺陷类型清单/对照调用方/风格例外/可复现性/防空审查），保留本地协议对接三项（逐条核对验收标准、裁决分级「阻断/有条件通过/通过」、**待验证**段交主代理执行）；**工具集去掉 Bash**（对齐内置设计：复审纯静态、不陷于跑命令，需执行才能确认的怀疑走「待验证」交主代理——符合「主线程是唯一执行汇聚点」）。④**关键澄清**：内置那次跑 29 步/3m28s **不是它 prompt 的问题**（其首句即"只审任务点名的东西"），而是**主代理简报没给足**（无 diff 清单/摘要，它只能自己摸）→ 修正方向落在模板的"复审简报必须给足"（已加：验收标准 + `git diff --name-only` + 关键 diff 摘要），而非改内置。⑤模板同步：表格工具列改「Read/Glob/Grep（无 shell、无写权限）」、派发规则补"复审简报必须给足"条。三定义复跑校验器均 ✓ 完全通过。
- **scout/fixer prompt 对照迭代 v2（2026-10-16，用户追问「另两个是否也要优化」）**：同样先取内置全文（app.asar `BUILTIN_SUBAGENT_DOCUMENTS`）再改。**内置 `explorer`** 要点＝「按工具分工（Grep 文本/Glob 文件名/Read 具体文件）」「**别停在第一个命中**——顺着定义与调用点、问题涉及多处时一处结果不算答案」「引用那几行并给 path:line」「**找不到时说清搜了哪里、线索断在哪——精确的死胡同比猜测有用**」，报告形状 `<files>/<answer>`，工具 `Read/Glob/Grep/Bash`。**内置 `fixer`** 要点＝「主代理交的是完整自洽规格→**实现它，不重新规划**、不做规格外调研」「**先读每个要改的文件**，绝不凭记忆/过期内容写」「**改动最小化、不碰无关代码**」「只能在工作区内写，用工作区相对路径」「跑相关验证，不适用就报告 skipped + 原因」「**不派子代理、不问用户、不联网**；缺上下文自己 Grep/Glob/Read」，报告形状 `<summary>/<changes>/<verification>`。
  **迭代结论（两个都升 v2）**：①`gemini-scout.md`（1,758 B，body 640）吸收＝工具分工、**别停在第一个命中**（原先最大缺口）、精确死胡同；保留本地＝一次读够、独立探查同批发出、Bash timeout、不要推测。②`gemini-fixer.md`（2,319 B，body 946）吸收＝**不重新规划**、**不派子代理/不问用户/不联网**（原先完全缺失，防递归委派）、不顺手重构、只在工作区写；保留本地＝Edit 行操作与写后重读 tag、**只看 exitCode 判成败**、最小子集验证不跑全量、"没跑过验证不许说完成"。③**有意不采用内置处**：内置 fixer 允许「验证不适用就报告 skipped」，我们要求更严（跑不了必须给原因）；内置用 XML 报告形状，我们沿用紧凑中文三段（主代理是 Gemini，中文更省 token 且与 SESSIONS 用语一致）。④三者复跑校验器 **✓ 完全通过**，吸收项/保留项逐条命中（4/4、4/4、4/4+3/3）。
- **节点 268 实跑时间账与「能否砍掉 1 小时」的诚实答复（2026-10-16）**：读会话 `bfa8745f` 全量数据（3 回合，第 3 回合执行中）：**wall 约 68 min**；**模型往返 307 次、等待合计 37.3 min（占 67%）、中位 7.2s／P90 16.6s**；工具自身合计 18.7 min（33%），309 次工具调用（Read 152、Grep 45、Edit 43、Bash 40 其中 24 报错、Glob 8、Write 7）。**根因三条**：①**重复读**——154 次 Read 只对应 38 个文件（**83% 重复读**），`BrandAnalyticsPage.vue` 读 43 次只改 13 次、其 spec 读 23 次只改 7 次；②**同文件连续编辑被拆成 N 次单点改**——6 个「连续编辑段」共 27 次小改，本可合并为 6 次多 op Edit，另有 **19 次「编辑后紧接同文件重读」**（tag 变化逼出）；③**Bash 24/40 报错**：其中 15+4 次是 **vitest 的 browserslist/deprecation 噪声被当失败**（正是 skill §3 已写但未被遵守），5 次是 `save.ps1 checkpoint` 缺 `-Node` 参数。**诚实结论：本机制能省 15–20%（68min→约 55min），省不掉一半**——TTFT 7.2s 是渠道侧，307 次往返是「43 次编辑 + 154 次读」这类任务规模的固有产物。**据此新增两条硬规则**（SKILL.md 12,667 B / 193 行）：§1「**批量编辑**」——同一文件多处改动写进**一次 Edit 调用的多个 op**（原始行号、自底向上、不重叠），只在真需看新内容时才重读（样本对照：63 趟≈7.5min → 8–16 趟≈1–2min）；§6「**重复读是最大隐性开销**」——读之前先问「已有信息够不够下笔」，实测 83% 是重复读。模板侧无需改（§9/§10 已有依赖与派发规则）。
- **体系命名为 `pi-tempo`（2026-10-16，用户拍板）**：这套「让 CPA 渠道 Gemini 在执行节点时更快/更稳」的体系正式命名 **pi-tempo**（节奏）——命名为依据＝核心实测洞察「**时间 ≈ 模型往返次数 × 每次等待**」（往返中位 7.2s vs 工具自身 3.6s），整套纪律的主线就是压掉白往返；与既有 `pi-speed-meter`／`pi-throughput` 同族（都归"快"这一支）。
  **改名动作（已完成并核验）**：①目录 `~/.agents/skills/pi-tool-discipline/` → **`~/.agents/skills/pi-tempo/`**（旧 skill 名 `pi-tool-discipline` 已名不副实——内容早超出"工具纪律"，含往返预算/切分/依赖调度）；②`SKILL.md` frontmatter `name: pi-tempo`、标题改「pi-tempo：PI-Desktop 执行节奏纪律」、开头改为一句第一性原理＋四条实测基线（Edit 失败 12.6%／Bash 39.4%／重复读 83%／单节点 307 往返＝68min）；description 重写为十节清单（708 字符，未超 1024）；自检路径同步。③项目模板 `/node-run` 两处引用改 `pi-tempo`（第 0.2 步 skill 名、§9 指向）。
  **核验**：旧目录已消失／新目录三文件（SKILL.md 14,827 B、analyze.mjs、baseline）／frontmatter name 与目录名一致／无 BOM 无乱码／10 章节完整／**全盘残留引用扫描（旧名 pi-tool-discipline）= 0**（子代理三件、analyze/基线、模板均已查）／模板内 `pi-tempo` 2 处、旧名 0 处。
  **手动调用方式**（斜杠菜单）随之变为 **`/skill:pi-tempo`**；`/node-run` 内部加载不受影响（模板已更新）。
- **专用测试沙盒 `E:\www\pi-tempo-lab`（2026-10-16，用户明确要求「别拿 reddit-trend-tc 测」）**：起因＝用户禁止在真实工作项目 reddit-trend-tc 上测试 pi-tempo，且其 PROGRESS 里没有"待开始"节点（全为待验收）。**沙盒设计（刻意贴合 pi-tempo 各条规则）**：零依赖 Node 项目（`node --test`，22 文件）——①`src/core/parse-amount.js` 留真实缺陷（不认负数/千分位、报错说不出原因）②`src/format/currency.js` 留真实缺陷（无千分位、负数输出 `¥-1234.50`）③`src/core/ledger.js`+`src/format/table.js` 留硬编码中文（门禁可机器校验）④**共享文件结构**＝`src/i18n/index.js`（注册表）+ `messages.zh.js` ↔ `messages.en.js`（孪生）+ `test/messages.test.js`（键一致性校验，共享测试基建）⑤门禁 `scripts/check.mjs`＝跑单测 + 扫 `src/` 硬编码中文（**行注释不计**，避免逼模型删注释）。**已登记节点 #2 `ledger-hardening`**（待开始，owner=lab-1），验收＝三要求：①parseAmount 支持负数与千分位+可定位报错+测试 ②formatCurrency 支持千分位与负数显示+测试 ③硬编码中文收进 i18n（zh/en 键齐全）④门禁全绿。**预期切分**：T1∥T2 可并行（各自独立文件），T3 碰共享 i18n → 主线程收尾或独立批次。
  **沙盒建设踩坑与处置**：①`node --test <目录>` 在 Node 24 + Windows 上误报失败（"test at test:1:1"）→ 实测无参数 `node --test` 正常（17/17 绿），已在 `scripts/check.mjs` 与 `AGENTS.md`/`README` 写明"不要传目录参数"；②CJK 扫描最初把**中文注释**也算硬编码（8 处）→ 改为剥离行注释后计（精确到 3 处真实文案）；③沙盒的 node-architect 是 **v1.10.1**（动作集无 `finish`）→ 模板收口段按老版本写（`save.ps1 save … -Completed` + 手工五步），**不能用 reddit 项目的 v1.12.x `finish`**；④**README 刻意写成中性示例项目说明**（不写"这是 pi-tempo 测试沙盒"）——避免被观察的 Agent 因"知道自己在被测"而刻意表现；⑤补 `git init` + 基线提交（越界检查 `git status --porcelain` 依赖 git）。
  **另查实（对未来有用）**：斜杠模板有**全局目录**——`composerTemplateDirs()` = `{ project: <ws>/.pi/prompts, user: ~/.pi/agent/prompts }`，**项目级优先、重名时项目覆盖全局**；故 `/node-run` 可做成全局版在所有项目可用（当前未做，用户选择先保留 reddit 项目级那份）。

## pi-tempo 验证收口（2026-10-16）：四轮实测 + 两轮外部调研

### 四轮实测

| 轮次 | 场景 | 关键数据 |
|---|---|---|
| 基线 | 节点 268（真实项目，pi-tempo 之前），会话 `bfa8745f` | 388 趟往返、模型等待 79.9 min、**381/388 趟只带 1 个工具调用**、重复读 53%、`BrandAnalyticsPage.vue` 重复读 32 次／改 13 次 |
| run1 | 沙盒节点 2（ledger-hardening），会话 `b1837896` | 40 ops／488s；重复读 21%；`save.ps1` 被碎片读 4 次；复审等待期主线程空转 107s |
| run2 | 同节点回滚重跑（唯一变量＝加两条规则），会话 `2fde73e5` | 47 ops／482s；重复读 7%；`save.ps1` 1 次读完；等待期主线程塞进 6 个往返（TaskWait 107→56s）；**回退＝todo 按任务罗列导致该合的批没合** |
| run3 | 沙盒节点 3（module-expansion，21 文件三棵独立树），会话 `c1b9311d` | 39 ops／537s；**1 个往返并发写 16 个文件（99.6s）**；todo 已按批次登记；越界检查过；65 测试全绿 |

**修复系数（沙盒实测）**：调用/趟 1.02→2.2–3.2；重复读 53–77%→7–21%。**外推节点 268 同任务**：往返 388→约 110–145、墙钟 91→约 45–60 min；工具 25.6 min（vitest/gate/Playwright）省不掉。

### 并行派发的结论（四轮一致：从未派过 fixer，且不该派）

- 节点 268＝**结构不允许**：所有改动围着一个枢纽文件（读 46 改 13），文件集拆不开必然撞车。
- 沙盒节点 3＝**经济不允许**：能一批写完的任务，并行永远是负优化（1 往返 vs 3 个 fixer ≈10 往返）。
- **subagent 的真实价值**：上下文隔离（`gemini-scout`，保护主线程上下文）与模型多样性（`independent-review`，异构家族盲点不同）——**不是"并行干活"**，主线程本来就并发调工具。

### 外部调研（两轮）

1. **Co-Coder**（arXiv 2606.00953，2828 任务）：T(P)=W(P)+α·C(P)；文件级并行 API 成本 +60% 只换 1.56×；Claude Code Agent Teams 墙钟最快但质量低于串行。可借鉴：hub 隔离（in-hub 单例／out-hub 归集成组）、lift 量化判据（α·c_ij < w_i 才拆）、共享任务表无屏障调度。
2. **动态并发实证**（arXiv 2610.10263，Codex/Claude/Kimi，2124 执行/$20K）：收益只在万行级长程任务转正；token 1.41–3.31×；三种真获益机制＝互补并行／多方案探索／独立验证；Kimi 一次派 20 子代理死等整批超时（验证 TaskWait mode:any 规则）。
3. **OMP（oh-my-pi，Pi 同源 fork，34.6k stars）**：schema 化子代理返回（无散文解析）、worktree 隔离（无合并冲突）、Agent Hub 实时观测、auto-thinking 自动降档。
4. **OMO（oh-my-openagent，11 个内置 agent）**：角色比我们细——explore/librarian/oracle/metis（计划评审）/momus；"Research agents: cheap fast models are fine"。
5. **LangChain forked subagents**：isolated（默认，会重做主线程已做的读取）vs fork（继承全部对话）；分工准则＝**worker 用 fork、verifier 用 isolated**——run3 复审重读 12 个文件正是 isolated 的固有浪费。
6. **Flash 画像**：218 tok/s（比 Pro 快 3×）、$0.5/$3（便宜 4×）、**长上下文可靠性 22.1%（vs Pro 26.3%）**、幻觉率 91% → 上下文守门与每批验证从"优化"变"必需"。

### 收口动作（2026-10-16）

- 判据替换：删「≥5 文件／≥30 行／≥5 处」→ 耦合判据（读 ≥3 个他分支文件→不拆）＋规模判据（>2000 行或 ≥8 个串行往返）。
- 新增：上下文守门（>30 文件派 scout／大输出先摘要）＋门禁每批跑最小子集。
- 去重瘦身：skill 删重复基线表（第 22–29 行系残本）、合并「一次读够」双写、等待期清单细节归模板；三文件合计 44,422→44,156 B（净 −266）。
- 同步：reddit-trend-tc 模板三处（fixer 判据／门禁时机／拆节点阈值）。
- 验证：旧判据残留 0；沙盒回归 65/65 测试 + 门禁 exit 0。

### 遗留（记档不落地，等真实节点数据）

Best-of-N 决策点／强模型审切分表／难度自适应结构／机械步降档强化；上游建议＝fork 子代理、工具输出自动摘要、schema 化返回。**下一个真实节点验收指标**：每趟调用数 ≥2.5／往返 ≤160／重复读 ≤20%／墙钟 ≤60 min／预判 >30 文件时派了 scout。
