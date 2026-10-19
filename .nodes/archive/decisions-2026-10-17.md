# Archived Decisions (2026-10-17)

> Trimmed from DECISIONS.md (kept latest 20 entries).

## [2026-10-08] PI-Desktop 插件调查与落地：pi-subagents 判死 / pi-web-access 经官方导入通道安装成功

- **背景**：用户想给 PI-Desktop 装 pi-subagents。调查确认：PI-Desktop 内核即 pi coding agent 衍生（resources/agent-runtime 打包 @earendil-works/pi-coding-agent），但扩展体系自建——会话 trustedExtensions 只来自插件系统（plugins.getAgentExtensions()，manifest 声明 contributes.agentExtensions），**不消费 pi CLI 的 ~/.pi/agent/settings.json packages 通道**（本机已装的 pi-web-access/pi-mcp-adapter 是给 pi CLI 的，PI-Desktop 不读）。
- **决定**：① pi-subagents 判死不装——其核心依赖 pi-coding-agent 会话 SDK 在 PI-Desktop 扩展沙箱（runner-P4RTFJWM.js）里是 stub（访问即记 unsupported_api 并返回空对象），子会话委派必落空；② pi-web-access 可装（pi-coding-agent 仅 2 处引用且均带 fallback，工具注册/事件钩子全在支持子集内），pi-lens 观望（9 处 setWidget 实时面板在沙箱全 inert，主打卖点砍半）；③ 走官方「导入 pi 扩展」通道落地，产物 ~/.pi-desktop/plugins/imported/pi-web-access，id=imported.pi-web-access，source=dev。
- **踩坑记录**（同款导入必读）：① 导入器对 pi.extensions 为目录（"./dist"）的包生成目录条目 "src/dist"，而加载校验只认 .ts/.js 文件 → PLUGIN_INVALID 自产自拒且报错一闪而过（静默失败根因）；手工把 manifest 条目改成 src/dist/index.js 后「加载本地插件」即通过。② 导入被打断会留残缺 node_modules（.package-lock.json 在但包不全）；在插件目录补跑 `npm install --ignore-scripts` 即修复。③ PS5.1 `Set-Content -Encoding UTF8` 写 JSON 带 BOM 会炸解析（"is not valid JSON"），必须 UTF8 无 BOM。④ 「加载本地插件」的文件对话框无父窗口，Windows 上易弹到主窗后面（Alt+Tab 找）。
- **影响/验证**：registry ready+enabled+global，plugin.load.success（10-08 17:10）；新会话工具清单出现 web_search/web_enable/fetch_content/source_check；实测 web_search 走 exa 返回真实结果（会话 e04a835e/fc4f3342）。已知降级：扩展状态 widget 不显示、抓图缩放失效（有兜底）、web_enable 按需激活退化为全量激活。另观察：file-manager 0.5.2→0.6.1 自动更新因镜像网络失败后短暂 load.error（宿主日志多次 curl 重置/404），待其网络恢复自愈。

## [2026-10-09] v1.9.0 /plan-node 斜杠命令：并入存档 skill 强绑定（方案 A/B 比较后取 A）

- **背景**：用户每次需手动输入「你使用存档skill，扫描空闲节点，并将计划存档为一个计划节点」且要 LLM 保证不与既有节点冲突；要求压成 /xxx 斜杠命令，并与存档 skill 强绑定、云端作为一个整体同步。比较「并入存档 skill（A）」vs「另立独立 skill 包（B）」。
- **决定**：并入存档 skill（A）。理由：/plan-node 的全部价值 = next-node 的门面，无独立交付价值，不满足拆分前提（独立价值+独立节奏）；强绑定与云端整体同步在 A 下是结构性保证——一个仓库/一个 dist zip/一个版本号，remote-install 拉整仓 zip 跑 install.ps1，命令自动随 skill 落地，不存在只装其一或版本错配；B 会重新制造第二真源（v1.4.0 三处漂移教训）。落地：模板 `skill/commands/plan-node.md`（不设独立版本号，随 SKILL frontmatter 同源）→ install 复制到 opencode `.opencode\command\` 与 claude `.claude\commands\`（Copy-Item 规避 install.ps1 内 CJK 字面量）；DSH/PI-Desktop 等无斜杠端用触发语「登记计划节点」（SKILL description 已加）；冲突语义完全复用 next-node v1.8.0（同名 exit 1 拒 / 锁忙 exit 1 重试 / 存量撞号附注 / plans 差异→追加不覆盖），零改 save.ps1。
- **踩坑**：① PS 5.1 `powershell -File x.ps1 -Clients a,b` 会把数组参数折叠为单字符串 "a,b"（install.ps1 自身 .EXAMPLE 示例即踩坑写法）——param 后加逗号归一化修复；② save.ps1 的 -Project 默认 Get-Location：跨项目冒烟未显式 -Project 时把垃圾行写进了工作区 PROGRESS（实测中招一次，已清除；agent 会话内 cwd=项目根无此险，但测试/脚本调用必须显式 -Project）。
- **影响**：dist v1.9.0 zip（64.1 KB，sha256 2A98A2A8…）含 skill/commands/plan-node.md；根 dist 换版 v1.6.0→v1.9.0 + 根 README 引用同步；镜像 diff=0；版本三处一致 1.9.0；沙箱 next-node 三态（正常 #2 / 重名 exit 1 / 撞号附注 #1 x2）实测通过。

## [2026-10-09] 节点18 PI-Desktop 斜杠命令通道查实：原生 composer 模板存在（.pi/prompts/），v1.10.0 三端同构

- **背景**：用户要求 /plan-node 在 PI-Desktop 原生可用（选项C），并质疑"任何 AI 工具都支持 skill，PI-Desktop 不可能不支持"。需查实：skill 与斜杠命令是两套机制——PI-Desktop 支持 skill（node-architect 本会话已激活），缺的是"项目级斜杠命令注册"通道。
- **调查证据**（app.asar 反编译级字符串证据，非猜测）：① 消息发送路径：`req.content.startsWith("/")` → `loadComposerTemplatesCached(root)` → `expandSlashInvocation` 把模板展开为 promptContent 发给模型，失败则按字面文本发送；② 目录：`composerTemplateDirs = { project: <workspace>/.pi/prompts, user: ~/.pi/agent/prompts }`；③ 格式：`.md` 文件，文件名=命令名（剥 .md），frontmatter 含 description/argument-hint；④ 占位符正则 `PLACEHOLDER_RE` 支持 $ARGUMENTS/$@/$1/${ARGUMENTS:-def}（Claude Code 兼容超集）；⑤ 模板缓存 5s TTL，按 workspace root 键控。另有插件命令通道（pi.gitlens 的 contributes.commands + pi.commands.register）走命令面板，属 UI 菜单非聊天框，不是本需求路径。
- **决定**：无需做插件——install.ps1 新增 3.2 节，无条件把真源 commands\plan-node.md 复制到 `<项目>\.pi\prompts\plan-node.md`（无可靠环境指纹可探测 PI-Desktop，且文件是随仓库走的小资产，无害）；模板 frontmatter 加 argument-hint（opencode/claude/PI-Desktop 三端通用）；版本 bump v1.10.0；.gitignore 加 `/.pi/*` + `!/.pi/prompts/`（本地 .pi/plan 等状态静音，命令模板随 git 云端同步）。
- **影响**：/plan-node 现在**三端原生**：opencode（.opencode/command/）、claude（.claude/commands/）、PI-Desktop（.pi/prompts/，聊天框原生展开）；DSH 仍用触发语。dist v1.10.0 zip（64.7 KB）含命令模板；镜像 diff=0；版本三处 1.10.0。待用户在 PI-Desktop 聊天框实测 `/plan-node <名>`（模板缓存 5s，新文件即装即用；新会话必生效）。
## [2026-10-09] 节点 19 v1.10.1：事故速查与派活纪律并入母版（个案不进母版）

- **背景**：brand-console-rail 项目 Gemini 3.8 flash 会话卡死（pseudo-tool-call：模型把 Read 调用写成正文 → agent 循环按「无 tool_calls=完成」提前收工，任务停在 0/3）；渠道侧 7 发探针 + Keeper 时间线定责=模型侧偶发失误，渠道无罪。用户要求把防复发能力沉淀进存档 skill。
- **决定**：母版只收**通用指纹**，个案细节（Gemini 3.8 flash / qq 车道 / 7 发探针）归事故项目自己的 DECISIONS——① QUICKREF 新增「事故速查」节（指纹/定责/处置/断点恢复四要素：同会话说「继续」即续上、复发换思考档、不原样重发）；② PROTOCOL 执行效率协议第 6 条「模型派活纪律」（长 agent 循环重活派强模型、flash 档只接单步/机械批、一次委派=一个可验收单元）；③ SKILL-FULL 补指针行；④ 版本 bump v1.10.1——节点 18 被 PI-Desktop 斜杠命令节点（同窗口并行交付）占用，本节点顺延 19、版本叠 patch 位（v1.4.1 先例）。
- **踩坑**：编辑工具 body 行「+ 空格+内容」写法会给每行留一个前导空格（须用「+内容」无空格语法）——首版四个文件全部中招；SKILL.md version 行带空格导致 install 解析为 v?、`.nodes/PROTOCOL.md` 被刷成 `__VER__` 未注入版本；修复后重跑 install 自愈并自动刷新 AGENTS 指针。
- **影响**：镜像 diff=0；版本三处 1.10.1；dist v1.10.1 zip（65.4 KB）+sha256，根 dist 换版 v1.10.0→v1.10.1 + 根 README 三处引用同步；沙箱（scratch 解压 zip 独立安装）全过。事故项目侧的个案归档（追加㉟）由用户在该项目会话执行。

## [2026-10-12] 节点20 PI-Desktop 生成速度本地补丁：把 TTFT 从分母里剔除（用户选择本地改，不打上游 issue/评论）

- **背景**：用量弹窗「生成速度」= outputTokens / responseDurationMs，而 runtime 的 responseDurationMs 从 `message_start` 起算（provider 流一开就算，早于首个 token）→ 分母含 TTFT，速度被系统性低估。本机 78 个 DSH 会话实测：TTFT 占流窗口比例中位数 43.8%，PI/DSH 吞吐量比值中位数 1.78x、p75 9.85x、p90 58x。上游已在 #93 跟踪（#916 作重复关闭，#416/#418 相关）。用户决定：「直接改，不提任何 issue 或评论」。
- **决定**：只改本机已安装文件，工具包落在 `pi-desktop-speed-patch/`（自写 asar 读写器 + 幂等 `apply`/`revert` + 独立 `verify` + 退出后自动换入的 watcher）。① 运行时（`resources/agent-runtime/sidecar.js`）5 处锚点：`message_start` 重置 `firstTokenAt`、首个可见 token（text/thinking）时记 `responseFirstTokenMs`，并把它塞进 `usage.firstTokenMs`——宿主只白名单持久化 `{modelId,providerId,responseDurationMs,status,usage}`，`usage` 是唯一能跟着会话存下来、重载后仍在的载体；② 渲染器只改 `out/renderer/assets/use-transcript-view-*.js` 里的轮次聚合 `bs()`，从 Σ`responseDurationMs` 改为 Σ(`responseDurationMs` − TTFT)，旧消息（无新字段）回退原值。
- **理由**：**不动 `responseDurationMs` 的语义**，所以「模型响应耗时 / 会话总耗时」不受影响（已核实：弹窗该数字走 `vr()` 对原始逐条消息的 `responseDurationMs` 求和，与补丁改的 `bs()` 聚合是两条路）；不动计时口径也就不必改持久化 schema、不破坏历史会话数据。
- **验证**：`verify.mjs` 全 PASS（runtime 5 项 + staged `app.asar.new` 逐条目对比只 1 个 chunk 不同 + 补丁后 chunk 可作为 ESM 解析）；`asar-selftest.mjs` 往返 570 条目逐字节一致；注入片段已核实 `_t` 由同一 `let` 列表声明、`this` 指向同一实例（避免运行期 ReferenceError）。`app.asar` 被运行中的宿主占用（EPERM 换不掉），因此新归档先写成 `app.asar.new`，由 watcher（`finish-when-closed.ps1`）或 `finish-patch.cmd` 在应用退出后换入——**补丁生效需要重启一次 PI-Desktop**（运行时的改动也一并在重启后生效）。
- **影响/回滚**：`node patch.mjs revert` 一键还原（`.pi-speed.bak` 备份），升级 PI-Desktop 后 `node patch.mjs apply` 重打；锚点对不上时脚本直接报错且不写任何文件（应用保持原状）。

## [2026-10-12] 节点20 验收补记：换入成功；整包投递渠道测不出差异（firstTokenMs=0 实证），用户拍板保留现状

- **验收过程**：watcher 15:01 完成 `app.asar` 换入（90,897,150→90,897,280 字节）并自动重启；`patch.mjs status` 双 PATCHED；`verify.mjs` live 归档全 PASS。
- **实测意外**：用户用 `gemini-3.8-flash`（OpenAI 兼容中转 `api.mindnest.asia:8443/v1`，providerId 3c836f79…）发一句话测速，弹窗仍是 4 tokens/s。落盘会话（`.pi-desktop/sessions/e6d0532c-….jsonl`）显示助手消息 `usage.firstTokenMs=0`——**补丁后的运行时真实跑了**，但测得 TTFT=0ms：该中转整包投递，`message_start` 与首个可见 token 同毫秒到达，分界信息没过网络。渲染端忠实执行 5782−0，数字不变是正确行为。
- **结论**：本补丁只对**真流式**渠道（首 token 有真实等待）改变数字；整包/聚合投递渠道（DSH Antigravity、本中转）本地任何实现都无法拆出解码速度，4 tok/s=可见输出 23 ÷ 全程 5.78s 已是唯一诚实的平均速度。另：弹窗速度分子只数 `usage.outputTokens`（不含 `reasoningTokens`，本例 23 vs 217）——若计入约 41 tok/s，但 DeepSeek 系 `outputTokens` 多半已含推理，盲目相加会重复计数，故不动。
- **决定**：用户选择**保持现状**。补丁保留；`finish-patch.cmd` 留在 resources 作手动兜底（revert 时清理）。
- **方法论坑**：验收弹窗数字时必须先看落盘 `usage.firstTokenMs`——它直接区分「补丁没生效」和「渠道无可扣 TTFT」；会话 JSONL 的助手消息字段在 `meta` 键下（宿主白名单只存 modelId/providerId/responseDurationMs/status/usage，usage 整体透传，顶层自定义字段不落盘但 usage 内字段能落）。
