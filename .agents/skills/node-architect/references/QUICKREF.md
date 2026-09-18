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

## 存档脚本 save.ps1

| 命令 | 用途 |
|------|------|
| `save.ps1 lock -Session <会话>` | 写 CONTEXT.md 前取锁 |
| `save.ps1 unlock -Session <会话>` | 写完 CONTEXT.md 后放锁 |
| `save.ps1 verify -Node <节点名> -Session <会话>` | 中途存档校验（全 [OK] 才算通过） |
| `save.ps1 verify -Node <节点名> -Session <会话> -Completed` | 节点完成校验（含归档文件检查） |
| `save.ps1 verify-batch -Node <节点名> -Session <会话> -Batch <N>` | 批末存档校验（批次状态 + 计划侦察/校准回填检查） |
| `save.ps1 commit -Node <节点名> -Session <会话> -Batch <N> -ContextFile <暂存文件>` | 原子收口（lock→CONTEXT→unlock→verify-batch 一条命令） |
| `save.ps1 save -Node <节点名> -Session <会话> -ContextFile <暂存文件> [-Completed]` | 一键存档（lock→CONTEXT→unlock→verify 一条命令，非批次场景） |
| `save.ps1 check-tombstone` | 检查压缩后是否漏补存档（退出码 3 = 有告警） |
| `save.ps1 trim-decisions [-Keep <N>]` | 剪切旧决策到 archive/（默认保留最近 20 条） |

## 退出码

| 码 | 含义 |
|----|------|
| 0 | 成功 / 校验全过 |
| 1 | 失败（锁竞争 / 校验未过） |
| 3 | 告警（墓碑检查发现疑似断链） |

## 常规存档速查步骤

```
1. edit  PROGRESS.md    → 更新节点行
2. write SESSIONS/<会话>.md → 重写会话状态
3. edit  DECISIONS.md   → 有决策则追加（只追加不改旧）
4. write 暂存文件       → CONTEXT.md 新全文
5. save.ps1 save -Node <节点名> -Session <会话> -ContextFile <暂存>
   （或批次场景用 commit 替代 save）
```
