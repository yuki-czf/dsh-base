# 决策日志 DECISIONS

> 只追加，永不改写历史条目。多会话并发追加是安全的。最新的在最下面。

> Older entries archived: archive/decisions-*.md

> Older entries archived: archive/decisions-*.md

## [2026-08-27] 批次计划表列数口径：按枚举六列起草，"七列"视作沿袭口径

- **背景**：v1.3.0 批1 起草发现，上游文档（PROGRESS 验收标准 / plans/README 模板 / v1.3.0 批次计划）均称"七列表"，但逐处枚举与实际计划表均为六列：批 / 名称 / 范围（文件/函数）/ 验收标准 / 预估材料K / 前置批。
- **决定**：PROTOCOL「批次协议」节与 templates/BATCH-PLAN.md 按实际枚举六列落稿；正文保留"七列表"原文口径不改，批3 定稿微调时一并复核（改口径为六列，或补第 7 列定义）。
- **理由**：模板须与真实在用的计划表实例一致才可执行；擅自补列属越界设计，违反批1 边界。
- **影响**：验收自检第③项按"每个字段位置有填写说明"解释通过；批3 复核若定"七列"需给出第 7 列定义（候选：状态 / 会话标识）。

## [2026-08-27] 链式分批：批末自动派生下一批会话（OpenChamber 链），断链等人

- **背景**：用户提出"执行完一批后主动开新会话执行下一批，直到任务结束"。关键约束：派生必须是工具调用创建的全新会话（零上下文），不能是本会话续跑，否则分批防压缩的不变量被破坏。
- **决定**：batch-executor 纪律 7 升级为「批末判断与链式派生」、新增纪律 9「防失控」——verify 全 [OK] 且 PROGRESS 为 `进行中·批N/M`（N<M）且无未决问题时，调 openchamber `session.create`（prompt=「读档，执行下一批」、agent=batch-executor、model 钉死公司 vLLM、title=`<节点>-b<N+1>`、不等待）派生后继后本会话即停；待验收/全部完成/verify 修不好/设计分叉 → 不派生断链等人；无 openchamber 的环境不派生并输出手动恢复话术。单会话最多派生一次；派生必须在 verify 全过之后（先存档后派生）；派生报错不重试。
- **理由**：每批会话上下文从近零启动的属性靠"新会话"而非"长会话"保证；先存档后派生使链条任意点崩溃都停在干净存档边界，恢复零损失；PROGRESS 状态作唯一闸门 + 单派生上限，杜绝指数分叉；链终点（待验收）归人，总验收不自动化。
- **影响**：plans/README.md 回灌链式模式说明；失败策略定为立即断链（不重试，避免重复烧慢模型）；批2 起实测闭环；纯 TUI 环境降级为手动链（原一句话话术）。

## [2026-08-28] 插件注入终局：wrapper 取消 + 询问制 + agent 迁母版并入 v1.3.1

- **背景**：节点 5 五批实战复盘——spec-superflow 全局插件注入已被 batch-executor「纪律0 指令豁免」实测压制（v130-b2 重试至 b5 四代零格式复发）；用户提出以"规划时询问范式"取代技术拦截；batch-executor 迁母版原拟留 v1.3.2。
- **决定**：①**不做** spec-superflow-guard 包装器，全局插件原样保留零改动；②采纳**询问制**——立节点拆批前规划会话先问「本任务走 spec-superflow 还是分批约定，二选一不混用」，一句话落 plans/README 与母版协议口径（并入 v1.3.1 批3）；③batch-executor 迁母版（bridge/opencode/agents/ + {{BATCH_MODEL}} 占位 + install `-BatchAgent`）并入 **v1.3.1 批4**，不单开节点 7、不再有 v1.3.2。
- **理由**：注入残余风险已被纪律压制且有四代实证，wrapper 的省 token 收益（每会话 2-4K，占阈值不足一成）抵不过维护成本；询问制零代码消除范式混用；合并后单版本交付，且批3 终稿→批4 模板化天然避免 agent 文件双写。
- **影响**：v1.3.1 批次 3→4，批4 执行材料已落计划文件；全局插件零改动；本机全局 agent 在批3 终稿后降级为"生成物"（母版为真源，改后手动同步）；enable_thinking 兜底维持观察期；若未来批次会话再现注入致乱，wrapper 设计已存档可随时启用。

## [2026-08-28] DSH 适配立项：preset 机制承接 batch-executor，链式派生分两档

- **背景**：用户问 batch-executor 与链式自动派生能否拓展到 DSH。本机实证——`~/.dsh/` 有 `.agent-presets` 机制（cordis 组合格式，reddit-pg 样例 267 行：persona 支持 {{model}}/{{cwd}} 模板、服务可 disabled 含 !!js 条件、delegation 组即子代理派发、compaction 组可整体挂载）；**模型路由属 host 平面，preset 不可钉模型**（文件注释明示），settings.yaml 已配公司 vLLM provider（Qwen3.8-27B-W4A16-AWQ，contextWindow 200K）；本机无 dsh CLI，只有桌面应用 + 本地 web 服务（DSH_WEB_URL）+ 自定义插件目录（dsh-mcp-ls 样例）。
- **决定**：①batch-executor 以 DSH preset 承接：persona 嵌九条纪律 + {{model}} 校验（非公司 vLLM 即停，补偿不可钉模型）、delegation 组整体排除、compaction 组保留作 131K 后备；②链式派生 DSH 侧先维持**手动链**（无 CLI、插件 API 未探明），二期探明 DSH 插件 API 后再评估"派生工具"插件；③立项节点 7（v1.3.2）两批：批1 preset 研发+实测（DSH 侧实测需用户配合开 preset 会话），批2 母版收编 bridge/dsh/ + install 探测 ~/.dsh + pack。
- **理由**：preset 机制与 opencode markdown agent 能力对等（唯模型钉定缺失，用 persona 校验缓解）；手动链 README 已支持零成本；插件 API 反推成本高，不阻塞主线。
- **影响**：新增本机 `~/.dsh/.agent-presets/batch-executor/` 与母版 `bridge/dsh/`（分发）；install -BatchAgent 语义扩展为双客户端（opencode→项目 agent，DSH→全局 preset）；DSH 跑批时模型需用户在会话创建时手动选公司 vLLM。

## [2026-08-28] DSH 自动派生探路立项：节点 8 待开始，先存档排期后执行

- **背景**：用户确认希望 DSH 侧也自动派生（批末自动开下一批会话）。障碍实证：DSH 执行会话无"创建会话"工具、本机无 dsh CLI；有利线索：桌面版本地 web 服务（127.0.0.1:43120）+ app.asar 可读 + 自定义插件机制存在。
- **决定**：立项**节点 8「DSH 自动派生探路」**（状态=待开始，执行排期由用户发起）：批1 只读反推 web API 产出契约笔记（能/不能程序化创建会话都算完成）；批2 分支 A（可用）实现派生+实测+版本 bump / 分支 B（不可用）归档结论维持手动档并关节点。计划落 `.nodes/plans/DSH自动派生探路.md`。
- **理由**：探路节点的验收=拿到确定性答案而非承诺做成；POST 实测会真实创建会话，设用户知情前置；与节点 7（待验收）解耦，不阻塞其归档。
- **影响**：PROGRESS 新增节点 8（待开始）；执行时优先 pwsh 直调形态（零安装面）；边界=只读 app.asar、POST 实测前用户知情、不动节点 6/7 既有交付物。

## [2026-08-28] 模型校验防线实测：软纪律对非目标模型失效，闸门改置选择时刻

- **背景**：节点 7 批 1 DSH 实测③——用 nemotron-3-ultra-free 开 preset 会话。会话记录实证：persona 全文与 {{model}} 解析（nemotron-3-ultra-free）均正确进入上下文，但模型无视模型校验纪律直接寒暄；同 preset 下 Qwen3.8（实测②）则严格遵守并通过读档复述。
- **决定**：①preset.yml name 前置模型警示「〔必须选公司vLLM-Qwen3.8〕」、description 如实改为「preset 不约束模型，选错将无分批纪律保护」——把闸门放在选择时刻（唯一可靠点位）；②persona 模型校验移至首句、绝对化措辞（对目标模型加固，对异模型尽力而为）；③验收标准③改为上述双防线口径，不再承诺"选错拒开工"。
- **理由**：复现本项目 v1.1.0 教训——确定性流程不能依赖模型服从提示词；preset 机制无法钉模型（host 平面）是 DSH 侧的结构性限制，只能用"选择时点人工确保 + 软纪律加固"双防线；对目标模型 Qwen3.8 软纪律有效（②实证）故保留。
- **影响**：本机 preset 两文件已修订（③重测可选，异模型大概率仍无视属已知接受）；plans 计划文件校准日志与验收措辞同步；批2 收编时以修订版为准。另：③会话系统提示实证 DSH 桌面版运行本地 web 服务（127.0.0.1:43120）——二期链式派生插件的 API 探路有据。

## [2026-08-27] save.ps1 批次收口校验：选 ② 加 -Batch 轻校验（verify-batch 动作）

- **背景**：节点5 批2 审 save.ps1 改动面，对比三案：①不动脚本（批末只跑标准 verify，靠模型自觉补批状态）②加 -Batch 轻校验（verify 的批次特化分支）③verify 强制批号（所有 verify 调用都要求批号上下文）。
- **决定**：选 ②。save.ps1 新增 `verify-batch` 动作 + `-Batch` 参数：批末收口跑 `save.ps1 verify-batch -Node <节点> -Session <会话> -Batch <N>`，覆盖 verify 的 1/2/4 步（PROGRESS 行存在 / SESSIONS 非空 / CONTEXT 日期）+ 两条批次特有项：A：PROGRESS 该行状态 = `进行中·批N+1/M` 或 `待验收`（末批收口）；B：SESSIONS 暂停点含「已完成批N」标记。退出码同 verify（0/1）。①③ 否决：①无机械校验，批状态漂移无兜底；③改动面大且无批次节点时每次 verify 都要带批号，破坏非分批场景的调用面。
- **理由**：轻校验成本最低（新增一条独立分支，verify 本体零改动）；-Batch 只接受纯数字、与 -Completed 互斥，调用面清晰；批次特化项直接针对"批末必存档"两条可机检的纪律（状态推进 + 暂停点标记），其余靠标准 verify 覆盖；batch-executor 纪律 6 收口命令随之更新为 verify-batch。
- **影响**：save.ps1 为母版源改动件（UTF-8 BOM 需保持）；文档侧（SKILL.md 存档流程 / PROTOCOL 批次协议节 / AGENTS.md 摘要 / plans/README）在批3 同步补 verify-batch 一句；批4 冒烟需覆盖 verify-batch 两态（通过/失败）；本仓库 .nodes 侧收口自本批起即用 verify-batch（本条存档即首批使用者）。

## [2026-08-28] 批4 落地记录：分发 v1.3.0 zip 与冒烟验证通过

- **背景**：节点5 批4 负责把母版 1.3.0 打包为 dist zip，并在新临时项目中冒烟验证分发可用性、init 幂等、锁竞争与 verify-batch。
- **决定**：批4 验收按磁盘产物为准——dist\node-architect-v1.3.0.zip + .sha256 必须存在且校验一致；临时目录解压后的安装源必须能独立生成 .nodes；init-nodes.ps1 两连跑必须幂等；锁竞争与 verify-batch 两态必须通过/失败语义正确。
- **理由**：分发产物是 v1.3.0 可移交形态，冒烟只消费 dist 不回改源，能尽早暴露 pack/init/协议内容/脚本校验在干净环境中的断链。
- **影响**：dist\node-architect-v1.3.0.zip（30.5 KB）与 sha256 校验一致；临时 demo 项目生成 .nodes 五件套齐全且 PROTOCOL 含「批次协议」节与 plans/ 目录树；init 两连跑幂等；锁竞争抢占失败/本人解锁成功；verify-batch 失败与通过两态均验证通过。

## [2026-08-28] 批4 补充：冒烟环境保留为批5 总验收复跑基准

- **背景**：批4 临时项目 `C:\Users\tc\AppData\Local\Temp\opencode\node-architect-v130-smoke\demo-project` 已验证 v1.3.0 分发 zip 解压后 init 与脚本校验可用。
- **决定**：批5 总验收不直接删除该临时项目；先用它对照 dist zip/sha256、解压内容、init 幂等、PROTOCOL 批次节、锁/verify-batch 冒烟结果，再清理。
- **理由**：批5 需要“逐条对照节点验收标准勾验”，保留冒烟环境可避免重复解压/初始化时引入新的时间戳变量，也让验收记录与批4 产物可追溯。
- **影响**：批5 完成前该临时目录只读消费；验收记录里注明路径与 sha256。

## [2026-08-28] 批5 总验收：节点5 全部验收项通过，状态 → 待验收

- **背景**：节点5 末批（批5）按「逐条对照节点验收标准勾验」收口，验收一律以磁盘产物为准（试点教训：v130-b2/b3 有提前声明完成倾向）。
- **决定**：五项验收标准逐条通过——①母版 PROTOCOL 含「批次协议」节且六条纪律全覆盖、目录树含 plans/ 行；②templates/BATCH-PLAN.md 六列每列有填写说明、含示例行；③install 镜像 `.agents\skills\node-architect\` 递归 SHA1 diff=0（镜像备份快照在 .agents\backup\）；④实例 `.nodes\PROTOCOL.md` 与母版 SHA256 一致（C1A0DC1F…1EE92）；⑤dist\node-architect-v1.3.0.zip（30.5 KB）与 .sha256 一致（75D8C225…0454），临时 demo（Temp\opencode\node-architect-v130-smoke）冒烟结果与批4 存档一致。试点经验回灌 `.nodes\plans\README.md`「试点经验回灌」节（验收以磁盘为准 / verify-batch -Node 逐字一致 / PS 5.1 编码敏感）。
- **理由**：verify-batch（v130-b5/批4）全 [OK] 是机械凭据；勾验项全部落盘可复跑，不采信会话内口头声明。
- **影响**：PROGRESS 节点5 状态 → 待验收（owner 改 v130-b5）；临时 demo 目录留待用户验收后清理；节点5 归档（archive/）留待节点真正完成（用户验收通过后）时由大模型会话执行。

## [2026-08-28] 批5 总验收：节点5 五条标准逐项复核通过

- **背景**：节点5（v1.3.0 批次协议固化）批1–4 已完成，批5 负责试点回灌 + 逐条勾验 + 收口存档。
- **决定**：五条验收标准以磁盘产物为准逐项复核，全部通过：① 母版 `.nodes/PROTOCOL.md` 含「批次协议」节且六条纪律全覆盖（触发条件/批次计划文件/拆批时机/切割原则/一批一会话/批末必存档/超限即断/校准回路）；② `templates/BATCH-PLAN.md` 六列字段（批/名称/范围/验收标准/预估材料K/前置批）逐列配 `{填写说明}` 且有示例行；③ install 后镜像 diff=0（`.agents\skills\node-architect` 逐文件 SHA1 比对无差异，旧版快照在 `.agents\backup\node-architect\20260828-*`）；④ 实例 `.nodes\PROTOCOL.md` 与母版逐字节一致（SHA256 相同）；⑤ `dist\node-architect-v1.3.0.zip`（30.5 KB）+ `.sha256` 校验一致（SHA256 75D8C225…0454），临时 demo 冒烟五件套齐全、PROTOCOL 含批次节。试点经验已回灌 `.nodes/plans/README.md`（脚本卫生、收口先于派生、main 补全断链、阈值校准 30K 维持）。
- **理由**：总验收必须可复核，全部结论落在文件系统而非会话记忆；回灌进 plans/README 使约定级试点经验可被后续节点直接引用。
- **影响**：PROGRESS 节点5 状态 → 待验收；临时冒烟目录 `C:\Users\tc\AppData\Local\Temp\opencode\node-architect-v130-smoke` 留待用户验收通过后清理（只读消费完毕）；节点2/4 仍待用户验收、节点3 进行中，均由 main 线负责。

## [2026-08-28] v1.3.1 批2：verify-batch 补 CONTEXT 时效校验 + UTF-8 降噪

- **背景**：verify-batch 只校验 PROGRESS 行/SESSIONS 非空/CONTEXT 日期，不校验 CONTEXT 内容是否指向正确批次（盲区：CONTEXT 停在旧批状态时 verify-batch 仍假通过）；脚本内中文 Write-Host 在 GBK 控制台产生 mojibake。
- **决定**：① verify-batch 新增特有项 C——CONTEXT.md 须含当前节点名且「下一步」行指向 `批(n+1)` 或 `待验收`（末批）；② 脚本头部加 `[Console]::OutputEncoding = UTF8` + `$OutputEncoding = UTF8` 强制 UTF-8 输出（try/catch 包裹，非控制台环境不报错）。
- **理由**：CONTEXT 停在旧批是批末最常见的"假通过"场景（模型改了 PROGRESS/SESSIONS 却忘了更新 CONTEXT 的下一步指向），机械校验兜底；UTF-8 降噪只改控制台输出编码，文件 IO 一直走 .NET UTF-8 API 不受影响。
- **影响**：save.ps1 为母版源改动件（BOM+CRLF 保持）；测试发现 PowerShell 5.1 中 `($n + 1)` 在 `$()` 子表达式里 `+1` 被当作 `+$1`（空变量），已改为预先计算 `$n1 = $n + 1`；六场景实测全过（T1 正例 / T2 stale / T3 末批 / T4 缺节点名 / T5 verify 回归 / T6 commit 回归）。

## [2026-08-28] v1.3.1 批3：agent 纪律6/7 改 commit 收口 + 完成字样时序 + 询问制全链落盘

- **背景**：批1 落地 `commit` 原子收口动作后，agent 纪律 6 仍停留在手工 lock/unlock 多跳收口（中途崩溃会留锁/半写）；v130 试点暴露"提前声明完成"倾向（b2/b3），且存档内"已完成批N"与 verify-batch 校验标记耦合，先写后验失败会导致重跑自打架；询问制（DECISIONS 2026-08-28 插件注入终局条目②）尚未落任何文档。
- **决定**：① batch-executor 纪律 6 收口改为五步：①PROGRESS/②SESSIONS/③DECISIONS 落盘 → ④新 CONTEXT 全文写暂存文件（路径≠CONTEXT.md）→ ⑤单命令 `save.ps1 commit`（脚本内 lock→CONTEXT 原子替换→删暂存→unlock→verify-batch）；锁竞争 exit 1 时暂存保留、重试同一命令免重写；verify FAIL 时 CONTEXT 已落盘无损，补 ①② 后重跑 verify-batch。② 纪律 7 加"完成字样时序"：「完成/已完成批N」只允许在 commit 全过（exit 0）之后写入/说出；SESSIONS 暂停点收口阶段用中性描述（"批N 收口进行中，待 verify-batch 确认"）。③ 询问制全链落盘：实例 plans/README「立节点先问」节 + 母版 PROTOCOL 批次协议触发条件后新增「立节点先问（二选一不混用）」条目 + BATCH-PLAN 模板新增「拆批确认」行与表后 commit/时序注记 + 实例 plans/v1.3.1 计划补「拆批确认」行（登记行 批1/3→批1/4 对齐四批）。
- **理由**：commit 是批1 已验收的机械能力，纪律引用它才能兑现"原子"（多跳手工作收口的崩溃面就是批1 要消灭的问题）；完成字样时序与 v130 教训（磁盘校验是完成唯一凭据）一脉相承，且中性措辞避免 verify 标记与宣告语互相耦合；询问制按 DECISIONS 既定口径落盘，补实例计划确认行是"约定级→可模板化"的最小补强（文档同步属批3 范围）。
- **影响**：全局 agent 为批4 母版模板（{{BATCH_MODEL}} 占位）蓝本，改后批4 直接模板化；母版 SKILL/README/AGENTS/BATCH-PLAN/PROTOCOL 同步（SKILL 新增「批次协议」节+存档流程第 7 步 commit 说明，README 补 save.ps1 动作清单与拆批执行节，AGENTS 验收第 3 条补询问制+commit）；母版 .md 文件统一补 CRLF 对齐 PS 5.1 编码铁律（.ps1 除外，其 BOM+CRLF 本就合规）；批4 执行材料中"批3 终稿"以本存档为凭据。

## [2026-08-28] v1.3.1 批4：agent 模板入母版 + install -BatchAgent + 分发 v1.3.1 zip

- **背景**：批3 终稿 agent（`~/.config/opencode/agents/batch-executor.md`）含硬编码 model 字段（`company-vllm/Qwen3.8-27B-W4A16-AWQ`），不可分发；DECISIONS 2026-08-28 插件注入终局条目③ 决定 agent 迁母版并入 v1.3.1 批4，需 `{{BATCH_MODEL}}` 占位 + install 参数化。
- **决定**：① 新建母版 `node-architect\bridge\opencode\agents\batch-executor.md`，内容以批3 终稿为蓝本，`model:` 字段改为 `{{BATCH_MODEL}}` 占位符（仅 model 字段一处占位）；② install.ps1 新增 `-BatchAgent` 开关 + `-BatchModel <id>` 参数（3.6 节）：仅当 opencode 在目标客户端时生效，复制模板到 `<项目>\.opencode\agent\batch-executor.md`，`-BatchModel` 有值则字面替换占位符，无值则保留占位符并打印「⚠ 未配置模型：手工编辑替换」提示；③ SKILL.md frontmatter version 1.3.0→1.3.1；④ 重跑 install.ps1 同步镜像（diff=0）；⑤ pack.ps1 产出 dist\node-architect-v1.3.1.zip（36.7 KB）+ .sha256 校验一致。
- **理由**：模板化是 agent 可分发的最小改动（只动 model 字段，九条纪律全文不动）；install 参数化与 bootstrap `{{MASTER}}` 占位符先例一致，复用「复制→替换→写入」三行模式；未提供模型时保留占位符+提示比默认填死更诚实（使用者知道要改）。
- **影响**：母版新增 `bridge\opencode\agents\` 目录与 agent 模板；本机全局 `~/.config/opencode/agents/batch-executor.md` 降级为生成物（母版为真源，改后手动同步）；两态冒烟验证：带 -BatchModel 替换正确 / 不带保留+提示 / 非 opencode 目标正确跳过；PROGRESS 节点6 状态 → 待验收。

## [2026-08-28] 节点8 批1：派生通道定 web API 直调（分支 A），renderer token 路线否决

- **背景**：节点8 探路"能否程序化创建 DSH 会话"。反推 app.asar（DSH Desktop 2.0.3）发现单一 RPC 面 `POST /api/<method>`（`session.create`/`selectModel`/`prompt` 三连即完整派生），前置唯一硬闸为 DesktopWebServer browser access；renderer token（32B base64url）仅内存态且只注入 Electron 原生窗口，进程外不可获取。
- **决定**：批2 走分支 A 的 **web API 直调**（pwsh Invoke-RestMethod），前置=用户一次性在 DSH 设置开 compatibility+浏览器访问且 networkExposure 锁 loopback；cordis 插件进程内通道降为 fallback；`dsh-headless` 通道仅记录不探（除非直调失败）。
- **理由**：直调零安装面（pwsh 原生），栅栏放行是 DSH 产品内建能力（浏览器访问本就是面向用户的开关），相比摸插件 API 成本最低；loopback 锁定是因为放行后任意本地进程可驱动 DSH，开 lan 会暴露局域网。
- **影响**：批2 实现落点=batch-executor preset 纪律 7 的 DSH 分支或独立 `derive-next-batch.ps1`；首个真 POST 实测前须用户知情（plans 边界约定）；契约细节与执行序见 `plans/DSH自动派生探路.md`「批1 产出」。

## [2026-08-28] 节点8 批2：派生脚本落地实测通过 + PS5.1 中文 body 编码坑

- **背景**：用户开启浏览器访问（compatibility+openBrowser，loopback）后，按批1 契约实现 derive-next-batch.ps1（session.create→selectModel→prompt 三连）。首测发现中文 prompt 到达会话时变 `??????`：PS 5.1 Invoke-RestMethod 对字符串 body 默认按 latin1 编码（无 charset 时）。
- **决定**：①派生脚本落母版 `skill\scripts\derive-next-batch.ps1`（与 save.ps1 同目录同安装链，端口 43120 起自适应探测、403 给出开启指引）；②body 一律 `[Text.Encoding]::UTF8.GetBytes()` + ContentType 加 `charset=utf-8`；③preset 纪律 7 升级为批末自动派生（commit exit 0 → 跑脚本 → 输出总结即停），脚本报错回退手动链；④版本 bump v1.3.3。
- **理由**：脚本被会话以项目相对路径调用（纪律 6 引 save.ps1 同模式），随 skill 安装链分发零额外安装面；PS5.1 编码坑只有字节级发送才可靠规避；纪律 7 保留手动链回退，栅栏意外关闭时不阻塞批次流转。
- **影响**：修复后真 POST 实测全通（中文完整送达、Qwen3.8 按 preset+模型运行并按指令回复、turn 正常结束）；镜像 diff=0；dist v1.3.3 zip（43.9 KB）+sha256；首个真 POST 实测会话两个（session-c371…编码缺陷版 / session-453e…修复验证版）留 DSH 供用户查验删除；测试会话回复极简不产生副作用。
## 2026-09-17 · dsh-plan-popup 数据管道决策（main）

个人套餐弹窗插件（节点 9）不建独立数据管道：浏览器端直接同源 fetch dsh-usage 自带接口 `GET /api/dsh-usage/overview` + `POST /api/dsh-usage/refresh`（调研确认其设置页自身即此模式，无额外鉴权头），宿主半边保持空实现。理由：零数据逻辑重复、dsh-usage 升级零耦合。前置工作 dsh-usage-sidebar（侧边栏入口→设置页导航）同日已交付实测通过，其踩坑清单（pnpm file: inode 同步、dsh.client 声明、Shadow DOM 穿透、自匹配、隐藏面板判定）沉淀于 plans/dsh-plan-popup.md。

## [2026-09-17] v1.4.0 skill 优化：分层文档 + 真源对齐 + 一键存档 + 目录锁 + 跨平台 save.mjs

- **背景**：node-architect 经 9 个节点实战后，执行层复杂度开始反噬可维护性——SKILL.md 单文件 64 行高密度文本一次全量加载；三处真源（SKILL/PROTOCOL/AGENTS）已漂移（PROTOCOL 头部写 v1.1.0 而实际交付 v1.3.3，且缺 commit/完成字样时序等关键内容）；常规存档需 lock→写→unlock→verify 四次调用；锁是"读-判-写"非原子、并发下有竞态；DECISIONS 230 行已过 200 行阈值却从未裁剪；平台锁定 PowerShell 5.1；无"已废弃"状态且待验收节点可无限期积压。
- **决定**：一轮 8 项优化并 bump v1.4.0——① SKILL.md 分三层（精简 46 行 + `references/QUICKREF.md` 命令速查 + `references/SKILL-FULL.md` 原文）；② PROTOCOL.md 版本号改 `__VER__` 占位符由 init 运行时注入，补齐 commit/一键存档/完成字样时序/已废弃，真正成为唯一全文真源；③ save.ps1 新增 `save` 动作（lock→CONTEXT 原子替换→unlock→verify 单命令，非批次场景）；④ 新增 `trim-decisions` 动作，verify 追加 DECISIONS 行数与待验收超期双 [WARN]（不影响退出码）；⑤ 模板补"已废弃"状态；⑥ 锁改目录锁（`.lock.d/`，mkdir 原子创建，自动迁移兼容旧 `.lock`）；⑦ 新增跨平台 `save.mjs`（Node.js，与 PS 版功能对等）；⑧ 批次协议在 SKILL 侧缩为引用、全文归 PROTOCOL。
- **理由**：核心思路（文件是记忆，对话不是）已验证有效，痛点全在执行层复杂度与平台绑定——分层把常读路径压到约 50 行；占位符注入让版本号不再靠人工同步；目录锁借用文件系统原子性消除竞态；save.mjs 让无 PowerShell 环境也拿到机械校验能力。改动先落在安装产物侧，故做了一次反向同步（安装产物 → 母版）对账，此后恢复"只改母版 → 重跑 install"的正向流程。
- **影响**：母版↔真源镜像 diff=0；版本号三处一致 v1.4.0（SKILL frontmatter / .nodes/PROTOCOL.md / AGENTS 指针），且 init 新增指针版本自刷新逻辑（只替换版本 token，不动正文）；母版 4 个 .ps1 全部归一 BOM+CRLF（修掉 init-nodes 缺 BOM、compact-context LF 行尾）；新机解压安装实测通过（版本注入无 `__VER__` 残留、save 一键存档全链路 [OK]）；dist v1.4.0 zip（53.3 KB）+sha256；顺带修掉 trim-decisions 只匹配 `^## \[` 而漏掉 `## 日期 ·` 无括号格式的缺陷（21 条被误判为 20）。
## [2026-09-17] v1.4.1：引导技能补"更新节点协议"触发词

- **背景**：用户希望在其他项目里用一句话让 agent 更新节点协议，但全局引导（node-architect-installer）的触发词只有"装/初始化/安装"，"更新/升级"未显式覆盖，模型匹配看发挥。
- **决定**：引导 description 增加"更新节点协议 / 升级节点协议 / 同步节点协议"，正文补「重跑即更新（幂等，本地差异自动备份，.nodes 档案保留）」语义说明；版本 bump v1.4.1；重跑 -Bootstrap 刷新四端全局副本；重打 dist zip。
- **理由**：更新与安装本就是同一条幂等命令，缺的只是话术入口——加触发词零代码改动，四端全局引导已装且母版路径正确，边际成本一行字。
- **影响**：DSH 热发现即时生效（本会话技能目录已见新触发词）；四端全局引导均指向母版 E:\www\dsh-base\node-architect；dist v1.4.1 zip（53.5 KB）+sha256。注意：-Bootstrap 写 C 盘全局目录，在 DSH 沙箱 workspace-write 内会被拒，需 danger-full-access 提权跑一次。

## [2026-09-18] v1.5.0+v1.6.0：batch-executor 退役入 attic + 执行效率协议（补登记）

- **背景**：链式派生（批末自动开下一批会话）依赖 batch-executor preset/agent 与 DSH web API 直调，维护面大于实战收益；同时大节点执行的主要浪费来自「计划期问题执行期暴露」——测试 mock 缺失导致批量返工、验证命令逐项跑每次工具冷启动 10s+、可并行批次被串行执行。该轮工作在另一会话完成时未走存档纪律，本条为补登记。
- **决定**：v1.5.0 将 batch-executor 全家（derive-next-batch.ps1 / DSH preset / opencode agent）移入 `attic/batch-executor-v1.5.0/` 退役存档，`verify -Completed` 增「归档无未替换占位符」机器校验；v1.6.0 增「执行效率协议」节（开工侦察三问 / 批次依赖标注 / 批内检查点 / 效率复盘归档必填），拆批触发条件扩至时间巨头（>15 文件 / >100 处改动 / >40 分钟），`verify-batch` 增侦察段占位符清空与校准日志回填两道机器校验，协议本体 ≤150 行红线。
- **理由**：退役——实验关停但 attic 保留全量文件可随时复活；效率协议——把三类浪费前移到登记阶段，且全部配机器校验兜底而非纯提示词纪律。新增脚本代码块采用 ASCII-only（CJK 匹配用 \uXXXX 转义），规避编辑工具剥 BOM 后 PS 5.1 按 ANSI 解析中文碎裂的实证坑。
- **影响**：本地母版 v1.6.0；安装副本与 AGENTS 指针同步 v1.6.0；dist v1.6.0 zip（47.4 KB，因 batch-executor 移出体积下降）；仓库根 dist\ 安装包更新；DSH 链式派生能力随退役消失，批末恢复手动开下一批。
