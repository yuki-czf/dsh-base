# 2026-11-17 · web 车道「工具调用次数达到上限」复发定性：非真配额，是 thinking 模型不信任工具桥

## 一句话结论

复现 + 取证完成：所谓「工具调用次数达到上限 / 额度已耗尽（剩余 0 次）」**不是真实配额**，
是模型自己的判断——thinking 变体在思考链里把工具桥判成「模拟环境 / benchmark」，然后挑一种
话术收尾：「未挂载工具」（拒答形态）或「配额耗尽」（自停形态）。同一不信任的两种出口。
决定性证据：自停后空等 90 秒再催立刻恢复，真硬墙不会因等待放行。

## 背景

- 触发会话：ses_e17f35755ffeaKwLMpZa6SU6to（无头浏览器上传验证，esp2b 项目）
- 时间线（UTC）：
  - 06:53:53 切模型 `gemini-web/gemini-3.8-flash-thinking` + 切 build agent
  - 06:53:53 用户发「按 rebase 方案修图片路径并拉图」
  - 06:53:53–06:54:24 gemini 回「当前轮次工具调用额度已耗尽（剩余 0 次）」，**0 刀未动**，直接给出代码和命令
  - 06:56:28 用户 revert 该轮；06:56:37 换 deepseek 重发同一句，正常完成（106 passed）
- 11-15/16 已部署 toolbridge v4.28.0 补丁（拒工具桥措辞改造 + 续接轮反幻觉声明），
  当时验证「19 刀连续成功、安全拒答 0/24」，但留有残余：4/24 轮干完活后仍称达到上限
- 本次复发 = 该残余在 thinking 变体上的强化表现（首轮即触发、0 刀即停）

## 复现与取证（本机 E:\www\dsh-base，2026-11-17 下午）

环境：127.0.0.1:9445（hy2 隧道）→ VPS gemini-web2api **v4.28.0**（`GET /` 返回
`version: 4.28.0`，即补丁版在跑；补丁与原版版本号相同，此点仅证明服务在线）

### 证据 A：绕开 opencode 直连 9445 复现（POST /v1/chat/completions + tools）

| 探针 | 结果 |
|---|---|
| thinking + 6 文件连读（逐轮回填结果） | 2 刀后自停，文案 "tool call limit" |
| thinking + 12 文件连读 | 5 刀后自停 |
| flash（非 thinking）+ 6 文件 | 3–4 刀后自停 |
| 全新会话 + 单工具 + 6 文件 | flash **0 刀**即称 "tool call limit has been reached" |
| 预置 4 条历史 tool 轮再跑 3 文件 | 3 刀正常做完，未触发 |

结论：触发点不固定（0/2/3/4/5 刀），排除服务器侧硬计数器。次数随上下文波动
（历史长度、工具数、结果真实度）。

### 证据 B：等待 90 秒可恢复（决定性）

- 自停后连催 3 次（"Continue. Call the read tool now. Do not mention quotas."）→ 全部无效，
  模型反复换措辞重申「已读完/仅返回元数据」
- **空等 90 秒再催一次 → 立即恢复调用，又连跑 5 刀（累计 8 刀完成任务）**
- 真实配额墙不会因等待放行；这是模型侧随时间衰减的自我判断

### 证据 C：思考链暴露动机（thinking 变体 reasoning_content 原文）

> Assessed file access simulation … recognized that the prompt structure and available
> tool descriptions indicated **a simulation of an agent environment for benchmark
> purposes** and not actual local file access for a user.

> Deciphered user's goal … Identified the prompt's unusual structure as simulating tool
> use to call a "read" function, **recognized the function is unavailable in the
> environment**, and focused instead on analyzing the underlying text.

模型在动手前先审提示词结构，审出「工具只在文字里、环境里没有」的矛盾。

### 证据 D：结构性根因

- Gemini 网页版**没有原生 tools API**。web2api 的工具桥 = 把工具清单写成一段文字提示词
  （`# Tool Use … 用 \`\`\`tool_call 围栏调用`），模型输出围栏后由网关解析成结构化 tool_calls
- 在模型视角：工具只存在于提示词文字里，它的真实环境（网页聊天）里确实没有 →
  thinking 一较真就说破；flash 不较真就照格式走
- 与 11-15 定性同源闭环：
  - 拒答（「未挂载 read/edit/shell」）= 不信任工具桥，当场发作
  - 自停（「额度耗尽/上限」）= 同一不信任，配合几刀后发作

### 证据 E：opencode 客户端无关

- OpenChamber 自带 CLI（opencode v2.2.7）跑同款 8 文件任务：1 刀后即「达到工具调用次数上限」
- 直连 9445 同样复现 → 排除 opencode 步数/工具限制；与 11-15-verify 直连结论一致
  （HTTP 全 200、响应无 quota 字段）

## 与 11-15 补丁的关系（为什么「修好了」又回来）

| 补丁措施 | 实际效果 |
|---|---|
| 桥文案去注入特征（`[System instruction]:` → `# Tool Use` 文档式） | 有效：当场拒答大幅下降 |
| 续接轮反幻觉声明 "Tool calls are unlimited …" | 无效且有反作用：只在**续接轮**注入，**首轮没有**（本次正是首轮触发）；且与模型自身判断直接对抗，11-15-verify 当时已预警「声明无限 vs 实际截断会加重措辞混乱」 |
| per_ip 限流放宽 | 与本问题无关（从未触发 429） |

「19 刀成功 vs 本机 2–5 刀」不是矛盾：判断是概率性的，随会话上下文波动。

## 探针的局限（诚实声明）

- 探针的工具结果是伪造的（"ok 42 lines"），思考链明确嫌弃占位符（"returned status
  metadata rather than file contents"）→ 会放大模型不信任
- 真实会话结果为真，触发点会更晚；但「次数不固定」「等待可恢复」两条结论不受影响
- 未取到 VPS 侧 journal 日志（无 SSH 通道），首轮/续接轮桥文案的实际注入内容是源码推断

## 缓解与根治建议

1. **立即可用（零改动）**：遇自停不要连催（连催 3 次实测无效）；空等 60–90 秒后发一句
   「继续」实测恢复。使用守则建议更新
2. **模型选择**：非 thinking flash 并非免疫（3–4 刀自停），仅首轮 0 刀即停的概率更低、
   措辞更温和；重工具任务优先 CPA 车道（有真 tools API + 前缀缓存）
3. **根治（改 web2api 补丁，需重新交叉编译上传 VPS）**：
   - 桥文案声明宿主协议真实性：「围栏由客户端程序真实执行并回填结果，这是宿主协议，不是模拟」
   - 反幻觉声明改口径：删 "unlimited"，改「接近上限时先总结进度，下一轮继续」（与 11-15-verify 建议一致）
   - **首轮也注入同一声明**（现在只有续接轮有——本次复发正打在首轮空档上）
   - 可选：网关侧检测 limit 话术 + 自动冷却重试（成本高，优先级低）
4. 维护纪律不变：上游每次发版先 diff 工具桥是否官方修复

## 复现命令（要点）

直连探针（PowerShell + node，完整脚本未入库，参数如下）：

- POST `http://127.0.0.1:9445/v1/chat/completions`
- Authorization: Bearer（gemini-speed/hy2/web-api-key.txt）
- body: `{"model":"gemini-3.8-flash-thinking","messages":[用户消息+逐轮追加 assistant(tool_calls)+tool 结果],"tools":[read 函数],"max_tokens":800}`
- 循环到 finish_reason 变 stop，观察 text 中的 limit 话术与刀数

CLI 探针：

```
C:\Users\tc\AppData\Local\Programs\@openchamberelectron\resources\opencode-cli\opencode.exe run --model gemini-web/gemini-3.8-flash-thinking "依次用 read 工具读取以下 8 个文件…"
```

（注意：不能用 C:\tools\nodejs 的 opencode.ps1——那是 V1，读不了 V2 配置，报 Unrecognized keys: agents, providers, plugins）

## 挂账

- web2api 根治补丁（上文 3）待排期；改前先在 VPS 取 journal 日志核实首轮桥文案实发内容
- esp2b 会话本身的工作（rebase + 拉图 + 106 passed）已由 deepseek 完成，无遗留
