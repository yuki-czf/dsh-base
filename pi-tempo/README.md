# pi-tempo

PI-Desktop 的**执行节奏纪律**体系（2026-10-16，节点 23 产出）。

核心洞察来自本机实测：**时间 ≈ 模型往返次数 × 每次等待**（往返中位 7.2s，而工具自身中位 3.6ms）——所以整套纪律的主线只有一条：**压掉白往返**。

## 这是什么 / 不是什么

| 组件 | 类型 | 说明 |
|---|---|---|
| `skill/` | **skill**（规则文档） | 十节纪律：Edit 行操作与批量编辑 / Bash 超时 / 退出码判成败 / 最小子集验证 / Grep→Read 一次读够 / 往返预算 / 切分判定 / 子代理调度 |
| `subagents/` | **subagent 定义**（3 个） | `gemini-scout`（只读测绘·low）/ `gemini-fixer`（可写实现·high）/ `independent-review`（异构家族复审·DeepSeek·只读） |
| `templates/` | `/node-run` 斜杠模板 | lab 版（node-architect v1.10.1，`save … -Completed`）与 reddit-trend-tc 版（v1.12.x，`finish`） |

**pi-tempo 本体是 skill，不是 agent。** 它没有模型、没有工具，只是装进主 Agent 上下文的操作规程；subagent 才是独立会话，由主 Agent 按这份规程调度。

## 安装

```powershell
# skill（手动调用入口：/skill:pi-tempo）
Copy-Item -Recurse -Force .\skill "$env:USERPROFILE\.agents\skills\pi-tempo"

# 三个子代理
Copy-Item -Force .\subagents\*.md "$env:USERPROFILE\.agents\subagents\"

# /node-run 模板（按需，放到目标项目；.pi/prompts 是点目录，Git/Glob 对它不可见）
Copy-Item .\templates\node-run.lab.md <项目>\.pi\prompts\node-run.md
```

装完重启 PI-Desktop：设置 → 技能 应出现 `pi-tempo`；设置 → 子智能体 应出现三个。子代理所用模型需在 设置 → 模型 里开启 **Available for AI delegation**，否则派发会 `PERMISSION_DENIED`。

## 体检脚本

```powershell
node "$env:USERPROFILE\.agents\skills\pi-tempo\analyze.mjs"
```

直接读 PI-Desktop 自己的数据库（`~/.pi-desktop/pi.sqlite`）与会话 JSONL，输出：回合状态分布、平均墙钟、各工具调用/错误率、Edit 失败码分布、Bash 失败分桶。与 `skill/baseline-2026-10-16.txt` 对比即可判断纪律是否生效。

> `analyze.mjs` 的第 4 个参数是 provider id（本机 pi.sqlite `providers` 表）。仓库副本已把默认值替换为 `YOUR_PROVIDER_ID` 占位符——装回去后请改回你自己的值（形如 `3c836f79-…`）。

## 实测结论（为什么是这些规则）

四轮实测 + 两轮外部调研，详见 dsh-base `.nodes/archive/Gemini 3.8 Flash 调查与 PI-Desktop 使用优化（CPA 渠道商）.md` 的「pi-tempo 验证收口」一节。要点：

- **基线**（一个真实节点，pi-tempo 之前）：388 趟往返、模型等待 79.9 分钟、**381/388 趟只带 1 个工具调用**（零合批）、重复读 53%。
- **修复后**（沙盒三轮）：调用/趟 1.02 → **2.2–3.2**、重复读 53–77% → **7–21%**。
- **「并行派 subagent 写代码」被证伪**：结构耦合与规模不足双重否定。subagent 的真实价值只有两种——**上下文隔离**（读 >30 个文件先派 scout 测绘）与**模型多样性**（收口复审换异构家族），不是"并行干活"（主线程本来就并发调工具）。
- 并行派发判据（2026-10-16 替换）：**耦合**（该支要读 ≥3 个属于其他分支的文件才能确定接口 → 不拆）+ **规模**（预计实现 >2000 行、或该支自身 ≥8 个串行往返 → 才考虑）。

## 版本

- **v1.0.2**（2026-10-17）：引入**锚定（ANCHOR）机制**——用「主动生成」对抗长上下文注意力衰减。依据：节点 271 实测规则确凿在上下文里但执行率≈0（69/71 次读仍小窗口、43 次 Bash 0 次加过滤），根因是上下文中位 33.8 万 token 时开工装载的规则注意力只剩 ~2%。三档：ANCHOR（每批次开工在**助手正文**写一行 `ANCHOR: 风险→验证点→§号`，~20 token）/ MINI（切分表定稿复述规则编号）/ FULL（收口复审逐条对照）。**关键约束：必须出现在 output 流而非 thinking；跳过＝该批作废**。skill 18,592 B，两模板各加同条。
- **v1.0.1**（2026-10-16）：真实节点 269/270 复测后新增五条——**大文件一次读够**（§6）/ **先侦察后落笔**（同文件多处改动一次多 op 写掉，§1）/ **大输出先瘦身**（§8）/ **上下文恶性循环警示**（§8）/ **验收口径换为「每改一处 ≤5 次模型往返」**（自检，旧口径每趟 ≥2.5 个调用只适用小文件项目）。skill 16,498 B，模板未改内容仅升版本号。
- **v1.0.0**（2026-10-16）：skill 15,380 B（frontmatter 加 `version`）/ 模板 lab 13,106 B / 模板 reddit-trend-tc 15,899 B。
- **版本号唯一真源 = `skill/SKILL.md` frontmatter 的 `version`**；两份模板各有 `<!-- pi-tempo vX -->` 注释行可 grep 校验。三处版本必须一致，改 skill 后同步模板并递增。

### 真实节点复测数据（v1.0.0，reddit-trend-tc）

| 指标 | 268 基线 | 节点 269 | 节点 270 | v1.0.1 目标 |
|---|---|---|---|---|
| 墙钟 | 91 min | 38.2 min | 24.5 min | ≤60 ✅ |
| 主线程往返 | 388 | 137 | 79 | ≤160 ✅ |
| 每改一处摊的往返数 | 7.8 | 4.4 | 4.6 | ≤5 ✅ |
| 真重复读 | 53% | 47% ❌ | 16% ✅ | ≤20% |
| 并行派 fixer | 0 | 0（判据正确：耦合+规模不足） | 0（同） | 基本永不触发，属设计 |
