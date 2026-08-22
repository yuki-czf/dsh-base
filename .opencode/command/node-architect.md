---
description: 节点协议入口：读档恢复 / 存档 / 初始化（协议真源 .nodes/PROTOCOL.md）
---
读取并遵守 `.nodes/PROTOCOL.md` 节点协议，然后：
1. 若 `.nodes/` 不存在：运行 `.agents/skills/node-architect/scripts/init-nodes.ps1`（默认装到当前目录）初始化，再执行第 2 步。
2. 若已存在：读 `.nodes/CONTEXT.md` 与 `.nodes/PROGRESS.md`，向用户复述"当前节点 / 下一步"后待命。
3. 若用户参数是"存档"：按协议执行五步存档。

用户补充：$ARGUMENTS
