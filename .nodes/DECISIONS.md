# 决策日志 DECISIONS

> 只追加，永不改写历史条目。多会话并发追加是安全的。最新的在最下面。

> Older entries archived: archive/decisions-*.md

> Older entries archived: archive/decisions-*.md

> Older entries archived: archive/decisions-*.md

> Older entries archived: archive/decisions-*.md

> Older entries archived: archive/decisions-*.md

> Older entries archived: archive/decisions-*.md

> Older entries archived: archive/decisions-*.md

## [2026-10-12] 节点20 补充：pi-throughput 插件 v0.1.1 同步对齐 DSH TPS 口径（用户要「实际生成速度」）

- **需求**：用户确认要的是「实际上的速度」——模型真实吐字速率（含推理、扣等首字），不是整轮 e2e 摊平值。弹窗 v2 已是该口径，插件（v0.1.0 = outputTokens ÷ 整轮墙钟，分子还不含推理）是三处口径里唯一没对齐的。
- **改动**（`E:\www\dsh-base\pi-throughput`，dev 目录安装、重启即生效）：`main.js` 的 `normalizeTurn` 新增 `generatedTokens`（推理单报渠道 = outputTokens+reasoningTokens）与 `decodeMs`（有 `usage.firstTokenMs` 就扣，无则退化为整轮窗口）；`tokensPerSecond`/`summarize` 换用新字段；`tpsSource`/`ttftAvailable` 元数据如实更新；头部注释与 README 公式同步；manifest bump 0.1.1，dist 重打包（sha256 cf3045e5…，旧 0.1.0 piplug 已删）。
- **与弹窗的差异（预期内）**：插件是「轮」口径（分母含工具调用/审批等待，`pi.usage.listTurns` 只给轮级时间戳），弹窗是「单次模型回复」口径；纯聊天轮两者接近，带工具的轮插件更低——那是真实体感，不是口径打架。
- **验证**：`node --check` 两文件通过；v0.1.1 重新打包成功；dev 安装路径 `E:\www\dsh-base\pi-throughput`（registry 确认），重启 PI-Desktop 后与 app.asar v2 一起生效。
- **踩坑**：本轮行号编辑又错两次（多插重复键/重复括号、漏换行号）——务必「先 Read 定位、改完读回」；`firstTokenMs=0` 是合法值，判缺失必须用 `asNumber(...)===null` 而不是 falsy 判断。

## [2026-10-15] 节点22 pi-statusbar 底部速度状态条（参考 ZCode Token-Usage-Statusbar；正门 renderer slot 实现）

- **需求**：用户给了 ByteRax/zcode-token-usage-statusbar，问其速度算法是否与我们一致、是否 e2e，并要求「和他们的做法一样」在 PI-Desktop 底部加速度 UI。
- **ZCode 算法判定**（`token_rate.py to_item()` + `docs/design-notes.md`）：**不是 e2e**。默认分母=completed_at−first_token_at（解码窗）；含思考的请求（reasoning_tokens>0 或 Claude 系）改用 completed_at−started_at——因为它们的首字时刻=可见首字，思考 token 在其之前流出，不前移会虚高（真库 claude-opus-5-5 有 35% 请求 >300 t/s）。分子=output_tokens，**已含思考、绝不再加**（与 DSH 同款不变式：他们直接拒绝 reasoning>output 的数据）。按段累加、段间工具等待不计；200ms≤窗<1h；每完成一次请求刷新一次，非流式实时。**与我们同构**：我们 runtime 的首字=任意内容首个 delta（含思考），decodeMs=时长−首字 单公式即等价于他们的分支；分子口径一致（他们的 output 已含推理 = 我们的 out+单报推理）。
- **实现差异（有意为之）**：ZCode 需要注入 app.asar（ZCode 无插件 UI 通道）；PI-Desktop 有 renderer slots，走正门 `composerControl`（不做注入，升级免 auto-heal）。数据源用 `usage.listTurns`（usage.read）+`onRendererCall`，1s 缓存、渲染层 1.5s 轮询。
- **落地**：`E:\www\dsh-base\pi-statusbar`（local.pi-statusbar v0.1.0，PluginCheck 过，dist sha256 7eebb9af…）。渲染层 composerControl 右侧：⚡解码速度/首字/本轮/会话/今日，悬停明细，无 TTFT 显 ⚡--（黄）；命令 `PI Statusbar: 速度明细`。Scaffold 已 dev 加载，**renderer.extension 为高风险权限，需用户在插件页确认一次**。
- **待实测风险**：`listTurns` 行是否带 `usage.firstTokenMs` 未实测——若无，速度显 ⚡--（诚实降级），届时给渲染层加胶囊同款 React 树取数即可（数据在内存消息对象里必有）。

## [2026-10-15] 节点22 v0.2.0：状态条改为「输入框元素正下方」的外挂横条（用户澄清位置），算法维持自有解码窗

- **需求澄清**：用户要的「底部 UI」=输入框**元素下方的外部横条**（ZCode 同款），不是输入框内部工具条；算法确认用自有口径（体感生成速度=解码窗），不改。
- **v0.2.0 改动**（`pi-statusbar/renderer.js` 重写为纯 DOM）：
  - bar 为 body 级 `position:fixed` div，rAF 逐帧跟随输入框矩形（bottom+6px、左对齐、等宽）——ZCode 踩坑文档同款：不进 React 布局流（不会被重渲染清掉）、`<style>` 挂条元素自身内部（防 React 清 head 样式）、rAF try/catch+finally 续帧（防一次异常静默死亡）；
  - 输入框定位：composerControl 里注册零尺寸隐藏锚点，从锚点向上爬到第一个含 textarea 的祖先 ≈ 输入框容器；锚点缺失时回退 textarea 父元素；
  - 代际守卫：onLoad 先移除 `[data-pi-statusbar]` 旧代 bar（热重载防打架）；
  - 新增字段：`E2E x.xs`（最近一次调用端到端墙钟，仅展示）；main.js 首帧向宿主日志输出 contract 探针（listTurns 行键名+usage 键名+有无 firstTokenMs），为 ⚡-- 排障留证。
- **验证**：`node --check` 两文件过、manifest JSON 过、PluginCheck 过（仅 renderer.extension 高风险提示）、PluginPack v0.2.0（sha256 67deaf7e…，旧 0.1.0 piplug 已删）。
- **待实测**：①条出现且随窗口缩放/滚动跟随；②⚡ 数字与胶囊/弹窗同量级；③若恒 ⚡--：查宿主日志 `[pi-statusbar] contract:` 行——`hasFirstTokenMs:false` 即 listTurns 不带首字字段，届时数据源换胶囊同款 React 树取数（内存消息对象必有 usage.firstTokenMs）。

## [2026-10-15] 节点22 v0.2.1：状态条没显示的两个真凶（pi 遮蔽 + 扩权需显式重载）与 ZCode 样式重做

- **症状**：用户重启后输入框下方无状态条。宿主 plugin.log 两类错误：①`PLUGIN_LOAD_FAILED / plugin.restore.failed: Cannot read properties of null (reading 'commands')`；②循环刷 `PERMISSION_DENIED: manifest now requests renderer.extension, usage.read; reload it from the Plugins page to review`。
- **根因 ①（我的 bug）**：main.js 写了模块级 `let pi = null` **遮蔽宿主注入的全局 `pi`** 且从未赋值 → onLoad 首行 `pi.commands.register` 即抛空指针 → 插件加载失败。修复：删除遮蔽声明（直接用宿主全局），onUnload 加 try/存在性守卫（恢复/卸载期宿主可能已拆掉命令注册表）。
- **根因 ②（宿主安全规则）**：dev 插件首装时权限是 `ui.panel`（脚手架默认），我改成 `renderer.extension`+`usage.read` 属于**扩权**，宿主明文规定热重载不批扩权（"Widening permissions needs an explicit re-load"）→ 每次热重载都被拒。修复无代码解：**必须用户在 插件页 对 PI Statusbar 显式重载一次**批复新权限。
- **样式重做（对照用户截图的 ZCode 条）**：细条（26px）贴输入框底边（top=bottom−1，视觉连体）、左对齐等宽、上边框隐藏+下圆角（似输入框延伸）；分段用竖线分隔、`flex:1` 均分铺满整宽；每段「图标+标签+粗体值」；速度段绿色（--ds-success）；溢出即视口放不下时自动浮到输入框上方（floating 类）。分段：⚡速度 / ◷首字 / ⋮E2E / ▤本轮(带 t/s) / ◧会话 / ⊛今日，各段悬停 tooltip 带口径说明。
- **验证**：node --check 双过、manifest JSON 过、PluginCheck 过、PluginPack v0.2.1（sha256 14f1cd04…，删 0.2.0 旧包）。**待用户操作**：插件页重载 PI Statusbar（批复扩权）→ 看条；若速度恒 ⚡--，看宿主日志 `[pi-statusbar] contract:` 的 hasFirstTokenMs。
- **教训入册**：宿主注入的全局（`pi`）绝不能用同名模块级变量遮蔽；脚手架默认权限与自己最终权限不一致时，第一次改 manifest 就该让用户显式重载，而不是等热重载循环报错。

## [2026-10-15] 节点22 v0.3.0：数据源切换为 React 树内存记录（listTurns 契约实测无 TTFT）+ 定位 bug 修复

- **实测证据**（首帧 contract 探针，宿主日志）：`listTurns` 行键 = cacheReadTokens/cacheWriteTokens/endedAt/inputTokens/modelId/outputTokens/projectId/providerId/reasoningTokens/sessionId/sessionTitle/startedAt/turnId，`usageKeys:[]`，`hasFirstTokenMs:false`——**宿主用量契约没有首字时刻**，用它算速度永远 ⚡--。此探针一帧定案，避免瞎猜。
- **v0.3.0 改动**：①渲染层引入 pi-speed-meter 的实战采集器（React fiber 全根枚举 + 有界 DFS + 内容签名去重 + 轮界三级回退 user/entry/user-time→连续段），从内存消息记录取 `responseDurationMs`+`usage.firstTokenMs`，解码窗口径就地计算：⚡最近一次/▤本轮/◧会话 三级速度与 token；②listTurns 降级为「今日 token 合计」专用（无速度）；③修 composerRect 定位 bug：v0.2.x 在无 textarea 时用 0×0 锚点自身取矩形 → 恒 display:none（条不可见的直接原因），改为从锚点 parent 向上爬 + 尺寸启发（宽≥200/高≥32）+ contenteditable 兜底。
- **验证**：node --check 双过、PluginCheck 过、PluginPack v0.3.0（sha256 63678171…）。权限已批（用户已显式重载），**dev 目录热重载即生效，无需重启**。
- **观察点**：①条是否出现并逐帧跟随输入框；②发一条消息后 ⚡ 数字应与胶囊/弹窗同量级；③「今日」是否随宿主 listTurns 出数。若条仍不显示：下一步查渲染层异常（无独立日志，可在 renderer onLoad 首行加 console.log 走宿主 plugin.log）。

## [2026-10-15] 节点22 v0.3.1：条盖住输入框工具条的定位修正（最近公共祖先法）

- **实测反馈**（用户截图）：条已出数且与胶囊交叉验证一致（⚡164 t/s vs 胶囊 172 t/s，本轮 172 t/s；首字 6.2s / E2E 9.4s / 今日 843k 全通）——数据链路全通；但条钉进了输入框**内部**，盖住底部工具条。
- **根因**：composerRect 的「向上爬+尺寸启发」在锚点父链上先碰到一个内层包裹元素（底边在工具条上方），不是输入框外框。
- **修复**：定位改用「隐藏锚点 与 输入框编辑区(textarea/contenteditable) 的**最近公共祖先**」——按 DOM 结构它就是输入框外框卡片（同时包含编辑区与工具条），无需猜尺寸；条钉其下 4px。回退链保留：无编辑区时用尺寸启发，最后用 editable/锚点父级。
- **验证**：ESM 语法过、PluginCheck 过、PluginPack v0.3.1（sha256 f854d363…）。热重载即生效。
- **方法论**：UI 挂载类插件定位优先用「结构关系」（公共祖先/contains）而非「尺寸启发」——前者由 DOM 语义保证，后者随样式改版漂移。

## [2026-10-15] 节点22 v0.3.2：定位改几何边界法（v0.3.1 公共祖先法仍误配 TODO 面板）

- **实测反馈**（用户截图）：v0.3.1 的条压在了输入框**上方**的 TODO 折叠面板上——「最近公共祖先」又匹配错容器（锚点槽位与首个 contenteditable 的共同祖先落在了 TODO 面板所在层级；首个 contenteditable 可能是 TODO 项标题而非聊天编辑区，两条线索叠加导致误配）。
- **v0.3.2 定位终版（几何边界法，弃用一切容器猜测）**：从工具条里的零尺寸锚点出发逐级向上；每个祖先都包住工具条（底边 ≥ 锚点底边），**输入框卡片是最后一个「底边 ≤ 锚点底边+40px」的祖先**——卡片底边距工具条只有一份内边距（≤40px），再往上（聊天列/页面容器）底边会明显超出，即停止。该规则只依赖「输入框卡片底边距工具条很近」这一布局事实，不再依赖 editable 选择器或尺寸启发。条钉卡片底边下 4px。
- **验证**：ESM 语法过、PluginCheck 过、PluginPack v0.3.2（sha256 75230108…）。热重载即生效。
- **方法论沉淀**：跟随式 UI 的锚定，容器猜测（选择器/尺寸/公共祖先）都会随宿主改版漂移；「以已知内点为基准、按几何边界向上收敛」最稳。连续三轮定位翻车（0×0 锚点自身 → 公共祖先误配 → 首轮也误配）终于收敛到这一版。

## [2026-10-15] 节点22 v0.3.3：条消失的真凶=position:fixed 锚点坐标不可靠；改文档流锚点+geom 诊断上报

- **症状**：v0.3.2 条完全消失。根因推断：锚点是 `position:fixed;width:0;height:0` 的 0×0 元素，fixed 的「静态位置」在有 transform/contain/滚动的祖先里会飘（甚至落到视口原点）→ `anchorRect.bottom≈0` → 几何规则第一层祖先就判「底边 > 0+40 出卡」→ break → best=null → display:none。
- **v0.3.3 改动**：①锚点改 `display:block;width:1px;height:1px;opacity:0`（**文档流内**，坐标真实；1px 不影响工具条布局）；②爬升遇零宽祖先从 break 改 continue（display:contents 包裹层不再中断）；③新增一次性 geom 诊断：渲染层第 3 拍把 `{geom:{anchorRect,bestRect,ok}, anchorConnected, records, found, visited}` 经 `onRendererCall("report")` 发给 main → 宿主日志 `[pi-statusbar] geom:`（manifest rendererCallMethods 加 report）——再不显示时日志一帧定案。
- **验证**：node --check 双过、manifest 过、PluginCheck 过、PluginPack v0.3.3（sha256 890b3b01…，删 0.3.2 旧包）。热重载即生效。
- **教训**：用于测量的锚点绝不能 position:fixed（坐标基准会漂）；要伪装成布局中性元素就用「文档流 1px 透明块」。诊断要走一条从渲染层到宿主日志的通路（plugin.call→main console.log），否则渲染层异常是黑盒。

## [2026-10-15] 节点22 v0.3.5 定位终版收敛：合成矩形法 + geom 实测通过（input→card 坐标全对）

- **.geom 实测**（每 30s 自动上报）：`stage:"ok", input(384,820,1462,887), card(384,820,1462,927)` —— 合成矩形生效：水平=输入框自身左右界，垂直=「第一个底边低于输入框的祖先」的底边（工具条+内边距≈40px）。条位 top=931，恰在输入框卡片下方 4px，与侧边栏/TODO 面板/工具条互不遮挡。
- **本轮三连修的根因链**：①`rAF` 在插件渲染上下文不触发（v0.3.2-0.3.4 条消失/错位的总根因）→ 改 150ms `setInterval`；②隐藏锚点 `position:fixed` 坐标漂 + flex-shrink 压缩到 0×0 → 改文档流 1px 块 + `flex:none`，且定位不再依赖锚点（只作 React 树扫描起点）；③「向上爬找卡片」在外层容器恰好也结束于输入框附近时必然多爬一层 → 改合成矩形（水平用输入框自身、垂直用第一层向下延伸祖先）。
- **交付**：v0.3.5 已热重载生效、PluginCheck 过、dist 打包（sha256 02a8ba4a…）。待用户目视确认后节点 22 收口。

## [2026-10-15] 节点22 v0.3.6：取消「浮到上方」回退（盖 TODO 面板的直接原因），条压薄至 22px 贴底放置

- **实测定位**：v0.3.5 几何计算正确（card 底=927），但用户窗口里输入框底边距视口底只有 ~22px，放不下 26px 的条 → 旧「浮到输入框上方」回退被触发（top=输入框顶-30）→ 条盖住 TODO 面板。与 v0.3.1 的遮挡同根：都是「放不下就往上跑」。
- **v0.3.6 改动**：①删除浮上方回退——条**永远**在输入框下方；②条压薄 26→22px；③空间不足时 `top=min(card底+4, innerHeight−24)` 贴窗口底边，最多压输入框卡片底部留白 2-4px，绝不遮上方面板。
- **验证**：node --check 过、PluginCheck 过、PluginPack v0.3.6（sha256 03d2b68d…，删 0.3.5 旧包）、geom 持续 `stage:"ok"`（input 887 / card 底 927 稳定）。热重载即生效。

## [2026-10-15] 节点22 v0.4.0：腾空间版（spacer 26px）——条独占一行，geom 实测 spacer 生效

- **用户拍板**：做「腾空间」版——输入框和 TODO 上移，条独占一行。
- **实现**：位置循环（150ms）里给「输入框卡片容器」（findComposer 返回的第一个底边低于输入框的祖先）加 `margin-bottom:26px`——flex 列布局中卡片整体上移 26px，上方 TODO 随之、transcript 区缩 26px；条钉在卡片新底边+4px（专属行）。React 重渲染清内联样式时由 tick 补写；onUnload 还原 margin；升级后布局失效自动退化为贴底模式（margin 无 reflow 时条仍钉卡片底+4）。
- **geom 实测**：spacer 生效——input 从 (384,**820**,1462,887) 上移至 (384,**794**,1462,861)；卡片真实边界显形 (372,784,1474,901)（含 12px 内边距）；条位 905-927 全在视口内。连续两轮上报坐标稳定。
- **验证**：node --check 双过、PluginCheck 过、PluginPack v0.4.0（sha256 a2b98be0…，删 0.3.6 旧包）。热重载即生效。
- **方法论**：「挪宿主布局」的可行性关键在三点——①margin 目标必须是 React 不管理 style 的容器（inline style 幸存率高，且 tick 补写兜底）；②效果必须可观测（geom 上报让 spacer 是否 reflow 一眼可见）；③卸载必须还原（不留残迹）。做到这三点，改宿主布局的维护成本可控。
- **收口（用户实测成功）**：条独占输入框下方一行、不遮任何内容。分布格局定型：⚡速度/首字/E2E/本轮/会话 = 渲染层内存记录（解码窗口径，与胶囊/弹窗一致）；今日 token = listTurns。节点 22 已完成。

## 2026-10-15 · 状态条 ⚡ 口径对齐：单次调用 → 整轮池化（pi-statusbar v0.4.1）
- **症状**（用户截图）：弹窗 222 tokens/s、输入框胶囊 222 t/s、状态条 ⚡163 tok/s，三处不一致。
- **定位（落盘会话逐条复算，非推测）**：公式四处**完全相同**（Σ生成token ÷ Σ(时长−首字)，解码窗≥250ms，无首字不计），差的是**统计范围**：
  - 状态条 ⚡163 = `latestStats()` 的**最近一次模型调用**（416 tok / 10.427s / 首字 7.874s → 162.9 t/s，与该条上的「首字 7.9s / E2E 10.4s」逐一对上；证据 = session `3f0c9f47…jsonl` 第 1257 行）；
  - 弹窗 222 = 宿主自己的「本轮合计」区块聚合（同文件后缀表 k=10 池化 = 221.5 ≈ 222）；
  - 胶囊 pi-speed-meter = 设计上就镜像弹窗那一套集合；
  - 状态条 ▤本轮 / ◧会话 本来就是池化（该时刻 222 / 149）。
- **决策**：状态条主数字 ⚡ 改为**本轮池化**（`turnStats().decodeTps`）——与胶囊 / 弹窗 / pi-throughput 面板四处一致；单次调用速率只留在悬停提示（同一轮实测 160~420 tok/s，波动太大，不适合作主数字）。▤本轮 段去掉重复的 t/s，只留 token 合计。
- **顺带修复**：`pi-statusbar/renderer.js` 缺 `SCAN_MS` 常量（胶囊里有 3000）→ 偶数 tick 抛 ReferenceError、状态条实际每 3s 才刷新一次、日志常驻 pollError；补 `const SCAN_MS = 3000;`。
- **可复核证据**：`report` 调用新增 `bar:{headline,turnCalls,turnGen,turnTps,latestTps,sessionGen,sessionTps}` 快照 → `logs\app\plugin.log` 的 `[pi-statusbar] geom:` 行里直接可读。
- **验证**：`node --check` OK；PluginCheck/PluginPack 过；保存即热重载（`development.plugin.reloaded` + 首条 report 无 lastError，实测 headline=175 tok/s、turnTps=175、latestTps=244、sessionTps=160）。
- **回滚**：备份 `%PI_SCRATCH_DIR%\pi-statusbar-renderer.v0.4.0.bak.js`（25275 字节，与 v0.4.0 逐字节同）。
- **方法沉淀**：判断「几处数字不一致」先分两问——①公式是否同构 ②统计范围是否同集合；同一轮内单次调用速率与池化速率天然差 30%+，拿单次比池化必然对不上。
- **v0.5.1 生成中实时速率**（10-16，用户拍板「加实时」）：流式期 ⚡ 切实时——优先 usage 增量（精确），兜底转录区 DOM 文本增量÷2.8（≈ 估算，悬浮披露口径）；本轮结束回落整轮池化。实测本渠道（mindnest 中转）**在飞调用不以记录形式进 React 树**（geom `flightGen` 恒 null、usage 结束时一次性落地），故实时实际走 DOM 通路；流式调用去重改单槽位 `live|atMs`（部分快照互相替换，不再堆进轮合计）；成本：转录区 textContent 长度每 1.5s 采样 + 流式期强制每 tick 重扫（LIVE_HOLD_MS 15s）；诊断加 `tNode` 字段。
- **v0.5.2+v0.5.3 窄窗自适应与转录区修正**（10-16，用户报窄窗段落裁切成乱码）：①状态条永不换行，宽度不足按 `e2e→today→session→turn→ttft` 顺序收段（⚡ 永留），逐段 `scrollWidth>clientWidth+1` 判定，段宽 `flex:1 1 0`→`1 1 auto`（按内容占比），geom 加 `dropped` 字段可直接观测；②实时采样的「转录区节点」原按「产出记录最多的 fiber」挑——结果选中 composer 独立根的 state 持有者（手里有全会话数据、DOM 只有 ~55 字符的输入框壳，geom `domLen:55` 实证），改按候选中 `textContent` 最大且 ≥400 字符才认（否则沿用上一个存活节点）；修后 `domLen:421k` 且随流式增长。
- **v0.6.0 设置齿轮（对齐 ZCode 形态）**（10-16，用户指出缺字段显隐开关）：条最右侧 ⚙ 段（gearbtn，永不参与窄窗收段）点开上拉面板，6 字段勾选即时生效；选择存 `localStorage["pi-statusbar.hiddenFields.v1"]`（渲染层同源，无需新权限，读写均 try/catch 兜底）；被隐藏字段 `display:none`，不参与 fitSegments 收段判定（两层独立：用户偏好 + 窄窗自适应）；面板 body 级 fixed，随 frame() 150ms 跟随条位置，点外部/Esc 关闭；geom 加 `hidden` 字段。
- **v0.6.1+v0.6.2 ◈ 思考（估算）段**（10-16，用户问「思考时间是哪个」→ 选快速估算方案）：时长 ≈ reasoningTokens ÷ 解码速度（悬浮披露口径与±误差；v0.6.2 修正：不再要求 rea>out——实测渠道一次调用 rea=684<out=811 也明确报了思考数，rea>out 只该管速度分子）；recordFrom 增存原始 `out/rea`；turnStats 累计 `thinkRea`（进解码窗的思考 token），tooltip 附「本轮思考合计」；⚙ 面板同步加开关（FIELDS think）；收段顺序 e2e→**think**→today…；geom 加 `latestThinkSec/latestOut/latestRea` 实证出数（0.38s=97÷254）。
- **v0.7.0 贴图闪烁修复**（10-16，用户报贴图时状态条闪一下）：根因=输入框卡片 React 托管，重渲染会清掉内联 spacer margin 或整体重建卡片节点，旧方案 150ms tick 补写前布局跳一帧（贴图必触发）；修=①MutationObserver 盯卡片 style/class，同一次提交内同步补写 spacer（微任务时机、先于绘制，回调内补写自身触发的 mutation 有幂等守卫）；②findComposer 找不到输入框时保留原位置 600ms（COMPOSER_GRACE_MS）再隐藏；onUnload 断开 observer。另：日志实证 gen-est 正常触发（≈287/257 tok/s source:dom、思考段 1.98s 出数）；截图中的「⚡ …」=gen-wait（工具执行/等首字期无 token 增量），属设计行为非 bug。
- **v0.8.0 状态动效（animate skill 流程）**（10-16，用户报「实时估算触发像 bug」）：根因=状态/数值文本硬切 + 每次渲染整体重建 DOM（任何过渡都无法存活）。改=①段元素持久化（segEls Map + sync 原地更新、insertBefore 校正顺序），②「…」→ 三点呼吸动画（共享单例元素防 stagger 重启），③数值变化 WAAPI 150ms 上滑淡入 tick（仅文本变化时触发，闲置零动效），④实时态 ⚡ 图标 1.6s 呼吸 + b 颜色 160ms 过渡（绿↔蓝不瞬变），⑤tabular-nums 防数字抖宽。素材：仅 transform/opacity；ease-out=cubic-bezier(0.23,1,0.32,1)（扩展宿主 --motion-ease-out token）；全部 ≤150ms；prefers-reduced-motion 降级（CSS media + matchMedia 门 WAAPI；此上下文 rAF 不触发故不用）。教训：CSS 模板串 `#${BAR_ID}` 三次漏 `#`（一次连带删掉收尾 `}`/反引号），读回整块重写修复。
- **v0.8.1 SVG 图标 + 尺寸升级**（10-16，用户要求图标字体大一点、弃 emoji）：自绘 Feather 风格描边 SVG（24 viewBox→14px、stroke=currentColor 自动继承 live 蓝/speed 绿/warn 黄，speed 闪电用 fill），映射 speed/ttft/e2e/think/turn/session/today/gear；字号 11→12px、条高 22→26px、SPACER_PX 26→30、底部限位 -24→-30（geom 卡片底 900→896 印证）；kindOf 从 emoji 文本前缀改 `dataset.k`（buildSegEl 已写 dataset.k，SVG 化后文本前缀失效）。
- **pi-statusbar 上云**（10-16，用户要在其他设备安装）：v0.8.1 全套（源码+README+dist 三个 piplug 含 0.8.1 sha256 148bb802…）提交 `56ce061` 推 yuki-czf/dsh-base main（走 7892 代理成功）；安装路径=新设备 clone 后「开发目录加载 + 插件页显式授权」（.piplug 安装器拒收问题未解，README「其他设备安装」节已写明流程与补丁依赖）；dist 混入 0.4.0/0.4.1 两个旧包（无害历史备份）。
- **v0.9.0 思考秒表**（10-16，用户发现思考段只在调用完成后刷新、选 DOM 秒表方案）：①thinkProbe 侦察（geom `thinkProbe` 字段）实证宿主思考块=`div.tool-row.thinking`（136 个历史块、len 1.7k~14.9k）；②liveState 每 tick 盯最后一个 thinking 块长度：增长>8 字符→秒表激活（startAt=恢复增长时刻）、停增 8s→定格失效（markdown 抖动不断表）、len=-1 首采样只播种防误激活；③渲染层 `◈ 思考中 Ns`（think live，蓝+呼吸）优先于完成估算 `◈ 思考 Ns`，调用完成自动交接；④geom 加 `thinkLive`；阳性样本待用户下一条消息现场验证（采样窗口错开本人流式）。
- **v0.9.1 回归修复（空条事故）**（10-16，用户报条完全空白）：根因=插思考秒表块时把锚点行 `const flight = newestInFlight();` 整行**替换**而非前置插入（`PUT 752.=752` 误用），声明丢失 → `live.flightGen = flight...` ReferenceError → liveState 每次抛错 → render 永不执行 → 条清空后无内容；`node --check` 查不出未定义变量（运行时错），**geom `lastError:"flight is not defined"` 一次定位**，补回一行声明即愈（0.9.1）。教训：①行号编辑「插入 vs 替换」锚点选错是本插件第三次同类伤（前两次漏 `#`），后续对锚点行的增删必须读回核验 ②「语法 OK」不等于「运行 OK」，几何报告的 lastError 才是运行时金标准。

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

