# 节点归档：pi-statusbar 底部速度状态条

- **周期**：2026-10-14 → 2026-10-15（形态试错 → v0.4.0 spacer 版用户实测成功 → v0.4.1 口径对齐收口；10-16 补记归档）
- **验收结果**（对照 PROGRESS 行 22 ①~⑧）：
  - ① 六段状态条——✅ `⚡ {tps} tok/s | ◷首字 | ⋮E2E | ▤本轮 tok·t/s | ◧会话 tok·t/s | ⊛今日 tok`，悬停 tooltip，无 TTFT 显黄 ⚡--（不编数）
  - ② 口径=自有解码窗——✅ Σ生成token ÷ Σ(时长−首字)，首字>0、窗 ≥250ms（MIN_WINDOW_MS）才计入、无首字不稀释均值；分子 `outputTokens + max(0, reasoningTokens−outputTokens)`（DeepSeek 系 output 已含推理不重加，单报推理渠道相加）——与 v3 补丁/胶囊/弹窗/pi-throughput 四处同构
  - ③ 数据源=渲染层 React 树——✅ 探针定案：`usage.listTurns` 行键无 TTFT（`hasFirstTokenMs:false`、`usageKeys:[]`），速度只取内存消息记录（借 pi-speed-meter 采集器：fiber 全根枚举+有界 DFS+内容签名去重+轮界三级回退）；listTurns 仅作「今日 token」
  - ④ 无 TTFT 黄警——✅ ⚡-- 黄色，不静默降级
  - ⑤ PluginCheck 过——✅（仅 renderer.extension 高危提醒；权限扩宽经用户插件页显式重载确认生效）
  - ⑥ README 口径说明——✅（数据通路/窗口定义/排障三柱）
  - ⑦ 定位——✅ body 级 fixed + 合成矩形（水平=输入框自身左右界、垂直=第一个底边低于输入框的祖先的底边）+ 150ms setInterval + spacer 26px（输入框卡片 marginBottom 腾出专属行）；geom 实测 input(384,794,1462,861)/card 底 901、条独占 905-927 一行，不遮输入框/TODO/工具条；用户目视确认「成功了」
  - ⑧ v0.4.1 ⚡ 主数字=整轮池化——✅ turnStats().decodeTps 与胶囊/弹窗/面板同集合（同轮实测 175=175；单次速率 160~244 波动大只进 tooltip）；顺手修 `SCAN_MS` 未定义（曾致做数 tick 抛 ReferenceError、条实际 3s 才刷一次、日志常驻 pollError）
- **改动了什么**（全部在 `E:\www\dsh-base\pi-statusbar\`，dev 目录加载于 `~/.pi-desktop/plugins/registry.json`，保存即热重载）：
  - `manifest.json`（v0.4.1：renderer + rendererActions:["plugin.call"] + rendererCallMethods:[statusbar,report] + permissions renderer.extension/usage.read）
  - `renderer.js`（状态条 UI + fiber 采集 + 池化口径 + 合成矩形定位 + spacer 补写 + 150ms tick + tooltip；v0.4.0 备份 5275B 在会话 scratch）
  - `main.js`（onRendererCall 服务渲染层、usage.listTurns 今日 token；console.log 透传 geom/contract 到 `logs\app\plugin.log`）
  - `README.md`（口径与排障说明）；`dist\local.pi-statusbar-0.4.0.piplug`（40404B sha256 a2b98be0…）与 `dist\local.pi-statusbar-0.4.1.piplug`（42758B sha256 55b52e2f…）
- **踩坑记录**：
  1. **composerControl 等官方槽都在输入框内部**，满足不了「输入框元素正下方」→ body 级 fixed overlay（ZCode 同形态），但走 PI-Desktop 正门插件通道，不做 asar 注入。
  2. **main.js 里别定义全局 `pi`**——会遮蔽宿主注入的 `pi`，插件整体致瘫（v0.2.0 修）。
  3. **rAF 在插件渲染上下文不触发**（v0.3.5 定案）→ 一律 150ms setInterval。
  4. **position:fixed 锚点自身 0×0**：getBoundingClientRect 坐标随滚动漂移且被 flex 容器压缩 → 弃真实锚点，改合成矩形；祖先判定=「第一个底边低于输入框的祖先」（v0.3.1 公共祖先方案曾误配容器）。
  5. **状态条永不浮到输入框上方**——「空间不足浮上方」的回退正是盖住 TODO 面板的根因（v0.3.6 删）；空间不足贴窗口底边 `min(card底+4, innerHeight−24)`。
  6. **spacer 会被 React 清样式**（状态类重渲染重置 style）→ tick 每 150ms 检查补写 marginBottom:26px，onUnload 还原；升级后布局失效自动退化贴底，聊天功能永不受影响。
  7. **渲染层常量漏定义（SCAN_MS）不报编译错**——运行时才 ReferenceError，且症状隐蔽（条 3s 才刷、pollError 刷日志）；改完必须热重载看 report.lastError。
  8. **「几处数字不一致」先分两问**：①公式是否同构 ②统计范围是否同集合——同轮内单次速率与池化速率天然差 30%+（163 vs 222），拿单次比池化必然对不上。
  9. **权限扩宽（renderer.extension）热重载不批**——必须用户在插件页显式重载确认一次。
  10. **行号编辑纪律**：编辑前 Read 定位、改完读回（沿用节点 21 教训）。
- **执行效率复盘**：预估一次会话，实际跨 10-14~10-15 两个工作日；最大浪费点=**定位方案三连翻车**（v0.3.1 公共祖先 → v0.3.2/0.3.3 fixed 锚点 → v0.3.4，直至 v0.3.5 用 geom 日志实测坐标才定案）与 **rAF 假设**。可复用结论=**播放式 UI 锚点三原则**：①锚点不能是 position:fixed 元素 ②用文档流布局中性元素（spacer）占位 ③定位失效必须可观测（geom 日志 stage/坐标）且可回退（贴底模式）。
- **遗留**：
  - 微调（间距/字号/显示哪些段/SPACER_PX）都是 `renderer.js` 一行改动，保存即热重载。
  - PI-Desktop 大版本升级后看 `[pi-statusbar] geom:` 是否仍 `stage:"ok"`；spacer 失效自动退化贴底（可接受态）。
  - dist 产物可作安装备份；dev 目录加载已是活路径。
- **给下个节点的衔接说明**：
  - 数据形状（渲染层采集的助手记录）与 pi-speed-meter 完全同源：`{ id, role:"assistant", createdAt, modelId, providerId, responseDurationMs, usage:{ firstTokenMs, outputTokens, reasoningTokens, … } }`。
  - 口径函数：`turnStats().decodeTps`（整轮池化，⚡ 主数字）、`latestStats()`（单次，tooltip）、`sessionStats()`（全会话）；`report` 调用回传 `bar:{headline,turnCalls,turnGen,turnTps,latestTps,sessionGen,sessionTps}` 快照。
  - 排障三柱：`logs\app\plugin.log` 的 `[pi-statusbar] contract:`（数据契约）/ `[pi-statusbar] geom:`（定位坐标与阶段）/ lastError，30s 周期上报。
  - 关键常量：SPACER_PX=26、条高 22px、位置 tick 150ms、扫描 SCAN_MS=3000、MIN_WINDOW_MS=250。
  - 宿主契约：body 级 overlay 需权限 renderer.extension；渲染层→main 走 `plugin.dispatch("plugin.call",{method,args})`。
