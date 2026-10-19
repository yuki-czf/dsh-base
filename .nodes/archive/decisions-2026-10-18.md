# Archived Decisions (2026-10-18)

> Trimmed from DECISIONS.md (kept latest 20 entries).

## [2026-10-12] 节点20 补丁 v2：生成速度算法与 DSH Desktop TPS 完全对齐（分子含推理 token）

- **需求**：用户要求 PI-Desktop 弹窗的「生成速度」与 DSH Desktop 的输出速度（TPS）同一算法。
- **DSH 原始算法**（本机提取 `E:\Program Files\DSH Desktop\resources\app\node_modules\@deepseek-ai\dsh-client-ui-chat\lib\client.js`）：每助手 step 取 `ttftMs = firstTokenTime − stepStartTime`、`decodeMs = completedTime − firstTokenTime`、`outputTokens = usage.outputTokens`；汇总 `TPS = ΣoutputTokens / (ΣdecodeMs/1000)`，`decodeMs>0` 才显示。**DSH 的分子恒含推理**——其 usage 归一化直接拒绝 `reasoningTokens > outputTokens` 的数据（DeepSeek 语义：推理算在输出内，reasoningTokens 只是子集口径，UI 展示为「输出 N（其中推理 x）」）。
- **v2 改动**（仅渲染器 `bs()`，runtime 无需再动；`patch.mjs` 支持 v1→v2 原位升级，v2 标记 `rt>ot`）：分子从 `usage.outputTokens` 改为——推理已含在 outputTokens 内（`reasoningTokens ≤ outputTokens`）时用 `outputTokens`（与 DSH 全同）；推理单报（`reasoningTokens > outputTokens`，如 mindnest 中转的 Gemini：23+217）时取两者之和。分母不变（Σ(responseDurationMs−TTFT)）。
- **预期效果**：用户上次实测那条（整包投递，TTFT=0）将从 4 tok/s 变为 ≈240÷5.78≈41 tok/s；真流式渠道则同时受益于分母扣除 TTFT。弹窗里「输出/推理」的展示口径不动（那是 usage 展示，不是速度分子）。
- **验证**：`node verify.mjs` VERIFY OK——staged v2 各项 PASS、staged↔live 逐条目仍只 1 个 chunk 不同、补丁 chunk 过 ESM 解析；live 在换入前如实报 INFO(v1)。app.asar.new 已暂存，watcher（pid 37864，`finish-when-closed.ps1 -Launch`）待用户退出应用后自动换入并重启。
- **踩坑**：① 行号定位的编辑连续两轮打错位置（README 切坏、verify 检查行放错）——大段改动必须先 Read 确认目标行再动手，改完立即读回；② verify 的 v2 检查对「live 还是 v1」的过渡态要报 INFO 而非 FAIL，否则换入前永远红。

## [2026-10-12] 节点20 补丁 v3：面板「生成速度」逐条对齐网关真速度报告（speed_report §3）

- **需求**：用户要求「面板的生成速度 = 我一开头发的那份报告的 TPS 算法」，并选「补上工具调用回复的 TTFT 捕获」；天津侧 `speed_report.py` 本会话不做。
- **三条落地**：①TTFT 记在任意内容首个 delta（文本/思考/**工具调用参数**/hostedSearch）——v2 只看文本/思考，纯工具调用回复无 TTFT（实测 47 条 assistant 里 12 条，例 108 tok/3.9s≈28 t/s）②无 TTFT 的消息整条跳过（报告 base 要求 `ttft_ms>0`；v2 是退回整窗）③解码窗 <250ms 两侧都不计（报告的守卫）。
- **分子口径**：报告的 `gen=output_tokens+reasoning_tokens` 源于其库中两者**分立**；PI 的 `outputTokens` 由适配器归一（`google-generative-ai` 适配器 `output=candidates+thoughts`、OpenAI 兼容 `completion_tokens` 内含 reasoning detail），而中转渠道实测 `out=46/rea=253`（数学上只能分立）。故取 `ot+(rt>ot?rt:0)`——两种口径下都等于报告的数，恒相加会重复计数。
- **实测**：本会话 82 条 assistant：v2 规则 136.7 t/s → v3 规则 150.5 t/s（21 条无 TTFT 不再稀释）。
- **验证**：`apply --dry-run` 锚点 OK；`node verify.mjs` → VERIFY OK（staged v3 各项 PASS；staged↔live 570 条仅 1 chunk 不同）。runtime 已就地升级，`app.asar.new` 已暂存，watcher pid 37388（`finish-when-closed.ps1 -Launch`）。
- **踩坑**：①新增补丁锚点必须**逐字符**从活体代码复制（我按记忆写成 `==="number"`、活体是 `=="number"` → 锚点 0 命中；dry-run 拦住，未写任何文件）②PS `Start-Process -ArgumentList` 传带空格路径必须显式加引号，否则 watcher 起不来（改用 `cmd /c` + 引号）③按命令行过滤进程会把**自己这条命令**也匹配进去，别把自匹配当成 watcher。
