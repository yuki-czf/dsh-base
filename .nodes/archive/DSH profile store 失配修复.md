# 节点归档：DSH profile store 失配修复

- **周期**：2026-10-19（单会话，约 40 分钟，含取证与探针实验）
- **验收结果**：逐条对照
  - ① **根因取证 ✅**：`E:\.dsh\profiles\desktop\node_modules\.modules.yaml` 记录 `storeDir=E:\.pnpm-store\v10`、`packageManager=pnpm@10.32.1`、`prunedAt=2026-10-19T02:54:47Z`（＝本机 10:54:47）；`fsutil hardlink list` 实证 dshmarket／dsh-ops／dsh-builtin-browser／dsh-subagent-default-model 的 package.json 硬链接落在 `E:\.pnpm-store\v10\files\…`。DSH 市场操作日志（`.plugin-manager/logs/operation-I8PJZq/pnpm.log`）写明它调的是自带 `pnpm 11.8.0`，其 store 解析为 `E:\.pnpm-store\v11`（当天 14:48:14 那次失败正好写在这个 store 里）→ 市场 `log.ndjson` 三次失败均为 `ERR_PNPM_UNEXPECTED_STORE`（12:07 / 14:46 / 14:48）。
  - ② **修复 ✅**：只改 `.modules.yaml` 两字段——`storeDir` v10→v11、`packageManager` 10.32.1→11.8.0；原文件备份 `node_modules/.modules.yaml.bak-20261019-151050`。改前先用探针目录比对 pnpm 11.8.0 的期望值：`layoutVersion` 同为 5、`virtualStoreDirMaxLength` 同为 60、`hoistPattern/included/nodeLinker/registries` 逐项一致 → 布局兼容，无需重装。
  - ③ **双通实测 ✅**：`add -w is-number@7.0.0` → `Done in 3.3s using pnpm v11.8.0`；`remove -w is-number` → `Done in 1.3s`；`pnpm-lock.yaml` SHA256 不变、`node_modules/is-number` 零残留。
  - ④ **用户端闭环 ✅**：市场日志 `dsh-better-sidebar@0.28.0 exit=0 hot=true`（15:15）、`@kenz1117/dsh-ui-usage-billing@1.6.2 exit=0 hot=true`（15:19）——用户实装确认。
  - ⑤ **防复发落档 ✅**：DECISIONS 追加条目 + CONTEXT「关键路径提醒」加铁律行。
- **改动了什么**：
  - `E:\.dsh\profiles\desktop\node_modules\.modules.yaml`：`storeDir`、`packageManager` 两字段（唯一实质改动）；新增备份 1 个。
  - `E:\.dsh\profiles\desktop\package.json`：被 pnpm 重排依赖顺序（`@linxin666/...` 前移），语义不变——7 个依赖与版本一致，`dsh` 配置块（bundles 清单、desktopNext*）未动。
  - `E:\.dsh\profiles\desktop\pnpm-lock.yaml`：经 add/remove 往返后 SHA256 与操作前一致。
  - **未重装任何包**；工作区实验探针目录已清理。
- **踩坑记录**：
  1. **官方 storeDir 建议跨大版本无效**（本次最大发现）：DSH 报错弹窗自带「把记录里的 store 写进 `pnpm-workspace.yaml`：`storeDir: <第一个路径>`」。实测 pnpm 的 store 路径 = `<storeDir> + \v<自己的 store 版本>`（仅当已以该版本结尾才不再追加），所以 `storeDir: E:\.pnpm-store\v10` 会被解析成 `E:\.pnpm-store\v10\v11`，仍报同一错。该修法只适用于**同一大版本换盘**（记录是 v11 时写 v11 路径即通过）。
  2. **市场无法自愈是设计使然**：`pnpm install` 在 store 变更时会先要求确认删除 node_modules，非 TTY 下 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`（须 `CI=true` 或 `confirmModulesPurge=false`，且要先退出 DSH 释放占用）。
  3. **PATH 与自带 pnpm 大版本不一致是引爆点**：本机 PATH 上是 `pnpm 10.32.1`（`C:\tools\nodejs`），DSH 自带 `11.8.0`；在 profile 里跑一次 PATH 版 install 就把记录写回 v10，市场随即全拒（今天 10:54:47 那次）。
  4. 诊断顺序可压缩：市场 `log.ndjson`（错误码）→ `.plugin-manager/logs/<op>/pnpm.log`（真实命令行）→ `node_modules/.modules.yaml`（记录值）→ `fsutil hardlink list`（内容实际归属），四步即可闭环，不必先啃 app.asar。
- **执行效率复盘**：预估 20 分钟 / 实际约 40 分钟；**最大浪费点**＝前半程在 DSH 的 `app.asar` 与日志里反查错误码语义（其实市场 `log.ndjson` 里错误码是明文）；**一条可复用结论**＝报错先摆「记录值 vs 现用值」两栏再谈修法，且任何「改配置就行」的建议必须在本机复刻目录里实测通过才能执行（本次正是实测推翻了官方建议）。
- **委派复盘**：未派子代理——单会话运维，判断链（读档→取证→探针→改单文件→实测）强上下文依赖，符合 `执行:—(自干理由)`；收口以 add/remove 真实操作 + 市场日志闭环替代独立复审（无新代码，符合 `收口:—(纯环境运维)`）。
- **遗留**：`E:\.pnpm-store\v10`（47841 文件 / 918MB）中的内容仍被 node_modules 硬链接引用——**直接删不省空间**（数据块由硬链接共享）。彻底退役需退出 DSH 后，用自带 pnpm 11 跑一次 `install` 全量重链到 v11 store，再清 v10；未执行（可选）。
- **给下个节点的衔接说明**：本机 profile 装插件的铁律——**node_modules 记录里的 store 必须与操刀 pnpm 的大版本一致**（DSH 自带 11.8.0 → `E:\.pnpm-store\v11`）。诊断三件套＝`.modules.yaml` + 市场 `log.ndjson` + `.plugin-manager/logs/<op>/pnpm.log`。回滚＝用 `.modules.yaml.bak-20261019-151050` 覆盖（会立刻复现故障，仅作保底）。
