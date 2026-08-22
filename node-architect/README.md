# node-architect（节点架构师）—— 集中式多客户端安装包

对抗上下文压缩的长项目开发协议：**文件是记忆，对话不是**。
设计先行 → 节点推进 → 落盘存档（`save.ps1` 管锁与校验）→ 换窗口/压缩后读档无缝续接。

## 最简用法（对任何 agent 说这一句）

> 帮我安装 `<本目录路径>\node-architect` 目录下的 skill

agent 打开本目录读到 `AGENTS.md`，就会在项目根执行 `install.ps1`——无需其他交代。目录放哪都行（解压 zip、U 盘拷贝均可），路径用当时的位置即可。

## 架构：唯一真源 + 客户端联接镜像

```
<项目>\
├── .agents\skills\node-architect\   ← ★ 真源（git 管理；DSH 原生扫描；由母版生成，勿直接改）
├── .opencode\skills\node-architect  ← 联接(junction) → 真源
├── .zcode\skills\node-architect     ← 联接 → 真源
├── .opencode\command\node-architect.md ← opencode 斜杠命令 /node-architect
├── .nodes\                          ← 项目档案（协议真源 PROTOCOL.md + 四件套）
├── AGENTS.md                        ← 内联五条铁律（所有客户端保底入口）
└── .gitignore                       ← 联接镜像为生成物，自动忽略
```

日常维护改**母版** `node-architect\skill\`，重跑 `install.ps1` 同步真源与各端（联接是文件系统层的同一份，真源更新即全端生效）。
真源若被本地改过，覆盖前自动备份到 `.agents\backup\`（重跑不丢改动）。
不支持联接的场景（exFAT/网络盘/故意要提交镜像）加 `-Copy` 用拷贝镜像。

存档的机械动作由 `skill\scripts\save.ps1` 承担：`lock` / `unlock`（CONTEXT 写锁，10 分钟超时）、`verify`（五步存档完整性校验，归档骨架自动生成）。

## 一次性引导：让"装节点协议"四个字生效

新项目里的 agent 不知道母版在哪——解法是给每个客户端的全局技能目录装一个 2KB 的**引导技能**（一次性）：

```powershell
powershell -ExecutionPolicy Bypass -File <母版路径>\install.ps1 -Bootstrap          # 四家全局目录全装（opencode/zcode/claude/dsh）
powershell -ExecutionPolicy Bypass -File <母版路径>\install.ps1 -Bootstrap -Clients opencode   # 只装指定家
```

之后**任何新项目、任何客户端**，会话里说一句「装节点协议」→ 引导技能被自动匹配 → 运行母版安装器 → 自动识别客户端 → 装对目录。
换机/移动母版目录后重跑一次 `-Bootstrap`，引导技能里的母版路径自动更新（自愈）。

## 安装到某个项目（一条命令）

```powershell
powershell -ExecutionPolicy Bypass -File <母版路径>\install.ps1                                # 默认装到当前目录
powershell -ExecutionPolicy Bypass -File <母版路径>\install.ps1 -Project D:\www\你的项目 -Clients opencode,zcode   # 跨项目 + 指定客户端
```

自然语言场景：在项目根直接跑脚本（不传 `-Project`），它默认就装到当前项目。

**自动识别**：不传 `-Clients` 时，脚本探测客户端注入的 shell 环境变量指纹（`OPENCODE` → opencode，
`CLAUDECODE` → claude，`ZCODE` → zcode[推测]，`DSH_*` → DSH 免镜像），自动建对应联接。
所以**在客户端会话里让 agent 跑安装，它自己就会装对目录**；裸终端探测不到时只装真源+AGENTS.md 保底层（已够用）。
显式 `-Clients` 与自动探测取并集。

选项：`-Copy` 拷贝镜像｜`-SkipNodes` 不初始化档案｜重复运行安全（幂等，兼作"重建联接"）。

## 打包分发 / 换电脑

本目录自包含，整目录拷走即是完整安装源：

```powershell
powershell -ExecutionPolicy Bypass -File <母版路径>\pack.ps1     # 产出 dist\node-architect-v<版本>.zip（附 .sha256）
```

新电脑三步：
1. 解压 zip 到任意固定目录（如 `D:\tools\node-architect`）
2. （可选）跑一次 `install.ps1 -Bootstrap`，让「装节点协议」四个字在新机生效
3. 新项目里对 agent 说「帮我安装 `D:\tools\node-architect` 目录下的 skill」；老项目（随项目目录整体拷贝过来的）在项目根重跑 install 重建联接即可

给别人的电脑：发 zip → 对方解压 → 同上第 2、3 步。仅要求 Windows + PowerShell 5.1（系统自带）。

## 各客户端入口一览

| 客户端 | 入口 | 生效方式 |
|---|---|---|
| 任意（保底） | `AGENTS.md` 内联铁律 | 指令文件，会话自动加载 |
| DSH | `.agents\skills\`（原生扫描，无需镜像） | 技能目录自动发现（已实测） |
| opencode | 联接镜像 + `/node-architect` 命令 | 技能目录 + 斜杠命令 |
| zcode | 联接镜像（假定 `.zcode\skills`，待实测） | 技能目录 |
| claude code | 联接镜像 `.claude\skills` | 技能目录 |

## 卸载

删除 `.agents\skills\node-architect\`、各客户端镜像联接、`.nodes\`，清理 `AGENTS.md` 与 `.gitignore` 中"节点协议/生成镜像"相关段落。

## 验收

装完在任意客户端打开项目问"当前项目什么状态"——模型应读 `.nodes/CONTEXT.md` 并复述。
