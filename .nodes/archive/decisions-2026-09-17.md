# Archived Decisions (2026-09-17)

> Trimmed from DECISIONS.md (kept latest 20 entries).

## [2026-08-21] 安装形态：纯项目级

- **背景**：用户多客户端（DSH/opencode/zcode）且明确不想敲斜杠指令、不想占系统盘。
- **决定**：只做项目级安装（`.dsh/skills/` + `.nodes/` + `AGENTS.md` 指针），不做全局用户级。
- **理由**：项目自包含 → 随 git 跨电脑/跨团队/跨客户端零成本；放弃的只是"本机新项目零安装"。
- **影响**：母版 `node-architect/` 保留在仓库根作为安装源，新项目从它安装。

## [2026-08-21] 协议真源放项目内，客户端入口只做薄指针

- **背景**：协议正文若只存在 DSH skill 里，其他客户端无法进入协议。
- **决定**：协议全文 stamp 进每个项目的 `.nodes/PROTOCOL.md`（客户端无关）；DSH 的 SKILL.md 和通用 AGENTS.md 都只是入口。
- **理由**：拿到任何客户端、任何机器，协议和数据都在项目里，谁都能接手。
- **影响**：协议升级时需同步更新母版 SKILL.md、references/PROTOCOL.md 及各项目副本。

## [2026-08-21] 约束机制：一期铁律句式 + 自然语言触发，二期再上自动钩子

- **背景**：用户不想敲指令；纯文本约束（L0）可靠性弱于宿主代码（L3）。
- **决定**：v1 用 SKILL.md 铁律 + 用户自然语言（"存档/这节点差不多了"）触发；L2 斜杠命令方案被否决；L3（preset 挂 agent/pre-step 自动存档）留二期。
- **理由**：先零成本见效，确定性增强按需追加；L3 需复制 standard preset 挂插件，工程量一期装不下。
- **影响**：二期开工时文档格式不变，只加执行者。

## [2026-08-21] 多会话并发安全文档规范

- **背景**：用户会开多个会话并行开发，同时压缩/存档可能互踩。
- **决定**：DECISIONS.md 只追加；PROGRESS.md 只改自己节点的行；SESSIONS/ 每会话一文件；写 CONTEXT.md 前加 `.lock`（10 分钟超时）写完即删；冲突重读合并。
- **理由**：以"追加+行级分区+快照锁"把文件级冲突概率压到接近零，无需引入数据库。
- **影响**：所有客户端的存档实现都必须遵守 `.nodes/PROTOCOL.md` 的并发协议一节。

## [2026-08-21] 入口重心校准：AGENTS.md 从薄指针升级为内联铁律

- **背景**：用户明确主力客户端是 opencode/zcode，DSH 只是偶尔用——`.dsh/skills/` 对日常几乎无意义，AGENTS.md 才是每天真正的入口。
- **决定**：init 脚本生成的 AGENTS.md 由两行指针升级为内联五条铁律（读档/节点先行/存档时机/压缩恢复/并发纪律）；协议全文仍在 `.nodes/PROTOCOL.md` 唯一真源。
- **理由**：opencode 原生读 AGENTS.md，铁律直接进上下文比"指针+自觉跳转"可靠；DSH skill 副本保留但降级为增强件。
- **影响**：已装项目需重跑 install 或手动同步 AGENTS.md；本项目已同步；临时目录端到端测试通过。

## [2026-08-21] 安装器支持多客户端原生入口（-Clients）

- **背景**：用户指出 `.dsh\skills\` 只有 DSH 认，opencode 的 skill/命令在 `.opencode\` 约定目录下，装错地方等于没有原生入口。
- **决定**：install.ps1 增加 `-Clients` 参数：`opencode` → 复制技能包到 `.opencode\skills\node-architect\` 并生成 `.opencode\command\node-architect.md` 斜杠命令；`claude` → `.claude\skills\`；未知客户端告警并退回 AGENTS.md 保底。
- **理由**：入口分两层——AGENTS.md 内联铁律是所有客户端的保底（opencode 原生读）；原生技能目录/命令只影响发现体验与手动触发。两层同装，互为冗余。
- **影响**：临时项目端到端验证通过（三客户端目录 + 命令文件 + .nodes + AGENTS.md 齐全）；本项目已装 opencode 入口；zcode 目录约定未知，待用户提供路径后加入安装器。

## [2026-08-21] 集中式布局：唯一真源 .agents\skills + 客户端联接镜像

- **背景**：用户多客户端并行开发同一项目（opencode/zcode/DSH），指出每家各一份 skill 副本分散在 `.opencode\`、`.zcode\`、`.dsh\` 目录，维护繁琐易漂移。
- **决定**：改为集中式——技能唯一真源放 `.agents\skills\node-architect\`（DSH 原生扫描该目录，rank 200，无需 `.dsh\skills` 副本）；opencode/zcode/claude 的技能目录用 NTFS junction 联接到真源；`.gitignore` 忽略联接镜像（生成物）；`-Copy` 开关保留拷贝模式兜底；clone 后重跑安装命令重建联接。
- **理由**：维护只改一处、全端即时同步（联接是文件系统层同一份）；`.agents\` 是跨工具中立区约定；真源随 git 走，镜像可再生。
- **影响**：临时项目端到端验证通过（联接创建/穿透读取/幂等重跑/真源完好）；本项目已迁移（.dsh\skills 已清，DSH 从 .agents\skills 实测加载成功）；zcode 的 `.zcode\skills` 子目录约定仍属假定，待实测确认。

## [2026-08-21] 客户端自识别：环境变量指纹探测，-Clients 可省略

- **背景**：用户提出"能否让大模型自己识别自己是什么客户端，自己选 .opencode 还是 .zcode"，免手动传参。
- **决定**：install.ps1 内置指纹探测——OPENCODE→opencode、CLAUDECODE/CLAUDE_CODE_ENTRYPOINT→claude、ZCODE→zcode（推测）、DSH_*→无需镜像；探测结果与显式 -Clients 取并集；探测不到时只装真源+AGENTS.md 保底并打印提示。
- **理由**：客户端会话里的 agent 跑安装脚本时，shell 继承客户端注入的环境变量，探测天然可靠（本会话工具 shell 已实测正确报出 DSH）；裸终端无指纹时保底层依然完整可用。
- **影响**：在 opencode/zcode 里说"帮我装节点协议"即可全自动装对目录；ZCODE 变量名与 .zcode\skills 目录均为推测，实测不符改指纹表一行。

## [2026-08-21] 自然语言安装：-Project 变为可选默认当前目录

- **背景**：用户希望提示词更贴近自然语言——"装节点协议"四个字搞定，而不是还要带项目路径。
- **决定**：install.ps1 不再要求 -Project，省略时默认当前目录；同步让脚本生成的 opencode 命令文件也不再让 agent 传 -Project。
- **理由**：在客户端会话里跑脚本时，agent 的 shell cwd 即项目根，省略 -Project 既符合直觉又零歧义；需要跨项目时才显式传。
- **影响**：临时项目无参调用实测通过（自动识别 opencode + 装真源 + 联接镜像 + 命令 + .nodes + AGENTS.md 全齐）；opencode/zcode agent 的话术从"运行 ... -Project <留空>" 简化为"运行 ..."；裸终端跑等价。

## [2026-08-21] 全局引导技能：解决"新项目 agent 不知道母版在哪"

- **背景**：用户指出新项目里的 agent 是失忆的，说"帮我装节点协议"它不知道母版在 E:\www\dsh-base\node-architect。
- **决定**：新增 2KB 引导技能 `node-architect-installer`（正文写死母版绝对路径），经 `-Bootstrap` 装入四家客户端的**全局技能目录**（~/.config/opencode/skills、~/.zcode/skills、~/.claude/skills、~/.dsh/skills——后三者路径已在本机实探确认，格式与 SKILL.md 同款）。
- **理由**：用各家原生技能发现机制做触发器，比改 AGENTS.md/配置文件更可靠；一次安装，所有新项目永久生效；探测不到指纹时默认四家全装（各 2KB）。
- **影响**：已实际装入本机四家全局目录（提权写入）；沙箱伪造 USERPROFILE 测试通过；zcode 的 ZCODE 指纹与项目级 .zcode\skills 目录仍待实测。

## [2026-08-21] 终极简化：母版目录自带 AGENTS.md，指哪装哪

- **背景**：用户实测新项目 agent 不认识"装节点协议"（全局技能发现不可靠），且拒绝代写全局配置；明确要求"我说帮我安装 xxx 目录下的 skill，你不需要做额外猜测"。
- **决定**：母版目录根放一份面向 agent 的 AGENTS.md——写明唯一动作（在目标项目根运行 install.ps1）与验收步骤；README 顶部同步最简话术。知识随目录走，不依赖任何全局配置/技能发现/指纹。
- **理由**：用户指路径时 agent 必然能读到该目录；目录自描述 = 零猜测、零预设、零维护。
- **影响**：标准话术定为「帮我安装 E:\www\dsh-base\node-architect 目录下的 skill」；全局引导技能与指纹探测保留为可选增强，不再是必要环节。

## [2026-08-21] v1.1.0 P0：存档机械动作脚本化 + 真源覆盖备份 + 版本号单一真源

- **背景**：skill 评审发现三大风险——五步存档全靠模型自觉（易漏步、锁纪律靠意识）、重跑 install 会 Remove+Copy 静默覆盖真源本地改动、协议规则在 SKILL/PROTOCOL/AGENTS 三处重复且已现版本漂移。
- **决定**：① 新增 `save.ps1`（lock/unlock/verify：锁持有者校验、10 分钟超时、五步存档清单校验、归档骨架自动生成，退出码供 agent 自纠）；② install.ps1 覆盖真源前按 SHA256 递归比对，有本地差异先备份到 `.agents\backup\node-architect\<时间戳>\` 并列出差异文件；③ 版本号单一真源 = SKILL.md frontmatter `version:`，init-nodes.ps1 运行时解析注入 AGENTS.md 指针（`__VER__` 占位符），PROTOCOL.md 头部声明自身为规则唯一真源；顺手把 AGENTS.md 追加判重标记从 `\.nodes` 改为 `node-architect`（防正文恰好含 .nodes 字样误跳过）。
- **理由**：确定性流程交给脚本比交给模型提示词可靠；覆盖前备份把"维护口径矛盾"从数据丢失风险降级为可恢复提示；版本运行时注入消除多处硬编码漂移。
- **影响**：SKILL.md 存档流程/并发规则改为调用 save.ps1；沙盒全周期实测通过（锁状态机 6 场景、verify 三态、备份两态）；本项目已同步 v1.1.0（旧真源备份于 .agents\backup\）；已装项目重跑 install 即升级。
