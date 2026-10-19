# DSH 主力栈跨设备安装手册（install-stack）

> 版本：v1.2（对应 bundle v1.3.2）· 母仓 yuki-czf/dsh-base
> **DSH 版本要求：核心 `>=0.2.1-rc.2 <0.2.2`**（验证基线＝0.2.1-rc.2 / 桌面壳 2.0.18；bundle 已带 engines 闸，不满足会拒装）
> **产品名注记（2026-10-19）**：本栈验证于 DSH Desktop 时期，该产品现已更名 **DeepSeek NEXT**——本手册一切判据（P0 版本窗口、P2 目录、S3 工具、S5 路径）均以**版本字段/目录路径/工具名**为准，不依赖产品名，后续再改名也不影响。更名后的新版本线未经验证，engines 闸会照常拒装——须先在本仓验证后放宽窗口。
> 用法：目标设备的 DSH 桌面端（旧名 DSH Desktop / 现名 DeepSeek NEXT），工作区打开本仓库克隆，用**默认会话**粘贴下方开工话术，代理照本手册执行。

## 0. 开工话术（复制即用）

```
读 research/dsh-adaptation-drafts/install-stack.md（DSH 主力栈跨设备安装手册）并严格按它执行安装。
规则：凡手册标 [询问] 的步骤先征得我同意再动；插件安装前必须确认；涉及密钥的配置只列键名、绝不显示值；
每完成一步给我一行验证结果；全部完成后按手册 S7 终验清单自检并报告。
```

## 1. 前置自检（代理执行，缺项即停并报告）

| # | 检查 | 方法 | 缺失处理 |
|---|---|---|---|
| P0 | DSH 核心版本在窗口内 | `plugin_manager list_bundles` 看 `@deepseek-ai/dsh-base` 的 version（须 ≥0.2.1-rc.2 且 <0.2.2） | 版本过旧/过新 → 停止并报告（bundle engines 闸同款约束；升级 DSH 或等本栈适配后再装） |
| P1 | 本仓库文件就位 | 存在 `research/dsh-adaptation-drafts/bundle/package.json` | 报错停止（克隆/拷贝不完整） |
| P2 | DSH home 与 profile | 存在 `~/.dsh/profiles/desktop/` | 报错（DSH 桌面端——DSH Desktop/DeepSeek NEXT——未初始化） |
| P3 | 会话有 `plugin_manager` 工具 | 本会话工具列表 | 若无：请用户在设置→Agent 预设换带插件管理的预设；或本手册 S3 走 GUI 侧栏「插件」页兜底 |
| P4 | 模型渠道就绪 | 扫描 profile 的 llm-pi-ai providers **只列键名**（密钥值一律不读不显）；确认存在至少一条 Gemini 系路由与一条异构（非 Gemini）路由 | 缺则停：渠道接入属用户自理，配好后重跑 |

## 2. 交付清单（全部在本仓库内，P1 已验）

- **三 skill（项目级，随仓库走）**：`.agents/skills/pi-tempo/`（含 subagents/ 三模板）、`.agents/skills/prometheus-spec/`、`.dsh/skills/node-run.md`
- **bundle**：`research/dsh-adaptation-drafts/bundle/`（五预设 + tool-subagent 四元白名单 + subagent-model-selection override）
- **人设快照**：`research/dsh-adaptation-drafts/tool-management-personas/`（4 个 md）
- **参考**：`discrepancies.md`（16 条台账）、`README.md`（目录导读）

## 3. 安装步骤

### S1 [询问] 安装 tool-management 插件（可视化管子智能体；可选）

`plugin_manager install_bundle` target=`dsh-plugin-tool-management@latest`（或用户在插件市场自装）。
不装则 S5 跳过（人设无宿主），其余不受影响。弹审批属预期。

### S2 路由映射采集 [询问] + 设备本地副本

1. 问用户两个映射（给 P4 扫到的键名作选项）：
   - **执行/测绘路由**（原 `vps-direct` / `gemini-3.8-flash`）
   - **复审路由**（原 `zai-coding-cn` / `glm-5.3-flash`，须与执行路由不同家族=异构）
2. 若与原键一致 → 替换全部跳过；否则制作**设备本地副本**（仓库本体保持 git 干净）：
   - bundle → `~/.dsh/dsh-stack/bundle/`（整目录复制）
   - 在副本 `cordis.patch.yml` 与以下部署目标上做字面量替换（旧→新，replace-all）：
     `vps-direct`→新执行 provider；`gemini-3.8-flash`→新执行 model；`zai-coding-cn`→新复审 provider；`glm-5.3-flash`→新复审 model
   - 部署目标＝S3 的 bundle 副本、S5 的人设副本、S6 的 skill 副本（仓库内文件不动）
3. 把映射记入安装报告。

### S3 安装 bundle（必装）

`plugin_manager install_bundle` target=`<S2 副本路径 或 仓库内 research\dsh-adaptation-drafts\bundle>`（弹 Full/审批属预期）。
GUI 兜底：侧栏「插件」页手动安装同目录。

### S4 验证

`plugin_manager list_plugins`：`preset-prometheus-spec / preset-librarian / preset-gemini-fixer / preset-gemini-scout / preset-independent-review` 五行 **enabled+active、无诊断**；`list_bundles`：`@local/dsh-prometheus-spec` enabled+installed 且 **overrides 含 `subagent-model-selection-settings`**。

### S5 人设部署（S1 已装才执行）

复制 `tool-management-personas/*.md` → `~/.dsh/tool-management/subagents/`，再按 S2 映射替换副本中的路由四元组。验证：四文件在位；工具管理页 TTL 扫描后显示 4 条。

### S6 [可选·询问] 用户级 skill 副本（任意项目可用）

复制三 skill → `~/.agents/skills/`（rank 500），并按 S2 映射替换副本中路由字样。
不装则技能仅在本仓库工作区可用（项目级 rank 200 会遮蔽用户级副本——见 §5 边界）。

### S7 终验清单（代理自检后报告）

```
□ P1–P4 自检记录
□ S1 插件状态（或用户选择不装）
□ S2 路由映射表（旧→新）
□ S4 五 preset 行 active + override 生效
□ S5 人设 4/4（若装）
□ S6 用户级副本（若装）
□ 新会话冒烟：用户另开一空白会话（预设选 Prometheus-Spec）发「实现一个暗色模式切换」
  → 预期：首步加载 prometheus-spec skill、回应"创建工作计划"、不写码
```

## 4. 回滚

- `plugin_manager remove_bundle @local/dsh-prometheus-spec`（+ 卸 tool-management 同法）
- 删 `~/.dsh/tool-management/subagents/` 下四个人设与 `~/.dsh/dsh-stack/`
- 用户级 skill 副本：删 `~/.agents/skills/{pi-tempo,prometheus-spec}` 与 `~/.dsh/skills/node-run.md`（若做过 S6）
- 仓库本体未被修改（S2 起全部动副本），无需还原

## 5. 已知边界（照搬本仓结论，安装时不需处理）

1. **技能作用域**：项目级（200）遮蔽用户级（500）——在本仓库工作区里，node-run/A2 引用的是仓库内原路由；其他项目用 S6 副本的路由
2. **宿主面工具泄漏**：子会话可见宿主级工具（含写能力的），preset 只读保证有边界（discrepancies #15）——policy 插件二期议题
3. **模型选择 override 与 GUI**：Desktop 无子智能体设置卡（#14），override 是唯一入口；若未来版本渲染该卡，GUI 编辑与 config 层的优先级未验证
4. **预设白名单**：仅含 S2 两条路由；加新路由须改 bundle 副本 yml 的 `allowedModels` 并重装（remove→install）

## 6. 传运输送道（给搬运者，非代理步骤）

- 正路：源设备修复 git 网络（`.git/FETCH_HEAD` ACL）→ push → 目标设备 clone
- 绿色版：直接拷贝整个 dsh-base 文件夹（含 .git）到目标设备，效果等同
