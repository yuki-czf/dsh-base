# Archived Decisions (2026-10-16)

> Trimmed from DECISIONS.md (kept latest 20 entries).

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

## [2026-09-25] DSH 机器环境：Gemini 载荷改造（browser/playwright 裁剪 + gemini-lean 预设 + dsh-lean-tools 掩码插件）

- **背景**：网关管理员 mubai 委托的《DSH × Gemini 3.8 Flash 性能改造说明书》执行（一次性委托，非本仓库节点）。本机基线 93 工具/69.9KB schema/10.2KB sys（同说明书 61/53.5KB 口径更重：多装了 playwright MCP 与项目 MCP）。
- **决定**：① `~/.dsh/profiles/desktop/cordis.patch.yml` 追加标记块：禁 `tool-browser`/`mcp-playwright`/`mcp-resources` 三行、wallpaper 仅关 agent 公告；② 新增本地零依赖插件 `~/.dsh/plugins/dsh-lean-tools`（预设作用域 `ctx.tools.restrict` allow 掩码 + prompt 段遮蔽 + 防膨胀规则段），junction 进两个 profile 的 node_modules；③ 声明 `gemini-lean` 预设（14 工具白名单）；④ A/B 用独立 web profile 引导层（`dsh --profile web` + token-cookie API：`POST /api/<ns>/<method>`，信封 `{type:'client-request',rpcId,method,payload:{args:{request:…}}}`）全自动完成。
- **理由**：载荷削减全部走声明式配置面（patch 行禁用 + 预设声明），可整体回滚；掩码语义按 dsh-tools `view()` 源码实证（restriction 过滤全部继承面而非仅宿主全局——`allow:[]` 会连预设工具一起掩掉，白名单必须显式列名）。
- **影响**：默认会话 93→32 工具/30.8KB/8.1KB sys；gemini-lean 15 工具/16.1KB/5.7KB sys（固定 ≈6.1K tokens，命中管理员推算）；A/B 实证首步并行+分页读取。遗留：桌面宿主重启前桌面侧 gemini-lean 不可用（插件代码 HMR 不热载）；本机 pwsh 管道按 GBK 处理无 BOM UTF-8（Add-Content 吞换行）——写 ~/.dsh 一律字节级操作。报告与脚本：`_diag/gemini-perf/`（REPORT.md）。

## [2026-09-25] 修正：上条 §3.2 全局裁剪全量回滚，改为纯增量 gemini-lean（用户澄清委托边界）

- **背景**：用户明确"不能改动到别的 Agent，预期是新建一个针对 Gemini 的 Agent 且不改动原 Agent 功能"。上条把说明书 §3.2"对编码类 workspace 禁用浏览器插件"执行成了 profile 级全局禁用（tool-browser/mcp-playwright/mcp-resources + wallpaper 公告），越出委托边界。
- **决定**：① 桌面 patch 重写为「原始备份 + 仅预设声明块」，全局行零残留（YAML 校验 + 探针会话实证 93 工具/69,902B/sys 10,164B 与基线逐字节一致）；② dsh-lean-tools 增至五处预设作用域段遮蔽（harness:source 置空、app:web-surface 压缩、tool:browser / plugin:dsh-wallpaper / mcp-resource-servers 置空），lean 效果自足不依赖全局禁用；③ 回归验证：全局还原后 lean 会话仍 15 工具/16,085B/5,689B 不变。
- **理由**：allow 掩码与段遮蔽本来就只作用于选用预设的会话，全局裁剪对 lean 效果是冗余的；委托边界优先于说明书字面。
- **影响**：默认/standard 会话完全恢复原状；gemini-lean 数据不变（每请求固定 ≈6.1K tokens）；REPORT.md 重写为 v2。桌面宿主重启的前置条件不变（插件代码热载限制）。


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


## [2026-09-26 晚] perf-gemini-lean 全线收口：subagent entryId 翻案 + medium A/B 实证 + 非流式悬案侦破

- **subagent 翻案（v12.1）**：preset 行 `id: tool-subagent` 与宿主 `include:tool-subagent` **entryId 撞车**→挂载必报 "already registered in this scope"→assembled 82 无 subagent。修复=改名 `tool-subagent-lean`（框架有多实例先例 tool-subagent-codex/claude-code）。实测：assembled 83、`wire 83->16`、单发+并行双发真调成功（双子代理 1ms 间隔同消息发射，继承 lean 血统 16 工具+分页纪律）——"lean 无 subagent"关闭；原"preset 自层注册行"设想经改名成立。
- **行为改造验证**：rulesText plan-first+技能按需落地（sysBytes +328B 精准）；行为测试全 turn 零探索性加载、先思考后动；根因侦察=skill 工具 description 引用的 "session skill catalog" 悬空（lean/standard 提示词均无技能目录）——"开局先加载"是悬空引用+听话模型，不是模型缺陷。
- **medium A/B（effort=medium 已验上 wire，防 GUI 小坑假测）**：思考量 518-1236→343-480 字符/步（砍半）；**机械步 -27~34%**（汇总步 6.93→4.56 / 6.55→4.79s），派发步持平；零质量回退（medium 反而先读后答更 grounded）。**默认档维持 high+手动切换，两周体感复评再定**（改默认须知会 mubai，红线程序）。
- **非流式悬案（与家里 Keeper 联合侦破）**："7s 纯等待"根因=**Google Antigravity 后端对含工具调用的响应聚合投递**（思考+函数参数生成完才单事件发出），非任何层 bug。公司侧洗清三证据：pi-ai `openai-completions.js:587` `stream:true` 硬编码无条件分支；onPayload 钩子全链无人注册；DSH 会话记录不落盘 stream 字段。**归因修正：非流式分界线是响应类型（tool-call 步全非流式/纯文本步流式），不是档位**——上轮 high 派发步 gap 0.25s/716tok=2864t/s 同样超物理上限，两轮皆然，medium 无辜。
- **影响与遗留**：整线终账 6.9s 体感→机械步 ~4-6s（网关/载荷/档位三段战役全部数据闭环）；剩余为物理区间（Google 地板 2-4s + 排队尾部 + 上游聚合投递）。遗留决策：默认档两周复评；工具步 UI 状态指示=DSH 产品 feature request；聚合投递隐藏开关待问上游；skill 目录悬空可选 wire 层内联（低优先）。回滚链：`cordis.patch.yml.bak-dsh-v12-20260926` + `host.js.bak-v11` + rulesText 删两行 + entryId 改回。
