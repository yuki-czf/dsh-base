# 节点归档：pi-speed 插件：输入框 TPS 胶囊

- **周期**：2026-10-13（单日闭环，跨 0.19.1 宿主契约侦察 → 数据通路过 0.0% 对表 → 目视验收）
- **验收结果**（对照 PROGRESS 行 21 六条）：
  - ① 输入框左侧出现 TPS 胶囊（`composerControl` + `positions:["left"]`）——✅ 用户目视确认（绿点 + 数字）
  - ② 数字=报告口径且与 session JSONL 独立复算一致——✅ 实测同日 `calls=3 · gen=2135 · decodeMs=10394 · 205 t/s` vs JSONL `used=3 · gen=2135 · decode=10394 · 205.41 t/s`，生成量/解码窗偏差 **0.0%**（同刻截断对表，工具 `scratch/compare-chip.mjs`）
  - ③ 数据面——⚠️ 口径已如实修订：不落盘、不联网、不读数据库文件；逐次调用记录取自宿主**已渲染**的内存 React 状态（官方 API 拿不到逐次 TTFT，见「踩坑记录」第 1 条）
  - ④ TTFT 缺失时黄点明示而非静默降级——✅ 逻辑就位（`missing-ttft` 分支 + 悬停给重打补丁步骤）；未做「卸掉补丁」的端到端实测（代价=重打/回滚补丁+重启宿主）
  - ⑤ 打包 `.piplug`——⚠️ 部分达成：官方 `PluginPack` 通过并产出 `dist/local.pi-speed-meter-0.3.0.piplug`（43774B/sha256 38b9a722…），但**安装器拒收**（`PLUGIN_INVALID: manifest.json missing`，与宿主打包器逐字节同构仍被拒）；现用**目录加载**（`E:\www\dsh-base\pi-speed-meter`）验证通过
  - ⑥ 升级 PI-Desktop 不覆盖——✅ 显示层是插件（装在 `~/.pi-desktop/plugins` 或目录注册，升级 `resources/` 不动它）；⚠️ TTFT 仍由 sidecar 补丁产生，升级后需按 `pi-desktop-speed-patch/README.md` 重打
- **改动了什么**：
  - `pi-speed-meter/manifest.json`（v0.3.0，权限收窄为 `renderer.extension` + `usage.read`，白名单动作 `plugin.call`，方法 `getSnapshot/probe/reportProps`）
  - `pi-speed-meter/renderer.js`（≈540 行：`composerControl` 胶囊 + 有界 fiber 遍历采集 + 池化计算 + 悬停明细 + 点击诊断）
  - `pi-speed-meter/main.js`（≈180 行：官方 `usage.listTurns` 对照行、两个命令、`onRendererCall` 服务渲染器）
  - `pi-speed-meter/README.md`（数据通路/窗口定义/验证方法/排查顺序）
  - `pi-speed-meter/dist/local.pi-speed-meter-0.3.0.piplug`
- **踩坑记录**：
  1. **官方 API 拿不到逐次 TTFT**：`session.listMessages` 在 0.19.1 对用户会话返回 `NOT_FOUND`（`session.read.own` 只覆盖插件自建会话）；`session.getLlmContext` 需 `session.read` 且仅工具执行期可用。→ 渲染器扩展改读宿主已渲染的消息记录（其 props/hook 状态里同时带 `responseDurationMs`、`responseFirstTokenMs`、`usage.*`）。
  2. **别从 `.message-meta` 找数据**：那是工作面板/预览转录的组件（`wr`，只有派生 usage），轮次数字与主会话对不上。正确姿势=从**胶囊自己的 DOM 节点**取 fiber 再上溯到 app 根。
  3. **宿主日志单条被截断 ≈1.3KB**：大 payload 会被 `[truncated N chars]` 切掉 → 诊断改成「一条一事实」的小报告。
  4. **目录插件热重载最长约 105 秒**（实测 reload 间隔 ~105s），按秒级等会误判「没生效」；改完必须 `node --check`（把 `renderer.js` 复制成 `.mjs` 再查 ESM）。
  5. **store 会被「每秒一条 user 角色记录」灌满**（工具/流式行的 `role:"user"`），既挤掉真记录又在时间轴上造出空洞 → 只保留 `assistant` 行 + 容量 800。
  6. **按 id 去重不够**：同一调用可能以不同 id 出现两次 → 改按内容签名 `role|atMs|durationMs|ttftMs|gen` 去重。
  7. **本仓库 Edit 的行号替换极易多留/漏行**（本次两次：重复 `const queue`、丢失 `if (...)` 守卫），每次改完立刻 `node --check` 并回读区段。
  8. **日志采样节流**：主进程侧日志要有 `LOG_INTERVAL_MS`，否则渲染器轮询会把日志刷爆（曾每 3 秒 6 条 PERMISSION_DENIED）。
- **执行效率复盘**：预估半天，实际约 6 小时（含 0.19.1 契约侦察与 4 轮数据通路试错）。最大浪费点=**先假设了官方 API 路径**（写了两版 main.js 的会话读取器）与**从 `.message-meta` 猜数据源**；可复用结论：**宿主插件要取「宿主自己渲染中的真值」，先花 10 分钟用一次性的 fiber 树扫描把数据位置问清楚，再写正式通路**——本次最后 20 分钟是靠「逐条小报告诊断」定案的。
- **遗留**：
  - `.piplug` 安装器拒收（`PLUGIN_INVALID: manifest.json missing`）——未定位，暂以目录加载兜底；若要分发需再查 installer 的读法（候选：zip 根是否有额外条目/名字编码）。
  - 「最近一轮」窗口=相邻调用间隔 ≤180s；断档即重开一轮。数字对停顿时敏感（181s 刚好跨过阈值会只算 1 次调用），可按体感调 `BURST_GAP_MS`。
  - 虚拟滚动 → 只覆盖已挂载消息；滚走的老消息不在内存里（正合「最近一轮」语义）。
  - 点击胶囊会写一条 `reason:"diag"` 日志（排障用，保留）。
- **给下个节点的衔接说明**：
  - 数据形状（渲染器侧采集到的助手记录）：`{ id, role:"assistant", createdAt(ISO), modelId, providerId, responseDurationMs, responseFirstTokenMs, usage:{ firstTokenMs, outputTokens, reasoningTokens, cacheReadTokens, inputTokens, totalTokens, operationId, … } }`
  - 口径函数：`pooledSpeed()`（renderer.js）＝ `Σgen ÷ Σ(durationMs − ttftMs) × 1000`，`ttftMs>0`、窗口 `≥250ms`，跳过计数回传悬停。
  - 宿主契约：槽位 `composerControl`（`positions:["left"]`）；manifest 需 `renderer` + `rendererActions:["plugin.call"]` + `rendererCallMethods` + 权限 `renderer.extension`；渲染器模块导出 `onLoad(pi)`。
  - 验证脚本：`scratch/compare-chip.mjs`（读宿主日志最新 diag → 同刻截断 session JSONL 复算 → 打差异）。
