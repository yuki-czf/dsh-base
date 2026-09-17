# DSH Base (探索与基座开发项目)

本项目为探索性研发与技术调研项目，主要聚焦于 AI Agent 基础设施、多客户端协作协议及智能化工具链的孵化与验证。

---

## ☁️ 云端一键安装（推荐）

在**任意项目根目录**打开 PowerShell，一行命令直装（零凭据、零依赖，仅需 Windows + PowerShell 5.1）：

### node-architect（节点协议 skill）

```powershell
irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1 | iex
```

### ssh-runner（跨客户端 SSH MCP，另需 node/npm）

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/yuki-czf/dsh-base/main/remote-install.ps1))) -Module ssh-runner
```

可选参数（下载后运行或用 scriptblock 传参）：`-Project <路径>`、`-Clients opencode,cursor,zed,claude`、`-Branch <分支>`；离线/内网可用 `-ZipPath <仓库zip>`。

或在 AI 客户端会话中直接说：

> 帮我安装 `github.com/yuki-czf/dsh-base` 仓库里的 node-architect skill / ssh-runner MCP

> ⚠️ 版权提示：本仓库未附开源 License，代码公开仅便于本人跨设备安装使用，保留所有权利，未授权请勿使用/分发。

---

## 🎯 项目定位与阶段规划

本项目处于前期探索与原型孵化阶段，核心任务涵盖前沿调研、协议设计与工具链落地。

### 初期重点方向

1. 🛠️ **Skill 开发（技能体系）**
   - 跨 Agent 标准化技能规范定义与母版维护。
   - 上下文抗压缩、长项目开发协议（如 `node-architect` 节点架构师）。
   - 客户端技能自动分发与自愈安装机制。

2. 🔌 **MCP 开发（Model Context Protocol）**
   - 研发面向本地开发环境与外部系统的标准化 MCP Server。
   - 探索多 Agent 共享上下文与状态同步协议。
   - 统一工具调用（Tooling）与数据源接口封装。

3. 🧩 **插件开发（Plugin & Extensions）**
   - 面向 **OpenCode / DSH / Claude Code / zcode** 等主流客户端的插件与扩展。
   - 交互增强、斜杠命令与客户端能力桥接（Bridge）。

---

## 📁 规划目录结构

```
dsh-base/
├── skills/                     # [规划] Skill 技能母版与开发目录
│   └── node-architect/         # 节点架构师技能源码
├── mcps/                       # [规划] MCP (Model Context Protocol) 服务开发
├── plugins/                    # [规划] 多客户端插件与桥接代码
├── research/                   # [规划] 调研报告、技术方案选型与评测
├── dist/                       # 打包产物与离线发布包
│   └── dist/node-architect-v1.4.1.zip
└── README.md                   # 项目总览
```

---

## 📦 现有基础资产

### `dist/node-architect-v1.4.1.zip` (节点架构师安装包)
已验证并打包的通用节点协议开发基座，主要特性：
- **核心理念**：*文件是记忆，对话不是* —— 设计先行 → 节点推进 → 落盘存档 → 换窗口无缝续接。
- **架构机制**：唯一真源（`.agents/skills/node-architect`）+ 客户端联接镜像（Junction），一次更新全端同步。
- **内置工具**：`install.ps1`（自动探测多客户端并建联）、`save.ps1`（存档锁/校验/一键存档 `save`/批次 `commit`/决策归档 `trim-decisions`）、`save.mjs`（Node.js 跨平台版）。

#### 快速解压与使用
```powershell
# 解压到当前目录
Expand-Archive -Path ".\dist\node-architect-v1.4.1.zip" -DestinationPath ".\"

# 一次性全局引导（让所有 AI 客户端识别"装节点协议"）
powershell -ExecutionPolicy Bypass -File .\node-architect\install.ps1 -Bootstrap

# 安装到目标项目（可在 Agent 会话中直接下达指令）
# "帮我安装 G:\www\dsh-base\node-architect 目录下的 skill"
```

---

## 🖥️ 适配客户端矩阵

| 客户端 | 适用入口 | 适配机制 |
|---|---|---|
| **DSH** | `.agents\skills\` | 原生扫描真源 |
| **OpenCode** | 联接镜像 + `/node-architect` 命令 | Junction + Command 桥接 |
| **Claude Code** | `.claude\skills` | Junction 镜像 |
| **zcode** | `.zcode\skills` | Junction 镜像 |
| **通用 Agent** | `AGENTS.md` | 内联协议兜底加载 |

---

## 🗺️ 后续迭代路线

- [ ] 解构并规范化 `skills/` 源码目录，建立统一的开发与测试标准
- [ ] 启动初期 MCP Server 调研与最小可行性原型（MVP）验证
- [ ] 针对 OpenCode / DSH 探索专用扩展插件（Plugin）桥接机制
- [ ] 建立自动化打包与发布流水线（`pack.ps1` 增强）
