# PI Statusbar（PI 底部速度状态条）

> v0.2.1 修复：main.js 曾用 `let pi = null` 遮蔽宿主注入的全局 `pi` 导致 onLoad 崩溃（插件加载失败的真凶）；
> 权限从 ui.panel 扩到 renderer.extension+usage.read 后，**必须到 插件页 对本插件显式重载一次**（热重载不批扩权）。
> v0.4.1 修复：①⚡ 主数字改为**整轮池化**（此前是「最近一次调用」的瞬时速率，所以和胶囊/弹窗的 222 对不上号）；
> ②补上被漏掉的 `SCAN_MS` 常量（此前偶数 tick 直接抛 `ReferenceError`，状态条实际上每 3 秒才刷新一次，且日志里一直带着 pollError）。
> v0.5.0 新增：**生成中实时速率**——流式期间 ⚡ 切换为会跳动的实时数字（渠道流式给 usage 时为精确增量；否则按流式消息 DOM 文本增量 ÷2.8 估算，显示 `≈N tok/s`）；本轮结束回落整轮池化口径。
> v0.5.0 同时修复：流式中的调用此前按内容签名去重，多个部分快照会被当成多次调用堆进轮次合计；现改为按创建时刻的单槽位（`live|atMs`），完成版落地后即被替换。
> v0.5.2 修复：窗口变窄/改分辨率时段落被裁成乱码——状态条不换行，改为按「E2E → 今日 → 会话 → 本轮 → 首字」顺序自动收起低价值段（⚡ 永远保留），段宽从均分改为按内容占比分配。
> v0.6.0 新增：**设置齿轮**——条最右侧 ⚙ 点开字段显隐面板（生成速度/首字/E2E/本轮/会话/今日），勾选即时生效并存 localStorage（重启保留）；被关掉的字段不参与窄窗收段判定。
> v0.6.1 新增：**◈ 思考（估算）**段——最近一次调用「吐思考」的时长 ≈ 思考token数 ÷ 解码速度（假设思考与正文同速，±误差大，悬浮有口径；渠道上报 reasoningTokens 即可显示，当前 glm/mindnest 渠道实测有报）；⚙ 面板可开关；收段顺序里排在 E2E 之后。v0.6.2 修正：时长估算不再要求 reasoningTokens > outputTokens（那个条件只该管速度分子，实测你渠道有 684 思考 token 的调用因 rea<out 被误挡）。
> v0.7.0 修复：贴图/输入框重排时状态条闪烁——①spacer 改用 MutationObserver 在 React 清样式的同一次提交内同步补写（不再等 150ms tick，布局不跳）；②输入框短暂找不到时保留原位置 600ms 再隐藏（贴图瞬间的 DOM 重建不再让条闪没）。
> v0.8.0 动效：状态切换不再硬切——「…」改**三点呼吸动画**（通用的"工作中"语言）、实时数值变化做 150ms 上滑淡入 tick、⚡ 实时态图标轻微呼吸、字段颜色 160ms 过渡（绿↔蓝不瞬变）；段元素改**持久化原地更新**（过渡能生效的前提）；全部 ≤150ms、仅 transform/opacity、`prefers-reduced-motion` 自动降级。
> v0.9.0 新增：**◈ 思考中 Ns 秒表**（流式实时）——侦察确认宿主思考块 = `div.tool-row.thinking`；每个 tick 盯最后一个思考块：在增长 → 秒表递增（蓝色呼吸），停增 8s 定格，调用完成后切换为「推理token÷速度」估算；找不到思考块自动退回旧估算。诊断加 `thinkLive` 字段。
> v0.8.1 视觉：emoji 图标全部换**自绘 Feather 风格 SVG**（14px 描边、`currentColor` 自动继承速度绿/实时蓝/警示黄：⚡闪电/◷时钟/⋮双向箭头/◈星芒/▤气泡/◧数据库/⊛日历/⚙齿轮）；字号 11→12px、条高 22→26px（spacer 26→30、底部限位同步）；`kindOf` 段识别从 emoji 文本前缀切到 `dataset.k`（SVG 化的前提）。

PI-Desktop 插件：在**输入框元素的正下方**（输入框外部，随窗口/滚动逐帧跟随）常驻一条 ZCode Token-Usage-Statusbar 风格的状态条：

- **数据源**：速度/首字/本轮/会话 = 渲染层直接读宿主已渲染的内存消息记录（React 树有界遍历，记录含 `responseDurationMs` 与 `usage.firstTokenMs`——后者来自本地 runtime 补丁）；「今日」token 合计 = 宿主只读接口 `pi.usage.listTurns`（该接口无首字时刻，故今日仅显示 token 不显示速度）。
- v0.3.0 起速度不再依赖 listTurns（其契约无 firstTokenMs，实测探针 `hasFirstTokenMs:false`）。

```
⚡ 222 tok/s · ◷ 首字 7.9s · ⋮ E2E 10.4s · ▤ 本轮 1.2k tok · ◧ 会话 117k tok · ⊛ 今日 923k tok
```

与输入框胶囊（pi-speed-meter）、用量弹窗补丁、pi-throughput 面板**同一口径**。

## 口径（= DSH Desktop / ZCode 同构）

```
tok/s   = Σ generatedTokens ÷ (Σ decodeMs / 1000)     （解码窗 ≥250ms 才计入）
decodeMs        = 响应时长 − firstTokenMs              （宿主记录了首字时刻时）
generatedTokens = outputTokens（推理单报的渠道：outputTokens + reasoningTokens）
```

- 推理 token 算生成——模型真实吐出的字，只是某些渠道不把过程流给你看；
- 等首字的时间不算——那时模型还没开始吐字；
- 没有首字时刻的调用**不进速度均值**（整轮时长会混入等待，稀释真实速率），token 照常计入合计；
- 无 TTFT 时速度显示 `⚡ --`（黄色警示），不编造数字。
- **⚡ 主数字 = 本轮池化**（最新提问之后的所有模型调用合并计算）——与胶囊 / 弹窗 / 面板同口径；单次调用的瞬时速率波动大（同一轮实测 160~420 tok/s），只放进悬停提示。
- **生成中**：⚡ 显示实时速率——usage 流式增量=精确值；`≈N tok/s`=按流式消息文本增量÷2.8 的估算（悬浮有说明）；工具执行/等首字时显示 `…`；本轮完成后回落整轮池化。

与 ZCode 插件的差异：它数据来自本地 SQLite，首字时刻=可见首字，所以含思考的请求要把窗口前移到 started_at；
我们 runtime 补丁记录的首字=任意内容首个 delta（含思考），单条公式即覆盖，无需分支。

## 数据与隐私

- 数据只来自宿主只读接口 `pi.usage.listTurns`（权限 `usage.read`），计数器与标识符；
- 不读消息正文、不联网、不落盘；快照在插件进程内缓存 1 秒，状态条每 1.5 秒拉取一次。

## 安装

开发目录加载：PI-Desktop **设置 → 插件** 选择本目录（`E:\www\dsh-base\pi-statusbar`），保持启用。
`dist\local.pi-statusbar-<版本>.piplug` 为打包产物（用 tools\pack.ps1 或 PluginPack 生成）。

### 其他设备安装（云端 = 本仓库）

1. 新设备 `git clone https://github.com/yuki-czf/dsh-base.git`（已有克隆则 `git pull`）；
2. PI-Desktop **设置 → 插件 → 开发目录** 加载 `<仓库>\pi-statusbar`，保持启用；
3. 首次加载需在插件页**显式授权** `renderer.extension` 高危权限（热重载不批权）；
4. ⚠️ **依赖**：⚡ 速度 / ◷ 首字 / ◈ 思考 依赖本机 PI-Desktop 补丁（`pi-desktop-speed-patch/`，升级后按其 README 重打）；无补丁时这些字段不显示（⚡ 显 `--` 黄警），本轮/会话/今日 token 计数不受影响；
5. `dist\local.pi-statusbar-<版本>.piplug` 为打包备份（sha256 见 DECISIONS；宿主安装器暂拒收 .piplug，`PLUGIN_INVALID` 待查，故统一走目录加载）；字段显隐偏好存浏览器 localStorage，不随仓库同步。

## 文件

| 文件 | 作用 |
|---|---|
| `main.js` | 宿主侧：读 `usage.listTurns`，按口径计算快照，应答渲染层 `statusbar` 调用（1s 缓存） |
| `renderer.js` | 渲染层：body 级 fixed 细条（输入框元素正下方，150ms 定位 + 26px spacer 腾出独占行）；数字来自渲染层 fiber 遍历到的宿主内存消息记录；1.5s 轮询，悬停显示明细 |
