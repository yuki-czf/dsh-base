# DSH Desktop 主力栈适配——调研结论与实施蓝图（交接文档）

> 生成：2026-10-18，设计会话（DSH Desktop / glm-5.3，工作区 `G:\www\dsh-base`）。
> 用途：本会话的调研与设计结论不跨会话共享，本文档是**执行会话（创造模式）的唯一交接图纸**，自包含。
> 实施前通读全文；对任何事实有疑问，按 §8 出处清单复核原文件，不要凭印象。

## 0. 目标一句话

把 prometheus-spec（规划 Agent）+ node-architect / pi-tempo（两个项目级 skill）+ subagent 全家桶（gemini-fixer / gemini-scout / independent-review / librarian）迁入 DSH Desktop，形成闭环：
**规划（强模型）→ node-run 调度 → Gemini 执行棒并行 → 异构复审 → 存档**。DSH 成为唯一主力客户端。

## 1. 背景与用户工作流（迁移动机）

- 现状：prometheus-spec 跑在另一台设备的 openchamber（opencode 系）上；执行在 PI-Desktop，`node-run <节点名>` 驱动
- 完整流程：prometheus-spec 出计划五件套（`changes/{需求名}/`：proposal/specs/design/tasks/execution-contract）→ node-architect（v1.13.3，委派双槽）登记节点 + `plans/<名>.md` 七列接力表 → PI-Desktop `node-run` 逐棒派 `Task(gemini-fixer)`（Gemini 3.8 Flash）→ `.nodes/relay/<名>/facts.md` 记账 → 越界检查（`git status --porcelain` 对基线快照）→ independent-review 异构复审 → node-save 存档
- 动机：Gemini Flash 快但弱，上下文变长即幻觉/不守规则；对策 = 拆小节点 + 每棒新鲜上下文 + 并行派发 + 锚定（ANCHOR）
- 迁移增益：调度器从 Gemini Flash 换成 DSH 主会话强模型（调度质量不再受衰减影响）
- 用户明确划界：**模型渠道接入（含 Gemini 路由配置）用户自己处理**，本蓝图只消费路由名

## 2. 本机环境盘点（执行前必读）

| 项 | 现状 | 影响 |
|---|---|---|
| 工作区 | `G:\www\dsh-base`（git 克隆，本地检出停在 **v1.10.1 时代**，约 2026-10-11） | 本地与云端 main 落后约 3 周 |
| 云端母版版本 | node-architect **v1.13.3**、pi-tempo **v1.0.9**、prometheus-spec **v1.1**（GitHub yuki-czf/dsh-base main） | 语义基准以云端为准 |
| `pi-tempo/`、`prometheus-spec/` 目录 | **本地不存在**（云端 10-18 才推） | 底稿从 GitHub raw 拉（见下表） |
| `node-architect/` 母版 | 本地存在（~v1.10.1） | 可用，但委派双槽是 v1.13.x 语义，见云端 SKILL.md |
| 本地 `git fetch` | **失败**：`.git/FETCH_HEAD` ACL 异常（一个非标准 SID 只有 W/D/DC 无 R） | 本批**不需要** git；要修再修（icacls 或 diagnose-windows-sandbox-acl skill） |
| 项目 `.agents/skills/` | 存在但**为空**（2026-08-22 建的空目录） | 项目级 skill 装载尚未启用，本批首次启用 |
| `~/.agents/skills/`（rank 500） | 有 5 个设计类 skill（frontend-design、web-design-guidelines、emilkowalski-motion、impeccable-design-polish、taste-skill） | 与本批无关，不动 |
| DSH profile | `~/.dsh/profiles/desktop/cordis.yml`；**创造模式组合真实存在**（skill-filesystem + tool-skill + tool-cordis + tool-plugin-manager + tool-plugin-market + customSkillDirs→agent-preset 包内 skills） | 执行会话直接选创造模式预设即可，plugin_manager 工具会就位 |
| 已装社区插件 | skill-explorer、dsh-liangshen（含预设）、dsh-image-gen 等（profiles/desktop/node_modules） | 说明 plugin market 在用；prometheus-spec bundle 未来可上市场分发 |
| node-architect 技能来源 | 本会话技能目录可见 node-architect，但项目/用户级目录均无其文件，profile 里也搜不到正文——**来源未定位**（开放问题 §7） | 不阻塞：经验证明本工作区会话看得到它 |

**底稿拉取地址（GitHub raw，main 分支）**：

```
https://raw.githubusercontent.com/yuki-czf/dsh-base/main/pi-tempo/skill/SKILL.md
https://raw.githubusercontent.com/yuki-czf/dsh-base/main/pi-tempo/subagents/gemini-fixer.md
https://raw.githubusercontent.com/yuki-czf/dsh-base/main/pi-tempo/subagents/gemini-scout.md
https://raw.githubusercontent.com/yuki-czf/dsh-base/main/pi-tempo/subagents/independent-review.md
https://raw.githubusercontent.com/yuki-czf/dsh-base/main/pi-tempo/templates/node-run.lab.md
https://raw.githubusercontent.com/yuki-czf/dsh-base/main/pi-tempo/templates/node-run.reddit-trend-tc.md
https://raw.githubusercontent.com/yuki-czf/dsh-base/main/prometheus-spec/prometheus-spec.md
https://raw.githubusercontent.com/yuki-czf/dsh-base/main/prometheus-spec/librarian.md
https://raw.githubusercontent.com/yuki-czf/dsh-base/main/prometheus-spec/README.md
https://raw.githubusercontent.com/yuki-czf/dsh-base/main/node-architect/skill/SKILL.md
```

**产出落位原则**：本批只写「项目级安装形态」（`.agents/skills/`、`.dsh/skills/`）与草稿目录（`research/dsh-adaptation-drafts/`），**不改母版目录、不动 git**。母版合流（pi-tempo/prometheus-spec 目录补齐 + 版本对齐）是修好 git 之后的后续节点。

## 3. DSH 扩展面结论（已核实事实，出处见 §8）

### 3.1 skill 装载（dsh-skill-filesystem）
- 五级 rank：100 `<项目>/.dsh/skills`；200 `<项目>/.agents/skills`；300 customSkillDirs；400 `~/.dsh/skills`；500 `~/.agents/skills`
- 格式：`<name>/SKILL.md` 目录 bundle 或平铺 `<name>.md`；frontmatter `name`（kebab-case）+`description` 必填，`whenToUse`/`metadata`/`disable-model-invocation`/`user-invocable` 可选
- 热加载（监视深度 1，**不递归发现** `**/SKILL.md`；bundle 内资源子目录无妨）；`user-invocable` 控制是否进用户命令面（'/' 源）
- 项目根 = 最近 `.git` 祖先

### 3.2 Agent 预设（现行体系）
- preset = bundle patch 声明行（`@deepseek-ai/dsh-agent-preset`），经 `plugin_manager install_bundle` 安装到 profile
- 声明行 config：`id`/`name`/`description`/`order`/`plugins`（Cordis 插件行列表）
- ⚠️ legacy `$DSH_HOME/.agent-presets/<id>/`（preset.yml + agent.cordis.yml）**已废弃，无人读取**——节点 16 ssh-runner 生成器因此失效
- GUI 不能建 preset（注册表只读，"没有任何接口接受 YAML 写回"）；官方口径"创造模式在对话中编写这类 bundle"
- 出货预设：standard / ptc / minimal / cordis（dsh-web-app bundle）

### 3.3 persona（dsh-persona，preset 内挂载）
- `prefix`（必填，渲染为 deployment:persona-prefix 段）/ `suffix` / `complete: true`（前缀=整个系统提示词）/ `includeRuntimeContext: false`
- 只能在 preset 作用域挂载；全局挂载会与提示词注册表撞名报错
- 本蓝图用法：**persona 短前缀**（规划者身份 + 强制第一步加载 prometheus-spec skill + 禁写码声明），33KB 全文放项目级 skill——程序性指令（"先加载X"）实测遵守率接近 100%，且 skill 随 git 走、热更新

### 3.4 工具面 = 权限面的一半
- preset 的 plugins 列表决定该 agent 挂哪些工具包（官方示例：review preset 只挂 tool-bash）
- **不挂写工具 = 模型真的没有写工具**（对模型层是真实边界）
- 但 preset 不是安全沙箱（YAML/插件可执行 Host 代码）；`install_bundle` 需 Full 权限或人工审批（安装时弹窗属预期）

### 3.5 子代理与并行
- `subagent` 工具**异步**：立即返回 id，完成时会话内主动通知，无需轮询；**同一消息里多个 subagent 调用 = 并行**；Settings→Subagent 有递归深度/并行容量/可选模型白名单（开启后 subagent schema 才长出 provider/model/reasoning_effort 参数）
- child preset：tool-subagent 行 config `agentPreset`（默认子级）/`allowedAgentPresets`（模型经 `agent_preset` 枚举选择）；**仅 in-process spawn 后端支持**
- override 是**整块替换** config，必须重述原行全部字段；Host 级 override 影响所有会话
- `workflow` 工具：`parallel()`（全量屏障）/ `pipeline()`（条目间无屏障）/ `agent(prompt,{schema,provider,model,label})`（schema 可做 JSON Schema 机器校验）；纯 JS 沙箱（无 fs/网络/timer/Node API），IO 全由子代理承担
- preset 无 model 字段——模型在调用层定（契合"同一 fixer preset 换模型跑"）

### 3.6 模型路由（用户自理）
- `dsh-llm-pi-ai`：pi-ai 多提供方路由（google 在列）+ OpenAI 兼容网关；`apiKeyEnv`/OAuth；与 DeepSeek 直连可并存；配置热生效
- **占位符约定**：本蓝图所有派棒指令中的 `__GEMINI_ROUTE__` 由用户回填实际路由名（providers 字典键）；回填前相关验收项挂起

### 3.7 权限闸门（二期）
- DSH 无 opencode 式 per-action allow/ask/deny 规则表
- 硬闸门路线：bundle 内小 policy 插件（preset 可贡献 policies），在 fs 事件闸门按路径前缀放行 `changes/` + `.nodes/`、其余 deny
- 降级方案 = persona 口头纪律（opencode v1.0→v1.1 的演进史已证明口头版不够，只作过渡）
- **本批不上**，等试跑出现"越权写"证据再立项

## 4. 交付物清单

### 批A：文件类（先做，纯文件，普通会话也能做）

| # | 产出 | 落位 | 说明 |
|---|---|---|---|
| A1 | pi-tempo **DSH 方言版** | `.agents/skills/pi-tempo/SKILL.md` | 源=云端 v1.0.9 改写：§1 Edit-tag 节整节替换（DSH edit 是字面量替换、无 tag 失效；批量=同消息多 edit / ops_replace / write 整文件）；§2→`timeoutMs`；§3→`[exit code: N]`；§7 参数表换 DSH 工具名；§8 删"机械步降档 low"（DSH 无按调用档位）；**§5/§6/§8.5（锚定）/§9/§10 普适内核原样保留**；§10 接力调度映射：Task/TaskWait→subagent 并发+完成通知 / workflow parallel·pipeline |
| A2 | 执行棒简报模板 DSH 版 | `.agents/skills/pi-tempo/subagents/{gemini-fixer,gemini-scout,independent-review}.md` | 源=云端同名文件；六段简报结构（GOAL/验收/文件集/已验证事实/验证/终止）原样；工具引用换 DSH（edit→edit/write、bash→pwsh、测试命令不变）；回报要求各段 ≤300 字保留 |
| A3 | **node-run DSH 版** | `.dsh/skills/node-run.md`（平铺、user-invocable 默认即开） | 语义照 `node-run.lab.md`：读档（CONTEXT+PROGRESS+接力表一批并发读）→ `git status --porcelain > .nodes/relay/<名>/baseline.txt` 基线快照 → 逐棒（读模板+六段简报 → `subagent(..., provider='__GEMINI_ROUTE__', model='gemini-3.8-flash')` → 报告事实追加 facts.md → 越界检查=快照后新增且不在本棒授权集的行）→ 复审棒（**换 provider** 异构）→ 存档收口；含 ANCHOR 行纪律与会话熔断线 |
| A4 | prometheus-spec **skill 全文 DSH 版** | `.agents/skills/prometheus-spec/SKILL.md` | 源=云端 prometheus-spec.md：剥 opencode frontmatter（permissions YAML/model/mode）→ 换 DSH skill frontmatter；工具表重映射：`task(explore)`→subagent 只读简报派发、`task(librarian)`→`subagent(agent_preset:'librarian')`、`task(general)`→裸 subagent、bash→pwsh、analyze_image MCP→视配置（无则注明降级）；shuo-ren-hua 引用→talk-human skill 名；五件套纪律/Clearance Checklist/自审三分类/高精度审查循环/交接铁律**原样保留** |
| A5 | persona 短前缀文本 | `research/dsh-adaptation-drafts/persona-prometheus-spec.md` | ≤30 行：规划者身份 + "永远理解为创建工作计划" + 权限闸门口径（changes/、.nodes/ 外无写权，被拒不绕过）+ **强制第一步加载 prometheus-spec skill** |
| A6 | librarian persona 文本 | `research/dsh-adaptation-drafts/persona-librarian.md` | 源=云端 librarian.md 剥 opencode frontmatter；证据必须带 permalink、四分类（A/B/C/D）、日期自检等正文原样 |

### 批B：bundle 类（依赖批A文本，需创造模式会话）

| # | 产出 | 说明 |
|---|---|---|
| B1 | bundle 目录 | `research/dsh-adaptation-drafts/bundle/{package.json, cordis.patch.yml}`；package.json 形如 `{"name":"@local/dsh-prometheus-spec","version":"1.0.0","private":true,"type":"module","dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}` |
| B2 | cordis.patch.yml | ① `insert` 行 `preset-prometheus-spec`：plugins = persona(prefix=A5 文本) + 只读工具面（fs-search / fs 读 / web / skill / subagent / todo / present；**先经 `cordis_inspect_query` 查 `dsh-tool-fs` 的 Config 能否只挂 read**——不能则本批挂全量 fs 工具，闸门降级为 persona 纪律 + 二期 policy）② `insert` 行 `preset-librarian`：persona(A6) + web/fs-search/fs 读，**无任何写工具** ③ `override` 行 tool-subagent（**先 `plugin_manager list_plugins` 查原行 id 与 config，整块重述**）：+`allowedAgentPresets: [librarian]` |
| B3 | 安装与验证 | `plugin_manager install_bundle`（target=bundle 目录绝对路径；需 Full/审批，弹窗属预期）→ `list_plugins` 查两 preset 行激活无诊断 → 新开会话预设选择器应出现 Prometheus-Spec / Librarian |

### 明确不做（本批）
- policy 硬闸门插件（二期，见 §3.7）
- 母版目录合流 / git ACL 修复 / dist 打包（后续节点）
- pi-tempo watchdog 与 analyze.mjs 的 DSH 移植（独立线，等基线重测需求）
- ssh-runner DSH 客户端按新 bundle 格式重写（节点 16 断代问题，另立节点）

## 5. 已知坑（执行前过一遍）

1. **override 整块替换 config**——先查再改，重述全部字段（含你没动的）
2. `allowedAgentPresets` 仅 in-process **spawn** 后端支持（fork/外部后端拒绝）
3. `install_bundle` 在 Host 进程执行插件代码 → 需 Full 权限或审批；已有会话保持开工组合，**验证必须新开会话**
4. 预设切换仅**空白会话**可切；已有会话切预设不生效
5. skill 发现深度 = 1（只认 `<root>/<name>/SKILL.md` 与 `<root>/<name>.md`）；bundle 内资源子目录不受影响
6. 每个 skill 作用域最多一个实例可拥有模型选择（tool-subagent 的模型白名单配置）
7. 本地 `git fetch` 因 `.git/FETCH_HEAD` ACL 失败——本批不要尝试 git 网络操作，底稿全走 raw URL
8. pi-tempo 的"重复读是最大隐性开销"同样适用于执行会话自己：底稿一次读够再改，别翻来覆去
9. `__GEMINI_ROUTE__` 未回填前，A3 里相关派发指令保持占位符原样，不要编造路由名

## 6. 验收清单（可直接作节点验收标准）

```
□ A1-A6 全部落位且 frontmatter 合法（name kebab + description）
□ 本项目会话技能目录出现 pi-tempo、prometheus-spec；'/' 命令面出现 node-run（GUI 实测）
□ A1 保留 §8.5 锚定与 §10 依赖四型等普适内核（对照云端原文抽查）
□ B3 两 preset 行激活、无诊断；新会话选择器可见
□ 选 prometheus-spec 预设的新会话：首步主动加载 skill，对"实现X"类请求回应"创建工作计划"而非动手写码
□ subagent 工具出现 agent_preset 枚举且含 librarian；派一次 librarian 跑通（web+read，无写工具可用）
□ 同一消息并发 ≥2 个 subagent（gemini 路由）→ 完成通知到齐后 fan-in（依赖 __GEMINI_ROUTE__ 回填 + Settings→Subagent 开启模型可选）
□ 试跑一个真实小节点（接力表 2 棒）：facts.md 记账 + 越界检查 + 异构复审全流程
执行:执行接力（批A 文件 / 批B bundle 可两棒；预估 >40min）
收口:独立复审（对照云端原文逐项 diff 抽查 + GUI 实测验收）
```

## 7. 开放问题

1. node-architect 技能目录条目的实际来源（项目/用户级目录均无文件、profile 无正文，但本工作区会话可见）——不阻塞，留档待查
2. `dsh-tool-fs` 能否在 preset 里只挂 read 不挂 write/edit（决定 B2 工具面写法；`cordis_inspect_query` Config.listConfigs 查）
3. persona prefix 有无隐性长度上限（本设计已规避：短前缀+skill 承载全文）
4. user-invocable skill 在 '/' 命令面的实际呈现（A3 验收覆盖）
5. workflow 脚本内 `Promise` 竞速能否实现 TaskWait mode:any 语义（暂不需要，记录备查）

## 8. 事实出处（复核用）

DSH checkout（`G:\app\DSH Desktop\resources\app\node_modules\@deepseek-ai\` 下）：
- `dsh-agent-preset\skills\editing-cordis-compositions\SKILL.md`——bundle 写法/legacy 迁移/安装验证/插件放置
- `dsh-agent-preset\skills\cordis-composition-reference\SKILL.md` + `references\packages.md`——patch 方言 + 全部可挂插件包清单
- `dsh-agent-preset-registry\README.zh.md`——注册表只读、创造模式写 bundle
- `dsh-persona\README.zh.md`——prefix/suffix/complete/includeRuntimeContext
- `dsh-skill-filesystem\README.zh.md`——五级 rank/格式/user-invocable/热加载/深度 1
- `dsh-tool-subagent\README.zh.md`——agentPreset/allowedAgentPresets/模型选择/仅 spawn 支持
- `dsh-llm-pi-ai\README.zh.md`——多提供方路由
- `dsh-mcp-client\README.zh.md`——MCP 插件行（节点 16 重写时用）
- 用户 profile：`C:\Users\zifeng\.dsh\profiles\desktop\cordis.yml`（创造模式组合在第 1234 行段；tool-plugin-manager 带 profileContext 条件启用）

## 9. 执行会话开场白（复制即用）

```
读 research/dsh-desktop-adaptation.md 并严格按它执行：批A（A1-A6 文件类）→ 批B（B1-B3 bundle）。
规则：底稿只从文中 raw URL 拉（本地 git 坏了别碰）；__GEMINI_ROUTE__ 未回填的验收项跳过并记录；
改母版目录和 git 操作都被禁止；每完成一项更新 todo；全部完成后按 §6 验收清单逐项自检并报告结果。
开工前先按 AGENTS.md 协议 next-node 登记节点「DSH主力栈适配」，验收标准用 §6。
```
