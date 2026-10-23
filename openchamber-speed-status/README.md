# openchamber-speed-status

OpenChamber 扩展：显示模型真实生成速度（tok/s）、首字延迟（TTFT）和 token 用量。
数据**全部读自本地 OpenCode 数据库**（`~/.local/share/opencode/opencode.db`，只读），
不订阅事件流、不做字符估算；生成中的那一轮显示已落库段落的真实值并标「生成中」。

## 口径（照 zcode-token-usage-statusbar）

- 一轮 = 会话内最后一条 user 消息之后的所有 assistant 消息（每条 = 一次模型请求）
- TTFT = min(text/reasoning part.time.start) − message.time.created
- 纯生成时长 Σ = Σ(part.time.end − part.time.start)，工具等待天然剔除
- t/s = (output + reasoning tokens) ÷ 纯生成时长（opencode 的 output 不含 reasoning）
- 缓存命中率 = cacheRead ÷ (input + cacheRead + cacheWrite)

## 结构

```
package.json          manifest: panel + statusSection(72px) + service
service/main.js       host service：node:sqlite 只读 + loopback HTTP（/health /stats）
service/db.mjs        只读查询（全部走 session_id / message_id 索引）
shared/stats.mjs      纯函数聚合（可单测）
shared/format.mjs     格式化（万/亿、着色阈值）
status/               Work Status 一行（方案 A）
panel/                右栏面板（方案 B）：大数字 + 曲线 + 按模型明细
scripts/build.mjs     esbuild 打 IIFE（产物 main.js 提交进仓库）
scripts/selftest.mjs  对真实库跑数据层断言
```

## 开发

```bash
npm install
npm run build      # 生成 status/main.js、panel/main.js
npm run selftest   # 数据层断言（需本机有 opencode.db）
```

## 安装

Settings → Extensions → 添加文件夹路径（本目录），批准 `Run a local service`。

数据源可用环境变量 `OPENCODE_DB` 覆盖（默认 `~/.local/share/opencode/opencode.db`）。
