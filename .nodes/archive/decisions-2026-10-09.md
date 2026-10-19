# Archived Decisions (2026-10-09)

> Trimmed from DECISIONS.md (kept latest 20 entries).

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
