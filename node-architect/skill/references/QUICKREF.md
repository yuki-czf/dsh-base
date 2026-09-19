# node-architect 命令速查

> 脚本均位于 `.agents/skills/node-architect/scripts/`；无 PowerShell 时用 `node save.mjs`（跨平台版）。

## 初始化

```
init-nodes.ps1 [-Project <项目根>]
```

## 开工侦察三连（登记后、写代码前；详见 PROTOCOL「执行效率协议」）

```
1. grep -r "vi.mock" <目标测试目录>        # 既有测试怎么 mock 依赖
2. 新依赖 → 单组件打样（含测试绿）再铺开    # 防整批返工
3. 批末验证合并一条命令跑                   # 工具冷启动 10s+/次
```

> 侦察结论用 `save checkpoint -Recon "..."` 一条命令登记进 SESSIONS；verify 会对缺侦察标记的节点 WARN。

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
