# prometheus-spec 分发母版

带权限闸门的规划 agent（只出计划不动手）：调研 → 规划 → 产出 spec-superflow 五件套工件，自审后交接 build agent 执行。本目录是它的云端分发母版，一条命令装到任意 Windows 机器的 opencode。

## 快速安装（Windows，PowerShell 5.1+）

```powershell
git clone https://github.com/yuki-czf/dsh-base.git
powershell -ExecutionPolicy Bypass -File "dsh-base\prometheus-spec\install.ps1" -Core
```

- `-Core` 非交互装必备三件；无参数进入交互模式（四层依赖逐层选择）
- 装完需**新开会话**生效
- 安装器不联网、不改 `opencode.json`、输出全英文

## 依赖四层清单

| 层 | 名称 | 获取方式 | 缺失后果 |
|---|---|---|---|
| REQUIRED | prometheus-spec agent + librarian 子agent + 安装引导 skill | install.ps1 自带（本目录） | agent 本体不可用；librarian 缺失时外部文档调研降级为 explore |
| STRONGLY REC | talk-human | 运行 `<仓库>\talk-human\install.ps1` | 输出规范不生效（回复可能冗长抽象） |
| STRONGLY REC | spec-superflow | `npm i -g spec-superflow` + 手动注册 plugin（见下节） | spec-superflow 工作流技能不可用，agent 按内置模板降级产出工件 |
| PROJECT-OPTIONAL | node-architect | 运行 `<仓库>\node-architect\install.ps1` | 节点存档协议不可用（计划交接后的存档环节落空） |
| OPTIONAL | systematic-debugging-with-impact-analysis / investigate / graphify / backend-patterns / skill-creator / karpathy-guidelines | 从 `<仓库>\.agents\skills\` 复制（若仓库含）或按各自文档安装 | 对应领域能力下降；agent 权限白名单已预留这些路径，装上即生效 |

### plugin 手动注册（spec-superflow）

安装器不碰 `opencode.json`，注册需手动做一次：

1. `npm i -g spec-superflow`
2. 运行 `npm root -g`，记下全局 node_modules 的实际路径
3. 在 `~/.config/opencode/opencode.json` 的 `plugin` 数组中加一条（路径填第 2 步的实际输出，用正斜杠）：

```jsonc
"plugin": [
  "C:/Users/<你>/AppData/Roaming/npm/node_modules/spec-superflow/.opencode/plugins/spec-superflow.js"
]
```

> 注：`~` 展开仅确认适用于 permissions 的 resource；plugin 路径请按 `npm root -g` 的实际输出填写绝对路径。

## 更新与卸载

- **更新**：重跑安装命令（幂等）。目标文件被手工改过时，安装器先生成 `<文件>.bak-yyyyMMdd-HHmmss` 备份再覆盖
- **卸载**：`powershell -ExecutionPolicy Bypass -File install.ps1 -Remove`——先整体备份到 `~/.config/opencode/prometheus-spec-uninstall-backup-<时间戳>\`，再删除三件

## 平台与已知限制

- Windows-only；PowerShell 5.1+；运行时带 `-ExecutionPolicy Bypass`
- 权限白名单使用 `~/` 路径形态；`~` 展开在用户名含中文/空格的机器上未验证，遇到权限弹窗异常请反馈
- 默认 npm 前缀（`~/AppData/Roaming/npm`）的机器开箱即用；非默认前缀见上节 plugin 注册说明

## 版本记录

- v1.1 · 2026-10-16 · 首个母版版，含权限闸门
