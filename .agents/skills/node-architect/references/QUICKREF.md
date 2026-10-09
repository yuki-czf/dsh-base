# node-architect 命令速查

> 脚本均位于 `.agents/skills/node-architect/scripts/`；无 PowerShell 时用 `node save.mjs`（跨平台版）。

## 初始化

```
init-nodes.ps1 [-Project <项目根>]
```

## 登记计划节点（/plan-node）

```
/plan-node <计划短名> [一句验收标准]      # opencode .opencode/command/ ｜ claude .claude/commands/ ｜ PI-Desktop .pi/prompts/
```

等价自然语言：「你使用存档skill，扫描空闲节点，并将计划存档为一个计划节点」。PI-Desktop 聊天框对 `/` 开头消息原生展开 `.pi/prompts/` 模板（$ARGUMENTS/$@/$1 占位）；DSH 等无斜杠命令的端直接说「登记计划节点 <名>」，走同一流程（命令模板全文：`commands/plan-node.md`）。流程五步：

```
0. 守卫：.agents/skills/node-architect/ 或 .nodes/ 不存在 -> 先 init（或说"装节点协议"）
1. 读档：读 CONTEXT.md + PROGRESS.md（只读）
2. 取号：save.ps1 next-node -Node <短名> [-Accept <验收>] -Session <会话>
3. 冲突校验：见下表，任何 FAIL 分支即停、不写档案
4. 落盘：计划写 plans/<短名>.md；验收占位 -> 回填 PROGRESS 行
5. 收口：save.ps1 verify -Node <短名> -Session <会话> 全 [OK] -> 复述"节点 #N 已登记（待开始）"
```

| 冲突分支 | 识别 | 处理 |
|---|---|---|
| 同名节点已存在 | exit 1 `already present` | 不登记；报告同名行（编号/状态/owner），用户选改名重跑或转入该节点正常流程 |
| 锁忙 | exit 1 `Lock busy`（30s） | 报告持锁 owner，稍后原样重跑（幂等安全） |
| 存量撞号 | 成功输出带 `existing duplicate numbers` | 新号=max+1 不受影响可继续；转述撞号详情，按 PROTOCOL「编号分配」处理 |
| 计划文件已存在 | `plans/<短名>.md` 内容不同 | 报告差异，用户确认后追加、绝不覆盖 |

纪律：节点号只能由 `next-node` 分配；登记只写 PROGRESS 一行 + plans 文件 +（可选）SESSIONS 检查点，CONTEXT「当前节点」切换留给首个工作会话。

## 开工侦察三连（登记后、写代码前；详见 PROTOCOL「执行效率协议」）

```
1. grep -r "vi.mock" <目标测试目录>        # 既有测试怎么 mock 依赖
2. 新依赖 → 单组件打样（含测试绿）再铺开    # 防整批返工
3. 批末验证合并一条命令跑                   # 工具冷启动 10s+/次
```

> 侦察结论用 `save checkpoint -Recon "..."` 一条命令登记进 SESSIONS；verify 会对缺侦察标记的节点 WARN。

## 事故速查（会话异常终止：pseudo-tool-call）
- **指纹**：模型正文出现 `call:xxx{...}` 文本 + 工具实际未执行 + 任务清单停在 0-N 不动；同会话前后工具步正常 = 模型把工具调用写成正文（模型侧偶发失误，非渠道/配置问题——能写出准确工具名即证明工具定义已送达）。
- **定责**：① 查同会话前后工具步 ② 最小探针（让模型只调一次工具）③ 换思考档对照。
- **处置**：① 同会话补一句「继续」即续上（档案未损，断点仍在）② 复发换思考档/强模型 ③ 不原样重发同一句（大概率复现）。
- **通用规则**：任何异常终止都是断点场景——进度在档案不在对话，下次开工照常读档恢复。

## 存档脚本 save.ps1

| 命令 | 用途 |
|------|------|
| `save.ps1 lock -Session <会话>` | 写 CONTEXT.md 前取锁 |
| `save.ps1 unlock -Session <会话>` | 写完 CONTEXT.md 后放锁 |
| `save.ps1 checkpoint -Node <节点> -Session <会话> [-Recon "..."] [-Note "..."]` | 轻量检查点：往 SESSIONS 追加一行（不动 CONTEXT 不加锁）；`-Recon` 登记开工侦察 |
| `save.ps1 review-audit [-Over 14]` | 待验收收敛：列出挂账超期节点；有超期 exit 3 |
| `save.ps1 verify -Node <节点名> -Session <会话>` | 中途存档校验（全 [OK] 才算通过；缺侦察标记 WARN） |
| `save.ps1 verify -Node <节点名> -Session <会话> -Completed` | 节点完成校验（含归档文件检查） |
| `save.ps1 verify-batch -Node <节点名> -Session <会话> -Batch <N>` | 批末存档校验（批次状态 + 计划侦察/校准回填检查） |
| `save.ps1 commit -Node <节点名> -Session <会话> -Batch <N> -ContextFile <暂存文件>` | 原子收口（lock→CONTEXT→unlock→verify-batch 一条命令） |
| `save.ps1 save -Node <节点名> -Session <会话> -ContextFile <暂存文件> [-Completed]` | 一键存档（lock→CONTEXT→unlock→verify 一条命令，非批次场景） |
| `save.ps1 next-node -Node <名称> [-Accept <验收>] [-Session <会话>]` | 新节点原子取号：锁内全表扫描 → max+1 → 表头下插行（ticket-server 模式，防并发撞号） |
| `save.ps1 check-tombstone` | 检查压缩后是否漏补存档（退出码 3 = 有告警） |
| `save.ps1 trim-decisions [-Keep <N>]` | 剪切旧决策到 archive/（默认保留最近 20 条；v1.7.0 行数感知=自动减条数保 DECISIONS ≤200 行） |
| `save.ps1 trim-context [-Apply]` | 滚出 CONTEXT.md 已完成条目/超长引言行 → archive/context-<日期>.md（默认 dry-run，`-Apply` 落盘） |
| `save.ps1 trim-progress [-Apply]` | 截断 PROGRESS.md 超长表格行（>600 字符）至列预算，原文全文滚出 → archive/progress-rows-<日期>.md（默认 dry-run） |

## 体积硬闸门（v1.7.0）

- **上限**：CONTEXT.md ≤60 行且每行 ≤6000 字符；PROGRESS.md 表格行 ≤600 字符；DECISIONS.md ≤200 行。
- **拦截**：`save` / `commit` 超限 → **exit 4** + 输出修复命令（暂存文件保留）；`verify` 超限 → FAIL 项（exit 1）。
- **每窗一拦**：拦截写 marker `.nodes/.cap-nudge`（违规指纹），10 分钟内同指纹重跑放行只 WARN——不锁死会话。
- **fail-open**：除超限外的任何异常（文件缺失/解析失败）不阻塞存档。
- 常态写法：核心文件写短（节点行只留一句话状态），细节直接写 `archive/<节点>.md`。

## 退出码

| 码 | 含义 |
|----|------|
| 0 | 成功 / 校验全过 |
| 1 | 失败（锁竞争 / 校验未过） |
| 3 | 告警（墓碑检查发现疑似断链；review-audit 发现超期待验收节点） |
| 4 | 体积闸门拦截（核心档案超硬上限；按提示 trim 后重跑，10 分钟内重跑同命令自动放行） |

## 常规存档速查步骤

```
1. edit  PROGRESS.md    → 更新节点行
2. write SESSIONS/<会话>.md → 重写会话状态
3. edit  DECISIONS.md   → 有决策则追加（只追加不改旧）
4. write 暂存文件       → CONTEXT.md 新全文
5. save.ps1 save -Node <节点名> -Session <会话> -ContextFile <暂存>
   （或批次场景用 commit 替代 save）
```
