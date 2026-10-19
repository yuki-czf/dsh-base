# discrepancies——蓝图 vs 实际差异台账

> 铁律5：发现蓝图与实际不符，先记这里再继续，不硬编。批A 执行中发现；批B 条目待补。

## 目录索引

1. [`.agents/skills/` 非空](#agentsskills-非空)
2. [云端 pi-tempo 版本](#云端-pi-tempo-版本)
3. [DSH skill frontmatter 静默丢弃坑](#dsh-skill-frontmatter-静默丢弃坑)
4. [本机 node-architect 为 v1.10.1，无 `finish` 动作](#本机-node-architect-为-v1101无-finish-动作)
5. [环境：受限令牌下存档锁创建被拒](#环境受限令牌下存档锁创建被拒)
6. [B2 工具面内部张力（已定案）](#b2-工具面内部张力已定案)
7. [B2③「override 行 tool-subagent」的落法修正](#b2③override-行-tool-subagent的落法修正)
8. [两条预设补挂了 compaction 组](#两条预设补挂了-compaction-组)
9. [GUI 实测环境受限](#gui-实测环境受限)
10. [bundle 以 pnpm link 形态安装](#bundle-以-pnpm-link-形态安装)
11. [四棒实体化（用户决策 2026-10-18，蓝图之上的设计升级）](#四棒实体化用户决策-2026-10-18蓝图之上的设计升级)
12. [主/子智能体层级标注（用户决策 2026-10-18，v1.2.0）](#主子智能体层级标注用户决策-2026-10-18v120)
13. [`__GEMINI_ROUTE__` 回填定案（2026-10-18）](#__gemini_route__-回填定案2026-10-18)
14. [子智能体设置卡片在 Desktop 构建不渲染（2026-10-18，v1.3.0 兜底）](#子智能体设置卡片在-desktop-构建不渲染2026-10-18v130-兜底)
15. [子会话可见宿主面工具（preset 只读保证的作用域边界，⑦ 试跑实测发现）](#子会话可见宿主面工具preset-只读保证的作用域边界⑦-试跑实测发现)
16. [v1.3.1 白名单扩复审路由与收口修订（2026-10-18）](#v131-白名单扩复审路由与收口修订2026-10-18)
17. [产品更名 DeepSeek NEXT 与手册 v1.2 判据去名化（2026-10-19）](#产品更名-deepseek-next-与手册-v12-判据去名化2026-10-19)

## 批A 期间发现

1. **`.agents/skills/` 非空**（蓝图 §2 说"存在但为空"）：实际已有 `node-architect/`（v1.10.1，蓝图定稿后被安装）。良性漂移，不影响本批落位。**附带回答开放问题1**：node-architect 技能来源＝项目级 `.agents/skills/node-architect/`（rank 200），本会话 skill 工具的资源基址实证。
2. **云端 pi-tempo 版本**：raw main 实为 **v1.0.10**（蓝图 §2/§4 写 v1.0.9）。按蓝图「语义基准以云端为准」执行 v1.0.10；方言改动注记已随文件头部声明。
3. **DSH skill frontmatter 静默丢弃坑**（蓝图 §3.1 未记录）：`description:` 平文本值内含 ASCII `: `（如 `[exit code: N]`）会被 YAML 解析器当作键分隔，**整个 skill 被静默丢弃**（技能目录不出现、无报错）。pi-tempo 首次落位实测踩中，把描述改为「按退出码标注判成败」后即出现在目录。**后续所有 skill 文案禁止在 frontmatter 平文本值里用 ASCII 冒号+空格**（全角冒号安全）。
4. **本机 node-architect 为 v1.10.1，无 `finish` 动作**：云端 SKILL.md（v1.13.3）推荐 `save.ps1 finish` 快路，本机不存在该子命令。A3（node-run DSH 版）存档命令只引用本机存在动作（save/checkpoint/commit/verify/verify-batch + `-Completed`）。
5. **环境：受限令牌下存档锁创建被拒**：workspace-write 沙箱令牌对 `.nodes\.lock.d` 的创建报 UnauthorizedAccessException，save.ps1 把它误报为「Lock busy / race lost to unknown」（竞态分支的 catch 吞了真实异常）。ACL 诊断脚本核实路径不存在、无可修对象（NOT_THIS_CLASS）；full access 下创建成功。**结论：本项目跑 save.ps1 需 full access 会话**（或先手动放开 .nodes 的目录创建权限）。

## 待批B 验证

6. **B2 工具面内部张力（已定案）**：蓝图 B2① 说 preset-prometheus-spec 挂「只读工具面」，但 A4 的五件套工作流要求规划者能**写** `changes/`（Step 2–7 全是 write/edit 调用）——纯只读 fs 面会让规划者无法产出工件。**查证结论**：`dsh-tool-fs` Config 有 `read`/`readImage`/`write`/`edit` 四独立开关（默认 true，官方 minimal 预设就有 `write:false+edit:false` 的只读挂载示范）→ 只读挂载**技术可行**；但规划者必须写五件套，故 preset-prometheus-spec 落地为 **fs 全量挂（不传开关）+ persona 闸门口径**（即蓝图自带降级方案），preset-librarian 落地为**物理只读**（`write:false, edit:false`）。**开放问题2结论：能只挂 read（write/edit 关掉即可）；librarian 无需 policy 插件即物理无写；prometheus-spec 的路径级写闸门（只放行 changes/ + .nodes/）dsh-tool-fs 无此粒度 → 二期 policy 插件有立项价值且可行（preset 可贡献 policies），是否立项仍按蓝图「等越权写证据」**。

## 批B 期间发现

7. **B2③「override 行 tool-subagent」的落法修正**：实际层次是——dsh-web-app 基底补丁把 Host 层 `tool-subagent` 行 `disabled: true`（注释明言「preset 决定 agent 看到哪些委派工具」），会话里的 subagent 工具来自**预设自己的插件行**。对一个 disabled 的 Host 行做 override 无法影响预设会话。故落地为：在 preset-prometheus-spec 的 plugins 里声明 tool-subagent 行，**整块重述出货预设（standard/ptc 完全一致）的原行 config**（`provider: spawn` / `toolName: subagent` / `modelSelectionSettings: true`）再 `+allowedAgentPresets: [librarian]`——与蓝图 §3.5「child preset：tool-subagent 行 config」语义一致，仅"override"一词按实际层次修正为"预设内整块重述声明"。
8. **两条预设补挂了 compaction 组**（蓝图工具面清单未列）：standard/ptc/minimal 全部出货预设都带 compaction-basic（+ptc 另带 pruner），规划者长访谈无压缩会爆上下文；librarian 也挂了 compaction-basic。属基础设施非工具面，判定为蓝图清单缺项而非超范围。
9. **GUI 实测环境受限**：本会话的 dsh-builtin-browser 载体不可用（未装 Electron 二进制，`dsh_browser_*` 全部拒绝）。§6 中依赖 GUI 的验收项（②'/' 命令面、④新会话选择器可见、⑤prometheus-spec 预设首步行为、⑥librarian 实派）转人工实测，步骤见收尾报告。未为此安装 Electron（避免本批引入大依赖，另立需要时再装）。
10. **bundle 以 pnpm link 形态安装**：`@local/dsh-prometheus-spec` link 到 `research\dsh-adaptation-drafts\bundle`——草稿目录现在是**承重目录**（改 patch 即改 profile），后续把 bundle 迁去正式位置（如随母版分发）时须重新 install_bundle。
11. **四棒实体化（用户决策 2026-10-18，蓝图之上的设计升级）**：用户追问「为什么没创建那几个子智能体」并确认需要 GUI 可见——三个执行棒从 A2 模板形态升级为 preset 实体（bundle v1.1.0：preset-gemini-fixer＝fs 全量+pwsh；preset-gemini-scout＝fs 只读+pwsh；preset-independent-review＝fs 只读、无 shell、无 web；tool-subagent 白名单扩成四元；A2 三文件转正为 persona 真源，A3/A4 派发口径同步换 agent_preset 形态）。可见性落点＝新会话预设选择器 + prometheus-spec 会话 subagent 的 agent_preset 枚举。模型钉死仍不可能（preset 无 model 字段），provider/model 维持调用层传。流程坑：link 包版本变更须 **remove_bundle → install_bundle**（直接 install 报 already-installed）。
12. **主/子智能体层级标注（用户决策 2026-10-18，v1.2.0）**：五个预设平铺在选择器会误导（子代理角色与主智能体同级出现）——DSH 预设声明无「隐藏出选择器」字段，落法＝显示名与描述带层级标注：`Prometheus-Spec（主智能体）`（会话级，对应 openchamber 的 plan/build 层）；`Librarian（子代理）`、`Gemini-Fixer（子代理）`、`Gemini-Scout（子代理）`、`Independent-Review（子代理）`，子代理描述首句写明「经 subagent(agent_preset=…) 派发，不作会话主智能体」。预设 id 不变（白名单/A3/A4 引用稳定）。
13. **`__GEMINI_ROUTE__` 回填定案（2026-10-18）**：铁律3 原文「不编造路由名」——最终也没编：键名从用户自己的 `~/.dsh/profiles/desktop/cordis.yml` llm-pi-ai providers 字典提取（**`vps-direct`**，displayName「VPS Direct」，模型 `gemini-3.8-flash`，推理档 low/medium/high；提取过程密钥类字段全部打码、未显示任何值）。已替换处：node-run 派发行+回填注记+停止条件、A2 fixer/scout 注释。复审异构路由定为 `zai-coding-cn/glm-5.3-flash`（与 gemini 实现棒不同家族；重活可换 glm-5.3）。**剩余用户动作**：设置→内置插件→官方分组→「子智能体」卡片→「模型选择」开「允许 Agent 为子智能体选择模型」+ 白名单加 `vps-direct/gemini-3.8-flash`（该卡片由 dsh-client-ui-settings-subagent 渲染，客户端标签已核实存在；仅影响新会话）。若卡片真不渲染，备选＝在 patch 层直写 `subagent-model-selection-settings` 行 config（enabled + allowedModels）。另：本机已装 python `zstandard` 包（解 session 日志用），DSH 会话日志在 `~/.dsh/sessions/<workspace-dir>/<id>/session.v4.jsonl.zstd`。
14. **子智能体设置卡片在 Desktop 构建不渲染（2026-10-18，v1.3.0 兜底）**：用户在 设置→内置插件 实测找不到「子智能体」设置卡——该页是**只读插件清单**（会话插件按预设查看 + 全局插件，点卡片仅展开文档）；`dsh-client-ui-settings-subagent` 的卡片要求 Host「服务命名空间」才渲染（configForms.whileServed），Desktop 壳未满足。**兜底已执行**：bundle v1.3.0 追加 override 行 `subagent-model-selection-settings`（`enabled: true` + `allowedModels: [vps-direct/gemini-3.8-flash]`），list_bundles 显示 overrides 生效；schemastery `volatile()` 语义已核实（稳定引用、字段缺省可 get，不阻碍 patch 供值）。效果等同 GUI 开关，仅影响新会话；GUI 卡片若将来渲染，读到的就是这个值。
15. **子会话可见宿主面工具（preset 只读保证的作用域边界，⑦ 试跑实测发现）**：审 scout 子会话（7c23d0ea）的 request/header 工具目录，发现子会话工具面＝**自身 preset 行 ∪ 宿主面已启用工具**——dsh-ops/dsh-chat-import/task-board/tool-management 等宿主级工具（含**写能力**的 `ops_replace`、`pwsh`（scout 自带）、`task_board_run`、`import_chat`）对子会话全部可见。含义：①「preset 物理只读」只约束 preset 自身工具行，不拦截宿主面泄漏；⑥ 的 librarian 实测零写操作成立，但"工具面里压根没有写工具"的说法过强（ops_replace 大概率在目录里，未使用而已）；②这直接加强二期 policy 插件的立项论据——**fs 事件级路径闸门才能挡住宿主面工具的写通道**。另：⑦ 试跑其他结论全过——同 step 双 subagent 并发（seq20/21，catalog 时间戳差 1ms）、调用参数带 model='gemini-3.8-flash'、子会话 request/header `config.provider=vps-direct`（真实路由铁证）、首支完成时模型明确"暂不合并"、双到齐后合并带行号。
16. **v1.3.1 白名单扩复审路由与收口修订（2026-10-18）**：⑧ 试跑前置——异构复审棒需走 `zai-coding-cn/glm-5.3-flash`，v1.3.0 白名单只有执行路由会被拒；v1.3.1 已按 #10 纪律 **remove_bundle→install_bundle 重装**（install 结果 version 1.3.1、application applied——复审棒「待验证」项据此闭案）。白名单终态＝执行/测绘 `vps-direct/gemini-3.8-flash` ＋ 复审 `zai-coding-cn/glm-5.3-flash`。收口复审（裁决=通过，零阻断）另提三条建议级滞后，均已修：①pi-tempo §10 的 TaskWait 类比补「DSH 无此工具」注记；②bundle 模板与 A4 的白名单注释由单元素改四元；③本条即 v1.3.1 的台账补记。**诚实更正**：#16 收口复审棒宣称走 gemini 异构路由，实际派发时漏传 provider/model、继承了主会话 glm-5.3（同族自审）——棒在报告尾注如实自报；真正的异构复审证据在 ⑧ 试跑（zai 审 gemini 执行棒）。遗留：索引锚点在 GitHub 渲染下的可点击性未验（低优先）。
17. **产品更名 DeepSeek NEXT 与手册 v1.2 判据去名化（2026-10-19）**：用户告知 DSH Desktop 已更名 **DeepSeek NEXT**（官方渠道六处核查均未见改名公告——GitHub 仓库/npm/exe 2.0.18/release notes 10-17/生态清单/官方文档站当日仍用旧名，改名信息以用户为准，来源待补）。**运气好在一处设计**：install-stack 的全部判据（P0 版本窗口/P2 目录/S3 工具/S5 路径/engines 闸）本就以**版本字段与路径**为准、不依赖产品名——改名零破坏。已修：手册 v1.2（头部加产品名注记＋双名写法）、pi-tempo SKILL 描述与标题去名化（DSH 桌面端（DSH Desktop/DeepSeek NEXT））。**未验证项**：更名后的新版本线（版本号是否延续 0.2.x 未知）——engines 闸 `>=0.2.1-rc.2 <0.2.2` 会照常拒装未验证版本，属预期保护；装新版本设备前须先在本仓验证并放宽窗口。另：本会话 web_search 无 API key（DeepSeek 搜索渠道缺 key），网调只能 web_fetch 定点——待用户配置。
