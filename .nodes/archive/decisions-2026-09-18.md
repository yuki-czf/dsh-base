# Archived Decisions (2026-09-18)

> Trimmed from DECISIONS.md (kept latest 20 entries).

## [2026-08-22] v1.2.0 可分发形态：zip 便携包 + 占位符自愈（不建仓库）

- **背景**：用户要在别的电脑用、也想方便给别人；dsh-base 根本不是 git 仓库（"clone 后重跑"是未落地假设），且母版 3 处硬编码 E:\www 路径、文档依赖 pwsh——直接拷目录到新机后引导链路会断。
- **决定**：① 分发走 zip 便携包（不建 git 仓库、仅 Windows）：新增 pack.ps1，从 SKILL.md frontmatter 读版本命名，产出 dist\node-architect-v<版本>.zip + .sha256，staging 打包剔除杂物；② bootstrap/SKILL.md 硬编码路径改 {{MASTER}} 占位符，-Bootstrap 复制后运行时重写为实际母版路径（换机重跑即自愈），兜底说明文字避开字面占位符防全文替换误伤；③ 母版 AGENTS.md 改相对指代（"本目录 = 你读到本文件的目录"），README 话术改 <解压位置> 占位；④ 文档全面 powershell -ExecutionPolicy Bypass 化（兼容无 PS7 机器）；⑤ 版本 1.1.0→1.2.0。zip 内含并行开发的 bridge 组件（可选装，-Bridge 才生效）。
- **理由**：目录自包含 + 相对指代 = 拷哪都能用；占位符重写把"换机断链"降级为"重跑一条命令"；zip+sha256 是零基础设施的分发最小形态，日后要 git 仓库/一键远程安装可平滑升级。
- **影响**：模拟新机全链路实测通过（解压→sha256→安装 v1.2.0 全套→伪造 USERPROFILE 验证 Bootstrap 指向解压位置）；母版 E:\www 残留清零（含顺手中性化 bridge 注释示例，未动其逻辑）；本项目已同步 v1.2.0；发现 PROGRESS 与并行会话节点号撞车（L2 桥接占 3），本节点改 4 号——后续登记节点前必先读表。

## [2026-08-21] L2 压缩前桥接：共享核心 + 每客户端薄适配器，注入式主线

- **背景**：用户要求多客户端（DSH/opencode/zcode/codex/Claude Code）都获得压缩前存档能力。五端实证碎片化——opencode 有 `experimental.session.compacting`（压缩前，可整体替换压缩 prompt）+ `experimental.compaction.autocontinue`（压缩后合成消息前注入），本机 SDK 验证；zcode 执行 Claude 兼容 hooks.json（superpowers 插件实证，SessionStart matcher 含 compact）；Claude Code 官方 PreCompact；codex 仅 notify 事件、压缩事件未证实；DSH `SessionStartSource` 预留 'compact' 无发出方（TODO(compaction)）。另：机械钩子无法自行提炼"未落盘进展"——它只存在于即将压缩的对话里。
- **决定**：载荷与触发分离。母版新增 `bridge/compact-context.ps1` 单一真源产出注入文本（.nodes 快照 + "摘要必须保留未落盘进展/决策/下一步"硬指令 + "压缩后第一动作=读档补存档"），每客户端一个薄适配器接线；第一期主线 = 注入式桥接 + SESSIONS 墓碑标记（钩子写"压缩发生于 T，恢复后立即补存档"标记）；"钩子内 LLM 预生成增量存档"（真·压缩前语义落盘）留二期单端实验。
- **理由**：措辞升级只改核心一处、五端同时生效；新客户端只加 <60 行适配器；注入式让摘要无损携带增量、压缩后第一动作补写完整存档——损失窗口近似归零且确定性高，避免预生成路线的额外 LLM 调用延迟与失败模式。
- **影响**：install.ps1 增加 `-Bridge` 可选装桥接件；zcode/Claude Code 若实测 PreCompact 不可注入上下文，退路为 SessionStart(matcher=compact) 压缩后兜底（效果等价 autocontinue）；codex/DSH 无挂载点期间维持 L0+L1 并在归档记录待接入条件。

## [2026-08-21] "压缩前完整语义存档"降级为可选实验；断链风险用墓碑校验兜底

- **背景**：注入式桥接落地后复盘残余风险——唯一未封死的是"压缩后、catch-up 存档前会话恰好终止"。预生成方案（钩子内 LLM 提炼增量并落盘）每次压缩多一次 LLM 调用（延迟+失败模式+复杂度翻倍）。另澄清关键事实：客户端持久化完整对话，压缩不销毁数据、只降级工作上下文，故"压缩前没存档=数据丢失"不成立。
- **决定**：① 预生成存档不进主线，降级为二期可选实验，升级触发条件 = 实测发现摘要不忠实或 catch-up 经常缺失（依据 _compactions.log 累积数据）；② 新增零成本兜底 `save.ps1 check-tombstone`：最新墓碑之后 .nodes 无任何内容文件写入即告警"上次压缩后可能未补存档"；verify 联动输出 [WARN] 行（不影响退出码）。
- **理由**：主要风险（上下文降级）已被注入硬指令覆盖；小概率断链用 mtime 启发式显式化即可，不值得为它付每压缩一次的 LLM 成本；把静默损失变成开工可见的告警，闭环即完整。
- **影响**：save.ps1 新增 check-tombstone 动作（退出码 3=有告警）与 verify 信息级行；四场景实测通过（无日志/新墓碑告警/verify 联动/补档后恢复 OK）；bridge README 同步说明。


## [2026-08-22] mcp-ssh-runner：凭据经 --config-file 注入，弃 argv/env

- **背景**：跨客户端 SSH MCP 需要凭据隔离；初版方案密码拼 argv，实测本机旧 npx 进程正在明文泄露密码（Win32_Process 可读）。
- **决定**：runner 从 `.secrets/ssh-servers.json` 读凭据、合并 `policy.json` 策略，写临时 resolved 文件，以 `--config-file` 传给 @fangjunjie/ssh-mcp-server@1.9.0（精确锁版，vendor 进项目，弃 npx/shell）。
- **理由**：读源码确认密码无 env 通道，config-file 是唯一避开 argv 的路径；策略与凭据分文件使策略可进 git 审计。临时文件放 `.secrets/` 内（继承其 gitignore/权限），退出即删 + 孤儿 1h TTL。
- **影响**：mcps/ssh-runner/、install.ps1 四端配置生成、research/ssh-mcp-cross-client-proposal.md；节点 #2（skill 纪律层）、#3（连接池）后续。

## [2026-08-22] 统一源采用项目级安装（.agents/mcps/），非中央安装

- **背景**：用户场景为单项目多客户端同时打开，曾考虑中央安装（~/.dsh/mcps 一份多项目引用）。
- **决定**：installer 拷贝 runner 到 `<project>/.agents/mcps/ssh-runner/` 并在该目录 npm install；客户端配置全部显式带 `--project <绝对路径>`。
- **理由**：项目自包含、可随 git 分发；显式 --project 根治 Claude Desktop cwd 错位（P0-2），配置行为确定不依赖 cwd。代价是升级需逐项目重跑 installer。
- **影响**：install.ps1 安装模型、.gitignore 增加 `.agents/mcps/*/node_modules/`。

## [2026-08-22] v0.2：凭据平文件化（一字段一文件），弃 ssh-servers.json

- **背景**：用户评审指出 v0.1 的 ssh-servers.json 一次 read 即把 host+user+password 全套带进 AI 上下文，与凭据隔离目标矛盾；JSON 文件名还天然诱导 AI 打开排障。
- **决定**：凭据改 `.secrets/ssh_host|ssh_port|ssh_user|ssh_password|ssh_key_path` 平文件；同时砍除多服务器支持（用户实际单服务器，将来按 `servers/<name>/` 目录约定扩展）。resolved 临时文件改为 stderr 扫描 "connection established" 即删（10s 兜底 + 退出即删 + 孤儿 TTL）。
- **理由**：单文件误读暴露面切到单字段；上游源码确认 config 同步解析后纯内存驻留、Logger 全走 stderr，早删安全（实测 215ms 出现 → 1047ms 删除 → 之后 SSH 执行仍正常）。
- **影响**：runner loadConfig/installer 模板/README/research 文档；opencode.json 附 permission deny（read/grep/bash 挡 .secrets）；installer 加 icacls ACL 收紧（移除继承，仅当前用户 (OI)(CI)F）。

## [2026-08-22] 防护分层明确：OpenCode 客户端拦截 + 跨客户端通用层

- **背景**：AI 读 .secrets 的威胁需要分层防御；各客户端拦截能力不对齐。
- **决定**：四层——①平文件切小暴露面（通用）②OS 层 gitignore + ACL（通用）③OpenCode permission deny 规则（仅 OpenCode，schema 已核实支持 last-match-wins）④skill 纪律层（节点 #2，覆盖所有客户端的 AI 行为教育）。
- **理由**：Cursor/Zed/Claude 无内建等价拦截，不能假装有；通用层兜底 + 客户端层增强是诚实的边界。
- **影响**：install.ps1 opencode 分支；节点 #2 范围定义。

## [2026-08-22] 云端分发：remote-install.ps1 泛化为多模块路由器

- **背景**：ssh-runner 需要像 node-architect 一样从 GitHub 云端安装到任意新项目。
- **决定**：不另起安装器，把 remote-install.ps1 泛化：`-Module` 参数（ValidateSet 路由）+ `$moduleMap` 模块→安装器路径登记表 + `-ZipPath` 离线包参数；默认 `node-architect` 保持旧行为，`irm | iex` 一行式不变；ssh-runner 带参一行式用 `& ([scriptblock]::Create((irm url))) -Module ssh-runner`。
- **理由**：云端层只负责"送母版到目标机器"，落装逻辑各模块 install.ps1 自持（已验证幂等）；新增模块只需 moduleMap 加一行。ZipPath 同时解决内网分发与无法推送时的本地端到端测试。
- **影响**：remote-install.ps1（注意保持 UTF-8 BOM）；dsh-base README、mcps/ssh-runner README 安装说明；真实云端可用性依赖 git 推送（mcps/ 等尚未提交）。

## [2026-08-22] 入口脚本编码铁律：remote-install.ps1 必须纯 ASCII 无 BOM

- **背景**：节点 #4 提交时给 remote-install.ps1 加了 UTF-8 BOM（沿用 install.ps1 的本地 -File 安全经验），推送后真实冒烟失败：`irm | iex` 与 `[scriptblock]::Create` 都因字符串开头的 \uFEFF（65279）字符解析报错。
- **决定**：入口脚本（会被当作字符串经网络管道消费的脚本）必须**纯 ASCII 且无 BOM**；中文+BFOM 仅限只作为文件执行的内层 installer（install.ps1 等）。文件头注释已写明此约束防止回归。
- **理由**：三条通道的编码要求互斥——本地 PS 5.1 -File 读无 BOM 中文文件按 ANSI 误解析（要 BOM），而 irm 返回的字符串会保留 BOM 字符且 PowerShell 解析器不吃它（要无 BOM）。纯 ASCII 是唯一同时安全的组合。
- **影响**：remote-install.ps1（fix commit 1f48925）；排障知识：raw.githubusercontent.com 的 fastly CDN 缓存约 5 分钟，改完立即测会用旧版，可用 GitHub contents API（base64 解码）即时验证 blob 真相。

## [2026-08-27] 分批执行器定位：opencode 会话级主 agent，而非子 agent

- **背景**：公司自部署 vLLM（131K 窗口、prefill 慢）作为补充模型，复杂任务上下文频繁压缩。已立 `.nodes/plans/README.md` 分批约定（一批=一个新会话，阈值 30K 起步）。用户提出为小模型做专用子 agent 串行执行。
- **决定**：做成全局会话级主 agent `~/.config/opencode/agents/batch-executor.md`（mode: all、model 钉死 company-vllm/Qwen3.8-27B-W4A16-AWQ、temperature 0.1、tools.task=false 物理禁并行），正文固化八条纪律：读档定位当前批（指定批号优先，否则自动取第一个未完成批）→ 只读本批材料 → 超 30K 超限即断 → 设计分叉暂停上报不自行设计 → 批末五步存档（SESSIONS 用 `<节点>-b<N>` 标识）→ verify 全 [OK] → 输出一行总结立即停止禁止跨批 → verify 失败不得跳过收工。
- **理由**：子 agent 被 spawn 在膨胀中的主会话上下文里跑，给不了"每批全新空上下文"，且天然可并行违反串行纪律；新会话选主 agent 才同时满足空上下文+模型钉死+禁并行。
- **影响**：项目 plans/README.md 已回灌该加速通道（立节点拆批仍用大模型 build 会话，内置 plan agent 只读不能落盘）；agent 的 model 字段硬编码 vLLM 模型 ID，换模型需同步修改；该 agent 文件属本机实验件，v1.3.0 固化时迁入母版 `node-architect/bridge/opencode/` 作为可选安装件。
