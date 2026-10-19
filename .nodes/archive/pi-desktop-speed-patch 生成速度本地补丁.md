# 节点归档：pi-desktop-speed-patch 生成速度本地补丁

- **周期**：2026-10-12 → 2026-10-13（跨 0.18.x → 0.19.1 两个版本）
- **验收结果**（对照 PROGRESS 节点 20 的六条）：
  - [x] ①runtime 发布 `responseFirstTokenMs` + `usage.firstTokenMs`；TTFT 记在任意内容首个 delta（文本/思考/**工具调用参数**/hostedSearch），并锚定适配器请求起始 `e.message.timestamp`（v3.1）
  - [x] ②渲染器 v3：分母 `Σ(responseDurationMs − TTFT)`，要求 TTFT>0、解码窗 <250ms 的两侧都不计；分子 = 全部生成 token（思考单列 `rea>out` 时相加，否则取 `outputTokens`，两种数据约定下都等于 DSH/报告的数）
  - [x] ③`node verify.mjs` 全 PASS（14 项，含 v3.1 新检查）
  - [x] ④`node patch.mjs status` → runtime PATCHED / renderer PATCHED（0.19.1 线）
  - [x] ⑤用户实测认可：重启后弹窗「生成速度」恢复到几百 tokens/s（本轮聚合 ≈191 t/s 实测对照通过）
  - [x] ⑥`revert` 一键还原可用，两个 `.pi-speed.bak` 备份在位；升级后可重打（已用 0.19.1 实战验证）
- **改动了什么**：
  - 本机安装：`E:\Program Files\PI-Desktop\resources\agent-runtime\sidecar.js`（v3.1，5 处注入 + v3.1 基点）、`resources\app.asar`（`out/renderer/assets/use-transcript-view-*.js` 聚合器 v3）；备份同名 + `.pi-speed.bak`
  - 工具包 `pi-desktop-speed-patch/`：`patch.mjs`（status/apply/revert，stock→v3、v1→v2、v2→v3、v3→v3.1 全升级链与 `--dry-run`）、`asar.mjs`（读写器；**修复数据起点 4 字节对齐 bug** + 替换条目 integrity 哈希重算）、`verify.mjs`（14 项独立复核）、`asar-selftest.mjs`、`finish-when-closed.ps1`（watcher）、`README.md`（口径对照、用法、升级实战记录）
  - 节点档案：PROGRESS / SESSIONS/pi-speed-v3 / DECISIONS（v2、v3 两条）/ CONTEXT
- **踩坑记录**：
  1. **锚点必须逐字符从活体代码复制**：手写 `==="number"` 而活体是 `=="number"` → 0 命中；`--dry-run` 拦住，零写入。
  2. **自写 asar 读取器的对齐 bug**：`16+L` 当数据起点，0.18 的 L 整除 4 碰巧对，0.19.1 的 `L%4==1` 把每个条目读早 3 字节（chunk 以 `};` 开头、结尾缺 `}`，`node --check` 必炸）。定位靠**目录自带的 SHA256 integrity 仲裁**；修复后 `asar-selftest` ROUND-TRIP OK。**新增：升级后先跑 asar-selftest 再 apply**。
  3. **0.19.1 把 `message_start` 与首个内容事件同批送达** → 本地 `streamStartedAt` 落在首 token 时刻，TTFT 全塌成 0–1ms（分母退化回整窗）。修法：锚适配器在请求开始打的 `e.message.timestamp`（随帧携带），缺失回退。
  4. PS 侧三个小坑：`Start-Process -ArgumentList` 传带空格路径必须显式加引号（watcher 起不来，改 `cmd /c` + 引号）；**WMI `Invoke-CimMethod Win32_Process Create` 才是可靠的分离启动**；按命令行过滤进程会匹配到**自己这条命令**，别把自匹配当 watcher。
  5. 行号定位的编辑连错两次（README 标题被误删、verify 检查串放错行）——大段改动先 Read 确认再动手，改完立即读回。
- **执行效率复盘**：
  - 预估：半天（脚本 + 验收）。实际：跨两天约 6-7 小时（含 0.19.1 升级带来的重打与两个新坑）。
  - 最大浪费点：**0.19.1 的 asar 对齐 bug 与 TTFT 基点坑**——都是「换版本后才发现」的环境差异，静态推理花了不少来回；两次都是先用**独立证据仲裁**（SHA256 哈希 / 真实消息数据分布）才收敛，而不是继续猜。
  - 可复用结论：**给宿主打补丁时，凡「时间戳/偏移」类数据一律找宿主的原始记录做锚**（适配器 timestamp、目录 integrity），别用补丁自己采的本地时间与自算偏移——本地时间会被送达时序污染（0–1ms 案），自算偏移会被头部对齐污染（3 字节案）。
- **遗留**：
  - 无未决缺陷。已知边界：旧轮次（无 TTFT）不计入聚合，老会话数字会跳；整包投递渠道首字等待为 0，数值退化为「全部生成 token ÷ 全程墙钟」，是信息量上限不是算法差异。
  - 0.19.1 起 asar 目录带 integrity 哈希，重打包已同步重算；若未来上游开启 asar integrity fuse（校验值嵌在可执行文件里），本地补丁需换思路（改 sidecar 或走插件层）。
- **给下个节点的衔接说明**：
  - 升级 PI-Desktop 后顺序：`node patch.mjs status` → `node asar-selftest.mjs <app.asar> <临时目录>` → `node patch.mjs apply --dry-run` → 关应用 → `apply` → 重开 → `node verify.mjs`。锚点报错=上游改名，按新代码重定位 `patch.mjs` 的常量（0.19.1 的改名样例：`nl`→`ll`、`I`→`P`、渲染器消息变量 `i`→`l`）。
  - 复核数据入口（只读）：`C:\Users\tc\.pi-desktop\pi.sqlite` 的 `turns.usage_json`（每次调用 `firstTokenMs`）与 `sessions\<id>.jsonl` 每条 assistant 消息的 `meta.usage/responseDurationMs`；注意宿主**白名单**只持久化 `{modelId, providerId, responseDurationMs, status, usage}`，顶层自定义字段会丢。
  - 天津网关 `speed_report.py` 线（用户贴的规格书）本节点**未做**：本机无 tianjin 的 ssh 配置/私钥，需要先解决访问方式；其 §3 口径与本补丁已逐条对齐，做的时候可复用本节点的口径对照表。
