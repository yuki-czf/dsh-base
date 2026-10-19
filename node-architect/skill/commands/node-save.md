---
description: 节点收口存档：一条 finish 命令完成 PROGRESS+SESSIONS+DECISIONS+CONTEXT+verify
argument-hint: <节点名> [状态短语]
---

# /node-save — 节点收口存档

把指定节点收口存档。节点名与状态：$ARGUMENTS（未给状态则默认「🟡实施完成待用户验收」）。

## 执行流程

**第 0 步（路径纪律）**：所有脚本路径照抄本模板，禁止用 Glob/Grep 搜索定位（`.agents`/`.pi` 点目录对搜索工具不可见，搜了必空转）。

1. **读档确认**：读 `.nodes/PROGRESS.md` 确认目标节点行存在、名字唯一（finish 按节点名唯一匹配，零/多命中会 fail）。
2. **门禁（本批有代码改动时必跑）**：跑项目的合并门禁命令（本项目为根目录 `scripts/gate.ps1`，参数见项目 AGENTS.md；无门禁脚本的项目按项目测试纪律逐项跑）。exit 0 才继续。
3. **委派闸门（v1.12.1）**：节点行带 `委派:收口独立复审` 且有新代码——收口前必须派复审子代理（简报四要素：目标/涉改文件/边界禁区/报告格式）并把结论写进 SESSIONS；不派须在 SESSIONS 写明豁免理由（verify 对缺失者 WARN）。
4. **CONTEXT 暂存**：把 `.nodes/CONTEXT.md` 全文微调后写入暂存文件（更新「最后更新」为今天、当前节点状态行同步；硬闸门 ≤60 行且每行 ≤6000 字符，注意计数含尾随换行——实际预算 59 行，超了先跑 `save.ps1 trim-context -Apply`）。
5. **一条命令收口**（节点完成时：先写 `.nodes/archive/<节点名>.md`，命令加 `-Completed`）：

   ```
   powershell -ExecutionPolicy Bypass -File .agents/skills/node-architect/scripts/save.ps1 finish -Node <节点名> -Session <会话标识> -Status "<状态>" -ContextFile <暂存文件> [-Note "<一句话>"] [-Decision "<决策标题>"] [-Recon "<侦察结论>"] [-Completed]
   ```

   无 PowerShell 环境用 `node .agents/skills/node-architect/scripts/save.mjs finish --node <节点名> --session <会话> --status "<状态>" --context-file <暂存> …`。
   退出码语义：0=verify 全绿收口完成；4=体积超限预检拦截（暂存保留，跑 `trim-*` 后原样重跑）；1=锁忙或节点行异常（按提示处理后重跑同一命令）。脚本幂等，失败不换姿势，原样重跑。
6. **复述**：向用户报告节点新状态 + verify 各项 [OK] 结果。

## 纪律

- 复杂决策（多 bullet 四要素）先手工追加 `.nodes/DECISIONS.md` 完整段落，finish **省略** `-Decision`；一句话轻量决策才用 `-Decision`（自动编号 `## 日期 #<节点号> 标题`）。
- finish 只动 PROGRESS 行的「状态」「更新时间」两列；验收标准等长文本列仍走手工 edit（防 600 字符闸门误伤）。
- 批次场景不用本命令（用 `save.ps1 commit`）。
